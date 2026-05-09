-- ============================================================
-- ROLLBACK: running_timers wieder droppen
-- ============================================================
-- Cross-Device-Timer-Sync (M3b.6, Migration 20260510000000) wurde
-- zurückgerollt. Das Pattern „fire-and-forget push + replace-on-pull"
-- war destruktiv bei silent push-failures: lokale Slots wurden nach
-- einem Refresh weggelöscht, weil der Server leer = autoritativ war.
--
-- Eine saubere Implementation bräuchte await-on-push mit Konflikt-
-- Handling und ein UX-Modell für Pending-Writes — der Aufwand ist
-- größer als der Nutzen für ein Single-User-Tool. Timer bleiben in
-- v3 lokaler State (siehe Doc-Header timerStore.ts).
--
-- DROP TABLE entfernt die Table samt RLS-Policies, Triggers und Indizes.
-- ============================================================

DROP TABLE IF EXISTS public.running_timers CASCADE;

NOTIFY pgrst, 'reload schema';
