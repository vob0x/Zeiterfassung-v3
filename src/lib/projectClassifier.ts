/**
 * Heuristik-Klassifikator für Projekt-Namen → Reaktivitäts-Kategorie.
 *
 * Welle 6 (REPORT-PHASE-C): Reports brauchen pro Projekt eine Einordnung
 * in `reaktiv` / `planbar` / `routine` / `fuehrung-admin`. Der Admin kann
 * jedes Projekt manuell überschreiben (siehe `projects.category` in der
 * Datenbank); die Heuristik hier liefert den *Vorschlag*, wenn nichts
 * gespeichert ist.
 *
 * Designziel: konservativ. Nur eindeutige Treffer werden klassifiziert,
 * unklare Projektnamen geben `null` zurück — der Bericht behandelt
 * `null` dann als „planbar"-Default, und der Admin entscheidet bei
 * Bedarf manuell nach.
 *
 * Wichtige Domain-Regel aus dem Sparring mit Team COM (NDB, 2026-05):
 * **extern getrieben ≠ reaktiv**. Eine Medienkonferenz wird Wochen vorher
 * geplant — das ist `planbar`. Reaktiv heißt „alles fallen lassen, jetzt"
 * (Medienanfrage, BGÖ, Krise).
 */

import type { ProjectCategory } from '@/types';

/**
 * Pro Kategorie eine Liste von Regex-Patterns. Reihenfolge zählt: die
 * erste Kategorie, die matched, gewinnt. `reaktiv` läuft zuerst, weil
 * z.B. „Politische Geschäfte" sonst von einer breiteren „routine"-Regel
 * geschluckt würde.
 */
const PATTERNS: ReadonlyArray<{
  category: ProjectCategory;
  patterns: ReadonlyArray<RegExp>;
}> = [
  // ─ Reaktiv — echte Flowstopper ────────────────────────────────────
  // Achtung: \b funktioniert in JavaScript-Regex nicht zuverlässig mit
  // Compound-Wörtern und Umlauten ("Medienanfragen" oder "BGÖ" matchen
  // nicht mit \b). Wir verzichten bewusst auf \b und akzeptieren, dass
  // Substring-Treffer überall im Namen greifen.
  {
    category: 'reaktiv',
    patterns: [
      /anfrage/i, // Medienanfrage(n), Bürgeranfrage(n), Anfrage
      /BGÖ/i, // Bundesgesetz Öffentlichkeitsprinzip
      /auskunftsersuch/i,
      /kris/i, // Krise, Krisenmanagement, Krisenkomm
      /bürger/i, // Bürgeranfragen, allg. Bürger-…
      /politisch.{0,3}gesch/i, // Politische Geschäfte
      /wording/i, // Eil-Sprachregelungen
      /eilantw/i, // Eilantwort, falls so benannt
      /eilmeld/i,
    ],
  },

  // ─ Abwesenheit — Projekt-seitig selten, aber für Vollständigkeit ──
  {
    category: 'abwesenheit',
    patterns: [
      /^ferien$/i,
      /^krankheit$/i,
      /^militär/i,
      /^zivildienst$/i,
      /bezahlte.freistellung/i,
    ],
  },

  // ─ Routine — operative Wiederkehr ─────────────────────────────────
  {
    category: 'routine',
    patterns: [
      /^daily$/i,
      /^weekly$/i,
      /^meeting$/i,
      /kerngruppen/i,
      /^koordination$/i,
      /ämterkonsultation/i,
      /\bmailbox/i,
      /medienmonitoring/i,
      /medienschau/i,
      /^GEVER$/i,
      /^GLS$/i,
      /MA-?update/i,
    ],
  },

  // ─ Führung-Admin ──────────────────────────────────────────────────
  {
    category: 'fuehrung-admin',
    patterns: [
      /führung.{0,3}und.{0,3}administration/i,
      /^teamentwicklung$/i,
      /^aktennotiz$/i,
      /^boardkaskade$/i,
    ],
  },

  // ─ Planbar — Eigen-Arbeit oder Auftrag mit planbarem Termin ──────
  // Steht zuletzt, weil viele dieser Wörter (z.B. „Medien…", „Sprech…")
  // in reaktiven Namen vorkommen können — die `reaktiv`-Regel hat dort
  // bereits gegriffen.
  {
    category: 'planbar',
    patterns: [
      /konzept/i, // Kommunikationskonzept, Konzeption (Projekt-Name)
      /strategi/i,
      /zielbild/i,
      /newsletter/i,
      /^mitteilung/i,
      /factsheet/i,
      /sprechnoti/i, // Sprechnotizen (extern beauftragt, aber planbar)
      /medienkonferenz/i, // wird Wochen vorher geplant
      /medienmitteilung/i,
      /hintergrundgespräch/i, // mit Medien — meist planbar
      /^interview/i,
      /präsentation/i,
      /grafik/i,
      /übersetzung/i,
      /^anlässe?$/i, // Anlass, Anlässe — events
      /\bG7\b/,
      /SiCH/, // SiCH26 etc.
      /personalnews/i,
      /^intranet$/i,
      /^internet$/i,
      /^infomail$/i,
      /^prophylax$/i,
      /^kompass$/i,
      /^cuverta$/i,
      /allgemeine lageverfolgung/i,
    ],
  },
];

