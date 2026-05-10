/**
 * PeriodPicker — Pill-Bar mit Tag/Woche/Monat/Jahr/Gesamt + Custom,
 * darunter eine Navigations-Zeile (◀ Aktuelles-Range-Label ▶) für
 * historische Zeiträume bei Tag/Woche/Monat/Jahr.
 *
 * Bei „Custom" erscheinen zwei Date-Inputs darunter, mit denen der User
 * eine beliebige Range wählen kann.
 *
 * Bei „Gesamt" und „Custom" ist die Navigation ausgeblendet (kein
 * sinnvolles „vorheriges Gesamt").
 */

import { useMemo } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { useUiStore } from '@/stores/uiStore';
import { useI18n } from '@/i18n';
import {
  formatRangeLabel,
  getPeriodRange,
  isPeriodNavigable,
  type Period,
} from '@/lib/dateRange';

const PRESETS: Period[] = ['day', 'week', 'month', 'year', 'all', 'custom'];

const LABEL_KEY: Record<Period, string> = {
  day: 'dashboard.period.today',
  week: 'dashboard.period.week',
  month: 'dashboard.period.month',
  year: 'dashboard.period.year',
  all: 'dashboard.period.all',
  custom: 'dashboard.period.custom',
};

export default function PeriodPicker() {
  const { t } = useI18n();
  const period = useUiStore((s) => s.period);
  const periodOffset = useUiStore((s) => s.periodOffset);
  const dateFrom = useUiStore((s) => s.dateFrom);
  const dateTo = useUiStore((s) => s.dateTo);
  const setPeriod = useUiStore((s) => s.setPeriod);
  const setPeriodOffset = useUiStore((s) => s.setPeriodOffset);
  const setCustomRange = useUiStore((s) => s.setCustomRange);

  const navigable = isPeriodNavigable(period);

  const range = useMemo(
    () =>
      getPeriodRange(period, {
        offset: periodOffset,
        customFrom: dateFrom,
        customTo: dateTo,
      }),
    [period, periodOffset, dateFrom, dateTo]
  );

  const rangeLabel = formatRangeLabel(period, range, t, periodOffset);

  return (
    <div className="space-y-2">
      <div role="tablist" className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => {
          const active = p === period;
          return (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setPeriod(p)}
              className="text-xs px-3 py-1 rounded-full transition-colors"
              style={{
                background: active ? '#C9A962' : 'rgba(255,255,255,0.04)',
                color: active ? '#1c1a17' : 'var(--text)',
                border: `1px solid ${active ? '#C9A962' : 'var(--border)'}`,
                fontWeight: active ? 600 : 400,
              }}
            >
              {t(LABEL_KEY[p])}
            </button>
          );
        })}
      </div>

      {/* Navigation für historische Zeiträume — nur bei Tag/Woche/Monat/Jahr */}
      {navigable && (
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setPeriodOffset(periodOffset - 1)}
            className="p-1 rounded hover:bg-neutral-800"
            style={{ color: 'var(--text-muted)' }}
            title={t('dashboard.period.prev')}
            aria-label={t('dashboard.period.prev')}
          >
            <ChevronLeft size={14} />
          </button>
          <span
            className="font-medium px-2"
            style={{
              color: periodOffset === 0 ? 'var(--text)' : '#C9A962',
              minWidth: 0,
            }}
          >
            {rangeLabel}
          </span>
          <button
            type="button"
            onClick={() => setPeriodOffset(periodOffset + 1)}
            disabled={periodOffset >= 0}
            className="p-1 rounded hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ color: 'var(--text-muted)' }}
            title={t('dashboard.period.next')}
            aria-label={t('dashboard.period.next')}
          >
            <ChevronRight size={14} />
          </button>
          {periodOffset !== 0 && (
            <button
              type="button"
              onClick={() => setPeriodOffset(0)}
              className="ml-1 flex items-center gap-1 text-[11px] px-2 py-0.5 rounded hover:opacity-80"
              style={{ color: 'var(--text-muted)' }}
              title={t('dashboard.period.resetToNow')}
            >
              <RotateCcw size={10} />
              {t('dashboard.period.resetToNow')}
            </button>
          )}
        </div>
      )}

      {period === 'custom' && (
        <div className="flex items-center gap-2 text-xs">
          <label className="flex items-center gap-1">
            <span style={{ color: 'var(--text-muted)' }}>
              {t('dashboard.period.from')}
            </span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setCustomRange(e.target.value, dateTo)}
              className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 focus:border-amber-600 focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-1">
            <span style={{ color: 'var(--text-muted)' }}>
              {t('dashboard.period.to')}
            </span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setCustomRange(dateFrom, e.target.value)}
              className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 focus:border-amber-600 focus:outline-none"
            />
          </label>
        </div>
      )}
    </div>
  );
}
