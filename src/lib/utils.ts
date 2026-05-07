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
