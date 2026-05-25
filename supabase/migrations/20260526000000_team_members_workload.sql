-- Welle 8: Workload-Anteil pro Team-Mitglied. Standard 100% (Vollzeit).
-- Teilzeit-Personen (z.B. 90%) bekommen einen entsprechend gekürzten
-- Vertragsstundenwert für die Überstunden-Rechnung.
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS workload_pct integer NOT NULL DEFAULT 100;
ALTER TABLE team_members ADD CONSTRAINT team_members_workload_pct_check
  CHECK (workload_pct BETWEEN 1 AND 100);
