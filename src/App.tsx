/**
 * v3 App-Shell mit Tab-Navigation.
 *
 * Vier Tabs:
 *   - Timer:     TimerView mit DayRing + Coverage + Slots + ManualEntry-shortcut
 *   - Dashboard: KPI-Cards (M4a) + Breakdowns (M4b)
 *   - Einträge:  ManualEntry oben + Liste aller Einträge
 *   - Team:      Setup (Create/Join) oder Connected-View (Mitglieder + Leave)
 *
 * Aktiver Tab kommt aus uiStore, persistiert in localStorage.
 */

import { useEffect, useMemo } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useEntriesStore } from '@/stores/entriesStore';
import { useMasterStore } from '@/stores/masterStore';
import { useTeamStore } from '@/stores/teamStore';
import { useTimerStore } from '@/stores/timerStore';
import { useUiStore } from '@/stores/uiStore';
import { useIsAdmin } from '@/hooks/useRole';
import { useI18n } from '@/i18n';
import AuthWall from '@/components/AuthWall';
import TabBar from '@/components/TabBar';
import BottomNav from '@/components/BottomNav';
import TimerView from '@/components/TimerView';
import DashboardView from '@/components/DashboardView';
import EntriesView from '@/components/EntriesView';
import TeamView from '@/components/TeamView';
import ManageView from '@/components/ManageView';
import DayRing from '@/components/DayRing';
import TrackingCoverage from '@/components/TrackingCoverage';
import { computeLivePresenceMs, computeLiveWallClockMs } from '@/lib/wallclock';
import { getTodayISO } from '@/lib/utils';

const DAILY_GOAL_MS = (8 * 60 + 24) * 60_000; // 8:24h

export default function App() {
  return (
    <AuthWall>
      <Shell />
    </AuthWall>
  );
}

function Shell() {
  const { t } = useI18n();
  const profile = useAuthStore((s) => s.profile);
  const signOut = useAuthStore((s) => s.signOut);

  const fetchEntries = useEntriesStore((s) => s.fetchEntries);
  const fetchMaster = useMasterStore((s) => s.fetchMaster);
  const initTimerFromStorage = useTimerStore((s) => s.initFromStorage);
  const syncTeamData = useTeamStore((s) => s.syncTeamData);
  const activeTab = useUiStore((s) => s.activeTab);

  // Ein-Mal-Initialisierung nach Login
  useEffect(() => {
    fetchEntries();
    fetchMaster();
    initTimerFromStorage();
    syncTeamData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    // pb-24 reserviert auf Mobile Platz für die fixe BottomNav (~56px
    // Bar + safe-area-inset auf iPhones). Auf Desktop zurück auf das
    // normale p-6 (md:pb-6), weil dort keine BottomNav existiert.
    <main className="min-h-screen bg-neutral-900 text-neutral-100 p-6 pb-24 md:pb-6">
      <div className="max-w-3xl mx-auto">
        <header className="flex items-center justify-between mb-4">
          <div>
            <div
              className="text-xs tracking-widest uppercase"
              style={{ color: '#C9A962' }}
            >
              {t('app.title')}
            </div>
            <div className="text-xs text-neutral-500">
              {t('app.versionLabel')} · M5a
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-neutral-400">
              <span className="font-mono">{profile?.codename}</span>
            </span>
            <button
              type="button"
              onClick={signOut}
              className="text-xs underline text-neutral-500 hover:text-neutral-300"
            >
              {t('app.signOut')}
            </button>
          </div>
        </header>

        <TabBar />

        {activeTab === 'timer' && <TimerTabContent />}
        {activeTab === 'dashboard' && <DashboardView />}
        {activeTab === 'entries' && <EntriesView />}
        {activeTab === 'team' && <TeamView />}
        {activeTab === 'manage' && <ManageView />}
      </div>
      <BottomNav />
    </main>
  );
}

/**
 * TimerTab: TimerView (Slots) + DayRing rechts daneben (Desktop) /
 * unten (Mobile) + Coverage-Widget.
 */
function TimerTabContent() {
  const entries = useEntriesStore((s) => s.entries);
  const slots = useTimerStore((s) => s.slots);
  const getElapsedMs = useTimerStore((s) => s.getElapsedMs);
  // Mitarbeiter sehen weder DayRing noch TrackingCoverage — die Aggregat-
  // Sicht auf den eigenen Tag ist v2-Vorbild bewusst Admin-only. Die
  // Slot-Liste und Coverage-Funktion bleiben für alle nutzbar; nur die
  // Aggregat-Visualisierungen verschwinden.
  const isAdmin = useIsAdmin();
  // tick binden für Live-Update
  useTimerStore((s) => s.tick);

  const todayEntries = useMemo(() => {
    const today = getTodayISO();
    return entries.filter((e) => e.date === today);
  }, [entries]);

  const runningSlots = useMemo(
    () =>
      slots
        .filter((s) => !s.isPaused)
        .map((s) => ({ elapsedMs: getElapsedMs(s.id), isPaused: false })),
    // tick triggert Recompute; slots-Identity reicht für Memo-Key
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slots, useTimerStore.getState().tick]
  );

  const presenceMs = useMemo(
    () => computeLivePresenceMs(todayEntries, runningSlots),
    [todayEntries, runningSlots]
  );

  const trackedMs = useMemo(
    () => computeLiveWallClockMs(todayEntries, runningSlots),
    [todayEntries, runningSlots]
  );

  // Mitarbeiter: nur Timer-Spalte, ohne Sidebar (DayRing + Coverage weg)
  if (!isAdmin) {
    return (
      <div className="grid grid-cols-1 gap-4 items-start">
        <TimerView />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-4 items-start">
      <div>
        <TimerView />
      </div>
      <aside className="space-y-3 md:sticky md:top-4">
        <DayRing
          presenceMs={presenceMs}
          trackedMs={trackedMs}
          goalMs={DAILY_GOAL_MS}
        />
        <TrackingCoverage />
      </aside>
    </div>
  );
}