/**
 * Heuristik aus Projektnamen → wahrscheinlichste Kategorie, oder `null`
 * wenn kein Muster passt. Konservativ: lieber `null` als falsch raten.
 *
 * @example
 *   classifyProjectName('Medienanfragen')        → 'reaktiv'
 *   classifyProjectName('Medienkonferenzen')     → 'planbar'
 *   classifyProjectName('Daily')                 → 'routine'
 *   classifyProjectName('Stämpfli')              → null
 */
export function classifyProjectName(name: string): ProjectCategory | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;

  for (const { category, patterns } of PATTERNS) {
    for (const re of patterns) {
      if (re.test(trimmed)) return category;
    }
  }
  return null;
}

/**
 * Effektive Kategorie: explizit gesetzte Kategorie hat Vorrang vor der
 * Heuristik. Wenn beide nichts liefern, gilt der Bericht-Default
 * „planbar" — definiert in `effectiveCategoryWithDefault`.
 */
export function effectiveCategory(
  storedCategory: ProjectCategory | null | undefined,
  name: string
): ProjectCategory | null {
  if (storedCategory) return storedCategory;
  return classifyProjectName(name);
}

/**
 * Wie `effectiveCategory`, aber fällt auf `planbar` zurück, wenn weder
 * gespeichert noch heuristisch klassifiziert. Für die Reaktivitäts-
 * Berechnung, wo wir jedem Slot eine Kategorie zuordnen müssen.
 */
export function effectiveCategoryWithDefault(
  storedCategory: ProjectCategory | null | undefined,
  name: string
): ProjectCategory {
  return effectiveCategory(storedCategory, name) ?? 'planbar';
}

/**
 * Menschlesbarer Label pro Kategorie — wird in der Admin-UI und in den
 * Reports verwendet. Hält die i18n-Sprache zentral.
 */
export const CATEGORY_LABELS: Record<ProjectCategory, string> = {
  reaktiv: 'Reaktiv (Flowstopper)',
  planbar: 'Planbar',
  routine: 'Routine',
  'fuehrung-admin': 'Führung & Admin',
  abwesenheit: 'Abwesenheit',
};

/**
 * Kurzform für kompakte Anzeige (z.B. Badges in der Projekt-Liste).
 */
export const CATEGORY_SHORT_LABELS: Record<ProjectCategory, string> = {
  reaktiv: 'Reaktiv',
  planbar: 'Planbar',
  routine: 'Routine',
  'fuehrung-admin': 'Führung',
  abwesenheit: 'Abwesenheit',
};
