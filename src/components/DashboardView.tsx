/**
 * DashboardView — der Dashboard-Tab.
 *
 * M4a-Scope: KPI-Cards (Heute / Zeitraum / Einträge). Period ist hart
 * auf „Heute" gesetzt — Period-Picker (Woche/Monat/Jahr/Custom) kommt
 * in M4b.
 *
 * Filter-Logik (kommt M4b):
 *   - Period bestimmt das Set der Einträge
 *   - Stakeholder/Projekt/Tätigkeit/Format/Notiz kann zusätzlich
 *     filtern, wirkt auf das gefilterte Set
 *
 * In M4a: nur Heute-Werte. KPIs basieren auf dem heutigen Eintrags-
 * Set. Naive für Zeitraum = Naive für Heute (weil Period = Heute).
 */

import { useMemo } from 'react';
import { useEntriesStore } from '@/stores/entriesStore';
import { useI18n } from '@/i18n';
import { computeNaiveSumMs } from '@/lib/wallclock';
import { isAbsenceEntry } from '@/lib/absences';
import { getTodayISO } from '@/lib/utils';
import KpiCards from './KpiCards';

export default function DashboardView() {
  const { t } = useI18n();
  const entries = useEntriesStore((s) => s.entries);

  const todayMs = useMemo(() => {
    const todayISO = getTodayISO();
    const todayEntries = entries.filter((e) => e.date === todayISO);
    return computeNaiveSumMs(todayEntries);
  }, [entries]);

  // M4a: Period = Heute. M4b kommt mit Period-Picker.
  const periodMs = todayMs;
  const periodEntries = useMemo(() => {
    const todayISO = getTodayISO();
    return entries.filter(
      (e) => e.date === todayISO && !isAbsenceEntry(e)
    );
  }, [entries]);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2
          className="text-xs uppercase tracking-widest"
          style={{ color: 'var(--text-muted)' }}
        >
          {t('dashboard.title')} · {t('dashboard.period.today')}
        </h2>
      </div>

      <KpiCards
        todayMs={todayMs}
        periodMs={periodMs}
        entriesCount={periodEntries.length}
      />

      <div className="text-xs text-neutral-500 pt-2">
        Period-Picker (Woche/Monat/Jahr/Custom) + Breakdowns nach
        Stakeholder/Projekt/Tätigkeit/Format kommen in M4b.
      </div>
    </section>
  );
}
