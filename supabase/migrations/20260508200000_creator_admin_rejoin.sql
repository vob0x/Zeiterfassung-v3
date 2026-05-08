-- ============================================================
-- Patch: Creator behält Admin-Rolle beim Re-Join
-- ============================================================
-- Problem: Wenn der Team-Creator das Team verlässt und mit dem
-- Invite-Code wieder beitritt, fired der ze_seed_member_role-
-- Trigger und setzt naiv 'mitarbeiter'. Korrekt wäre 'admin'.
--
-- Fix:
--   1. Trigger-Function smart machen — Creator-Check vorab
--   2. Bestehende Schief-Rows backfillen
-- ============================================================

-- ── 1. Smarter Trigger: Creator → admin, Rest → mitarbeiter ──
CREATE OR REPLACE FUNCTION public.ze_seed_member_role()
RETURNS TRIGGER AS $$
DECLARE
  v_is_creator boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.teams
    WHERE id = NEW.team_id AND creator_id = NEW.user_id
  ) INTO v_is_creator;

  INSERT INTO public.ze_roles (team_id, user_id, role)
  VALUES (
    NEW.team_id,
    NEW.user_id,
    CASE WHEN v_is_creator THEN 'admin' ELSE 'mitarbeiter' END
  )
  ON CONFLICT (team_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger ist über DROP+CREATE in der Hauptmigration schon angeheftet,
-- die Function-Definition oben reicht — der Trigger ruft die neue
-- Version automatisch auf.

-- ── 2. Backfill: Creator, die in ze_roles fälschlich 'mitarbeiter' sind ──
UPDATE public.ze_roles r
SET role = 'admin', updated_at = now()
FROM public.teams t
WHERE r.team_id = t.id
  AND r.user_id = t.creator_id
  AND r.role = 'mitarbeiter';

-- Schema-Cache flush
NOTIFY pgrst, 'reload schema';
