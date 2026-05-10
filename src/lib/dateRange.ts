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
 * Berechnet die Range für eine Period zum Zeitpunkt `now`, optional mit
 * einem `offset` für vergangene Zeiträume (offset=-1 = ein Zeitraum
 * zurück). Positive Werte sind technisch möglich (Zukunft) aber UI-
 * seitig blockiert.
 *
 * Bei 'all' und 'custom' wird offset ignoriert — beide Perioden haben
 * keinen sinnvollen "Vorgänger".
 */
export function getPeriodRange(
  period: Period,
  options: {
    now?: Date;
    /** Verschiebung in Period-Einheiten. -1 = ein Zeitraum zurück. */
    offset?: number;
    customFrom?: string;
    customTo?: string;
  } = {}
): DateRange {
  const now = options.now ?? new Date();
  const offset = options.offset ?? 0;
  const today = formatDateISO(now);

  switch (period) {
    case 'day': {
      const d = new Date(now);
      d.setDate(d.getDate() + offset);
      const iso = formatDateISO(d);
      return { from: iso, to: iso };
    }

    case 'week': {
      // Mo als Wochenstart (ISO-konform). getDay(): 0=So, 1=Mo, … 6=Sa
      const day = now.getDay();
      const offsetToMonday = day === 0 ? -6 : 1 - day;
      const monday = new Date(now);
      monday.setDate(monday.getDate() + offsetToMonday + offset * 7);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      return { from: formatDateISO(monday), to: formatDateISO(sunday) };
    }

    case 'month': {
      const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
      return { from: formatDateISO(first), to: formatDateISO(last) };
    }

    case 'year': {
      const first = new Date(now.getFullYear() + offset, 0, 1);
      const last = new Date(now.getFullYear() + offset, 11, 31);
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
 * True wenn ein Period-Typ via Offset navigierbar ist (Tag/Woche/Monat/Jahr).
 * `all` und `custom` haben keine Navigation.
 */
export function isPeriodNavigable(period: Period): boolean {
  return period === 'day' || period === 'week' || period === 'month' || period === 'year';
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
 * Hübsche Range-Bezeichnung für UI. Bei offset === 0 nutzen wir die
 * sprechenden Labels („Heute", „Diese Woche", „Mai 2026"); bei
 * historischen Zeiträumen die konkreten Daten/Monate/Jahre.
 */
export function formatRangeLabel(
  period: Period,
  range: DateRange,
  t: (key: string) => string,
  offset: number = 0
): string {
  if (period === 'all') return t('dashboard.period.all');
  if (period === 'custom') {
    return `${formatGermanDate(range.from)} – ${formatGermanDate(range.to)}`;
  }

  // offset === 0: sprechende Labels
  if (offset === 0) {
    if (period === 'day') return t('dashboard.period.today');
    if (period === 'week') return t('dashboard.period.thisWeek');
    if (period === 'month') return formatMonth(range.from);
    if (period === 'year') return formatYear(range.from);
  }

  // historische Zeiträume: konkrete Bezeichnung
  if (period === 'day') return formatGermanDate(range.from);
  if (period === 'week') {
    return `${formatGermanDate(range.from)} – ${formatGermanDate(range.to)}`;
  }
  if (period === 'month') return formatMonth(range.from);
  if (period === 'year') return formatYear(range.from);
  return '';
}

function formatGermanDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${parseInt(d, 10)}.${parseInt(m, 10)}.${y}`;
}

const MONTH_NAMES_DE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

function formatMonth(iso: string): string {
  const [y, m] = iso.split('-');
  if (!y || !m) return iso;
  const idx = parseInt(m, 10) - 1;
  return `${MONTH_NAMES_DE[idx] || m} ${y}`;
}

function formatYear(iso: string): string {
  const [y] = iso.split('-');
  return y || iso;
}
