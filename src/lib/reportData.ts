/**
 * reportData — Aggregiert TimeEntries zu einem strukturierten Report-Modell.
 *
 * Pure Funktionen ohne Zustand. UI-Komponenten und Renderer konsumieren
 * `ReportData` direkt. Narrative-Texte werden mit eigenen Generatoren
 * (generateSummaryNarrative, generateHighlightsNarrative) erzeugt — der
 * User darf sie im Modal editieren, aber die Defaults kommen hier raus.
 *
 * Drei Sicht-Modi:
 *   - 'self'   — Report über die eigenen Einträge des Users
 *   - 'member' — Report über einen einzelnen Teammitglied (Detail-Sicht)
 *   - 'team'   — Aggregierter Team-Report; perMember mit Per-Person-Zeilen
 */

import type { TimeEntry } from '@/types';
import { computeNaiveSumMs } from './wallclock';
import { isAbsenceEntry } from './absences';
import { formatHoursAdaptive } from './utils';

export type ReportScope = 'self' | 'member' | 'team';

export interface ReportRange {
  /** YYYY-MM-DD inklusiv */
  from: string;
  /** YYYY-MM-DD inklusiv */
  to: string;
  /** Lesbares Label, z.B. "Februar 2026" oder "01.02.–28.02.2026" */
  label: string;
}

export interface BreakdownRow {
  name: string;
  ms: number;
  pct: number;
}

export interface PerMemberRow {
  userId: string;
  codename: string;
  role: 'admin' | 'mitarbeiter';
  ms: number;
  entriesCount: number;
  pct: number;
}

export interface AbsenceCount {
  /** Wert der Tätigkeit, z.B. "Ferien", "Krankheit". */
  type: string;
  /** Anzahl Tage / Einträge mit dieser Abwesenheit. */
  count: number;
  /** Summe Stunden (für transparente Gesamtsicht). */
  ms: number;
}

export interface ReportData {
  meta: {
    title: string;
    range: ReportRange;
    scope: ReportScope;
    /** Codename des Subjekts (User oder Team-Name). */
    subjectName: string;
    generatedAt: string;
  };
  kpis: {
    /** Naive-Summe (Multi-Tasking voll, Multi-Stakeholder voll). */
    totalNaiveMs: number;
    /** Anzahl Einträge ohne Abwesenheiten. */
    entriesCount: number;
    /** Distinct dates mit min. einem Eintrag. */
    workingDays: number;
    /** Durchschnitt pro Arbeitstag. */
    avgPerDayMs: number;
  };
  /** Pro Member-Aufschlüsselung (nur scope === 'team'). */
  perMember?: PerMemberRow[];
  breakdowns: {
    stakeholders: BreakdownRow[];
    projekte: BreakdownRow[];
    taetigkeiten: BreakdownRow[];
    formate: BreakdownRow[];
  };
  absences: AbsenceCount[];
  /** Auto-generierte Narrative-Texte als Default. */
  narratives: {
    summary: string;
    highlights: string;
  };
}

interface BuildOptions {
  scope: ReportScope;
  range: ReportRange;
  /** Codename oder Team-Name für die Header-Zeile. */
  subjectName: string;
  /** Nur für scope === 'team' relevant. */
  members?: Array<{
    user_id: string;
    codename: string;
    role: 'admin' | 'mitarbeiter';
  }>;
  /** Locale für Narratives — beeinflusst Formulierungen. Default 'de'. */
  locale?: 'de' | 'fr';
}

/* ─────────────────────────────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────────────────────────────── */

function buildBreakdown(
  entries: TimeEntry[],
  dimension: 'stakeholder' | 'projekt' | 'taetigkeit' | 'format'
): BreakdownRow[] {
  const buckets = new Map<string, number>();
  for (const e of entries) {
    if (isAbsenceEntry(e)) continue;
    const ms = e.duration_ms || 0;
    if (ms <= 0) continue;
    if (dimension === 'stakeholder') {
      const list = Array.isArray(e.stakeholder)
        ? e.stakeholder
        : e.stakeholder
          ? [e.stakeholder]
          : [];
      if (list.length === 0) {
        buckets.set('—', (buckets.get('—') || 0) + ms);
      } else {
        for (const s of list) {
          const key = s || '—';
          buckets.set(key, (buckets.get(key) || 0) + ms);
        }
      }
    } else {
      const key = (e[dimension] || '—') as string;
      buckets.set(key, (buckets.get(key) || 0) + ms);
    }
  }
  const total = Array.from(buckets.values()).reduce((a, b) => a + b, 0);
  const list: BreakdownRow[] = Array.from(buckets.entries()).map(
    ([name, ms]) => ({
      name,
      ms,
      pct: total > 0 ? (ms / total) * 100 : 0,
    })
  );
  list.sort((a, b) => b.ms - a.ms);
  return list;
}

function countAbsences(entries: TimeEntry[]): AbsenceCount[] {
  const buckets = new Map<string, { count: number; ms: number }>();
  for (const e of entries) {
    if (!isAbsenceEntry(e)) continue;
    // Bei Abwesenheiten ist `taetigkeit` der Type (Ferien/Krankheit/etc.)
    const type = e.taetigkeit || 'Abwesenheit';
    const cur = buckets.get(type) || { count: 0, ms: 0 };
    cur.count += 1;
    cur.ms += e.duration_ms || 0;
    buckets.set(type, cur);
  }
  return Array.from(buckets.entries())
    .map(([type, v]) => ({ type, ...v }))
    .sort((a, b) => b.count - a.count);
}

/* ─────────────────────────────────────────────────────────────────────
   Hauptfunktion
   ───────────────────────────────────────────────────────────────────── */

