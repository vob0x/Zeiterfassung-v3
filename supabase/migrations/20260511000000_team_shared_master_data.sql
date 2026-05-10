-- ============================================================
-- Team-Shared Master-Data + Admin Cascade-Rename
-- ============================================================
-- Pfad A der M5-Erweiterung (siehe ARCHITECTURE.md):
--   1. Team-Mitglieder dürfen Master-Daten-Rows der Kollegen LESEN
--      → Picker zeigen einheitliche Vorschläge, Aggregationen werden
--        konsistent (alle picken aus derselben Liste).
--   2. Admin im Team darf Master-Daten-Rows der Kollegen UPDATEN
--      → Cascade-Rename kann Team-weit propagieren.
--   3. Admin im Team darf time_entries der Kollegen UPDATEN
--      → Cascade-Rename trifft auch fremde Einträge.
--
-- DELETE bleibt bewusst own-only — Admin sollte nicht aus Versehen
-- Mitarbeiter-Master-Items löschen können. Wenn das später nötig wird,
-- separate Migration.
--
-- ze_is_admin(team_id) wurde in 20260508000000_team_tables eingeführt.
-- Wir nutzen es hier konsistent.
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────
-- Helper: gibt's einen Team-Kollegen für (current user, target user)?
-- Vermeidet RLS-Recursion bei master-Table-Policies.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ze_is_teammate(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_members tm1
    JOIN public.team_members tm2 ON tm2.team_id = tm1.team_id
    WHERE tm1.user_id = auth.uid()
      AND tm2.user_id = target_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.ze_is_teammate(uuid) TO authenticated;

-- Helper: ist der current user Admin in EINEM Team das den Target-User
-- enthält? Nutzen wir um Master-Updates auf Teamkollegen zu erlauben.
CREATE OR REPLACE FUNCTION public.ze_is_admin_of_teammate(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_members tm1
    JOIN public.team_members tm2 ON tm2.team_id = tm1.team_id
    JOIN public.ze_roles r ON r.team_id = tm1.team_id AND r.user_id = auth.uid()
    WHERE tm1.user_id = auth.uid()
      AND tm2.user_id = target_user_id
      AND r.role = 'admin'
  )
  OR EXISTS (
    -- Creator-Fallback (immer Admin)
    SELECT 1
    FROM public.teams t
    JOIN public.team_members tm ON tm.team_id = t.id
    WHERE t.creator_id = auth.uid()
      AND tm.user_id = target_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.ze_is_admin_of_teammate(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- time_entries: Admin darf Teamkollegen-Einträge updaten (für Cascade)
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "te_update_own" ON public.time_entries;
DROP POLICY IF EXISTS "te_update_self_or_admin" ON public.time_entries;

CREATE POLICY "te_update_self_or_admin" ON public.time_entries
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.ze_is_admin_of_teammate(user_id)
  )
  WITH CHECK (
    auth.uid() = user_id
    OR public.ze_is_admin_of_teammate(user_id)
  );

-- ─────────────────────────────────────────────────────────────────────
-- Master-Tabellen: Team-Read + Admin-Update
-- ─────────────────────────────────────────────────────────────────────
-- Pattern: pro Tabelle dieselben drei Policies:
--   1. Team-Mitglieder können Rows der Kollegen LESEN  (Picker-Sharing)
--   2. Admin kann Rows der Kollegen UPDATEN            (Cascade-Rename)
--   3. INSERT/DELETE bleiben own-only                  (Schutz)

-- stakeholders
DROP POLICY IF EXISTS "sh_select" ON public.stakeholders;
CREATE POLICY "sh_select" ON public.stakeholders
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.ze_is_teammate(user_id)
  );

DROP POLICY IF EXISTS "sh_update" ON public.stakeholders;
CREATE POLICY "sh_update" ON public.stakeholders
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    OR public.ze_is_admin_of_teammate(user_id)
  )
  WITH CHECK (
    auth.uid() = user_id
    OR public.ze_is_admin_of_teammate(user_id)
  );

-- projects
DROP POLICY IF EXISTS "pr_select" ON public.projects;
CREATE POLICY "pr_select" ON public.projects
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.ze_is_teammate(user_id)
  );

DROP POLICY IF EXISTS "pr_update" ON public.projects;
CREATE POLICY "pr_update" ON public.projects
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    OR public.ze_is_admin_of_teammate(user_id)
  )
  WITH CHECK (
    auth.uid() = user_id
    OR public.ze_is_admin_of_teammate(user_id)
  );

-- activities
DROP POLICY IF EXISTS "act_select" ON public.activities;
CREATE POLICY "act_select" ON public.activities
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.ze_is_teammate(user_id)
  );

DROP POLICY IF EXISTS "act_update" ON public.activities;
CREATE POLICY "act_update" ON public.activities
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    OR public.ze_is_admin_of_teammate(user_id)
  )
  WITH CHECK (
    auth.uid() = user_id
    OR public.ze_is_admin_of_teammate(user_id)
  );

-- formats
DROP POLICY IF EXISTS "fmt_select" ON public.formats;
DROP POLICY IF EXISTS "fr_select" ON public.formats;
CREATE POLICY "fmt_select" ON public.formats
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.ze_is_teammate(user_id)
  );

DROP POLICY IF EXISTS "fmt_update" ON public.formats;
DROP POLICY IF EXISTS "fr_update" ON public.formats;
CREATE POLICY "fmt_update" ON public.formats
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    OR public.ze_is_admin_of_teammate(user_id)
  )
  WITH CHECK (
    auth.uid() = user_id
    OR public.ze_is_admin_of_teammate(user_id)
  );

NOTIFY pgrst, 'reload schema';
