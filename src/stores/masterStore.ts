/**
 * masterStore — Server-First Cache für Master-Daten.
 *
 * Vier Listen (Stakeholder, Projekt, Tätigkeit, Format), alle mit
 * demselben Shape (`MasterDataItem`). Das `name`-Feld ist verschlüsselt
 * im Schema — wir decrypten beim Pull.
 *
 * Team-Sharing (Pfad A der M5-Erweiterung): in einem Team enthalten die
 * Listen die Master-Rows ALLER Team-Mitglieder. RLS regelt das, wir
 * filtern nicht mehr per `.eq('user_id', ...)`. Der Picker dedupliziert
 * nach Name, Aggregationen werden durch geteilte Vokabel konsistent.
 *
 * Cascade-Rename:
 *   - Solo + Mitarbeiter: rename eigene Master-Row + cascade eigene Einträge
 *   - Admin im Team: rename ALLE Team-Master-Rows mit gleichem Namen +
 *     cascade ALLE Einträge teamweit
 */

import { create } from 'zustand';
import { supabase, ensureValidSession } from '@/lib/supabase';
import { decryptField, encryptField, hasEncryptionKey } from '@/lib/crypto';
import { useAuthStore } from './authStore';
import { useEntriesStore } from './entriesStore';
import { useTeamStore } from './teamStore';
import { generateUUID } from '@/lib/utils';
import type {
  Stakeholder,
  Project,
  Activity,
  Format,
  MasterDataItem,
  ProjectCategory,
} from '@/types';

/**
 * Bestimmt den Cascade-Scope für Rename basierend auf der aktiven Rolle:
 *   - kein Team:                    'self' (Solo)
 *   - Team + role === 'admin':      'team' (cascade teamweit)
 *   - Team + role === 'mitarbeiter':'self' (eigene Daten, Defensive)
 */
function getRenameScope(): 'self' | 'team' {
  const team = useTeamStore.getState().team;
  if (!team) return 'self';
  const profile = useAuthStore.getState().profile;
  const role = useTeamStore.getState().members.find(
    (m) => m.user_id === profile?.id
  )?.role;
  return role === 'admin' ? 'team' : 'self';
}

/**
 * Vier Master-Daten-Tabellen, gleiches Schema. `MasterTable` typisiert
 * den Tabellennamen so dass TypeScript bei `supabase.from(table)` nicht
 * meckert. Add/Remove/Rename teilen sich die Implementierung über diese
 * Konstante.
 */
type MasterTable = 'stakeholders' | 'projects' | 'activities' | 'formats';

interface MasterState {
  stakeholders: Stakeholder[];
  projects: Project[];
  activities: Activity[];
  formats: Format[];
  loading: boolean;
  error: string | null;
  fetchMaster: () => Promise<void>;

  addStakeholder: (name: string) => Promise<Stakeholder>;
  addProject: (name: string) => Promise<Project>;
  addActivity: (name: string) => Promise<Activity>;
  addFormat: (name: string) => Promise<Format>;

  /**
   * Renamed das Master-Daten-Item UND propagiert den neuen Namen in
   * alle eigenen Time-Entries, die den alten Namen verwenden (Cascade).
   * Returnt die Anzahl der betroffenen Einträge — wird in der UI als
   * Bestätigung angezeigt.
   */
  renameStakeholder: (id: string, name: string) => Promise<number>;
  renameProject: (id: string, name: string) => Promise<number>;
  renameActivity: (id: string, name: string) => Promise<number>;
  renameFormat: (id: string, name: string) => Promise<number>;

  removeStakeholder: (id: string) => Promise<void>;
  removeProject: (id: string) => Promise<void>;
  removeActivity: (id: string) => Promise<void>;
  removeFormat: (id: string) => Promise<void>;

  /**
   * Setzt die Reaktivitäts-Kategorie eines Projekts (Welle 6). NULL setzt
   * zurück auf Heuristik. Cascade über alle Team-Master-Rows mit dem
   * gleichen Namen, wenn der User Admin ist — analog zu Rename.
   */
  setProjectCategory: (id: string, category: ProjectCategory | null) => Promise<void>;
}

/** Maps state-key to DB-table-name. */
const TABLES: Record<
  'stakeholders' | 'projects' | 'activities' | 'formats',
  MasterTable
> = {
  stakeholders: 'stakeholders',
  projects: 'projects',
  activities: 'activities',
  formats: 'formats',
};

/** Decrypted ein Master-Daten-Row und gibt den klartext-`name` zurück. */
async function decryptRow(row: any): Promise<any> {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name ? await decryptField(row.name) : '',
    sort_order: row.sort_order || 0,
    created_at: row.created_at || '',
    updated_at: row.updated_at || '',
  };
}

