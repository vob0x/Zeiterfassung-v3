-- ============================================================
-- Patch: ze_roles_insert-Policy verschärfen
-- ============================================================
-- Die initiale Policy erlaubte authenticated Usern, ihre eigene Rolle
-- per Self-Insert zu setzen — als Workaround für den Client-side
-- ze_roles-Insert in createTeam/joinTeam.
--
-- Seit dem Code-Cleanup (M5a-Final) macht das ausschließlich der
-- DB-Trigger via SECURITY DEFINER. Die Self-Insert-Erlaubnis wäre
-- jetzt eine kleine Privilege-Escalation-Lücke (Auth-User könnte
-- sich theoretisch in einem fremden Team selbst als Admin eintragen,
-- wenn er die team_id kennt).
--
-- Fix: Policy auf admin-only zurückziehen.
-- ============================================================

DROP POLICY IF EXISTS "ze_roles_insert" ON public.ze_roles;
CREATE POLICY "ze_roles_insert" ON public.ze_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.ze_is_admin(team_id));

-- Trigger umgeht RLS via SECURITY DEFINER — kein Bedarf, hier
-- weiterhin Self-Insert zu erlauben.

NOTIFY pgrst, 'reload schema';
