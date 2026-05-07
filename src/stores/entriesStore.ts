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
import { decryptField, hasEncryptionKey } from '@/lib/crypto';
import { useAuthStore } from './authStore';
import { formatDateISO } from '@/lib/utils';
import type { TimeEntry } from '@/types';

// Verschlüsselte Felder pro Eintrag — muss exakt mit v2-Schema matchen,
// damit v2 + v3 dieselben Daten lesen können.
const ENCRYPTED_FIELDS = ['stakeholder', 'projekt', 'taetigkeit', 'format', 'notiz'] as const;

interface EntriesState {
  entries: TimeEntry[];
  loading: boolean;
  error: string | null;
  fetchEntries: () => Promise<void>;
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

export const useEntriesStore = create<EntriesState>((set) => ({
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
}));
