/**
 * entriesStore — Server-First Cache für TimeEntry-Daten.
 *
 * Verhältnis zur v2-Welt: dieser Store ist eine SCHEIBE des v2-
 * entriesStore — eindeutig kleiner, weil die ganze Defense-Schicht (Soft-
 * Merge, Pending-IDs, Tombstones-als-Sync, Stop-Journal, Force-Resync)
 * unter Server-First wegfällt. Wahrheitsquelle ist immer Supabase.
 *
 * Cache-Form:
 *   - `entries`     : Einträge des aktuellen Users (immer)
 *   - `teamEntries` : Einträge der Team-Mitglieder (nur wenn im Team)
 *
 * Der Server liefert via RLS (`te_select_teammates`) bei aktivem Team
 * automatisch alle Team-Einträge mit. Wir trennen client-seitig nach
 * user_id, damit Views entscheiden können was sie anzeigen — Timer und
 * Einträge-Tab nur eigene, Dashboard im Team-Scope alle.
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

/** Nicht-multi-Felder, die per Bulk-Rename in Einträgen ersetzt werden können. */
export type RenameableField =
  | 'stakeholder'
  | 'projekt'
  | 'taetigkeit'
  | 'format';

interface EntriesState {
  entries: TimeEntry[];      // eigene Einträge
  teamEntries: TimeEntry[];  // Einträge anderer Team-Mitglieder
  loading: boolean;
  error: string | null;
  fetchEntries: () => Promise<void>;
  addEntry: (input: NewEntryInput) => Promise<TimeEntry>;
  /**
   * Batch-Variante: encryptet alle Inputs und macht einen einzigen
   * Server-Insert. State wird einmal am Ende aktualisiert — kein
   * Listen-Flackern bei z.B. 14 Ferien-Einträgen auf einmal.
   */
  addEntries: (inputs: NewEntryInput[]) => Promise<TimeEntry[]>;
  updateEntry: (id: string, patch: EntryPatch) => Promise<TimeEntry>;
  deleteEntry: (id: string) => Promise<void>;
  /**
   * Cascade-Rename: ersetzt `oldName` durch `newName` in den
   * passenden Einträgen. Stakeholder ist multi-valued (Array) — nur
   * der gematchte Eintrag im Array wird ersetzt; andere Stakeholder
   * im selben Eintrag bleiben.
   *
   * Scope:
   *   - 'self' (default): nur eigene Einträge
   *   - 'team': eigene + Teamkollegen-Einträge. RLS muss erlauben
   *     (`te_update_self_or_admin` ab Migration 20260511…). Wird
   *     vom masterStore in Admin-Cascade-Renames benutzt.
   *
   * Single batch-upsert: alle betroffenen Rows in einem Round-Trip.
   * Returnt die Anzahl der berührten Einträge.
   */
  bulkRenameField: (
    field: RenameableField,
    oldName: string,
    newName: string,
    scope?: 'self' | 'team'
  ) => Promise<number>;
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
 * Holt alle visible time_entries-Rows in Pagination-Batches. Supabase
 * deckelt jeden Request bei `db_max_rows` (Default 1000). Bei Teams mit
 * mehr als 1000 sichtbaren Einträgen würde ein einzelner Fetch trunkiert
 * und Clients sähen unterschiedlich viele Rows — Schrödinger-Daten.
 *
 * Lösung: schleife mit `.range(offset, offset+SIZE-1)` bis weniger als
 * SIZE Rows zurückkommen. Jeder Range-Request ist deterministisch durch
 * die explizite ORDER BY date DESC, start_time DESC.
 */
const PAGE_SIZE = 1000;

async function fetchAllVisibleRows(): Promise<any[]> {
  const all: any[] = [];
  let offset = 0;
  // Hard-Cap als Sicherheitsnetz — falls die DB sich pathologisch
  // verhält (z.B. Tombstones nicht respektiert), bricht die Schleife
  // nach 50.000 Rows ab. Realistische Datenmengen liegen weit drunter.
  const MAX_PAGES = 50;

  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabase
      .from('time_entries')
      .select('*')
      .is('deleted_at', null)
      .order('date', { ascending: false })
      .order('start_time', { ascending: false })
      .order('id', { ascending: true }) // Tiebreak deterministisch über alle Pages
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    all.push(...data);
    if (data.length < PAGE_SIZE) break; // letzte Page

    offset += PAGE_SIZE;
  }
  return all;
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
  teamEntries: [],
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
      // RLS regelt: ohne Team nur eigene, mit Team auch die der
      // Mitglieder. Pagination via fetchAllVisibleRows() umgeht den
      // Supabase-1000-Row-Default — siehe Helper-Doc.
      const rows = await fetchAllVisibleRows();
      const decrypted = await Promise.all(rows.map(decryptEntryRow));

