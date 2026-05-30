-- Welle 12.2: Admin darf time_entries der Teamkollegen LESEN
-- (für CSV/JSON-Team-Export ausserhalb der App).
--
-- Bisher: time_entries.SELECT = nur eigene. Mit Welle 5 wurde
-- ze_is_admin_of_teammate(uuid) eingeführt; sie wird hier auf
-- die SELECT-Policy ausgeweitet, analog zur bestehenden UPDATE-
-- Policy (te_update_self_or_admin in
-- 20260511000000_team_shared_master_data.sql).

DROP POLICY IF EXISTS "te_select_own" ON public.time_entries;
DROP POLICY IF EXISTS "te_select_self_or_admin" ON public.time_entries;

CREATE POLICY "te_select_self_or_admin" ON public.time_entries
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.ze_is_admin_of_teammate(user_id)
  );