/**
 * Projekt-Row dekodieren — wie generic decryptRow, aber zieht zusätzlich
 * das `category`-Feld mit (Welle 6, REPORT-PHASE-C). Wert kommt im
 * Klartext aus der DB (kein Encryption-Bedarf — Kategorie ist Metadaten,
 * kein sensitiver Inhalt).
 */
async function decryptProjectRow(row: any): Promise<Project> {
  const base = await decryptRow(row);
  return {
    ...base,
    category: (row.category ?? null) as ProjectCategory | null,
  };
}

/**
 * Generischer Add: legt eine neue Master-Daten-Zeile an, ENCRYPTET das
 * `name`-Feld, wartet auf Server-Confirm und gibt das neue Item zurück.
 *
 * sort_order = max(existing) + 10 (klassischer Trick: Lücken lassen,
 * damit spätere manuelle Reihenfolge-Edits Platz haben).
 */
async function addItemServer(
  table: MasterTable,
  name: string,
  existingItems: MasterDataItem[]
): Promise<MasterDataItem> {
  const profile = useAuthStore.getState().profile;
  if (!profile?.id) throw new Error('Nicht authentifiziert');
  if (!hasEncryptionKey()) throw new Error('Personal Key fehlt');
  const ok = await ensureValidSession();
  if (!ok) throw new Error('Sitzung abgelaufen');

  const trimmed = name.trim();
  if (!trimmed) throw new Error('Name darf nicht leer sein');

  const id = generateUUID();
  const now = new Date().toISOString();
  const maxSort = existingItems.reduce(
    (m, x) => (x.sort_order > m ? x.sort_order : m),
    0
  );
  const encryptedName = await encryptField(trimmed);

  const { error } = await supabase.from(table).insert({
    id,
    user_id: profile.id,
    name: encryptedName,
    sort_order: maxSort + 10,
    created_at: now,
    updated_at: now,
  });
  if (error) throw new Error(error.message);

  return {
    id,
    user_id: profile.id,
    name: trimmed,
    sort_order: maxSort + 10,
    created_at: now,
    updated_at: now,
  };
}