export function buildReportData(
  entries: TimeEntry[],
  opts: BuildOptions
): ReportData {
  const { scope, range, subjectName, members = [], locale = 'de' } = opts;

  // Period filtern (entries werden vom Caller schon nach Range gefiltert
  // übergeben — buildReportData verlässt sich darauf, aber wir defensive
  // doppeln nicht).
  const nonAbsence = entries.filter((e) => !isAbsenceEntry(e));

  const totalNaiveMs = computeNaiveSumMs(nonAbsence);
  const distinctDates = new Set(nonAbsence.map((e) => e.date));
  const workingDays = distinctDates.size;
  const avgPerDayMs = workingDays > 0 ? totalNaiveMs / workingDays : 0;

  let perMember: PerMemberRow[] | undefined;
  if (scope === 'team' && members.length > 0) {
    perMember = members.map((m) => {
      const memberEntries = nonAbsence.filter((e) => e.user_id === m.user_id);
      const ms = computeNaiveSumMs(memberEntries);
      return {
        userId: m.user_id,
        codename: m.codename,
        role: m.role,
        ms,
        entriesCount: memberEntries.length,
        pct: totalNaiveMs > 0 ? (ms / totalNaiveMs) * 100 : 0,
      };
    });
    perMember.sort((a, b) => b.ms - a.ms);
  }

  const breakdowns = {
    stakeholders: buildBreakdown(nonAbsence, 'stakeholder'),
    projekte: buildBreakdown(nonAbsence, 'projekt'),
    taetigkeiten: buildBreakdown(nonAbsence, 'taetigkeit'),
    formate: buildBreakdown(nonAbsence, 'format'),
  };

  const absences = countAbsences(entries);

  const titleByScope: Record<ReportScope, string> = {
    self: locale === 'fr' ? 'Mon rapport' : 'Mein Report',
    member:
      locale === 'fr' ? `Rapport – ${subjectName}` : `Report – ${subjectName}`,
    team:
      locale === 'fr' ? `Rapport d'équipe – ${subjectName}` : `Team-Report – ${subjectName}`,
  };

  const data: ReportData = {
    meta: {
      title: titleByScope[scope],
      range,
      scope,
      subjectName,
      generatedAt: new Date().toISOString(),
    },
    kpis: {
      totalNaiveMs,
      entriesCount: nonAbsence.length,
      workingDays,
      avgPerDayMs,
    },
    perMember,
    breakdowns,
    absences,
    narratives: {
      summary: '',
      highlights: '',
    },
  };

  // Narratives erst NACH dem Daten-Aufbau generieren — sie greifen darauf zu.
  data.narratives.summary = generateSummaryNarrative(data, locale);
  data.narratives.highlights = generateHighlightsNarrative(data, locale);
  return data;
}

/* ─────────────────────────────────────────────────────────────────────
   Narrative-Generatoren
   ───────────────────────────────────────────────────────────────────── */

export function generateSummaryNarrative(
  d: ReportData,
  locale: 'de' | 'fr' = 'de'
): string {
  const hours = formatHoursAdaptive(d.kpis.totalNaiveMs);
  const days = d.kpis.workingDays;
  const avg = formatHoursAdaptive(d.kpis.avgPerDayMs);
  const period = d.meta.range.label;
  const subject = d.meta.subjectName;

  if (locale === 'fr') {
    if (d.meta.scope === 'team') {
      return `L'équipe ${subject} a saisi ${hours} sur ${period}, répartis sur ${days} jours actifs. Moyenne quotidienne : ${avg}.`;
    }
    return `${subject} a saisi ${hours} sur ${period}, répartis sur ${days} jours actifs. Moyenne quotidienne : ${avg}.`;
  }

  if (d.meta.scope === 'team') {
    return `Das Team ${subject} hat im Zeitraum ${period} insgesamt ${hours} erfasst, verteilt auf ${days} aktive Arbeitstage. Tagesdurchschnitt: ${avg}.`;
  }
  return `${subject} hat im Zeitraum ${period} insgesamt ${hours} erfasst, verteilt auf ${days} aktive Arbeitstage. Tagesdurchschnitt: ${avg}.`;
}

export function generateHighlightsNarrative(
  d: ReportData,
  locale: 'de' | 'fr' = 'de'
): string {
  const top3 = (rows: BreakdownRow[]) =>
    rows
      .slice(0, 3)
      .map((r) => `${r.name} (${Math.round(r.pct)}%)`)
      .join(', ');

  const stakeholders = top3(d.breakdowns.stakeholders);
  const projekte = top3(d.breakdowns.projekte);
  const taetigkeiten = top3(d.breakdowns.taetigkeiten);

  const parts: string[] = [];
  if (stakeholders) {
    parts.push(
      locale === 'fr'
        ? `Mandants principaux : ${stakeholders}.`
        : `Stakeholder-Schwerpunkt: ${stakeholders}.`
    );
  }
  if (projekte) {
    parts.push(
      locale === 'fr'
        ? `Projets principaux : ${projekte}.`
        : `Projekt-Schwerpunkt: ${projekte}.`
    );
  }
  if (taetigkeiten) {
    parts.push(
      locale === 'fr'
        ? `Activités principales : ${taetigkeiten}.`
        : `Tätigkeits-Schwerpunkt: ${taetigkeiten}.`
    );
  }

  // Abwesenheiten erwähnen falls relevant
  if (d.absences.length > 0) {
    const totalAbsenceDays = d.absences.reduce((acc, a) => acc + a.count, 0);
    const list = d.absences
      .map((a) => `${a.count}× ${a.type}`)
      .join(', ');
    parts.push(
      locale === 'fr'
        ? `Absences (${totalAbsenceDays} jours) : ${list}.`
        : `Abwesenheiten (${totalAbsenceDays} Tage): ${list}.`
    );
  }

  return parts.join(' ');
}
