-- ============================================================
-- Zeiterfassung v3 — Team-Tables + RLS-Policies
-- ============================================================
-- Komplette, idempotente Migration für M5a (Team-CRUD).
-- Kann mehrfach ausgeführt werden, ohne Daten zu verlieren.
--
-- Anlegen:  Tables teams, team_members, ze_roles + alle nötigen
--           Policies, Triggers und Indizes.
--
-- Voraussetzung: profiles-Table existiert bereits (aus M1).
--
-- Im Supabase SQL-Editor einfügen, „Run" klicken. Die Warnung
-- „RLS not enabled" erscheint nicht mehr, weil RLS hier explizit
-- aktiviert wird.
-- ============================================================

-- ── Helper: updated_at-Trigger-Function (falls aus M1 nicht da) ──
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================x
-- 1. teams
-- ============================================================
CREATE TABLE IF NOT EXISTS public.teams (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                varchar(255) NOT NULL,
  invite_code         varchar(12) NOT NULL UNIQUE,
  creator_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_team_key  text,           -- transport-encrypted Key (für Beitritts-Pfad)
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_teams_creator ON public.teams(creator_id);
CREATE INDEX IF NOT EXISTS idx_teams_invite  ON public.teams(invite_code);

DROP TRIGGER IF EXISTS update_teams_updated_at ON public.teams;
CREATE TRIGGER update_teams_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 2. team_members
-- ============================================================
CREATE TABLE IF NOT EXISTS public.team_members (
  team_id             uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  encrypted_team_key  text,           -- personal-encrypted Key (für schnellen Login-Pfad)
  display_name        text,
  joined_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_tm_team ON public.team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_tm_user ON public.team_members(user_id);

-- ============================================================
-- 3. ze_roles
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ze_roles (
  team_id     uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('admin', 'mitarbeiter')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);

ALTER TABLE public.ze_roles ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ze_roles_team_user
  ON public.ze_roles(team_id, user_id);

DROP TRIGGER IF EXISTS update_ze_roles_updated_at ON public.ze_roles;
CREATE TRIGGER update_ze_roles_updated_at
  BEFORE UPDATE ON public.ze_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 4. Helper-Functions (SECURITY DEFINER → bypassen RLS)
-- ============================================================
-- get_my_team_ids: vermeidet Infinite-Recursion in tm_select-Policy
CREATE OR REPLACE FUNCTION public.get_my_team_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT team_id FROM public.team_members WHERE user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_team_ids() TO authenticated;

-- ze_is_admin: kombiniert ze_roles + creator_id-Fallback
CREATE OR REPLACE FUNCTION public.ze_is_admin(tid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ze_roles
    WHERE team_id = tid AND user_id = auth.uid() AND role = 'admin'
  )
  OR EXISTS (
    SELECT 1 FROM public.teams
    WHERE id = tid AND creator_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.ze_is_admin(uuid) TO authenticated;

-- ============================================================
-- 5. Auto-Seed-Triggers für ze_roles
-- ============================================================
-- Beim Anlegen eines Teams → Creator wird automatisch Admin
CREATE OR REPLACE FUNCTION public.ze_seed_creator_admin_role()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.ze_roles (team_id, user_id, role)
  VALUES (NEW.id, NEW.creator_id, 'admin')
  ON CONFLICT (team_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS ze_seed_creator_admin_role_trg ON public.teams;
CREATE TRIGGER ze_seed_creator_admin_role_trg
  AFTER INSERT ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.ze_seed_creator_admin_role();

-- Beim Beitritt → User wird automatisch 'mitarbeiter' (außer schon gesetzt)
CREATE OR REPLACE FUNCTION public.ze_seed_member_role()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.ze_roles (team_id, user_id, role)
  VALUES (NEW.team_id, NEW.user_id, 'mitarbeiter')
  ON CONFLICT (team_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS ze_seed_member_role_trg ON public.team_members;
CREATE TRIGGER ze_seed_member_role_trg
  AFTER INSERT ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.ze_seed_member_role();

-- ============================================================
-- 6. RLS-Policies: teams
-- ============================================================
DROP POLICY IF EXISTS "teams_select" ON public.teams;
CREATE POLICY "teams_select" ON public.teams
  FOR SELECT
  TO authenticated
  USING (true);
-- Bewusst breit: teams.invite_code ist ein Shared Secret, der Client
-- muss ihn schon kennen, um per .eq('invite_code', ...) zu suchen.
-- name + encrypted_team_key sind beide nicht sensibel (Key ist
-- transport-encrypted und ohne invite_code+team_id nicht entschlüsselbar).

DROP POLICY IF EXISTS "teams_insert" ON public.teams;
CREATE POLICY "teams_insert" ON public.teams
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "teams_update" ON public.teams;
CREATE POLICY "teams_update" ON public.teams
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "teams_delete" ON public.teams;
CREATE POLICY "teams_delete" ON public.teams
  FOR DELETE
  TO authenticated
  USING (auth.uid() = creator_id);

-- ============================================================
-- 7. RLS-Policies: team_members
-- ============================================================
DROP POLICY IF EXISTS "tm_select" ON public.team_members;
CREATE POLICY "tm_select" ON public.team_members
  FOR SELECT
  TO authenticated
  USING (
    team_id IN (SELECT public.get_my_team_ids())
  );

DROP POLICY IF EXISTS "tm_insert" ON public.team_members;
CREATE POLICY "tm_insert" ON public.team_members
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "tm_update_own" ON public.team_members;
CREATE POLICY "tm_update_own" ON public.team_members
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "tm_delete_own" ON public.team_members;
CREATE POLICY "tm_delete_own" ON public.team_members
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- 8. RLS-Policies: ze_roles
-- ============================================================
DROP POLICY IF EXISTS "ze_roles_select" ON public.ze_roles;
CREATE POLICY "ze_roles_select" ON public.ze_roles
  FOR SELECT
  TO authenticated
  USING (
    team_id IN (SELECT public.get_my_team_ids())
  );

-- Insert: Trigger handhabt das beim Team-Create/Join. Client darf
-- zusätzlich inserten falls der User Admin ist (idempotent via ON
-- CONFLICT DO NOTHING in der App).
DROP POLICY IF EXISTS "ze_roles_insert" ON public.ze_roles;
CREATE POLICY "ze_roles_insert" ON public.ze_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.ze_is_admin(team_id)
    -- Self-Insert beim Team-Create erlaubt (vor dem Trigger):
    OR auth.uid() = user_id
  );

DROP POLICY IF EXISTS "ze_roles_update" ON public.ze_roles;
CREATE POLICY "ze_roles_update" ON public.ze_roles
  FOR UPDATE
  TO authenticated
  USING (public.ze_is_admin(team_id))
  WITH CHECK (public.ze_is_admin(team_id));

DROP POLICY IF EXISTS "ze_roles_delete_self" ON public.ze_roles;
CREATE POLICY "ze_roles_delete_self" ON public.ze_roles
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id           -- self-leave
    OR public.ze_is_admin(team_id) -- admin removes member (M5b)
  );

-- ============================================================
-- Done.
-- ============================================================
