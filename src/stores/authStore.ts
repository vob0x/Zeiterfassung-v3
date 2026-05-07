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
  setTeamKey,
  hasTeamKey,
  clearTeamKey,
  decryptTeamKeyWithPersonalKey,
  decryptTeamKeyFromTransport,
  encryptTeamKeyWithPersonalKey,
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

/**
 * Holt den Team Key aus der DB und legt ihn in sessionStorage.
 *
 * v3 muss das machen weil v2 alle Daten Team-Key-encrypted (nicht
 * Personal-Key-encrypted), sobald der User in einem Team ist. Ohne
 * Team Key in v3 bleiben alle Decryption-Versuche leer → die App
 * sieht überall "—".
 *
 * Drei-Stufen-Fallback (1:1 von v2):
 *   Pfad 1: team_members.encrypted_team_key (mit Personal Key
 *           verschlüsselt) → entschlüsseln mit Personal Key
 *   Pfad 2: teams.encrypted_team_key (mit Transport Key vom Invite-
 *           Code abgeleitet) → entschlüsseln und gleichzeitig auf
 *           team_members nachziehen für nächstes Mal
 *   Pfad 3: keine Team Daten verfügbar → still ablehnen (Solo-User
 *           oder Team-Daten existieren wirklich nicht)
 *
 * Vollständiges Team-Setup (Create/Join/Generate-Team-Key/Invite-
 * Code-Pfad) kommt in M5; M3a hat nur den Read-Restore-Pfad damit
 * v3 bestehende v2-Daten überhaupt entschlüsseln kann.
 *
 * Ausführliches Logging ist Absicht — der Pfad ist kritisch für die
 * Datenlesbarkeit, lieber zu viel als zu wenig Diagnostik. Wird in
 * M5 reduziert sobald stabil.
 */
async function restoreTeamKeyIfAny(userId: string): Promise<void> {
  if (!hasEncryptionKey()) {
    console.info('[Auth/Team-Key] skipped: kein Personal Key');
    return;
  }

  // 1. Membership + ggf. personal-encrypted Kopie holen
  type MemberRow = { team_id: string; encrypted_team_key: string | null };
  let memberRow: MemberRow;
  try {
    const { data, error } = await supabase
      .from('team_members')
      .select('team_id, encrypted_team_key')
      .eq('user_id', userId)
      .limit(1);
    if (error) {
      console.warn('[Auth/Team-Key] team_members query error:', error.message);
      return;
    }
    if (!data || data.length === 0) {
      console.info('[Auth/Team-Key] kein team_members-Row → User ist Solo');
      return;
    }
    memberRow = data[0] as unknown as MemberRow;
  } catch (e) {
    console.warn('[Auth/Team-Key] team_members query exception:', e);
    return;
  }

  // Pfad 1: Personal-Key-encrypted Kopie
  if (memberRow.encrypted_team_key) {
    try {
      const teamKeyB64 = await decryptTeamKeyWithPersonalKey(
        memberRow.encrypted_team_key
      );
      setTeamKey(teamKeyB64);
      console.info('[Auth/Team-Key] restored via Pfad 1 (personal-key copy)');
      return;
    } catch (e) {
      console.warn(
        '[Auth/Team-Key] Pfad 1 (personal-key copy) failed:',
        e
      );
      // weiter zu Pfad 2
    }
  } else {
    console.info('[Auth/Team-Key] Pfad 1 leer (encrypted_team_key=null)');
  }

  // Pfad 2: Transport-Key-encrypted Kopie auf teams-Row
  try {
    const { data, error } = await supabase
      .from('teams')
      .select('id, invite_code, encrypted_team_key')
      .eq('id', memberRow.team_id)
      .single();
    if (error) {
      console.warn('[Auth/Team-Key] teams query error:', error.message);
      return;
    }
    if (!data?.encrypted_team_key || !data?.invite_code) {
      console.info(
        '[Auth/Team-Key] Pfad 2 leer (teams.encrypted_team_key oder invite_code fehlt)'
      );
      return;
    }
    const teamKeyB64 = await decryptTeamKeyFromTransport(
      data.encrypted_team_key as string,
      data.invite_code as string,
      data.id as string
    );
    setTeamKey(teamKeyB64);
    console.info('[Auth/Team-Key] restored via Pfad 2 (transport-key copy)');

    // Bonus: Personal-Key-encrypted Kopie auf team_members nachziehen,
    // damit nächstes Login direkt Pfad 1 nutzen kann (schneller, ohne
    // teams-Roundtrip).
    try {
      const wrapped = await encryptTeamKeyWithPersonalKey(teamKeyB64);
      await supabase
        .from('team_members')
        .update({ encrypted_team_key: wrapped })
        .eq('user_id', userId)
        .eq('team_id', memberRow.team_id);
      console.info(
        '[Auth/Team-Key] Pfad 1 nachgezogen (team_members.encrypted_team_key gesetzt)'
      );
    } catch (e) {
      console.warn('[Auth/Team-Key] Backfill auf Pfad 1 failed:', e);
      // Nicht fatal — Pfad 2 funktioniert weiterhin nächstes Mal.
    }
  } catch (e) {
    console.warn('[Auth/Team-Key] Pfad 2 exception:', e);
  }
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

      // Falls der Personal Key noch da ist (Page-Reload, kein Tab-Close),
      // gleich auch den Team Key zurückholen falls vorhanden — sonst
      // bleiben Master-Daten + Einträge leer beim ersten Pull.
      if (keyAvailable && !hasTeamKey()) {
        await restoreTeamKeyIfAny(supaSession.user.id);
      }

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

      // Team Key restore (no-op wenn Solo-User).
      await restoreTeamKeyIfAny(data.user.id);

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
      // Auch beim Unlock den Team Key zurückholen — sonst sieht der
      // User nach dem Entsperren leere Team-Daten.
      await restoreTeamKeyIfAny(profile.id);
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
      clearTeamKey();
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
