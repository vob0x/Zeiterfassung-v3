-- ============================================================
-- Patch: fehlende Spalten an v2-Bestand nachziehen
-- ============================================================
-- v2 hat team_members ohne display_name angelegt. v3 schreibt
-- den Codename als display_name beim Insert. Diese Migration
-- ergänzt die fehlende Spalte (idempotent).
--
-- encrypted_team_key wurde in v2 bereits via 20260327000000_add_format
-- ergänzt, aber wir sichern's defensiv ab.
-- ============================================================

-- team_members: display_name + encrypted_team_key sicherstellen
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS display_name        text,
  ADD COLUMN IF NOT EXISTS encrypted_team_key  text;

-- teams: encrypted_team_key sicherstellen
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS encrypted_team_key  text;

-- Schema-Cache flush via NOTIFY (Supabase liest dann die neue Spalte sofort)
NOTIFY pgrst, 'reload schema';
