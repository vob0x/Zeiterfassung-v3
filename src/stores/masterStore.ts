/**
 * masterStore — Server-First Cache für Master-Daten.
 *
 * Vier Listen (Stakeholder, Projekt, Tätigkeit, Format), alle mit
 * demselben Shape (`MasterDataItem`). Das `name`-Feld ist verschlüsselt
 * im Schema — wir decrypten beim Pull.
 *
 * M2a-Scope: Read-only. Add/Update/Delete kommt M2b.
 */

import { create } from 'zustand';
import { supabase, ensureValidSession } from '@/lib/supabase';
import { decryptField, encryptField, hasEncryptionKey } from '@/lib/crypto';
import { useAuthStore } from './authStore';
import { generateUUID } from '@/lib/utils';
import type {
  Stakeholder,
  Project,
  Activity,
  Format,
  MasterDataItem,
} from '@/types';

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

  renameStakeholder: (id: string, name: string) => Promise<void>;
  renameProject: (id: string, name: string) => Promise<void>;
  renameActivity: (id: string, name: string) => Promise<void>;
  renameFormat: (id: string, name: string) => Promise<void>;

  removeStakeholder: (id: string) => Promise<void>;
  removeProject: (id: string) => Promise<void>;
  removeActivity: (id: string) => Promise<void>;
  removeFormat: (id: string) => Promise<void>;
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

      // Vier Tabellen parallel ziehen — Promise.all spart Round-Trips.
      const [shRes, prRes, actRes, fmtRes] = await Promise.all([
        supabase
          .from('stakeholders')
          .select('*')
          .eq('user_id', profile.id)
          .order('sort_order', { ascending: true }),
        supabase
          .from('projects')
          .select('*')
          .eq('user_id', profile.id)
          .order('sort_order', { ascending: true }),
        supabase
          .from('activities')
          .select('*')
          .eq('user_id', profile.id)
          .order('sort_order', { ascending: true }),
        supabase
          .from('formats')
          .select('*')
          .eq('user_id', profile.id)
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
        Promise.all((prRes.data || []).map(decryptRow)),
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
  // Rename — wieder Server-Confirm, dann Lokal-Update.
  // ───────────────────────────────────────────────────────────────────

  renameStakeholder: async (id, name) => {
    await renameItemServer(TABLES.stakeholders, id, name);
    const trimmed = name.trim();
    set((s) => ({
      stakeholders: s.stakeholders.map((x) =>
        x.id === id ? { ...x, name: trimmed, updated_at: new Date().toISOString() } : x
      ),
      error: null,
    }));
  },
  renameProject: async (id, name) => {
    await renameItemServer(TABLES.projects, id, name);
    const trimmed = name.trim();
    set((s) => ({
      projects: s.projects.map((x) =>
        x.id === id ? { ...x, name: trimmed, updated_at: new Date().toISOString() } : x
      ),
      error: null,
    }));
  },
  renameActivity: async (id, name) => {
    await renameItemServer(TABLES.activities, id, name);
    const trimmed = name.trim();
    set((s) => ({
      activities: s.activities.map((x) =>
        x.id === id ? { ...x, name: trimmed, updated_at: new Date().toISOString() } : x
      ),
      error: null,
    }));
  },
  renameFormat: async (id, name) => {
    await renameItemServer(TABLES.formats, id, name);
    const trimmed = name.trim();
    set((s) => ({
      formats: s.formats.map((x) =>
        x.id === id ? { ...x, name: trimmed, updated_at: new Date().toISOString() } : x
      ),
      error: null,
    }));
  },

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
}));
