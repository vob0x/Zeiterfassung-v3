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
