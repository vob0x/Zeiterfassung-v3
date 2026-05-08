/**
 * DashboardView — der Dashboard-Tab.
 *
 * Layout:
 *   - PeriodPicker (Tag/Woche/Monat/Jahr/Gesamt/Custom)
 *   - KPI-Cards (Erfasst Heute / Erfasst im Zeitraum / Anzahl Einträge)
 *   - Breakdowns (Stakeholder, Projekt, Tätigkeit, Format)
 *   - Heatmap Stakeholder × Projekt
 *
 * Alle Werte basieren auf Naive-Summen der gefilterten Period-Range.
 * "Erfasst Heute" ist immer Today (unabhängig von der Period), "Erfasst
 * im Zeitraum" folgt der Period.
 */

import { useMemo } from 'react';
import { useEntriesStore } from '@/stores/entriesStore';
import { useUiStore } from '@/stores/uiStore';
import { useI18n } from '@/i18n';
import {
  filterEntriesByRange,
  getPeriodRange,
  formatRangeLabel,
} from '@/lib/dateRange';
import { computeNaiveSumMs } from '@/lib/wallclock';
import { isAbsenceEntry } from '@/lib/absences';
import { getTodayISO } from '@/lib/utils';
import KpiCards from './KpiCards';
import PeriodPicker from './PeriodPicker';
import BreakdownList from './BreakdownList';
import Heatmap from './Heatmap';

export default function DashboardView() {
  const { t } = useI18n();
  const entries = useEntriesStore((s) => s.entries);
  const period = useUiStore((s) => s.period);
  const dateFrom = useUiStore((s) => s.dateFrom);
  const dateTo = useUiStore((s) => s.dateTo);
  const drillDown = useUiStore((s) => s.drillDownToEntries);

  const range = useMemo(
    () => getPeriodRange(period, { customFrom: dateFrom, customTo: dateTo }),
    [period, dateFrom, dateTo]
  );

  const todayMs = useMemo(() => {
    const todayISO = getTodayISO();
    return computeNaiveSumMs(entries.filter((e) => e.date === todayISO));
  }, [entries]);

  const periodEntries = useMemo(
    () => filterEntriesByRange(entries, range),
    [entries, range]
  );

  const periodMs = useMemo(
    () => computeNaiveSumMs(periodEntries),
    [periodEntries]
  );

  const periodEntriesNonAbsence = useMemo(
    () => periodEntries.filter((e) => !isAbsenceEntry(e)),
    [periodEntries]
  );

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2
          className="text-xs uppercase tracking-widest"
          style={{ color: 'var(--text-muted)' }}
        >
          {t('dashboard.title')} · {formatRangeLabel(period, range, t)}
        </h2>
        <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
          {range.from} — {range.to}
        </span>
      </div>

      <PeriodPicker />

      <KpiCards
        todayMs={todayMs}
        periodMs={periodMs}
        entriesCount={periodEntriesNonAbsence.length}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <BreakdownList
          title={t('list.stakeholdersCount')}
          entries={periodEntriesNonAbsence}
          dimension="stakeholder"
          accent="#5BA4D9"
          onItemClick={(value) =>
            drillDown({ dimension: 'stakeholder', value })
          }
        />
        <BreakdownList
          title={t('list.projectsCount')}
          entries={periodEntriesNonAbsence}
          dimension="projekt"
          accent="#6EC49E"
          onItemClick={(value) => drillDown({ dimension: 'projekt', value })}
        />
        <BreakdownList
          title={t('list.activitiesCount')}
          entries={periodEntriesNonAbsence}
          dimension="taetigkeit"
          accent="#9B8EC4"
          onItemClick={(value) =>
            drillDown({ dimension: 'taetigkeit', value })
          }
        />
        <BreakdownList
          title={t('list.formatsCount')}
          entries={periodEntriesNonAbsence}
          dimension="format"
          accent="#D4956A"
          onItemClick={(value) => drillDown({ dimension: 'format', value })}
        />
      </div>

      <Heatmap
        title={t('dashboard.heatmap')}
        entries={periodEntriesNonAbsence}
      />
    </section>
  );
}
