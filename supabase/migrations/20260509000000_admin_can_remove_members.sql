-- ============================================================
-- Patch: Admin darf andere Mitglieder aus dem Team entfernen
-- ============================================================
-- Bisherige tm_delete_own-Policy erlaubt nur Self-Leave (auth.uid() =
-- user_id). M5b.1 fügt Member-Removal hinzu: ein Admin darf jede Row
-- in team_members des eigenen Teams löschen.
--
-- ze_roles-Update/Delete sind schon admin-fähig (siehe initial-Migration),
-- müssen nicht angefasst werden.
-- ============================================================

DROP POLICY IF EXISTS "tm_delete_own" ON public.team_members;

CREATE POLICY "tm_delete_self_or_admin" ON public.team_members
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id              -- self-leave
    OR public.ze_is_admin(team_id)    -- admin removes member
  );

NOTIFY pgrst, 'reload schema';
