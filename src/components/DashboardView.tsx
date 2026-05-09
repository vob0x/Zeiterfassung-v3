/**
 * DashboardView — der Dashboard-Tab.
 *
 * Layout:
 *   - Header (Period-Range)
 *   - Optional: ScopeToggle (nur für Admins im Team)
 *   - Optional: Member-Focus-Header (zurück zur Übersicht)
 *   - PeriodPicker
 *   - KPI-Cards
 *   - Optional: TeamWorkload (im Team-Scope ohne Member-Focus)
 *   - Breakdowns (Stakeholder, Projekt, Tätigkeit, Format)
 *   - Heatmap Stakeholder × Projekt
 *
 * Sicht-Logik:
 *   - memberFocus gesetzt → Einträge nur dieses Members
 *   - dashboardScope === 'team' && Admin → eigene + Team-Einträge
 *   - sonst → nur eigene Einträge
 *
 * Mitarbeiter sehen niemals Team-Daten — der ScopeToggle wird ausgeblendet
 * und Team-Scope wird ignoriert.
 */

import { useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useEntriesStore } from '@/stores/entriesStore';
import { useTeamStore } from '@/stores/teamStore';
import { useAuthStore } from '@/stores/authStore';
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
import ScopeToggle from './ScopeToggle';
import TeamWorkload from './TeamWorkload';

export default function DashboardView() {
  const { t } = useI18n();
  const ownEntries = useEntriesStore((s) => s.entries);
  const teamEntries = useEntriesStore((s) => s.teamEntries);
  const period = useUiStore((s) => s.period);
  const dateFrom = useUiStore((s) => s.dateFrom);
  const dateTo = useUiStore((s) => s.dateTo);
  const drillDown = useUiStore((s) => s.drillDownToEntries);
  const scope = useUiStore((s) => s.dashboardScope);
  const memberFocus = useUiStore((s) => s.memberFocus);
  const setMemberFocus = useUiStore((s) => s.setMemberFocus);
  const team = useTeamStore((s) => s.team);
  const members = useTeamStore((s) => s.members);
  const profile = useAuthStore((s) => s.profile);

  // Bin ich Admin? Nur Admins kriegen ScopeToggle und MemberFocus.
  const myRole = members.find((m) => m.user_id === profile?.id)?.role;
  const isAdminInTeam = !!team && myRole === 'admin';

  // Sicht-Modus bestimmen — drei Stufen:
  const viewMode: 'self' | 'team' | 'member' = memberFocus
    ? 'member'
    : isAdminInTeam && scope === 'team'
      ? 'team'
      : 'self';

  // Welche Einträge bilden die Grundlage?
  const sourceEntries = useMemo(() => {
    if (viewMode === 'member') {
      return [...ownEntries, ...teamEntries].filter(
        (e) => e.user_id === memberFocus
      );
    }
    if (viewMode === 'team') {
      return [...ownEntries, ...teamEntries];
    }
    return ownEntries;
  }, [viewMode, memberFocus, ownEntries, teamEntries]);

  const range = useMemo(
    () => getPeriodRange(period, { customFrom: dateFrom, customTo: dateTo }),
    [period, dateFrom, dateTo]
  );

  // "Heute"-KPI: identische Logik wie zuvor, aber auf der Source-Auswahl
  // — d.h. im Team-Mode zeigt sie die heute-Summe des Teams.
  const todayMs = useMemo(() => {
    const todayISO = getTodayISO();
    return computeNaiveSumMs(sourceEntries.filter((e) => e.date === todayISO));
  }, [sourceEntries]);

  const periodEntries = useMemo(
    () => filterEntriesByRange(sourceEntries, range),
    [sourceEntries, range]
  );

  const periodMs = useMemo(
    () => computeNaiveSumMs(periodEntries),
    [periodEntries]
  );

  const periodEntriesNonAbsence = useMemo(
    () => periodEntries.filter((e) => !isAbsenceEntry(e)),
    [periodEntries]
  );

  // Member-Focus: Codename für Header
  const focusedMember =
    viewMode === 'member'
      ? members.find((m) => m.user_id === memberFocus)
      : null;

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

      {/* Member-Focus-Header (überschreibt ScopeToggle wenn aktiv) */}
      {viewMode === 'member' && focusedMember && (
        <div
          className="flex items-center justify-between gap-2 px-3 py-2 rounded"
          style={{
            background: 'rgba(91,164,217,0.08)',
            border: '1px solid rgba(91,164,217,0.30)',
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="text-[10px] uppercase tracking-widest"
              style={{ color: 'var(--text-muted)' }}
            >
              {t('dashboard.memberFocus')}
            </span>
            <span
              className="text-sm font-medium"
              style={{ color: '#5BA4D9' }}
            >
              {focusedMember.codename}
            </span>
            <span
              className="text-[10px] uppercase tracking-widest"
              style={{
                color:
                  focusedMember.role === 'admin'
                    ? '#C9A962'
                    : 'var(--text-muted)',
                fontWeight: focusedMember.role === 'admin' ? 600 : 400,
              }}
            >
              {t(`team.role.${focusedMember.role}`)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMemberFocus(null)}
            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded hover:opacity-80"
            style={{ color: 'var(--text-muted)' }}
            aria-label={t('dashboard.backToOverview')}
          >
            <ArrowLeft size={12} />
            {t('dashboard.backToOverview')}
          </button>
        </div>
      )}

      {/* ScopeToggle: nur Admins, wenn nicht im Member-Focus-Mode */}
      {isAdminInTeam && viewMode !== 'member' && (
        <div className="flex items-center justify-between gap-2">
          <ScopeToggle />
        </div>
      )}

      <PeriodPicker />

      <KpiCards
        todayMs={todayMs}
        periodMs={periodMs}
        entriesCount={periodEntriesNonAbsence.length}
      />

      {/* Team-Workload: nur im Team-Mode, nicht im Member-Focus */}
      {viewMode === 'team' && <TeamWorkload />}

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
