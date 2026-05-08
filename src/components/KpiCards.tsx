/**
 * KpiCards — drei Top-KPIs des Dashboards.
 *
 *   1. Erfasst Heute (Naive-Summe der heutigen Einträge ohne Absences)
 *   2. Erfasst im Zeitraum (Naive-Summe der gefilterten Periode)
 *   3. Anzahl Einträge im Zeitraum (ohne Absences)
 *
 * Jede Karte mit InfoTooltip — Erklärung was die Zahl bedeutet,
 * insbesondere die Multitasking-Doppelzählung.
 */

import { useI18n } from '@/i18n';
import { formatHoursAdaptive } from '@/lib/utils';
import InfoTooltip from './InfoTooltip';

interface Props {
  todayMs: number;
  periodMs: number;
  entriesCount: number;
}

export default function KpiCards({ todayMs, periodMs, entriesCount }: Props) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <Card
        label={t('kpi.today')}
        tooltip={t('kpi.tooltipToday')}
        value={formatHoursAdaptive(todayMs)}
        subtitle={t('kpi.todaySubtitle')}
        accent="#5BA4D9"
      />
      <Card
        label={t('kpi.period')}
        tooltip={t('kpi.tooltipPeriod')}
        value={formatHoursAdaptive(periodMs)}
        subtitle={t('kpi.periodSubtitle')}
        accent="#6EC49E"
      />
      <Card
        label={t('kpi.entriesCount')}
        tooltip={t('kpi.tooltipEntries')}
        value={String(entriesCount)}
        subtitle={t('kpi.entriesSubtitle')}
        accent="#9B8EC4"
      />
    </div>
  );
}

function Card({
  label,
  tooltip,
  value,
  subtitle,
  accent,
}: {
  label: string;
  tooltip: string;
  value: string;
  subtitle: string;
  accent: string;
}) {
  return (
    <div
      className="rounded-lg p-4"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: `1px solid ${accent}30`,
      }}
    >
      <div
        className="text-xs uppercase tracking-widest mb-1"
        style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
      >
        {label}
        <InfoTooltip text={tooltip} />
      </div>
      <div
        className="text-3xl font-bold"
        style={{ color: accent, lineHeight: 1.1 }}
      >
        {value}
      </div>
      <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
        {subtitle}
      </div>
    </div>
  );
}
