/**
 * Utility-Helfer. Wächst pro Milestone — bisher nur Datums-Helper für
 * den entriesStore-Decrypt-Pfad, später kommen die Wallclock-/Präsenz-
 * Berechnungen aus v2.
 */

/** YYYY-MM-DD (Local-Time) aus einem Date. */
export function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Erzeugt alle YYYY-MM-DD-Daten zwischen `fromISO` und `toISO` inklusiv,
 * chronologisch sortiert. Optional `excludeWeekends` filtert Sa/So raus.
 *
 * Wenn `to < from` oder ein Datum ungültig ist, wird `[from]` zurück-
 * gegeben (Fallback auf Einzeltag).
 */
export function dateRangeISO(
  fromISO: string,
  toISO: string,
  excludeWeekends: boolean = false
): string[] {
  if (!fromISO) return [];
  if (!toISO || toISO < fromISO) return [fromISO];

  const out: string[] = [];
  // Date-Konstruktion über Komponenten, damit lokale TZ stimmt
  const [fy, fm, fd] = fromISO.split('-').map(Number);
  const [ty, tm, td] = toISO.split('-').map(Number);
  if (!fy || !fm || !fd || !ty || !tm || !td) return [fromISO];

  const cur = new Date(fy, fm - 1, fd);
  const end = new Date(ty, tm - 1, td);

  // Defensive Cap (10 Jahre) — verhindert Runaway falls Eingabe absurd ist.
  for (let safety = 0; cur <= end && safety < 3700; safety++) {
    const day = cur.getDay(); // 0 = So, 6 = Sa
    const isWeekend = day === 0 || day === 6;
    if (!excludeWeekends || !isWeekend) {
      out.push(formatDateISO(cur));
    }
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/**
 * UUID v4 — vom Browser wenn verfügbar (immer in modernen Setups), sonst
 * mit Math.random-Fallback. Wird für neue Entry-IDs gebraucht; Supabase
 * verlangt UUIDs als Primary Key.
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Heute als YYYY-MM-DD (Local-Time). */
export function getTodayISO(): string {
  return formatDateISO(new Date());
}

/** ms → "H:MM" (z.B. "8:23"). Null-Sekunden weggelassen. */
export function formatDurationHM(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** ms → "H:MM:SS" (full precision für Live-Timer). */
export function formatDurationHMS(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** ms → adaptive: <1h zeigt "MM min", ≥1h zeigt "H.Mh". KPI-Cards. */
export function formatHoursAdaptive(ms: number): string {
  if (ms <= 0) return '0';
  if (ms < 60 * 60_000) {
    return `${Math.round(ms / 60_000)}min`;
  }
  return `${(ms / 3_600_000).toFixed(1)}h`;
}
