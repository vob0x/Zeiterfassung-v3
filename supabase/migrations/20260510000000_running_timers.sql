-- ============================================================
-- running_timers — laufende Timer-Slots, server-seitig sync-bar
-- ============================================================
-- Vorher waren Timer rein lokal in localStorage — Mobile-Timer war auf
-- Desktop unsichtbar. Diese Migration legt eine Server-Tabelle an, die
-- der timerStore jetzt als Source-of-Truth benutzt.
--
-- Encrypted-Blob-Approach: stakeholder/projekt/taetigkeit/format/notiz
-- werden zusammen als JSON encryptet abgelegt — gleicher Crypto-Pfad
-- wie für time_entries. Schema bleibt schmal, Felder können sich
-- ändern ohne Migrationen.
--
-- Plaintext-Felder (state-relevant für die Sync-Logik):
--   - start_time     : Unix-ms beim letzten Resume (oder erstem Start)
--   - paused_ms      : akkumulierte Pause-Zeit aus früheren Phasen
--   - is_paused      : aktueller Zustand
--
-- Beide Devices rendern gleich, weil elapsed = paused_ms + (now -
-- start_time) wenn !is_paused, sonst paused_ms. Unix-ms ist absolut,
-- keine Zeitzonen-Probleme.
--
-- RLS: own only (kein teammate-Read). Andere Mitglieder müssen die
-- Timer der Kollegen nicht sehen — Privacy + kein Use-Case.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.running_timers (
  id              uuid PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_data  text NOT NULL,
  start_time      bigint NOT NULL,
  paused_ms       bigint NOT NULL DEFAULT 0,
  is_paused       boolean NOT NULL DEFAULT FALSE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.running_timers ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_running_timers_user
  ON public.running_timers(user_id);

DROP TRIGGER IF EXISTS update_running_timers_updated_at ON public.running_timers;
CREATE TRIGGER update_running_timers_updated_at
  BEFORE UPDATE ON public.running_timers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS-Policies: User sieht und editiert nur eigene Timer.
DROP POLICY IF EXISTS "rt_select_own" ON public.running_timers;
CREATE POLICY "rt_select_own" ON public.running_timers
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "rt_insert_own" ON public.running_timers;
CREATE POLICY "rt_insert_own" ON public.running_timers
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "rt_update_own" ON public.running_timers;
CREATE POLICY "rt_update_own" ON public.running_timers
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "rt_delete_own" ON public.running_timers;
CREATE POLICY "rt_delete_own" ON public.running_timers
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
