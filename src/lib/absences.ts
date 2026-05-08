/**
 * Abwesenheits-Tätigkeiten — werden bei Wallclock-/Präsenz-/Naive-
 * Berechnungen meistens AUSGESCHLOSSEN, weil sie keine Arbeit darstellen.
 *
 * Die Liste muss exakt mit v2 übereinstimmen, da v2 + v3 dieselben Daten
 * lesen und schreiben. Wenn ein User in v2 „Ferien" als Tätigkeit
 * verwendet, muss v3 das genauso als Abwesenheit behandeln.
 *
 * Case-insensitive Matching, Trim, Diakritik-tolerant nicht — die
 * Tätigkeits-Strings sind controlled vocabulary aus dem Picker.
 */

export const ABSENCE_ACTIVITIES = [
  'Ferien',
  'Krankheit',
  'Militär',
  'Freistellung',
] as const;

const ABSENCE_SET = new Set(
  ABSENCE_ACTIVITIES.map((a) => a.toLowerCase())
);

/** True wenn die Tätigkeit eine Abwesenheit ist. */
export function isAbsenceActivity(taetigkeit: string | undefined): boolean {
  if (!taetigkeit) return false;
  return ABSENCE_SET.has(taetigkeit.trim().toLowerCase());
}

/** True wenn der Eintrag eine Abwesenheits-Erfassung ist. */
export function isAbsenceEntry(entry: { taetigkeit?: string }): boolean {
  return isAbsenceActivity(entry.taetigkeit);
}

/**
 * Schweizer Wochenend- und Feiertags-Erkennung — für Überzeit-
 * Berechnung. Sa + So immer Überzeit; Feiertage ignorieren wir in v3
 * vorerst (kann in M5/M6 mit einer dynamischen Liste erweitert werden,
 * inkl. kantonsspezifischer Feiertage). v2 hatte's auch nur für die
 * Bundesfeiertage und das war unvollständig.
 */
export function isOvertimeDate(dateISO: string): boolean {
  if (!dateISO) return false;
  const d = new Date(dateISO);
  const day = d.getDay(); // 0 = Sonntag, 6 = Samstag
  return day === 0 || day === 6;
}
