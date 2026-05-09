/**
 * TeamWorkload — Mitglieder-Aufschlüsselung für den Team-Scope im
 * Dashboard. Zeigt pro Mitglied die Naive-Stunden im aktuellen Period-
 * Range. Sortiert absteigend, mit Bar-Visualisierung.
 *
 * Klick auf einen Eintrag → setMemberFocus → Dashboard rendert die
 * Detail-Sicht für dieses Mitglied (Member-Detail-View).
 */

import { useMemo } from 'react';
import { Users } from 'lucide-react';
import { useEntriesStore } from '@/stores/entriesStore';
import { useTeamStore } from '@/stores/teamStore';
import { useUiStore } from '@/stores/uiStore';
import { useI18n } from '@/i18n';
import {
  filterEntriesByRange,
  getPeriodRange,
} from '@/lib/dateRange';
import { computeNaiveSumMs } from '@/lib/wallclock';
import { isAbsenceEntry } from '@/lib/absences';
import { formatHoursAdaptive } from '@/lib/utils';

export default function TeamWorkload() {
  const { t } = useI18n();
  const ownEntries = useEntriesStore((s) => s.entries);
  const teamEntries = useEntriesStore((s) => s.teamEntries);
  const members = useTeamStore((s) => s.members);
  const period = useUiStore((s) => s.period);
  const dateFrom = useUiStore((s) => s.dateFrom);
  const dateTo = useUiStore((s) => s.dateTo);
  const setMemberFocus = useUiStore((s) => s.setMemberFocus);

  const range = useMemo(
    () => getPeriodRange(period, { customFrom: dateFrom, customTo: dateTo }),
    [period, dateFrom, dateTo]
  );

  const allInRange = useMemo(() => {
    const all = [...ownEntries, ...teamEntries].filter((e) => !isAbsenceEntry(e));
    return filterEntriesByRange(all, range);
  }, [ownEntries, teamEntries, range]);

  const rows = useMemo(() => {
    const byUser = new Map<string, number>();
    for (const e of allInRange) {
      byUser.set(e.user_id, (byUser.get(e.user_id) || 0) + 1);
    }
    // Aggregat: jedes Mitglied bekommt seine Naive-Summe + Codename
    const list = members.map((m) => {
      const ms = computeNaiveSumMs(
        allInRange.filter((e) => e.user_id === m.user_id)
      );
      return {
        userId: m.user_id,
        codename: m.codename,
        role: m.role,
        ms,
      };
    });
    list.sort((a, b) => b.ms - a.ms);
    return list;
  }, [allInRange, members]);

  const total = rows.reduce((acc, r) => acc + r.ms, 0);

  if (rows.length === 0) return null;

  return (
    <div
      className="rounded-lg p-3"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(201,169,98,0.18)',
      }}
    >
      <div
        className="text-xs uppercase tracking-widest mb-2 flex items-center gap-1.5"
        style={{ color: 'var(--text-muted)' }}
      >
        <Users size={12} />
        {t('dashboard.teamWorkload')}
      </div>

      <ul className="space-y-1.5">
        {rows.map((r) => {
          const pct = total > 0 ? (r.ms / total) * 100 : 0;
          const pctRounded = Math.round(pct);
          const barWidth = Math.max(2, pct);
          const labelInside = pct >= 12;
          const accent = r.role === 'admin' ? '#C9A962' : '#5BA4D9';
          return (
            <li key={r.userId} className="text-xs">
              <button
                type="button"
                onClick={() => setMemberFocus(r.userId)}
                className="w-full text-left rounded transition-colors"
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '2px 4px',
                  margin: '-2px -4px',
                  color: 'inherit',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background =
                    'rgba(255,255,255,0.04)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
                title={t('dashboard.viewMemberDetail').replace(
                  '{name}',
                  r.codename
                )}
              >
                <div className="flex items-baseline justify-between gap-2 mb-0.5">
                  <span
                    className="truncate"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      color: 'var(--text)',
                    }}
                  >
                    {r.codename}
                    {r.role === 'admin' && (
                      <span
                        className="ml-1.5 text-[9px] uppercase tracking-widest"
                        style={{ color: '#C9A962' }}
                      >
                        ★
                      </span>
                    )}
                  </span>
                  <span
                    className="font-mono"
                    style={{
                      color: 'var(--text-muted)',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 6,
                    }}
                  >
                    {!labelInside && pctRounded > 0 && (
                      <span style={{ fontSize: 10, opacity: 0.7 }}>
                        {pctRounded}%
                      </span>
                    )}
                    <span>{formatHoursAdaptive(r.ms)}</span>
                  </span>
                </div>
                <div
                  style={{
                    height: 14,
                    borderRadius: 3,
                    background: `${accent}15`,
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      width: `${barWidth}%`,
                      height: '100%',
                      background: accent,
                      opacity: 0.75,
                      transition: 'width 0.4s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      paddingRight: labelInside ? 5 : 0,
                      boxSizing: 'border-box',
                    }}
                  >
                    {labelInside && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 600,
                          color: '#1c1a17',
                          letterSpacing: '0.02em',
                          fontFamily:
                            'ui-monospace, SFMono-Regular, Menlo, monospace',
                        }}
                      >
                        {pctRounded}%
                      </span>
                    )}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
