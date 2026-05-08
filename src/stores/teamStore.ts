/**
 * teamStore — Team-Membership-State.
 *
 * M5a-Scope:
 *   - createTeam: Team Key generieren, doppelt wrappen (Personal +
 *     Transport), teams + team_members-Row anlegen. Admin-Rolle setzt
 *     ein DB-Trigger automatisch.
 *   - joinTeam: Team via Invite-Code finden, Team Key via Transport-Key
 *     entschlüsseln, mit Personal Key gewrapped in team_members ablegen.
 *     Mitarbeiter-Rolle (oder Admin, falls Re-Join des Creators) setzt
 *     ein DB-Trigger automatisch.
 *   - leaveTeam: team_members + ze_roles-Row löschen, Team Key clearen
 *   - syncTeamData: aktuelles Team + Mitglieder + Codenames + Rollen laden
 *
 * Rollen werden serverseitig per Trigger autoritativ verwaltet — der
 * Client schreibt nicht direkt in ze_roles. Siehe supabase-migrations.
 *
 * M5b kommt: Rollen-Management (set/get role), Cross-Member-Daten im
 * Dashboard, Member-Removal als Admin.
 */

import { create } from 'zustand';
import { supabase, ensureValidSession } from '@/lib/supabase';
import {
  generateTeamKey,
  encryptTeamKeyForTransport,
  encryptTeamKeyWithPersonalKey,
  decryptTeamKeyFromTransport,
  setTeamKey,
  hasEncryptionKey,
  clearTeamKey,
} from '@/lib/crypto';
import { generateUUID } from '@/lib/utils';
import { useAuthStore } from './authStore';
import type { Team, TeamMemberWithRole, ZeRole } from '@/types';

interface TeamState {
  connected: boolean;
  team: Team | null;
  members: TeamMemberWithRole[];
  loading: boolean;
  error: string | null;

  syncTeamData: () => Promise<void>;
  createTeam: (name: string) => Promise<void>;
  joinTeam: (inviteCode: string) => Promise<void>;
  leaveTeam: () => Promise<void>;
  /**
   * Admin: Rolle eines Mitglieds ändern. RLS verhindert nicht-Admin-
   * Aufrufe — wir validieren trotzdem clientseitig für klare Fehler.
   */
  setMemberRole: (userId: string, role: ZeRole) => Promise<void>;
  /**
   * Admin: Mitglied aus dem Team entfernen. Löscht ze_roles + team_members
   * für den Ziel-User. Self-Removal nicht erlaubt — dafür gibt's leaveTeam.
   */
  removeMember: (userId: string) => Promise<void>;
  clearError: () => void;
}

/**
 * 6-Zeichen-Invite-Code, alphabet ohne mehrdeutige Zeichen (kein 0/O,
 * kein 1/I/L). Random aus crypto-Bytes — für 6 Zeichen aus 32-element-
 * Alphabet ist die Kollisionschance bei wenigen Teams praktisch null.
 */
const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function generateInviteCode(): string {
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join('');
}

/**
 * Lädt für eine Liste user_ids die Codenames aus profiles.
 * Cache-Lookup pro Sync-Call (kein eigener Store).
 */
async function fetchCodenames(
  userIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (userIds.length === 0) return map;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, codename')
    .in('id', userIds);
  if (error || !data) return map;
  for (const p of data) {
    map.set(p.id, p.codename);
  }
  return map;
}

/**
 * Lädt ze_roles für ein Team. Rolle-Default = 'mitarbeiter' falls
 * kein Row vorhanden.
 */
async function fetchRoles(
  teamId: string
): Promise<Map<string, ZeRole>> {
  const map = new Map<string, ZeRole>();
  const { data, error } = await supabase
    .from('ze_roles')
    .select('user_id, role')
    .eq('team_id', teamId);
  if (error || !data) return map;
  for (const r of data) {
    if (r.role === 'admin' || r.role === 'mitarbeiter') {
      map.set(r.user_id, r.role);
    }
  }
  return map;
}