async function renameItemServer(
  table: MasterTable,
  id: string,
  newName: string
): Promise<void> {
  if (!hasEncryptionKey()) throw new Error('Personal Key fehlt');
  const ok = await ensureValidSession();
  if (!ok) throw new Error('Sitzung abgelaufen');

  const trimmed = newName.trim();
  if (!trimmed) throw new Error('Name darf nicht leer sein');

  const encryptedName = await encryptField(trimmed);
  const { error } = await supabase
    .from(table)
    .update({ name: encryptedName, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Admin-Variante: alle Team-Master-Rows mit demselben Namen umbenennen.
 * RLS lässt nur durch wenn current user Admin in einem gemeinsamen Team
 * mit dem Row-Owner ist (oder selbst Owner) — siehe Migration
 * 20260511000000_team_shared_master_data.
 *
 * Returnt die Anzahl umbenannter Master-Rows.
 */
async function renameMasterByNameTeamWide(
  table: MasterTable,
  newName: string,
  candidateIds: string[]
): Promise<number> {
  if (candidateIds.length === 0) return 0;
  const ok = await ensureValidSession();
  if (!ok) throw new Error('Sitzung abgelaufen');
  if (!hasEncryptionKey()) throw new Error('Personal Key fehlt');

  const encryptedName = await encryptField(newName);
  const now = new Date().toISOString();

  // Eine Update-Query für alle IDs gleichzeitig — Round-Trip-sparend.
  const { error, count } = await supabase
    .from(table)
    .update({ name: encryptedName, updated_at: now }, { count: 'exact' })
    .in('id', candidateIds);
  if (error) throw new Error(error.message);
  return count ?? candidateIds.length;
}

async function removeItemServer(
  table: MasterTable,
  id: string
): Promise<void> {
  const ok = await ensureValidSession();
  if (!ok) throw new Error('Sitzung abgelaufen');
  // Master-Daten haben kein deleted_at — das ist Cleanup-Daten, kein
  // Recovery-Use-Case. Echtes DELETE.
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Map: Tabellen-Name → State-Slot, damit der Generic-Renamer den State
 * nach Erfolg patchen kann ohne 4 Switch-Cases.
 */
const TABLE_TO_STATE_KEY: Record<
  MasterTable,
  'stakeholders' | 'projects' | 'activities' | 'formats'
> = {
  stakeholders: 'stakeholders',
  projects: 'projects',
  activities: 'activities',
  formats: 'formats',
};

/**
 * Generischer Rename: macht den Cascade-Algorithmus einmal und wird
 * von allen vier renameXxx-Methoden aufgerufen. Returnt die Anzahl
 * der gecascadeten Einträge (für UI-Feedback).
 */
async function renameMasterWithCascade(
  set: (
    update:
      | Partial<MasterState>
      | ((s: MasterState) => Partial<MasterState>)
  ) => void,
  table: MasterTable,
  id: string,
  newName: string,
  entryField: 'stakeholder' | 'projekt' | 'taetigkeit' | 'format'
): Promise<number> {
  const stateKey = TABLE_TO_STATE_KEY[table];
  const state = useMasterStore.getState();
  const list = state[stateKey] as MasterDataItem[];
  const old = list.find((x) => x.id === id);
  if (!old) throw new Error('Eintrag nicht gefunden');
  const trimmed = newName.trim();
  if (!trimmed || trimmed === old.name) return 0;

  const scope = getRenameScope();
  const now = new Date().toISOString();

  if (scope === 'team') {
    // Admin-Cascade: alle Master-Rows mit gleichem Namen finden und
    // alle gemeinsam umbenennen. RLS lässt das durch (Migration
    // 20260511…) — Mitarbeiter-Rows der Kollegen mit gleichem Namen
    // werden ebenfalls aktualisiert.
    const candidates = list.filter((x) => x.name === old.name);
    await renameMasterByNameTeamWide(
      table,
      trimmed,
      candidates.map((x) => x.id)
    );
    // Lokal-State: alle gleichnamigen Items aktualisieren
    const idsToUpdate = new Set(candidates.map((x) => x.id));
    set((s) => ({
      [stateKey]: (s[stateKey] as MasterDataItem[]).map((x) =>
        idsToUpdate.has(x.id) ? { ...x, name: trimmed, updated_at: now } : x
      ),
      error: null,
    }) as Partial<MasterState>);
  } else {
    // Self-Scope: nur eigenes Master-Row updaten
    await renameItemServer(table, id, trimmed);
    set((s) => ({
      [stateKey]: (s[stateKey] as MasterDataItem[]).map((x) =>
        x.id === id ? { ...x, name: trimmed, updated_at: now } : x
      ),
      error: null,
    }) as Partial<MasterState>);
  }

  // Eintrags-Cascade — gleicher Scope wie Master-Update
  return useEntriesStore
    .getState()
    .bulkRenameField(entryField, old.name, trimmed, scope);
}

export const useMasterStore = create<MasterState>((set) => ({
  stakeholders: [],
  projects: [],
  activities: [],
  formats: [],
  loading: false,
  error: null,

  fetchMaster: async () => {
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

      // Kein .eq('user_id') mehr — RLS gibt: ohne Team nur eigene Rows,
      // mit Team auch die der Mitglieder. Vier Tabellen parallel.
      const [shRes, prRes, actRes, fmtRes] = await Promise.all([
        supabase
          .from('stakeholders')
          .select('*')
          .order('sort_order', { ascending: true }),
        supabase
          .from('projects')
          .select('*')
          .order('sort_order', { ascending: true }),
        supabase
          .from('activities')
          .select('*')
          .order('sort_order', { ascending: true }),
        supabase
          .from('formats')
          .select('*')
          .order('sort_order', { ascending: true }),
      ]);

      // Erste Fehlermeldung übernehmen, falls eine der vier failt
      const firstError = shRes.error || prRes.error || actRes.error || fmtRes.error;
      if (firstError) {
        set({ error: firstError.message, loading: false });
        return;
      }

      const [stakeholders, projects, activities, formats] = await Promise.all([
        Promise.all((shRes.data || []).map(decryptRow)),
        // Projekt-Rows tragen zusätzlich `category` für Welle 6
        Promise.all((prRes.data || []).map(decryptProjectRow)),
        Promise.all((actRes.data || []).map(decryptRow)),
        Promise.all((fmtRes.data || []).map(decryptRow)),
      ]);

      set({
        stakeholders,
        projects,
        activities,
        formats,
        loading: false,
      });
    } catch (e: any) {
      set({ error: e?.message || 'Fehler beim Laden', loading: false });
    }
  },

  // ───────────────────────────────────────────────────────────────────
  // Add — vier Wrapper um addItemServer, je mit dem richtigen
  // State-Slot zum Updaten. Server-Confirm vor Lokal-Update.
  // ───────────────────────────────────────────────────────────────────

  addStakeholder: async (name) => {
    const item = await addItemServer(TABLES.stakeholders, name, useMasterStore.getState().stakeholders);
    set((s) => ({ stakeholders: [...s.stakeholders, item], error: null }));
    return item;
  },
  addProject: async (name) => {
    const item = await addItemServer(TABLES.projects, name, useMasterStore.getState().projects);
    set((s) => ({ projects: [...s.projects, item], error: null }));
    return item;
  },
  addActivity: async (name) => {
    const item = await addItemServer(TABLES.activities, name, useMasterStore.getState().activities);
    set((s) => ({ activities: [...s.activities, item], error: null }));
    return item;
  },
  addFormat: async (name) => {
    const item = await addItemServer(TABLES.formats, name, useMasterStore.getState().formats);
    set((s) => ({ formats: [...s.formats, item], error: null }));
    return item;
  },

  // ───────────────────────────────────────────────────────────────────
  // Rename mit Cascade
  //
  // Rolle-abhängiger Scope (siehe getRenameScope):
  //   - Solo / Mitarbeiter: nur eigene Master-Row + eigene Einträge
  //   - Admin im Team:      ALLE Master-Rows mit gleichem Namen +
  //                          ALLE Einträge teamweit
  //
  // Reihenfolge: Master-Row(s) updaten → Eintrags-Cascade → Lokal-State.
  // Bei Failure des zweiten Schritts ist die Master-Row schon um —
  // akzeptiert, User kann via Verwaltung nacharbeiten.
  // ───────────────────────────────────────────────────────────────────

  renameStakeholder: (id, name) =>
    renameMasterWithCascade(set, 'stakeholders', id, name, 'stakeholder'),
  renameProject: (id, name) =>
    renameMasterWithCascade(set, 'projects', id, name, 'projekt'),
  renameActivity: (id, name) =>
    renameMasterWithCascade(set, 'activities', id, name, 'taetigkeit'),
  renameFormat: (id, name) =>
    renameMasterWithCascade(set, 'formats', id, name, 'format'),

  // ───────────────────────────────────────────────────────────────────
  // Remove — echter DB-DELETE (kein Soft-Delete für Master-Daten).
  // ───────────────────────────────────────────────────────────────────

  removeStakeholder: async (id) => {
    await removeItemServer(TABLES.stakeholders, id);
    set((s) => ({ stakeholders: s.stakeholders.filter((x) => x.id !== id), error: null }));
  },
  removeProject: async (id) => {
    await removeItemServer(TABLES.projects, id);
    set((s) => ({ projects: s.projects.filter((x) => x.id !== id), error: null }));
  },
  removeActivity: async (id) => {
    await removeItemServer(TABLES.activities, id);
    set((s) => ({ activities: s.activities.filter((x) => x.id !== id), error: null }));
  },
  removeFormat: async (id) => {
    await removeItemServer(TABLES.formats, id);
    set((s) => ({ formats: s.formats.filter((x) => x.id !== id), error: null }));
  },

  // ───────────────────────────────────────────────────────────────────
  // Welle 6 — Projekt-Kategorie setzen (Reaktivitäts-Klassifikation)
  //
  // category ist Klartext-Metadaten (kein Encryption-Bedarf). Setzen
  // auf null setzt zurück auf Heuristik aus dem Projektnamen.
  //
  // Cascade-Logik analog Rename: Admin im Team setzt für alle Team-
  // Master-Rows mit demselben Projekt-Namen; Solo / Mitarbeiter nur
  // die eigene Row.
  // ───────────────────────────────────────────────────────────────────

  setProjectCategory: async (id, category) => {
    const ok = await ensureValidSession();
    if (!ok) throw new Error('Sitzung abgelaufen');

    const list = useMasterStore.getState().projects;
    const own = list.find((p) => p.id === id);
    if (!own) throw new Error('Projekt nicht gefunden');

    const scope = getRenameScope();
    const now = new Date().toISOString();

    if (scope === 'team') {
      // Admin-Cascade: alle Team-Projekte mit gleichem Namen taggen
      const candidates = list.filter((p) => p.name === own.name);
      const ids = candidates.map((p) => p.id);
      const { error } = await supabase
        .from('projects')
        .update({ category, updated_at: now })
        .in('id', ids);
      if (error) throw new Error(error.message);
      const idSet = new Set(ids);
      set((s) => ({
        projects: s.projects.map((p) =>
          idSet.has(p.id) ? { ...p, category, updated_at: now } : p
        ),
        error: null,
      }));
    } else {
      // Self-Scope: nur eigene Row
      const { error } = await supabase
        .from('projects')
        .update({ category, updated_at: now })
        .eq('id', id);
      if (error) throw new Error(error.message);
      set((s) => ({
        projects: s.projects.map((p) =>
          p.id === id ? { ...p, category, updated_at: now } : p
        ),
        error: null,
      }));
    }
  },
}));
