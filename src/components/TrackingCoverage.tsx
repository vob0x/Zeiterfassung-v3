/**
 * TrackingCoverage — surfacet Lücken im heutigen Tracking, mit
 * klickbarer Liste der größten Lücken.
 *
 * Liefert die intuitive Antwort auf „warum ist meine Wallclock-Zeit
 * niedriger als erwartet": fehlt eine 30min-Lücke nach dem Mittag im
 * Tracking. User kann sich entscheiden ob er das nachträglich
 * tracken will.
 *
 * Lücken < 5min werden gefiltert (Task-Switching-Latenz, kein echtes
 * Vergessen). Lücken ≥ 30min sind farblich hervorgehoben — die sind
 * die actionable Kandidaten.
 */

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { useEntriesStore } from '@/stores/entriesStore';
import { useTimerStore } from '@/stores/timerStore';
import { useI18n } from '@/i18n';
import { findTrackingGaps } from '@/lib/wallclock';
import { formatDurationHM, getTodayISO } from '@/lib/utils';
import InfoTooltip from './InfoTooltip';

export default function TrackingCoverage() {
  const { t } = useI18n();
  const entries = useEntriesStore((s) => s.entries);
  const slots = useTimerStore((s) => s.slots);
  // tick binden für Live-Update wenn Slots laufen
  useTimerStore((s) => s.tick);
  const [expanded, setExpanded] = useState(false);

  const { gaps, bruttoMs, trackedMs, gapMs } = useMemo(() => {
    const todayISO = getTodayISO();
    // Gaps werden NUR aus saved entries berechnet — running slots
    // erweitern das Brutto-Fenster über den DayRing, nicht hier.
    return findTrackingGaps(entries, { date: todayISO, minGapMinutes: 5 });
  }, [entries, slots.length]);

  if (bruttoMs === 0) return null;

  const coveragePct = bruttoMs > 0 ? Math.round((trackedMs / bruttoMs) * 100) : 0;
  const hasGaps = gaps.length > 0;

  return (
    <div
      style={{
        marginTop: 12,
        padding: '10px 12px',
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        fontSize: 12,
      }}
    >
      <div
        onClick={() => hasGaps && setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          cursor: hasGaps ? 'pointer' : 'default',
          userSelect: 'none',
        }}
      >
        <Clock size={14} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: 'var(--text)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
            <span style={{ color: 'var(--text-muted)' }}>{t('coverage.label')}</span>
            <strong>{formatDurationHM(trackedMs)}</strong>
            <span style={{ color: 'var(--text-muted)' }}>
              {t('coverage.of')} {formatDurationHM(bruttoMs)} {t('coverage.presence')}
            </span>
            <span
              style={{
                color: coveragePct >= 90 ? 'var(--success)' : 'var(--text-muted)',
              }}
            >
              ({coveragePct}%)
            </span>
            <InfoTooltip text={t('coverage.tooltip')} />
          </div>
          {hasGaps && (
            <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>
              {gaps.length === 1
                ? t('coverage.oneGap').replace('{dur}', formatDurationHM(gapMs))
                : t('coverage.nGaps')
                    .replace('{n}', String(gaps.length))
                    .replace('{dur}', formatDurationHM(gapMs))}
            </div>
          )}
        </div>
        {hasGaps && (
          <div style={{ flexShrink: 0, color: 'var(--text-muted)' }}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        )}
      </div>

      {expanded && hasGaps && (
        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {gaps.map((g, i) => (
            <div
              key={`${g.start}-${g.end}-${i}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 8px',
                background: 'rgba(0,0,0,0.15)',
                borderRadius: 6,
                fontSize: 11,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono, monospace)',
                  color: 'var(--text)',
                  minWidth: 88,
                }}
              >
                {g.start} – {g.end}
              </span>
              <span
                style={{
                  color:
                    g.durationMs >= 30 * 60_000
                      ? 'var(--warning)'
                      : 'var(--text-muted)',
                  fontWeight: g.durationMs >= 30 * 60_000 ? 600 : 400,
                }}
              >
                {formatDurationHM(g.durationMs)}
              </span>
            </div>
          ))}
          <div
            style={{
              fontSize: 10,
              color: 'var(--text-muted)',
              marginTop: 4,
              fontStyle: 'italic',
            }}
          >
            {t('coverage.hint')}
          </div>
        </div>
      )}
    </div>
  );
}
