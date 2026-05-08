/**
 * Date-Range-Helper für Period-Picker.
 *
 * Period-Typen:
 *   - 'day':    Heute
 *   - 'week':   Aktuelle Kalenderwoche (Mo–So)
 *   - 'month':  Aktueller Monat
 *   - 'year':   Aktuelles Jahr
 *   - 'all':    Alles bis Anfang der Zeit (1970-01-01)
 *   - 'custom': User-defined Range über dateFrom/dateTo
 *
 * Alle Ranges sind INCLUSIVE auf beiden Seiten und werden als
 * YYYY-MM-DD-Strings zurückgegeben (matchen das `date`-Feld in
 * TimeEntry, das auch YYYY-MM-DD ist).
 */

import { formatDateISO } from './utils';

export type Period = 'day' | 'week' | 'month' | 'year' | 'all' | 'custom';

export interface DateRange {
  /** YYYY-MM-DD inklusiv */
  from: string;
  /** YYYY-MM-DD inklusiv */
  to: string;
}

/**
 * Berechnet die Range für eine Period zum Zeitpunkt `now`.
 * Bei 'custom' werden die übergebenen `customFrom`/`customTo` direkt
 * zurückgegeben (oder Heute als Fallback).
 */
export function getPeriodRange(
  period: Period,
  options: {
    now?: Date;
    customFrom?: string;
    customTo?: string;
  } = {}
): DateRange {
  const now = options.now ?? new Date();
  const today = formatDateISO(now);

  switch (period) {
    case 'day':
      return { from: today, to: today };

    case 'week': {
      // Mo als Wochenstart (ISO-konform). getDay(): 0=So, 1=Mo, … 6=Sa
      const day = now.getDay();
      const offsetToMonday = day === 0 ? -6 : 1 - day;
      const monday = new Date(now);
      monday.setDate(monday.getDate() + offsetToMonday);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      return { from: formatDateISO(monday), to: formatDateISO(sunday) };
    }

    case 'month': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { from: formatDateISO(first), to: formatDateISO(last) };
    }

    case 'year': {
      const first = new Date(now.getFullYear(), 0, 1);
      const last = new Date(now.getFullYear(), 11, 31);
      return { from: formatDateISO(first), to: formatDateISO(last) };
    }

    case 'all':
      return { from: '1970-01-01', to: '2999-12-31' };

    case 'custom':
      return {
        from: options.customFrom || today,
        to: options.customTo || today,
      };
  }
}

/**
 * Filtert Einträge auf eine Range. Vergleich auf String-Ebene
 * (YYYY-MM-DD ist lexikographisch vergleichbar = chronologisch).
 */
export function filterEntriesByRange<T extends { date: string }>(
  entries: T[],
  range: DateRange
): T[] {
  return entries.filter((e) => e.date >= range.from && e.date <= range.to);
}

/**
 * Hübsche Range-Bezeichnung für UI ("Heute", "1.1.2026 – 31.1.2026").
 */
export function formatRangeLabel(
  period: Period,
  range: DateRange,
  t: (key: string) => string
): string {
  if (period === 'day') return t('dashboard.period.today');
  if (period === 'week') return t('dashboard.period.week');
  if (period === 'month') return t('dashboard.period.month');
  if (period === 'year') return t('dashboard.period.year');
  if (period === 'all') return t('dashboard.period.all');
  return `${formatGermanDate(range.from)} – ${formatGermanDate(range.to)}`;
}

function formatGermanDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${parseInt(d, 10)}.${parseInt(m, 10)}.${y}`;
}
