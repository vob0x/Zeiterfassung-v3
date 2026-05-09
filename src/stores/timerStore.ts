/**
 * timerStore — laufende Timer-Slots, server-synced.
 *
 * Architektur:
 *   - Source of Truth: Server (`running_timers`-Table, RLS own-only)
 *   - Local Cache:     localStorage für instant render beim App-Start
 *   - Sync-Strategie:  push on every change (fire-and-forget),
 *                      pull on app-mount und visibilitychange
 *   - Konflikt:        last-write-wins (single user, normalerweise nur
 *                      ein aktives Device gleichzeitig — bei Race
 *                      gewinnt der spätere updated_at)
 *
 * Cross-Device-Flow:
 *   1. Mobile addSlot → lokal sofort sichtbar → INSERT zum Server
 *   2. Desktop syncFromServer (beim Tab-Focus) → SELECT → fügt fehlenden
 *      Slot lokal hinzu
 *   3. Desktop pauseSlot → lokal sofort sichtbar → UPDATE zum Server
 *   4. Mobile syncFromServer → SELECT → übernimmt is_paused / paused_ms
 *
 * Re-Render-Mechanik: ein zentraler tick-Counter wird jede Sekunde
 * inkrementiert, sobald mindestens ein Slot läuft. Komponenten lesen
 * via Selector, React rendert deshalb pro Tick.
 */

import { create } from 'zustand';
import { generateUUID } from '@/lib/utils';
import { supabase, ensureValidSession } from '@/lib/supabase';
import {
  decryptField,
  encryptField,
  hasEncryptionKey,
} from '@/lib/crypto';
import { useAuthStore } from './authStore';

const PALETTE = [
  '#C9A962', // gold
  '#6EC49E', // sage
  '#9B8EC4', // violet
  '#D4706E', // coral
  '#5BA4D9', // steel blue
  '#E5A84B', // warm orange
  '#7ECFCF', // teal
  '#C97B9B', // dusty rose
];

export interface TimerSlot {
  id: string;
  /** Dimensionen — können während des Laufens editiert werden. */
  stakeholder: string[];
  projekt: string;
  taetigkeit: string;
  format: string;
  notiz: string;
  /** Unix-ms beim letzten Resume (oder erstem Start). */
  startTime: number;
  /** Akkumulierte Pausen-Zeit aus früheren Resume-Phasen. */
  pausedMs: number;
  isPaused: boolean;
  /** Lokale Click-Debounce-Flag — wird gesetzt während Stop läuft, damit
   *  Doppelklick keinen zweiten Stop triggern kann. War der Hauptbug
   *  in v2 der zu Duplikaten führte. */
  isStopping: boolean;
  color: string;
}

interface TimerState {
  slots: TimerSlot[];
  /** Counter der jede Sekunde inkrementiert wird wenn was läuft. Komponenten
   *  binden sich daran, damit sie pro Sekunde re-rendern. */
  tick: number;
  /** True nachdem initFromStorage einmal gelaufen ist. Verhindert
   *  Doppel-Load + späteres Überschreiben. */
  hydrated: boolean;

  /** Lädt Slots aus localStorage (instant cache). Muss aufgerufen werden
   *  NACHDEM die Auth-Init durch ist und profile.id verfügbar — sonst
   *  landet der Storage-Key auf 'anonymous' und findet nichts. */
  initFromStorage: () => void;
  /** Lädt aktuelle Slots vom Server und ersetzt den Local-State.
   *  Wird beim App-Mount und bei visibilitychange aufgerufen. */
  syncFromServer: () => Promise<void>;

  addSlot: (init?: Partial<NewSlotInit>) => string;
  removeSlot: (id: string) => void;
  updateSlot: (id: string, patch: Partial<NewSlotInit>) => void;
  pauseSlot: (id: string) => void;
  resumeSlot: (id: string) => void;
  setIsStopping: (id: string, v: boolean) => void;

  /** Gesamte Elapsed-Zeit des Slots (paused + running). */
  getElapsedMs: (id: string) => number;
}

export interface NewSlotInit {
  stakeholder: string[];
  projekt: string;
  taetigkeit: string;
  format: string;
  notiz: string;
}

// ─────────────────────────────────────────────────────────────────────────
// localStorage-Persistenz — user-scoped, nur als Optimistic-Cache
// ─────────────────────────────────────────────────────────────────────────

function storageKey(): string | null {
  const userId = useAuthStore.getState().profile?.id;
  if (!userId) return null;
  return `ze_v3_${userId}_timer_slots`;
}

