/**
 * useRole — Liest die aktive Rolle des eingeloggten Users im aktuellen Team.
 *
 * Returns:
 *   - 'admin' | 'mitarbeiter' wenn User in einem Team ist
 *   - null wenn ohne Team (Single-User-Mode)
 *
 * Praktisch zum Gating von UI-Elementen:
 *   const role = useRole();
 *   const isAdmin = role === 'admin' || role === null;
 *
 * Hinweis: ohne Team (null) wird bewusst als „voller Zugriff" interpretiert
 * — Single-User hat keine Restriktionen.
 */

import { useTeamStore } from '@/stores/teamStore';
import { useAuthStore } from '@/stores/authStore';
import type { ZeRole } from '@/types';

export function useRole(): ZeRole | null {
  const profile = useAuthStore((s) => s.profile);
  const connected = useTeamStore((s) => s.connected);
  const members = useTeamStore((s) => s.members);

  if (!connected || !profile?.id) return null;
  return members.find((m) => m.user_id === profile.id)?.role ?? null;
}

/**
 * Convenience: Darf der aktuelle User adminähnliche Aktionen?
 * - Single-User (kein Team) → true
 * - Admin im Team → true
 * - Mitarbeiter im Team → false
 */
export function useIsAdmin(): boolean {
  const role = useRole();
  return role === null || role === 'admin';
}
