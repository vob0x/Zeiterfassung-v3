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
import { decryptField, hasEncryptionKey } from '@/lib/crypto';
import { useAuthStore } from './authStore';
import type { Stakeholder, Project, Activity, Format } from '@/types';

interface MasterState {
  stakeholders: Stakeholder[];
  projects: Project[];
  activities: Activity[];
  formats: Format[];
  loading: boolean;
  error: string | null;
  fetchMaster: () => Promise<void>;
}

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
}));