      // Trennen nach user_id: eigene → entries, fremde → teamEntries
      const own: TimeEntry[] = [];
      const team: TimeEntry[] = [];
      for (const e of decrypted) {
        if (e.user_id === profile.id) own.push(e);
        else team.push(e);
      }
      set({ entries: own, teamEntries: team, loading: false });
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

  addEntries: async (inputs) => {
    const profile = useAuthStore.getState().profile;
    if (!profile?.id) throw new Error('Nicht authentifiziert');
    if (!hasEncryptionKey()) throw new Error('Personal Key fehlt');
    if (inputs.length === 0) return [];
    const ok = await ensureValidSession();
    if (!ok) throw new Error('Sitzung abgelaufen');

    const now = new Date().toISOString();

    // Pro Input: ID + Encryption + Row-Shape parallel rechnen
    const prepared = await Promise.all(
      inputs.map(async (input) => {
        const id = generateUUID();
        const encrypted = await encryptEntryForServer(input);
        const row = {
          id,
          user_id: profile.id,
          ...encrypted,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        };
        const localEntry: TimeEntry = {
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
        return { row, localEntry };
      })
    );

    const { error } = await supabase
      .from('time_entries')
      .insert(prepared.map((p) => p.row));
    if (error) {
      set({ error: error.message });
      throw new Error(error.message);
    }

    // State einmal aktualisieren — neue Einträge nach vorn (Liste ist
    // date desc / start_time desc sortiert und neue Inserts sind
    // typischerweise heute oder zumindest jung).
    const newEntries = prepared.map((p) => p.localEntry);
    set({ entries: [...newEntries, ...get().entries], error: null });
    return newEntries;
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

  bulkRenameField: async (field, oldName, newName, scope = 'self') => {
    const profile = useAuthStore.getState().profile;
    if (!profile?.id) throw new Error('Nicht authentifiziert');
    if (!hasEncryptionKey()) throw new Error('Personal Key fehlt');
    const trimmedNew = newName.trim();
    if (!trimmedNew) throw new Error('Neuer Name darf nicht leer sein');
    if (oldName === trimmedNew) return 0;

    const matches = (e: TimeEntry): boolean => {
      if (field === 'stakeholder') {
        const list = Array.isArray(e.stakeholder) ? e.stakeholder : [];
        return list.includes(oldName);
      }
      return (e[field] || '') === oldName;
    };

    // Scope bestimmt das Suchfeld: 'team' nimmt eigene + Teamkollegen-
    // Einträge mit, 'self' nur eigene. RLS auf Server-Seite spiegelt
    // die Berechtigung — Mitarbeiter würde ein 'team'-Aufruf ohnehin
    // nicht durchgehen.
    const pool =
      scope === 'team'
        ? [...get().entries, ...get().teamEntries]
        : get().entries;
    const affected = pool.filter(matches);
    if (affected.length === 0) return 0;

    const ok = await ensureValidSession();
    if (!ok) throw new Error('Sitzung abgelaufen');

    const applyRename = (e: TimeEntry): TimeEntry => {
      if (field === 'stakeholder') {
        return {
          ...e,
          stakeholder: (e.stakeholder || []).map((s) =>
            s === oldName ? trimmedNew : s
          ),
        };
      }
      return { ...e, [field]: trimmedNew };
    };

    const now = new Date().toISOString();
    const updated = affected.map(applyRename);

    // Encrypten + zu DB-Rows formen, Single-Batch-Upsert.
    const rows = await Promise.all(
      updated.map(async (e) => ({
        id: e.id,
        user_id: e.user_id,
        date: e.date,
        start_time: e.start_time,
        end_time: e.end_time,
        duration_ms: e.duration_ms,
        ...(await encryptEntryForServer({
          date: e.date,
          stakeholder: e.stakeholder,
          projekt: e.projekt,
          taetigkeit: e.taetigkeit,
          format: e.format,
          start_time: e.start_time,
          end_time: e.end_time,
          duration_ms: e.duration_ms,
          notiz: e.notiz,
        })),
        updated_at: now,
      }))
    );

    const { error } = await supabase
      .from('time_entries')
      .upsert(rows, { onConflict: 'id' });
    if (error) throw new Error(error.message);

    // Lokal-State patchen — sowohl entries als auch teamEntries, je
    // nachdem wo die betroffenen Rows liegen.
    const updatedMap = new Map(updated.map((e) => [e.id, { ...e, updated_at: now }]));
    set({
      entries: get().entries.map((e) => updatedMap.get(e.id) ?? e),
      teamEntries: get().teamEntries.map((e) => updatedMap.get(e.id) ?? e),
      error: null,
    });
    return affected.length;
  },
}));
