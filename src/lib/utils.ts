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
