/**
 * entriesStore — Server-First Cache für TimeEntry-Daten.
 *
 * Verhältnis zur v2-Welt: dieser Store ist eine SCHEIBE des v2-
 * entriesStore — eindeutig kleiner, weil die ganze Defense-Schicht (Soft-
 * Merge, Pending-IDs, Tombstones-als-Sync, Stop-Journal, Force-Resync)
 * unter Server-First wegfällt. Wahrheitsquelle ist immer Supabase.
 * `state.entries` ist nur ein Cache der letzten erfolgreichen Antwort.
 *
 * M2a-Scope: Read-only. fetchEntries() pulled vom Server, decrypted, setzt
 * state. Kein add/update/delete (kommt M2b).
 */

import { create } from 'zustand';
import { supabase, ensureValidSession } from '@/lib/supabase';
import { decryptField, encryptField, hasEncryptionKey } from '@/lib/crypto';
import { useAuthStore } from './authStore';
import { formatDateISO, generateUUID } from '@/lib/utils';
import type { TimeEntry } from '@/types';

// Verschlüsselte Felder pro Eintrag — muss exakt mit v2-Schema matchen,
// damit v2 + v3 dieselben Daten lesen können.
const ENCRYPTED_FIELDS = ['stakeholder', 'projekt', 'taetigkeit', 'format', 'notiz'] as const;

/** Eingabe-Shape für add() — id wird generiert, Timestamps gesetzt. */
export interface NewEntryInput {
  date: string;            // YYYY-MM-DD
  stakeholder: string[];   // mind. eines, kann auch leer sein
  projekt: string;
  taetigkeit: string;
  format: string;
  start_time: string;      // HH:MM
  end_time: string;        // HH:MM
  duration_ms: number;
  notiz?: string;
}

/** Patchable Felder für update() — alle optional. */
export interface EntryPatch {
  date?: string;
  stakeholder?: string[];
  projekt?: string;
  taetigkeit?: string;
  format?: string;
  start_time?: string;
  end_time?: string;
  duration_ms?: number;
  notiz?: string;
}

interface EntriesState {
  entries: TimeEntry[];
  loading: boolean;
  error: string | null;
  fetchEntries: () => Promise<void>;
  addEntry: (input: NewEntryInput) => Promise<TimeEntry>;
  updateEntry: (id: string, patch: EntryPatch) => Promise<TimeEntry>;
  deleteEntry: (id: string) => Promise<void>;
}

/**
 * Verschlüsselt die `ENCRYPTED_FIELDS` eines Entry-Inputs in das
 * Supabase-Row-Format. Stakeholder wird als JSON-stringified-Array
 * verschlüsselt (v2-kompatibel). Leere Felder bleiben Leerstring statt
 * `enc:<...>`-Blob — das ist explizit, damit die DB beim Update einen
 * geleerten Wert auch wirklich überschreibt.
 */
async function encryptEntryForServer(input: {
  date: string;
  stakeholder: string[];
  projekt: string;
  taetigkeit: string;
  format: string;
  start_time: string;
  end_time: string;
  duration_ms: number;
  notiz?: string;
}): Promise<Record<string, any>> {
  return {
    date: input.date,
    start_time: input.start_time,
    end_time: input.end_time,
    duration_ms: input.duration_ms,
    stakeholder:
      input.stakeholder && input.stakeholder.length > 0
        ? await encryptField(JSON.stringify(input.stakeholder))
        : '',
    projekt: input.projekt ? await encryptField(input.projekt) : '',
    taetigkeit: input.taetigkeit ? await encryptField(input.taetigkeit) : '',
    format: input.format ? await encryptField(input.format) : '',
    notiz: input.notiz ? await encryptField(input.notiz) : '',
  };
}

/**
 * Decrypted ein einzelnes time_entries-Row. stakeholder kann als String
 * (alt-v2) oder als JSON-stringified-Array (neu) vorliegen — immer auf
 * Array normalisieren.
 */
async function decryptEntryRow(row: any): Promise<TimeEntry> {
  const decrypted: Record<string, any> = { ...row };
  for (const field of ENCRYPTED_FIELDS) {
    if (decrypted[field]) {
      const plain = await decryptField(decrypted[field]);
      // Stakeholder als JSON-Array? → parse
      if (field === 'stakeholder' && plain && plain.startsWith('[')) {
        try {
          decrypted[field] = JSON.parse(plain);
        } catch {
          decrypted[field] = plain;
        }
      } else {
        decrypted[field] = plain;
      }
    }
  }

  // Stakeholder auf Array normalisieren — Single-String wird zu [String]
  let stakeholder: string[] = [];
  const raw = decrypted.stakeholder;
  if (Array.isArray(raw)) {
    stakeholder = raw.filter(Boolean);
  } else if (typeof raw === 'string' && raw) {
    stakeholder = [raw];
  }

  // Datum als YYYY-MM-DD garantieren
  let date = decrypted.date;
  if (typeof date !== 'string') {
    date = formatDateISO(new Date(date));
  }

  return {
    id: decrypted.id,
    user_id: decrypted.user_id,
    date,
    stakeholder,
    projekt: decrypted.projekt || '',
    taetigkeit: decrypted.taetigkeit || '',
    format: decrypted.format || 'Einzelarbeit',
    start_time: decrypted.start_time || '',
    end_time: decrypted.end_time || '',
    duration_ms: decrypted.duration_ms || 0,
    notiz: decrypted.notiz || '',
    created_at: decrypted.created_at || '',
    updated_at: decrypted.updated_at || '',
    deleted_at: decrypted.deleted_at || null,
  };
}

