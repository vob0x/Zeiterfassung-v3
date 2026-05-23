-- Welle 6: Projekt-Klassifikation für das Reaktivitäts-Modell.
--
-- Jedes Projekt bekommt optional eine Kategorie, die in den Reports
-- die Achsen „Versickerung" und „Reaktivität" steuert. Default ist
-- NULL — der Code nutzt dann die Heuristik aus dem Projektnamen
-- (src/lib/projectClassifier.ts). Admin-Override schreibt den Wert
-- explizit hier rein.
--
-- Additive Änderung, keine bestehenden Daten betroffen.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS category text;

-- Wertdomäne absichern. abwesenheit wird in der Praxis nicht auf
-- Projekt-Ebene gesetzt (kommt aus der Tätigkeits-Achse), bleibt aber
-- als gültiger Wert reserviert.
ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_category_check;

ALTER TABLE projects
  ADD CONSTRAINT projects_category_check
  CHECK (category IS NULL OR category IN (
    'reaktiv',
    'planbar',
    'routine',
    'fuehrung-admin',
    'abwesenheit'
  ));

COMMENT ON COLUMN projects.category IS
  'Reaktivitäts-Klassifikation für Reports. NULL = ungeklärt (Heuristik greift).';