export const useTeamStore = create<TeamState>((set, get) => ({
  connected: false,
  team: null,
  members: [],
  loading: false,
  error: null,

  clearError: () => set({ error: null }),

  syncTeamData: async () => {
    const profile = useAuthStore.getState().profile;
    if (!profile?.id) {
      set({ connected: false, team: null, members: [] });
      return;
    }
    const ok = await ensureValidSession();
    if (!ok) return;

    set({ loading: true, error: null });
    try {
      // 1. Eigene team_members-Row holen — daraus geht hervor in welchem Team
      const { data: ownRow } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', profile.id)
        .limit(1);
      if (!ownRow || ownRow.length === 0) {
        set({ connected: false, team: null, members: [], loading: false });
        return;
      }
      const teamId = ownRow[0].team_id as string;

      // 2. Team-Row + alle Mitglieder + Rollen + Codenames parallel
      const [teamRes, membersRes, roles] = await Promise.all([
        supabase.from('teams').select('*').eq('id', teamId).single(),
        supabase
          .from('team_members')
          .select('*')
          .eq('team_id', teamId)
          .order('joined_at', { ascending: true }),
        fetchRoles(teamId),
      ]);

      if (teamRes.error || !teamRes.data) {
        throw new Error(teamRes.error?.message || 'Team nicht gefunden');
      }
      if (membersRes.error || !membersRes.data) {
        throw new Error(membersRes.error?.message || 'Mitglieder nicht ladbar');
      }

      const userIds = membersRes.data.map((m: any) => m.user_id);
      const codenames = await fetchCodenames(userIds);

      const team: Team = teamRes.data as Team;
      const members: TeamMemberWithRole[] = membersRes.data.map((m: any) => ({
        team_id: m.team_id,
        user_id: m.user_id,
        display_name: m.display_name || null,
        joined_at: m.joined_at,
        codename: codenames.get(m.user_id) || m.display_name || '?',
        role: roles.get(m.user_id) || 'mitarbeiter',
      }));

      set({ connected: true, team, members, loading: false });
    } catch (e: any) {
      set({
        error: e?.message || 'Team-Sync fehlgeschlagen',
        loading: false,
      });
    }
  },

  createTeam: async (name: string) => {
    const profile = useAuthStore.getState().profile;
    if (!profile?.id) throw new Error('Nicht authentifiziert');
    if (!hasEncryptionKey()) throw new Error('Personal Key fehlt');
    const ok = await ensureValidSession();
    if (!ok) throw new Error('Sitzung abgelaufen');

    const trimmed = name.trim();
    if (!trimmed) throw new Error('Team-Name darf nicht leer sein');

    set({ loading: true, error: null });
    try {
      // 1. Team Key + IDs erzeugen
      const teamKeyB64 = await generateTeamKey();
      const teamId = generateUUID();
      const inviteCode = generateInviteCode();

      // 2. Team Key doppelt wrappen
      const transportEncrypted = await encryptTeamKeyForTransport(
        teamKeyB64,
        inviteCode,
        teamId
      );
      const personalEncrypted = await encryptTeamKeyWithPersonalKey(teamKeyB64);

      const now = new Date().toISOString();

      // 3. teams-Row anlegen (mit transport-encrypted Key für Beitritts-Pfad)
      const { error: teamError } = await supabase.from('teams').insert({
        id: teamId,
        name: trimmed,
        invite_code: inviteCode,
        creator_id: profile.id,
        encrypted_team_key: transportEncrypted,
        created_at: now,
        updated_at: now,
      });
      if (teamError) throw new Error(teamError.message);

      // 4. team_members-Row für den Creator (mit personal-encrypted Key
      //    für schnellen Login-Pfad)
      const { error: memberError } = await supabase.from('team_members').insert({
        team_id: teamId,
        user_id: profile.id,
        encrypted_team_key: personalEncrypted,
        display_name: profile.codename,
        joined_at: now,
      });
      if (memberError) throw new Error(memberError.message);

      // 5. ze_roles wird automatisch via DB-Trigger gesetzt:
      //    - ze_seed_creator_admin_role_trg (AFTER INSERT ON teams)
      //      → Creator bekommt 'admin'
      //    - ze_seed_member_role_trg (AFTER INSERT ON team_members)
      //      → kein Konflikt, ON CONFLICT DO NOTHING

      // 6. Team Key in Session
      setTeamKey(teamKeyB64);

      // 7. State sync (lädt sauber, inkl. Mitglieder-Liste)
      await get().syncTeamData();
    } catch (e: any) {
      set({
        error: e?.message || 'Team-Erstellung fehlgeschlagen',
        loading: false,
      });
      throw e;
    }
  },

  joinTeam: async (inviteCode: string) => {
    const profile = useAuthStore.getState().profile;
    if (!profile?.id) throw new Error('Nicht authentifiziert');
    if (!hasEncryptionKey()) throw new Error('Personal Key fehlt');
    const ok = await ensureValidSession();
    if (!ok) throw new Error('Sitzung abgelaufen');

    const code = inviteCode.trim().toUpperCase();
    if (!code) throw new Error('Invite-Code darf nicht leer sein');

    set({ loading: true, error: null });
    try {
      // 1. Team via Invite-Code suchen
      const { data: teamRow, error: teamErr } = await supabase
        .from('teams')
        .select('id, encrypted_team_key, invite_code')
        .eq('invite_code', code)
        .maybeSingle();
      if (teamErr) throw new Error(teamErr.message);
      if (!teamRow) throw new Error('Ungültiger Invite-Code');
      if (!teamRow.encrypted_team_key) {
        throw new Error('Team hat keinen Schlüssel — Setup unvollständig');
      }

      // 2. Team Key über Transport entschlüsseln
      const teamKeyB64 = await decryptTeamKeyFromTransport(
        teamRow.encrypted_team_key as string,
        code,
        teamRow.id as string
      );

      // 3. Mit Personal Key wrappen für team_members-Row
      const personalEncrypted = await encryptTeamKeyWithPersonalKey(teamKeyB64);

      // 4. Bereits Mitglied? Falls ja: nur Key updaten, nicht doppelt einfügen
      const { data: existing } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('team_id', teamRow.id)
        .eq('user_id', profile.id)
        .maybeSingle();

      const now = new Date().toISOString();

      if (existing) {
        await supabase
          .from('team_members')
          .update({ encrypted_team_key: personalEncrypted })
          .eq('team_id', teamRow.id)
          .eq('user_id', profile.id);
      } else {
        const { error: memberErr } = await supabase
          .from('team_members')
          .insert({
            team_id: teamRow.id,
            user_id: profile.id,
            encrypted_team_key: personalEncrypted,
            display_name: profile.codename,
            joined_at: now,
          });
        if (memberErr) throw new Error(memberErr.message);

        // ze_roles wird automatisch via DB-Trigger gesetzt:
        // ze_seed_member_role_trg → 'mitarbeiter' für Standard-Beitritt,
        // 'admin' falls der User Creator des Teams ist (Re-Join-Fall).
      }

      // 5. Team Key in Session
      setTeamKey(teamKeyB64);

      // 6. State sync
      await get().syncTeamData();
    } catch (e: any) {
      set({
        error: e?.message || 'Beitritt fehlgeschlagen',
        loading: false,
      });
      throw e;
    }
  },

  leaveTeam: async () => {
    const profile = useAuthStore.getState().profile;
    const team = get().team;
    if (!profile?.id || !team) {
      // Nichts zu verlassen
      clearTeamKey();
      set({ connected: false, team: null, members: [] });
      return;
    }
    const ok = await ensureValidSession();
    if (!ok) throw new Error('Sitzung abgelaufen');

    set({ loading: true, error: null });
    try {
      // ze_roles zuerst — falls FK-Constraint, sonst macht's der Cascade
      await supabase
        .from('ze_roles')
        .delete()
        .eq('team_id', team.id)
        .eq('user_id', profile.id);

      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('team_id', team.id)
        .eq('user_id', profile.id);
      if (error) throw new Error(error.message);

      clearTeamKey();
      set({
        connected: false,
        team: null,
        members: [],
        loading: false,
        error: null,
      });
    } catch (e: any) {
      set({
        error: e?.message || 'Verlassen fehlgeschlagen',
        loading: false,
      });
      throw e;
    }
  },

  setMemberRole: async (userId: string, role: ZeRole) => {
    const profile = useAuthStore.getState().profile;
    const team = get().team;
    if (!profile?.id || !team) throw new Error('Nicht in einem Team');

    // Clientseitige Vorab-Prüfung — RLS würde sonst zwar greifen, aber
    // ein klarer Fehler ist besser als ein stilles Forbidden.
    const me = get().members.find((m) => m.user_id === profile.id);
    if (me?.role !== 'admin') throw new Error('Nur Admins dürfen Rollen ändern');

    const ok = await ensureValidSession();
    if (!ok) throw new Error('Sitzung abgelaufen');

    set({ loading: true, error: null });
    try {
      // Upsert — falls keine ze_roles-Row existiert, anlegen.
      const { error } = await supabase
        .from('ze_roles')
        .upsert(
          {
            team_id: team.id,
            user_id: userId,
            role,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'team_id,user_id' }
        );
      if (error) throw new Error(error.message);

      // Lokal-State updaten — kein voller resync nötig
      set({
        members: get().members.map((m) =>
          m.user_id === userId ? { ...m, role } : m
        ),
        loading: false,
      });
    } catch (e: any) {
      set({
        error: e?.message || 'Rollen-Update fehlgeschlagen',
        loading: false,
      });
      throw e;
    }
  },

  removeMember: async (userId: string) => {
    const profile = useAuthStore.getState().profile;
    const team = get().team;
    if (!profile?.id || !team) throw new Error('Nicht in einem Team');
    if (userId === profile.id) {
      throw new Error('Dich selbst kannst du nicht entfernen — nutze "Team verlassen"');
    }

    const me = get().members.find((m) => m.user_id === profile.id);
    if (me?.role !== 'admin') throw new Error('Nur Admins dürfen Mitglieder entfernen');

    const ok = await ensureValidSession();
    if (!ok) throw new Error('Sitzung abgelaufen');

    set({ loading: true, error: null });
    try {
      // ze_roles erst (FK-safe), dann team_members
      await supabase
        .from('ze_roles')
        .delete()
        .eq('team_id', team.id)
        .eq('user_id', userId);

      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('team_id', team.id)
        .eq('user_id', userId);
      if (error) throw new Error(error.message);

      set({
        members: get().members.filter((m) => m.user_id !== userId),
        loading: false,
      });
    } catch (e: any) {
      set({
        error: e?.message || 'Entfernen fehlgeschlagen',
        loading: false,
      });
      throw e;
    }
  },
}));
