/**
 * authStore — v3 Auth-State.
 *
 * Verglichen mit v2 deutlich entschlackt:
 *   ❌ kein Local-Fallback (`local_*` Users) — Server-First, kein Login
 *      ohne Supabase
 *   ❌ kein migrateUserData (keine local→supabase Migration)
 *   ❌ kein Team-Key (kommt erst in M5)
 *
 * Was bleibt:
 *   ✅ codeToEmail — Pseudo-E-Mail aus Codename, weil Supabase-Auth
 *      e-mail-basiert ist
 *   ✅ deriveEncryptionKey beim Login/Signup — Personal Key landet in
 *      sessionStorage
 *   ✅ needsPassword-Flag — sessionStorage löscht beim Tab-Close, dann
 *      braucht's das Passwort neu damit der Personal Key wieder
 *      abgeleitet werden kann
 *
 * Auth-State-Machine grob:
 *
 *   ┌─ uninitialized ─→ initializeAuth() ─→ ┬─ unauthenticated ──→ SignIn/SignUp
 *                                            │
 *                                            └─ authenticated ────┬─ keyAvailable      → in der App
 *                                                                 │
 *                                                                 └─ needsPassword     → UnlockForm
 */

import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import {
  deriveEncryptionKey,
  hasEncryptionKey,
  clearEncryptionKey,
} from '@/lib/crypto';
import type { Profile, Session } from '@/types';

interface AuthState {
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  /** Session valide, aber Personal Key fehlt (Tab geschlossen → sessionStorage weg).
   *  UI zeigt UnlockForm bis User Passwort wieder eingibt. */
  needsPassword: boolean;
  signIn: (codename: string, password: string) => Promise<void>;
  signUp: (codename: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  unlock: (password: string) => Promise<void>;
  initializeAuth: () => Promise<void>;
  setError: (error: string | null) => void;
  clearError: () => void;
}

/** Pseudo-E-Mail: codename → "<codename>@zeiterfassung.local". */
function codeToEmail(codename: string): string {
  return `${codename.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}@zeiterfassung.local`;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  profile: null,
  session: null,
  loading: true,
  error: null,
  isAuthenticated: false,
  needsPassword: false,

  initializeAuth: async () => {
    set({ loading: true });
    try {
      const {
        data: { session: supaSession },
      } = await supabase.auth.getSession();

      if (!supaSession?.user) {
        set({ loading: false, isAuthenticated: false, needsPassword: false });
        return;
      }

      // Profile aus Supabase ziehen (ohne Encryption — Codename ist Pseudonym).
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', supaSession.user.id)
        .maybeSingle();

      const codename =
        (profileData?.codename as string | undefined) ||
        (supaSession.user.user_metadata?.codename as string | undefined) ||
        'User';

      const profile: Profile = profileData ?? {
        id: supaSession.user.id,
        codename,
        created_at: supaSession.user.created_at,
        updated_at: supaSession.user.created_at,
      };

      // Falls kein Profile-Row in DB existiert: jetzt anlegen.
      if (!profileData) {
        await supabase.from('profiles').upsert(
          {
            id: supaSession.user.id,
            codename,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );
      }

      const session: Session = {
        user: profile,
        access_token: supaSession.access_token,
        refresh_token: supaSession.refresh_token || '',
      };

      // Personal Key in sessionStorage? Falls nein → needsPassword.
      const keyAvailable = hasEncryptionKey();

      set({
        profile,
        session,
        loading: false,
        isAuthenticated: true,
        needsPassword: !keyAvailable,
      });
    } catch (error) {
      console.error('[Auth] init failed:', error);
      set({ loading: false, isAuthenticated: false, needsPassword: false });
    }
  },

  signIn: async (codename: string, password: string) => {
    set({ loading: true, error: null });
    try {
      const email = codeToEmail(codename);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      if (!data.user) throw new Error('No user returned');

      // Personal Key ableiten und in sessionStorage legen.
      await deriveEncryptionKey(password, data.user.id);

      // Profile sicherstellen (upsert; Codename bleibt plaintext).
      await supabase.from('profiles').upsert(
        {
          id: data.user.id,
          codename,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

      const profile: Profile = {
        id: data.user.id,
        codename,
        created_at: data.user.created_at,
        updated_at: new Date().toISOString(),
      };
      const session: Session = {
        user: profile,
        access_token: data.session?.access_token || '',
        refresh_token: data.session?.refresh_token || '',
      };

      set({
        profile,
        session,
        loading: false,
        isAuthenticated: true,
        needsPassword: false,
      });
    } catch (e: any) {
      const msg =
        e?.message?.includes('Invalid login')
          ? 'Falscher Codename oder Passwort'
          : e?.message || 'Login fehlgeschlagen';
      set({ error: msg, loading: false });
      throw e;
    }
  },

  signUp: async (codename: string, password: string) => {
    set({ loading: true, error: null });
    try {
      const email = codeToEmail(codename);
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { codename } },
      });
      if (error) {
        if (error.message?.includes('already registered')) {
          throw new Error('Codename bereits vergeben');
        }
        throw error;
      }
      if (!data.user) throw new Error('No user returned');

      await deriveEncryptionKey(password, data.user.id);

      await supabase.from('profiles').upsert(
        {
          id: data.user.id,
          codename,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

      const profile: Profile = {
        id: data.user.id,
        codename,
        created_at: data.user.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const session: Session = {
        user: profile,
        access_token: data.session?.access_token || '',
        refresh_token: data.session?.refresh_token || '',
      };

      set({
        profile,
        session,
        loading: false,
        isAuthenticated: true,
        needsPassword: false,
      });
    } catch (e: any) {
      set({
        error: e?.message || 'Registrierung fehlgeschlagen',
        loading: false,
      });
      throw e;
    }
  },

  unlock: async (password: string) => {
    set({ loading: true, error: null });
    try {
      const { profile } = get();
      if (!profile) throw new Error('Keine Session zum Entsperren');
      // Wir leiten den Schlüssel mit dem aktuellen Passwort ab. Falls
      // das Passwort falsch war, merken wir das erst beim ersten
      // Decrypt-Versuch (M2+) — hier ableiten wir nur, kein Test gegen
      // einen echten Server-Fingerprint nötig.
      // Optional: ein zusätzlicher Sign-in-Roundtrip würde das Passwort
      // sofort verifizieren. Mache ich, weil sonst der User mit "scheinbar
      // entsperrt" aber kaputten Decrypts dasitzt.
      const email = codeToEmail(profile.codename);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        throw new Error('Falsches Passwort');
      }
      await deriveEncryptionKey(password, profile.id);
      set({ loading: false, needsPassword: false });
    } catch (e: any) {
      set({ error: e?.message || 'Entsperren fehlgeschlagen', loading: false });
      throw e;
    }
  },

  signOut: async () => {
    set({ loading: true });
    try {
      await supabase.auth.signOut();
    } catch {
      // ignorieren — wenn der Server nicht antwortet, müssen wir
      // trotzdem lokal ausloggen.
    } finally {
      clearEncryptionKey();
      set({
        profile: null,
        session: null,
        loading: false,
        isAuthenticated: false,
        needsPassword: false,
        error: null,
      });
    }
  },

  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),
}));