function loadSlots(): TimerSlot[] {
  const k = storageKey();
  if (!k) return [];
  try {
    const raw = localStorage.getItem(k);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((s: any) => ({
      id: s.id || generateUUID(),
      stakeholder: Array.isArray(s.stakeholder) ? s.stakeholder : [],
      projekt: s.projekt || '',
      taetigkeit: s.taetigkeit || '',
      format: s.format || '',
      notiz: s.notiz || '',
      startTime: typeof s.startTime === 'number' ? s.startTime : Date.now(),
      pausedMs: typeof s.pausedMs === 'number' ? s.pausedMs : 0,
      isPaused: !!s.isPaused,
      isStopping: false, // bei Restore IMMER zurücksetzen — falls Tab beim Stop crashed
      color: s.color || PALETTE[0],
    }));
  } catch {
    return [];
  }
}

function saveSlots(slots: TimerSlot[]): void {
  const k = storageKey();
  if (!k) return;
  try {
    // isStopping nicht mit-persistieren (UI-State, nicht semantisch)
    const serializable = slots.map((s) => ({ ...s, isStopping: false }));
    localStorage.setItem(k, JSON.stringify(serializable));
  } catch {
    // Quota oder ähnliches — ignorieren, Slots leben dann nur in-memory
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Server-Sync — Encrypted Blob für die fünf Eingabe-Dimensionen
// ─────────────────────────────────────────────────────────────────────────

interface EncryptedSlotPayload {
  stakeholder: string[];
  projekt: string;
  taetigkeit: string;
  format: string;
  notiz: string;
  color: string;
}

async function encryptSlotPayload(slot: TimerSlot): Promise<string> {
  const payload: EncryptedSlotPayload = {
    stakeholder: slot.stakeholder,
    projekt: slot.projekt,
    taetigkeit: slot.taetigkeit,
    format: slot.format,
    notiz: slot.notiz,
    color: slot.color,
  };
  return encryptField(JSON.stringify(payload));
}

async function decryptSlotPayload(
  encrypted: string
): Promise<EncryptedSlotPayload | null> {
  try {
    const plain = await decryptField(encrypted);
    const parsed = JSON.parse(plain);
    return {
      stakeholder: Array.isArray(parsed.stakeholder) ? parsed.stakeholder : [],
      projekt: parsed.projekt || '',
      taetigkeit: parsed.taetigkeit || '',
      format: parsed.format || '',
      notiz: parsed.notiz || '',
      color: parsed.color || PALETTE[0],
    };
  } catch {
    return null;
  }
}

/**
 * Fire-and-forget UPSERT zum Server. Failures werden nur geloggt — der
 * lokale State ist schon aktualisiert, der User soll nicht warten. Bei
 * temporärem Netzfehler holt der nächste sync den Server in Sync.
 */
async function pushSlotToServer(slot: TimerSlot): Promise<void> {
  try {
    const userId = useAuthStore.getState().profile?.id;
    if (!userId) return;
    if (!hasEncryptionKey()) return;
    const ok = await ensureValidSession();
    if (!ok) return;

    const encrypted_data = await encryptSlotPayload(slot);
    const { error } = await supabase
      .from('running_timers')
      .upsert(
        {
          id: slot.id,
          user_id: userId,
          encrypted_data,
          start_time: slot.startTime,
          paused_ms: slot.pausedMs,
          is_paused: slot.isPaused,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );
    if (error) console.warn('[Timer] sync push failed:', error.message);
  } catch (e: any) {
    console.warn('[Timer] sync push exception:', e?.message);
  }
}

async function deleteSlotOnServer(id: string): Promise<void> {
  try {
    const ok = await ensureValidSession();
    if (!ok) return;
    const { error } = await supabase
      .from('running_timers')
      .delete()
      .eq('id', id);
    if (error) console.warn('[Timer] sync delete failed:', error.message);
  } catch (e: any) {
    console.warn('[Timer] sync delete exception:', e?.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Color Assignment — pro Slot eine andere Farbe aus der Palette
// ─────────────────────────────────────────────────────────────────────────

function pickColor(usedColors: string[]): string {
  for (const c of PALETTE) {
    if (!usedColors.includes(c)) return c;
  }
  return PALETTE[usedColors.length % PALETTE.length];
}

// ─────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────

export const useTimerStore = create<TimerState>((set, get) => {
  // tick-Interval — wird einmal eingerichtet, läuft IMMER (auch wenn keine
  // Slots laufen). Cost: ein setState pro Sekunde, vernachlässigbar im
  // Vergleich zu manueller Setup-/Teardown-Logik.
  if (typeof window !== 'undefined') {
    setInterval(() => {
      const slots = useTimerStore.getState().slots;
      const hasRunning = slots.some((s) => !s.isPaused);
      if (hasRunning) {
        useTimerStore.setState((s) => ({ tick: s.tick + 1 }));
      }
    }, 1000);
  }

  return {
    slots: [],
    tick: 0,
    hydrated: false,

    initFromStorage: () => {
      if (get().hydrated) return; // idempotent, mehrere Mounts sind OK
      const loaded = loadSlots();
      set({ slots: loaded, hydrated: true });
    },

    syncFromServer: async () => {
      const userId = useAuthStore.getState().profile?.id;
      if (!userId) return;
      if (!hasEncryptionKey()) return; // ohne Key kann eh nicht decrypted werden
      const ok = await ensureValidSession();
      if (!ok) return;

      try {
        const { data, error } = await supabase
          .from('running_timers')
          .select('*')
          .eq('user_id', userId);
        if (error) {
          console.warn('[Timer] sync pull failed:', error.message);
          return;
        }

        const decrypted: TimerSlot[] = [];
        for (const row of data || []) {
          const payload = await decryptSlotPayload(row.encrypted_data);
          if (!payload) continue; // Decrypt-Failure → Row ignorieren
          decrypted.push({
            id: row.id,
            stakeholder: payload.stakeholder,
            projekt: payload.projekt,
            taetigkeit: payload.taetigkeit,
            format: payload.format,
            notiz: payload.notiz,
            startTime: Number(row.start_time),
            pausedMs: Number(row.paused_ms),
            isPaused: !!row.is_paused,
            isStopping: false,
            color: payload.color,
          });
        }

        // isStopping aus dem aktuellen Lokal-State erhalten — damit ein
        // gerade laufender Stop nicht mitten drin verschwindet.
        const localStopping = new Map(
          get().slots.map((s) => [s.id, s.isStopping])
        );
        const merged = decrypted.map((s) => ({
          ...s,
          isStopping: localStopping.get(s.id) || false,
        }));

        set({ slots: merged, hydrated: true });
        saveSlots(merged);
      } catch (e: any) {
        console.warn('[Timer] sync pull exception:', e?.message);
      }
    },

    addSlot: (init) => {
      const id = generateUUID();
      const used = get().slots.map((s) => s.color);
      const slot: TimerSlot = {
        id,
        stakeholder: init?.stakeholder ?? [],
        projekt: init?.projekt ?? '',
        taetigkeit: init?.taetigkeit ?? 'Produktiv',
        format: init?.format ?? 'Einzelarbeit',
        notiz: init?.notiz ?? '',
        startTime: Date.now(),
        pausedMs: 0,
        isPaused: false,
        isStopping: false,
        color: pickColor(used),
      };
      const next = [...get().slots, slot];
      set({ slots: next });
      saveSlots(next);
      // fire-and-forget — kein await, damit der UI-Klick instant ist
      void pushSlotToServer(slot);
      return id;
    },

    removeSlot: (id) => {
      const next = get().slots.filter((s) => s.id !== id);
      set({ slots: next });
      saveSlots(next);
      void deleteSlotOnServer(id);
    },

    updateSlot: (id, patch) => {
      let updated: TimerSlot | undefined;
      const next = get().slots.map((s) => {
        if (s.id !== id) return s;
        const u: TimerSlot = {
          ...s,
          ...(patch.stakeholder !== undefined && { stakeholder: patch.stakeholder }),
          ...(patch.projekt !== undefined && { projekt: patch.projekt }),
          ...(patch.taetigkeit !== undefined && { taetigkeit: patch.taetigkeit }),
          ...(patch.format !== undefined && { format: patch.format }),
          ...(patch.notiz !== undefined && { notiz: patch.notiz }),
        };
        updated = u;
        return u;
      });
      set({ slots: next });
      saveSlots(next);
      if (updated) void pushSlotToServer(updated);
    },

    pauseSlot: (id) => {
      let updated: TimerSlot | undefined;
      const next = get().slots.map((s) => {
        if (s.id !== id || s.isPaused) return s;
        // Beim Pause: aktuelle running-Zeit in pausedMs einfrieren
        const runningMs = Date.now() - s.startTime;
        const u = { ...s, pausedMs: s.pausedMs + runningMs, isPaused: true };
        updated = u;
        return u;
      });
      set({ slots: next });
      saveSlots(next);
      if (updated) void pushSlotToServer(updated);
    },

    resumeSlot: (id) => {
      let updated: TimerSlot | undefined;
      const next = get().slots.map((s) => {
        if (s.id !== id || !s.isPaused) return s;
        // Beim Resume: startTime neu setzen, pausedMs bleibt akkumuliert
        const u = { ...s, startTime: Date.now(), isPaused: false };
        updated = u;
        return u;
      });
      set({ slots: next });
      saveSlots(next);
      if (updated) void pushSlotToServer(updated);
    },

    setIsStopping: (id, v) => {
      const next = get().slots.map((s) =>
        s.id === id ? { ...s, isStopping: v } : s
      );
      set({ slots: next });
      // isStopping NICHT persistieren — flüchtiger UI-State, kein Server-Push
    },

    getElapsedMs: (id) => {
      const slot = get().slots.find((s) => s.id === id);
      if (!slot) return 0;
      if (slot.isPaused) return slot.pausedMs;
      return slot.pausedMs + (Date.now() - slot.startTime);
    },
  };
});
