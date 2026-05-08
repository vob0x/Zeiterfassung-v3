/**
 * timerStore — lokaler State für laufende Timer-Slots.
 *
 * Wichtiger Unterschied zu v2: in v3 sind Timer-Slots **rein lokaler
 * UI-State**, nicht serverpersistiert. Sie repräsentieren die Intention
 * des Users, aktuell zu tracken; das Datenartefakt entsteht erst beim
 * Stop, wo ein TimeEntry am Server angelegt wird (Server-First).
 *
 * localStorage-Persistenz: Slots überleben Page-Reload (z.B. F5
 * versehentlich), nicht aber Tab-Close — ähnlich wie der Personal Key.
 * User-scoped, damit verschiedene User auf demselben Browser sich nicht
 * gegenseitig die Slots klauen.
 *
 * Cross-Device-Sync: nicht in M3b. Zwei Devices = zwei unabhängige
 * Slot-Listen. Falls das später wichtig wird, kann ein optionales
 * `running_timers`-Table eingeführt werden.
 *
 * Re-Render-Mechanik: ein zentraler tick-Counter wird jede Sekunde
 * inkrementiert, sobald mindestens ein Slot läuft. Komponenten lesen
 * via Selector, React rendert deshalb pro Tick.
 */

import { create } from 'zustand';
import { generateUUID } from '@/lib/utils';
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

  /** Lädt Slots aus localStorage. Muss aufgerufen werden NACHDEM die
   *  Auth-Init durch ist und profile.id verfügbar — sonst landet der
   *  Storage-Key auf 'anonymous' und findet nichts. */
  initFromStorage: () => void;

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
// localStorage-Persistenz — user-scoped
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
    // Slots werden NICHT direkt beim Store-Create aus localStorage geladen,
    // weil der Store-Create zum Module-Load-Zeitpunkt passiert und da der
    // authStore noch keinen profile.id hat → storageKey wäre null. Stattdessen
    // ruft App.tsx initFromStorage() auf sobald die Auth-Wand passiert ist.
    slots: [],
    tick: 0,
    hydrated: false,

    initFromStorage: () => {
      if (get().hydrated) return; // idempotent, mehrere Mounts sind OK
      const loaded = loadSlots();
      set({ slots: loaded, hydrated: true });
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
      return id;
    },

    removeSlot: (id) => {
      const next = get().slots.filter((s) => s.id !== id);
      set({ slots: next });
      saveSlots(next);
    },

    updateSlot: (id, patch) => {
      const next = get().slots.map((s) =>
        s.id === id
          ? {
              ...s,
              ...(patch.stakeholder !== undefined && { stakeholder: patch.stakeholder }),
              ...(patch.projekt !== undefined && { projekt: patch.projekt }),
              ...(patch.taetigkeit !== undefined && { taetigkeit: patch.taetigkeit }),
              ...(patch.format !== undefined && { format: patch.format }),
              ...(patch.notiz !== undefined && { notiz: patch.notiz }),
            }
          : s
      );
      set({ slots: next });
      saveSlots(next);
    },

    pauseSlot: (id) => {
      const next = get().slots.map((s) => {
        if (s.id !== id || s.isPaused) return s;
        // Beim Pause: aktuelle running-Zeit in pausedMs einfrieren
        const runningMs = Date.now() - s.startTime;
        return { ...s, pausedMs: s.pausedMs + runningMs, isPaused: true };
      });
      set({ slots: next });
      saveSlots(next);
    },

    resumeSlot: (id) => {
      const next = get().slots.map((s) => {
        if (s.id !== id || !s.isPaused) return s;
        // Beim Resume: startTime neu setzen, pausedMs bleibt akkumuliert
        return { ...s, startTime: Date.now(), isPaused: false };
      });
      set({ slots: next });
      saveSlots(next);
    },

    setIsStopping: (id, v) => {
      const next = get().slots.map((s) =>
        s.id === id ? { ...s, isStopping: v } : s
      );
      set({ slots: next });
      // isStopping NICHT persistieren — flüchtiger UI-State
    },

    getElapsedMs: (id) => {
      const slot = get().slots.find((s) => s.id === id);
      if (!slot) return 0;
      if (slot.isPaused) return slot.pausedMs;
      return slot.pausedMs + (Date.now() - slot.startTime);
    },
  };
});
