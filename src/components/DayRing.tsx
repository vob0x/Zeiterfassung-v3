/**
 * DayRing — Doppelring für den Timer-Tab.
 *
 *   Außenring = Präsenzzeit (Brutto: erster Eintrag → letzter Eintrag,
 *               erweitert um „jetzt" wenn ein Slot läuft).
 *   Innenring = Getrackte Zeit (Wallclock-Union der Tracker-Intervalle).
 *
 * Präsenz und Getrackt werden gegen das Tagesziel skaliert (8:24h
 * default — wird in M5 als User-Setting konfigurierbar). Die sichtbare
 * Differenz zwischen den zwei Ringen ist genau die un-getrackte
 * Tagesfenster-Zeit, die das Coverage-Widget unten als Lücken-Liste
 * aufschlüsselt.
 *
 * Der naive Multitasking-Wert (= Dashboard-Headline „Erfasst Heute") ist
 * NICHT im Ring — er beantwortet eine andere Frage und gehört nur in
 * Dashboard-KPIs.
 */

import { useI18n } from '@/i18n';
import { formatDurationHM } from '@/lib/utils';
import InfoTooltip from './InfoTooltip';

interface Props {
  presenceMs: number;
  trackedMs: number;
  goalMs: number;
}

export default function DayRing({ presenceMs, trackedMs, goalMs }: Props) {
  const { t } = useI18n();
  const rOuter = 62;
  const rInner = 48;
  const cx = 78;
  const cy = 78;
  const circOuter = 2 * Math.PI * rOuter;
  const circInner = 2 * Math.PI * rInner;

  // Skalierung: cap auf 1.15× goalMs, damit der Arc bei extremen
  // Overshoots nicht über sich selbst läuft. Echte Werte stehen im
  // Center-Text.
  const presencePct = Math.min(presenceMs / Math.max(goalMs, 1), 1.15);
  const trackedPct = Math.min(trackedMs / Math.max(goalMs, 1), 1.15);
  const overGoal = presenceMs >= goalMs;

  const outerOffset = circOuter * (1 - presencePct);
  const innerOffset = circInner * (1 - trackedPct);

  const coveragePct =
    presenceMs > 0 ? Math.round((trackedMs / presenceMs) * 100) : 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        width: '100%',
      }}
    >
      <div style={{ position: 'relative', width: 156, height: 156, flexShrink: 0 }}>
        <svg width={156} height={156} viewBox="0 0 156 156">
          {/* Outer background */}
          <circle
            cx={cx}
            cy={cy}
            r={rOuter}
            fill="none"
            stroke="currentColor"
            strokeWidth={7}
            opacity={0.08}
            style={{ color: 'var(--text)' }}
          />
          {/* Outer ring — Präsenzzeit */}
          <circle
            cx={cx}
            cy={cy}
            r={rOuter}
            fill="none"
            stroke={overGoal ? '#6EC49E' : 'var(--text-muted)'}
            strokeWidth={7}
            strokeLinecap="round"
            strokeDasharray={circOuter}
            strokeDashoffset={outerOffset}
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{
              transition:
                'stroke-dashoffset 1s ease, stroke 0.4s ease',
              opacity: 0.85,
            }}
          />
          {/* Goal-Marker bei 12 Uhr */}
          <circle
            cx={cx}
            cy={cy - rOuter}
            r={2.5}
            fill={overGoal ? '#6EC49E' : '#4D4941'}
          />

          {/* Inner background */}
          <circle
            cx={cx}
            cy={cy}
            r={rInner}
            fill="none"
            stroke="currentColor"
            strokeWidth={6}
            opacity={0.06}
            style={{ color: 'var(--text)' }}
          />
          {/* Inner ring — Getrackte Zeit */}
          <circle
            cx={cx}
            cy={cy}
            r={rInner}
            fill="none"
            stroke="#C9A962"
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={circInner}
            strokeDashoffset={innerOffset}
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ transition: 'stroke-dashoffset 1s ease', opacity: 0.85 }}
          />
        </svg>

        {/* Center text — Präsenz + Goal-Status */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            className="font-mono"
            style={{
              fontSize: 26,
              fontWeight: 800,
              color: 'var(--text)',
              letterSpacing: '-0.02em',
              lineHeight: 1.05,
            }}
          >
            {formatDurationHM(presenceMs)}
          </span>
          <span
            style={{
              fontSize: 9,
              color: overGoal ? 'var(--success)' : 'var(--text-muted)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginTop: 2,
            }}
          >
            {overGoal
              ? `✓ ${t('timer.goalReached')}`
              : `/ ${formatDurationHM(goalMs)}`}
          </span>
        </div>
      </div>

      {/* Legende mit klaren Labels + Tooltips */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          fontSize: 12,
        }}
      >
        <LegendRow
          color={overGoal ? '#6EC49E' : 'var(--text-muted)'}
          isOutline
          label={t('ring.presenceLabel')}
          value={formatDurationHM(presenceMs)}
          tooltip={t('ring.tooltipPresence')}
        />
        <LegendRow
          color="#C9A962"
          isOutline={false}
          label={t('ring.trackedLabel')}
          value={`${formatDurationHM(trackedMs)} (${coveragePct}%)`}
          tooltip={t('ring.tooltipTracked')}
        />
      </div>
    </div>
  );
}

function LegendRow({
  color,
  isOutline,
  label,
  value,
  tooltip,
}: {
  color: string;
  isOutline: boolean;
  label: string;
  value: string;
  tooltip: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 3,
            ...(isOutline
              ? { border: `2px solid ${color}` }
              : { background: color }),
            opacity: 0.85,
            flexShrink: 0,
          }}
        />
        <span style={{ color: 'var(--text)' }}>{label}</span>
        <InfoTooltip text={tooltip} />
      </span>
      <span
        className="font-mono"
        style={{ color: 'var(--text)', fontWeight: 600 }}
      >
        {value}
      </span>
    </div>
  );
}