export const useEntriesStore = create<EntriesState>((set, get) => ({
  entries: [],
  loading: false,
  error: null,

  fetchEntries: async () => {
    const profile = useAuthStore.getState().profile;
    if (!profile?.id) {
      set({ error: 'Nicht authentifiziert', loading: false });
      return;
    }
    if (!hasEncryptionKey()) {
      set({ error: 'Personal Key fehlt — bitte entsperren', loading: false });
      return;
    }

    set({ loading: true, error: null });
    try {
      const ok = await ensureValidSession();
      if (!ok) {
        set({ error: 'Sitzung abgelaufen', loading: false });
        return;
      }
      // Tombstones (deleted_at NOT NULL) explizit ausfiltern. Soft-Delete-
      // Recovery wird ein eigener Read-Pfad in M5/M6.
      const { data, error } = await supabase
        .from('time_entries')
        .select('*')
        .eq('user_id', profile.id)
        .is('deleted_at', null)
        .order('date', { ascending: false })
        .order('start_time', { ascending: false });

      if (error) {
        set({ error: error.message, loading: false });
        return;
      }
      const decrypted = await Promise.all((data || []).map(decryptEntryRow));
      set({ entries: decrypted, loading: false });
    } catch (e: any) {
      set({ error: e?.message || 'Fehler beim Laden', loading: false });
    }
  },

  // ───────────────────────────────────────────────────────────────────
  // Write-Pfad (M2b) — alle synchron mit Server-Confirm.
  //
  // Im Gegensatz zu v2: KEIN optimistisches lokales Update vor dem
  // Server-Roundtrip. Wenn der Server failed, bleibt der lokale State
  // unangetastet und der User sieht den Fehler. Der Aufrufer (UI)
  // dispatched seinen eigenen Spinner / Disable-Logik.
  // ───────────────────────────────────────────────────────────────────

  addEntry: async (input) => {
    const profile = useAuthStore.getState().profile;
    if (!profile?.id) throw new Error('Nicht authentifiziert');
    if (!hasEncryptionKey()) throw new Error('Personal Key fehlt');
    const ok = await ensureValidSession();
    if (!ok) throw new Error('Sitzung abgelaufen');

    const id = generateUUID();
    const now = new Date().toISOString();
    const encrypted = await encryptEntryForServer(input);
    const row = {
      id,
      user_id: profile.id,
      ...encrypted,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };

    const { error } = await supabase.from('time_entries').insert(row);
    if (error) {
      set({ error: error.message });
      throw new Error(error.message);
    }

    // Lokalen Cache aktualisieren — INSERT-Pfad (an den Anfang weil
    // die Liste date desc / start_time desc sortiert ist und neue
    // Einträge meistens "heute" sind).
    const newEntry: TimeEntry = {
      id,
      user_id: profile.id,
      date: input.date,
      stakeholder: input.stakeholder,
      projekt: input.projekt,
      taetigkeit: input.taetigkeit,
      format: input.format,
      start_time: input.start_time,
      end_time: input.end_time,
      duration_ms: input.duration_ms,
      notiz: input.notiz || '',
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
    set({ entries: [newEntry, ...get().entries], error: null });
    return newEntry;
  },

  updateEntry: async (id, patch) => {
    const profile = useAuthStore.getState().profile;
    if (!profile?.id) throw new Error('Nicht authentifiziert');
    if (!hasEncryptionKey()) throw new Error('Personal Key fehlt');
    const ok = await ensureValidSession();
    if (!ok) throw new Error('Sitzung abgelaufen');

    // Den existierenden Eintrag finden, mit Patch mergen — wir brauchen
    // den vollen Stand, weil encryptEntryForServer alle Felder
    // erwartet.
    const existing = get().entries.find((e) => e.id === id);
    if (!existing) throw new Error('Eintrag nicht gefunden');

    const merged = {
      date: patch.date ?? existing.date,
      stakeholder: patch.stakeholder ?? existing.stakeholder,
      projekt: patch.projekt ?? existing.projekt,
      taetigkeit: patch.taetigkeit ?? existing.taetigkeit,
      format: patch.format ?? existing.format,
      start_time: patch.start_time ?? existing.start_time,
      end_time: patch.end_time ?? existing.end_time,
      duration_ms: patch.duration_ms ?? existing.duration_ms,
      notiz: patch.notiz ?? existing.notiz,
    };
    const encrypted = await encryptEntryForServer(merged);
    const now = new Date().toISOString();

    const { error } = await supabase
      .from('time_entries')
      .update({ ...encrypted, updated_at: now })
      .eq('id', id);
    if (error) {
      set({ error: error.message });
      throw new Error(error.message);
    }

    const updated: TimeEntry = {
      ...existing,
      ...merged,
      updated_at: now,
    };
    set({
      entries: get().entries.map((e) => (e.id === id ? updated : e)),
      error: null,
    });
    return updated;
  },

  deleteEntry: async (id) => {
    const profile = useAuthStore.getState().profile;
    if (!profile?.id) throw new Error('Nicht authentifiziert');
    const ok = await ensureValidSession();
    if (!ok) throw new Error('Sitzung abgelaufen');

    // Soft-Delete: setzen `deleted_at` per UPDATE, nicht echtes DELETE.
    // Damit bleibt der Eintrag in DB für die Soft-Delete-Recovery
    // ("versehentlich gelöscht?") in der Verwaltung (M5/M6).
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('time_entries')
      .update({ deleted_at: now, updated_at: now })
      .eq('id', id);
    if (error) {
      set({ error: error.message });
      throw new Error(error.message);
    }

    set({
      entries: get().entries.filter((e) => e.id !== id),
      error: null,
    });
  },
}));
