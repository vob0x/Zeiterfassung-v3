/**
 * reportData — Aggregiert TimeEntries zu einem strukturierten Report-Modell.
 *
 * Loop-4-Modell: qualitativer Report mit Tracking-Coverage statt Soll-Vergleich.
 *
 * Sektionen die der Report liefert:
 *   - KPIs (Wallclock, Präsenz, Coverage, Multi-Tasking, Produktiv-Quote)
 *   - Tracking-Qualität (Coverage-Buckets + Liste schwacher Tage)
 *   - Tätigkeits-/Format-Mix
 *   - Wochen-Verlauf
 *   - Schwerpunkte (Stakeholder + Projekte)
 *   - Verschiebungen 1. vs 2. Periodenhälfte (Trend)
 *   - Aus den Daten (findings: Daten-Hygiene, Beobachtungen, Empfehlungen)
 *
 * Drei Sicht-Modi: 'self' | 'member' | 'team' (team mit perMember).
 */

import type { TimeEntry } from '@/types';
import {
  buildSplitTailDates,
  computeNaiveSumMs,
  computeUnionMs,
  computePresenceForDayMs,
  isMidnightSpillover,
} from './wallclock';
import { isAbsenceEntry } from './absences';

export type ReportScope = 'self' | 'member' | 'team';

export interface ReportRange {
  from: string;
  to: string;
  label: string;
}

export interface BreakdownRow {
  name: string;
  ms: number;
  pct: number;
  count: number;
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
  type: string;
  count: number;
  ms: number;
}

export interface LowCoverageDay {
  date: string;
  coveragePct: number;
  presenceMs: number;
  wallclockMs: number;
  gapMs: number;
}

export interface TrendChange {
  name: string;
  firstPct: number;
  secondPct: number;
  deltaPct: number;
  firstMs: number;
  secondMs: number;
}

/**
 * Detail-Profil pro Top-Stakeholder. Wird für die Mandanten-Steckbriefe
 * im Narrative und die Out-of-Scope-Findings benutzt.
 */
export interface StakeholderProfile {
  name: string;
  pct: number;             // Anteil an Gesamt-Naive
  ms: number;              // absolute Zeit
  entriesCount: number;
  daysActive: number;      // Anzahl Kalendertage mit Einträgen
  avgEntryMs: number;
  microTaskPct: number;    // % Einträge unter 15 min — Reaktiv-Indikator
  nonprodPct: number;      // % Zeit auf 'Nicht produktiv' — Scope-Indikator
  notizPct: number;        // % Einträge mit Notiz — Doku-Disziplin
  topProjekt: BreakdownRow | null;
  topTaetigkeit: BreakdownRow | null;
  topFormat: BreakdownRow | null;
  meetingHeavyPct: number; // % Meetings/Telefon (Formate)
}

export interface WeekdayProfile {
  /** ISO Mo=1..So=7, sortiert nach Wochentag. */
  byDay: Array<{ dow: number; label: string; ms: number; pct: number }>;
  heaviestDow: string;
  lightestDow: string;
  weekendMs: number;       // Sa + So
  longestDay: { date: string; ms: number } | null;
  shortestDay: { date: string; ms: number } | null;
  highLoadDaysCount: number; // Tage mit >= 10h Präsenz
}

export interface Finding {
  level: 'warn' | 'info' | 'ok';
  htmlMessage: string;
}

export interface ReportData {
  meta: {
    title: string;
    range: ReportRange;
    scope: ReportScope;
    subjectName: string;
    generatedAt: string;
  };
  kpis: {
    totalNaiveMs: number;
    totalWallclockMs: number;
    totalPresenceMs: number;
    /** Naive / Wallclock — >1 = parallele Tracker. */
    multiTaskingFactor: number;
    /** Wallclock / Präsenz — Datenqualität. */
    coverage: number;
    avgWallclockMsPerDay: number;
    avgPresenceMsPerDay: number;
    entriesCount: number;
    workingDays: number;
    productivePct: number;
    productiveMs: number;
  };
  perMember?: PerMemberRow[];
  breakdowns: {
    stakeholders: BreakdownRow[];
    projekte: BreakdownRow[];
    taetigkeiten: BreakdownRow[];
    formate: BreakdownRow[];
  };
  /** Pro-Woche-Aggregat, sortiert chronologisch. */
  weeks: Array<{
    label: string;
    activeDays: number;
    wallclockMs: number;
    presenceMs: number;
    coverage: number;
  }>;
  coverage: {
    daysGood: number; // >=80%
    daysOk: number;   // 60-80%
    daysThin: number; // <60% (nur Tage mit >=2h Präsenz)
    lowCoverageDays: LowCoverageDay[];
  };
  trend: {
    firstHalfMs: number;
    secondHalfMs: number;
    firstHalfDays: number;
    secondHalfDays: number;
    growth: TrendChange[];
    decline: TrendChange[];
  };
  /** Mandanten-Steckbriefe für alle Stakeholder mit >= 10% Gesamtanteil. */
  stakeholderProfiles: StakeholderProfile[];
  weekday: WeekdayProfile;
  absences: AbsenceCount[];
  findings: Finding[];
  /** Qualitatives Management-Summary als HTML (mehrere Paragraphen).
   *  User kann's im Modal editieren. */
  narrativeHtml: string;
}

interface BuildOptions {
  scope: ReportScope;
  range: ReportRange;
  subjectName: string;
  members?: Array<{
    user_id: string;
    codename: string;
    role: 'admin' | 'mitarbeiter';
  }>;
}

/* ─────────────────────────────────────────────────────────────────────
   Formatting helpers (shared with renderer)
   ───────────────────────────────────────────────────────────────────── */

function fmtHours(ms: number): string {
  if (!ms || ms <= 0) return '0:00h';
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, '0')}h`;
}

function normalizeTaetigkeit(t: string | undefined): string {
  const s = (t || '').trim();
  if (s.toLowerCase().replace(/\.$/, '') === 'produktiv') return 'Produktiv';
  return s;
}

function htmlEsc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ─────────────────────────────────────────────────────────────────────
   Breakdown helper
   ───────────────────────────────────────────────────────────────────── */

function buildBreakdown(
  entries: TimeEntry[],
  dimension: 'stakeholder' | 'projekt' | 'taetigkeit' | 'format'
): BreakdownRow[] {
  const buckets = new Map<string, { ms: number; count: number }>();
  for (const e of entries) {
    if (isAbsenceEntry(e)) continue;
    const ms = e.duration_ms || 0;
    if (ms <= 0) continue;
    const addToKey = (key: string) => {
      const cur = buckets.get(key) || { ms: 0, count: 0 };
      cur.ms += ms;
      cur.count += 1;
      buckets.set(key, cur);
    };
    if (dimension === 'stakeholder') {
      const list = Array.isArray(e.stakeholder)
        ? e.stakeholder
        : e.stakeholder
          ? [e.stakeholder]
          : [];
      if (list.length === 0) addToKey('—');
      else for (const s of list) addToKey(s || '—');
    } else if (dimension === 'taetigkeit') {
      addToKey(normalizeTaetigkeit(e.taetigkeit) || '—');
    } else {
      addToKey(((e[dimension] as string) || '—').trim() || '—');
    }
  }
  const total = Array.from(buckets.values()).reduce((a, b) => a + b.ms, 0);
  return Array.from(buckets.entries())
    .map(([name, v]) => ({
      name,
      ms: v.ms,
      pct: total > 0 ? (v.ms / total) * 100 : 0,
      count: v.count,
    }))
    .sort((a, b) => b.ms - a.ms);
}

function countAbsences(entries: TimeEntry[]): AbsenceCount[] {
  const buckets = new Map<string, { count: number; ms: number }>();
  for (const e of entries) {
    if (!isAbsenceEntry(e)) continue;
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
   Stakeholder-Profile (Mini-Dossiers) + Wochentag-Profil
   ───────────────────────────────────────────────────────────────────── */

const MICRO_TASK_MS = 15 * 60_000; // < 15min = Mini-Task
const HIGH_LOAD_DAY_MS = 10 * 60 * 60_000; // >= 10h Präsenz
const MEETING_FORMAT_HINTS = ['meeting', 'sitzung', 'telefon', 'call', 'workshop'];
const STAKEHOLDER_PROFILE_THRESHOLD_PCT = 10; // Mini-Dossier ab 10% Anteil

function isMeetingFormat(fmt: string): boolean {
  const f = fmt.toLowerCase();
  return MEETING_FORMAT_HINTS.some((h) => f.includes(h));
}

/**
 * Baut die Detail-Profile für alle Stakeholder mit Anteil >= Threshold.
 * Pro Stakeholder werden die top Projekt/Tätigkeit/Format ermittelt
 * sowie ein paar Verhaltens-Indikatoren (Mini-Task-Quote als
 * Reaktiv-Marker, Nicht-produktiv-Quote als Scope-Marker, Notiz-Quote
 * als Doku-Marker, Meeting-Heavy-Quote als Format-Marker).
 */
function buildStakeholderProfiles(
  entries: TimeEntry[],
  totalNaiveMs: number,
  topStakeholders: BreakdownRow[]
): StakeholderProfile[] {
  if (totalNaiveMs <= 0) return [];
  const profiles: StakeholderProfile[] = [];

  for (const sh of topStakeholders) {
    if (sh.pct < STAKEHOLDER_PROFILE_THRESHOLD_PCT) continue;
    if (sh.name === '—') continue;

    // Filter Einträge dieses Stakeholders (auch Mehrfach-Listen)
    const shEntries = entries.filter((e) => {
      if (isAbsenceEntry(e)) return false;
      const list = Array.isArray(e.stakeholder)
        ? e.stakeholder
        : e.stakeholder
          ? [e.stakeholder]
          : [];
      return list.includes(sh.name);
    });
    if (shEntries.length === 0) continue;

    // Aktive Tage (unique dates)
    const days = new Set<string>();
    for (const e of shEntries) if (e.date) days.add(e.date);

    // Micro-Tasks, Notiz, Format-Anomalien
    let microCount = 0;
    let notizCount = 0;
    let meetingMs = 0;
    let totalShMs = 0;
    for (const e of shEntries) {
      const ms = e.duration_ms || 0;
      totalShMs += ms;
      if (ms > 0 && ms < MICRO_TASK_MS) microCount += 1;
      if ((e.notiz || '').trim().length > 0) notizCount += 1;
      if ((e.format || '').trim() && isMeetingFormat(e.format)) meetingMs += ms;
    }

    // Top-Breakdowns pro Dimension nur über diese Stakeholder-Einträge
    const topProjekt = buildBreakdown(shEntries, 'projekt')[0] || null;
    const topTaetigkeit = buildBreakdown(shEntries, 'taetigkeit')[0] || null;
    const topFormat = buildBreakdown(shEntries, 'format')[0] || null;

    // Nicht-produktiv-Anteil dieses Stakeholders
    let nonprodMs = 0;
    for (const e of shEntries) {
      const tk = normalizeTaetigkeit(e.taetigkeit);
      if (tk === 'Nicht produktiv') nonprodMs += e.duration_ms || 0;
    }

    profiles.push({
      name: sh.name,
      pct: sh.pct,
      ms: sh.ms,
      entriesCount: shEntries.length,
      daysActive: days.size,
      avgEntryMs: shEntries.length > 0 ? totalShMs / shEntries.length : 0,
      microTaskPct: (microCount / shEntries.length) * 100,
      nonprodPct: totalShMs > 0 ? (nonprodMs / totalShMs) * 100 : 0,
      notizPct: (notizCount / shEntries.length) * 100,
      topProjekt,
      topTaetigkeit,
      topFormat,
      meetingHeavyPct: totalShMs > 0 ? (meetingMs / totalShMs) * 100 : 0,
    });
  }

  return profiles;
}

const DOW_LABELS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/**
 * Wochentag-Verteilung + Tagesextremwerte. dayWallMs ist die per-Day
 * Wallclock-Map aus dem Haupt-Loop (vermeidet Re-Compute).
 */
function buildWeekdayProfile(
  dayWallMs: Map<string, number>,
  dayPresMs: Map<string, number>
): WeekdayProfile {
  const byDowMs = [0, 0, 0, 0, 0, 0, 0]; // index = ISO-Wochentag (0=So..6=Sa)
  dayWallMs.forEach((ms, dateISO) => {
    const [y, m, d] = dateISO.split('-').map(Number);
    if (!y || !m || !d) return;
    const dow = new Date(y, m - 1, d).getDay();
    byDowMs[dow] += ms;
  });
  const totalMs = byDowMs.reduce((a, b) => a + b, 0);

  const byDay = byDowMs.map((ms, dow) => ({
    dow,
    label: DOW_LABELS[dow],
    ms,
    pct: totalMs > 0 ? (ms / totalMs) * 100 : 0,
  }));

  // Heaviest/lightest unter den Tagen, die überhaupt Stunden haben
  const nonZero = byDay.filter((d) => d.ms > 0);
  const heaviest = nonZero.length > 0
    ? nonZero.reduce((a, b) => (a.ms > b.ms ? a : b))
    : { label: '—', ms: 0 };
  const lightest = nonZero.length > 1
    ? nonZero.reduce((a, b) => (a.ms < b.ms ? a : b))
    : { label: '—', ms: 0 };

  // Längster / kürzester Tag (nach Präsenz, weil Präsenz die "Brutto"-
  // Tageslänge ist).
  let longestDay: { date: string; ms: number } | null = null;
  let shortestDay: { date: string; ms: number } | null = null;
  let highLoadCount = 0;
  dayPresMs.forEach((ms, date) => {
    if (ms <= 0) return;
    if (!longestDay || ms > longestDay.ms) longestDay = { date, ms };
    if (!shortestDay || ms < shortestDay.ms) shortestDay = { date, ms };
    if (ms >= HIGH_LOAD_DAY_MS) highLoadCount += 1;
  });

  return {
    byDay,
    heaviestDow: heaviest.label,
    lightestDow: lightest.label,
    weekendMs: byDowMs[0] + byDowMs[6], // So + Sa
    longestDay,
    shortestDay,
    highLoadDaysCount: highLoadCount,
  };
}

/* ─────────────────────────────────────────────────────────────────────
   Hauptfunktion
   ───────────────────────────────────────────────────────────────────── */

export function buildReportData(
  entries: TimeEntry[],
  opts: BuildOptions
): ReportData {
  const { scope, range, subjectName, members = [] } = opts;

  const nonAbsence = entries.filter((e) => !isAbsenceEntry(e));

  // Per-Day Aggregate
  const byDay = new Map<string, TimeEntry[]>();
  for (const e of nonAbsence) {
    if (!e.date) continue;
    const list = byDay.get(e.date);
    if (list) list.push(e);
    else byDay.set(e.date, [e]);
  }

  // Spillover-Vorbereitung: Set der Daten mit '23:59'-Tail. Wird beim
  // Per-Day-Loop gebraucht, um Mitternachts-Spillover aus dem Präsenz-
  // Fenster auszufiltern (sie bleiben in Wallclock + Naive, da
  // duration_ms reale Arbeit ist).
  const splitTails = buildSplitTailDates(nonAbsence);

  // KPIs
  const totalNaiveMs = computeNaiveSumMs(nonAbsence);
  let totalWallMs = 0;
  let totalPresMs = 0;
  const dayWallMs = new Map<string, number>();
  const dayPresMs = new Map<string, number>();
  byDay.forEach((es, d) => {
    const w = computeUnionMs(es);
    const presenceEntries = es.filter(
      (e) => !isMidnightSpillover(e, splitTails)
    );
    const p = computePresenceForDayMs(presenceEntries);
    dayWallMs.set(d, w);
    dayPresMs.set(d, p);
    totalWallMs += w;
    totalPresMs += p;
  });

  const workingDays = byDay.size;
  const mtFactor = totalWallMs > 0 ? totalNaiveMs / totalWallMs : 1;
  const coverage = totalPresMs > 0 ? totalWallMs / totalPresMs : 1;
  const avgWall = workingDays > 0 ? totalWallMs / workingDays : 0;
  const avgPres = workingDays > 0 ? totalPresMs / workingDays : 0;

  // Tätigkeits-Mix für Produktiv-Quote
  const taetBuckets = new Map<string, number>();
  for (const e of nonAbsence) {
    const k = normalizeTaetigkeit(e.taetigkeit);
    if (!k) continue;
    taetBuckets.set(k, (taetBuckets.get(k) || 0) + (e.duration_ms || 0));
  }
  const productiveMs = taetBuckets.get('Produktiv') || 0;
  const productivePct =
    totalNaiveMs > 0 ? (productiveMs / totalNaiveMs) * 100 : 0;

  // Coverage-Buckets
  let daysGood = 0;
  let daysOk = 0;
  let daysThin = 0;
  const lowCovDays: LowCoverageDay[] = [];
  dayPresMs.forEach((presMs, d) => {
    const wMs = dayWallMs.get(d) || 0;
    if (presMs <= 0) return;
    const cov = wMs / presMs;
    if (cov >= 0.8) daysGood += 1;
    else if (cov >= 0.6) daysOk += 1;
    else if (presMs >= 2 * 60 * 60_000) {
      // mindestens 2h Präsenz, sonst zu marginal
      daysThin += 1;
      lowCovDays.push({
        date: d,
        coveragePct: cov * 100,
        presenceMs: presMs,
        wallclockMs: wMs,
        gapMs: presMs - wMs,
      });
    }
  });
  lowCovDays.sort((a, b) => a.coveragePct - b.coveragePct);

  // perMember
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

  // Breakdowns
  const breakdowns = {
    stakeholders: buildBreakdown(nonAbsence, 'stakeholder'),
    projekte: buildBreakdown(nonAbsence, 'projekt'),
    taetigkeiten: buildBreakdown(nonAbsence, 'taetigkeit'),
    formate: buildBreakdown(nonAbsence, 'format'),
  };

  // Wochen-Aggregat
  const weekMap = new Map<
    string,
    { wallMs: number; presMs: number; days: Set<string> }
  >();
  for (const [d, es] of byDay) {
    void es;
    const wk = isoWeek(d);
    const cur = weekMap.get(wk) || { wallMs: 0, presMs: 0, days: new Set() };
    cur.wallMs += dayWallMs.get(d) || 0;
    cur.presMs += dayPresMs.get(d) || 0;
    cur.days.add(d);
    weekMap.set(wk, cur);
  }
  const weeks = Array.from(weekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, v]) => ({
      label,
      activeDays: v.days.size,
      wallclockMs: v.wallMs,
      presenceMs: v.presMs,
      coverage: v.presMs > 0 ? v.wallMs / v.presMs : 1,
    }));

  // Halbzeit-Trend (Stakeholder-Bewegung)
  const sortedDates = Array.from(byDay.keys()).sort();
  const halfIdx = Math.floor(sortedDates.length / 2);
  const firstDates = new Set(sortedDates.slice(0, halfIdx));
  const secondDates = new Set(sortedDates.slice(halfIdx));
  const firstEntries = nonAbsence.filter((e) => firstDates.has(e.date));
  const secondEntries = nonAbsence.filter((e) => secondDates.has(e.date));

  function stakeholderShareMs(es: TimeEntry[]): Map<string, number> {
    const m = new Map<string, number>();
    for (const e of es) {
      const list = Array.isArray(e.stakeholder)
        ? e.stakeholder
        : e.stakeholder
          ? [e.stakeholder]
          : [];
      const targets = list.length === 0 ? ['—'] : list.map((s) => s || '—');
      for (const t of targets) {
        m.set(t, (m.get(t) || 0) + (e.duration_ms || 0));
      }
    }
    return m;
  }
  const firstSh = stakeholderShareMs(firstEntries);
  const secondSh = stakeholderShareMs(secondEntries);
  const firstTotal = Array.from(firstSh.values()).reduce((a, b) => a + b, 0);
  const secondTotal = Array.from(secondSh.values()).reduce((a, b) => a + b, 0);

  const universe = new Set<string>([...firstSh.keys(), ...secondSh.keys()]);
  const trendChanges: TrendChange[] = [];
  universe.forEach((sh) => {
    const f = firstSh.get(sh) || 0;
    const s = secondSh.get(sh) || 0;
    const fp = firstTotal > 0 ? (f / firstTotal) * 100 : 0;
    const sp = secondTotal > 0 ? (s / secondTotal) * 100 : 0;
    if (fp < 3 && sp < 3) return; // zu marginal
    const delta = sp - fp;
    if (Math.abs(delta) < 3) return; // unter Signifikanz-Schwelle
    trendChanges.push({
      name: sh,
      firstPct: fp,
      secondPct: sp,
      deltaPct: delta,
      firstMs: f,
      secondMs: s,
    });
  });
  trendChanges.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));

  const trend = {
    firstHalfMs: firstTotal,
    secondHalfMs: secondTotal,
    firstHalfDays: firstDates.size,
    secondHalfDays: secondDates.size,
    growth: trendChanges.filter((t) => t.deltaPct > 0).slice(0, 5),
    decline: trendChanges.filter((t) => t.deltaPct < 0).slice(0, 5),
  };

  const absences = countAbsences(entries);

  // Detail-Profile pro Top-Stakeholder + Wochentag-Verteilung
  const stakeholderProfiles = buildStakeholderProfiles(
    nonAbsence,
    totalNaiveMs,
    breakdowns.stakeholders
  );
  const weekday = buildWeekdayProfile(dayWallMs, dayPresMs);

  // ─── Findings (Data-Hygiene + Beobachtungen) ─────────────────────
  const findings: Finding[] = [];

  // Tippfehler-Detection
  const taetCount = new Map<string, number>();
  for (const e of entries) {
    const t = e.taetigkeit || '';
    if (!t) continue;
    taetCount.set(t, (taetCount.get(t) || 0) + 1);
  }
  const taetKeys = Array.from(taetCount.keys());
  const dupPairs: Array<{ a: string; b: string; ca: number; cb: number }> = [];
  for (let i = 0; i < taetKeys.length; i++) {
    for (let j = i + 1; j < taetKeys.length; j++) {
      const a = taetKeys[i];
      const b = taetKeys[j];
      if (
        a.trim().toLowerCase().replace(/\.$/, '') ===
        b.trim().toLowerCase().replace(/\.$/, '')
      ) {
        dupPairs.push({
          a,
          b,
          ca: taetCount.get(a) || 0,
          cb: taetCount.get(b) || 0,
        });
      }
    }
  }
  if (dupPairs.length > 0) {
    const msgs = dupPairs
      .map(
        (p) =>
          `&quot;${htmlEsc(p.a)}&quot; (${p.ca}x) / &quot;${htmlEsc(p.b)}&quot; (${p.cb}x)`
      )
      .join(' &middot; ');
    findings.push({
      level: 'warn',
      htmlMessage: `<b>Tippfehler in Tätigkeit:</b> ${msgs}. Im Verwaltungs-Tab konsolidieren — sonst zerteilt sich die Aggregat-Sicht künstlich.`,
    });
  }

  // Lange Tage
  const veryLongDays: Array<{ date: string; ms: number }> = [];
  dayWallMs.forEach((ms, d) => {
    if (ms > 14 * 60 * 60_000) veryLongDays.push({ date: d, ms });
  });
  if (veryLongDays.length > 0) {
    veryLongDays.sort((a, b) => b.ms - a.ms);
    const examples = veryLongDays
      .slice(0, 3)
      .map((x) => `${x.date} (${fmtHours(x.ms)})`)
      .join(', ');
    findings.push({
      level: 'info',
      htmlMessage: `<b>${veryLongDays.length} Tag(e) mit &gt;14h Wallclock</b> (${examples}). Falls Nacherfassung mehrerer Tage in einem Schritt: für sauberere Kennzahlen auf die echten Tage rückverteilen.`,
    });
  }

  // Konzentration
  if (
    breakdowns.stakeholders.length > 0 &&
    breakdowns.stakeholders[0].pct > 35
  ) {
    const top = breakdowns.stakeholders[0];
    findings.push({
      level: 'info',
      htmlMessage: `<b>Konzentrations-Risiko ${htmlEsc(top.name)}:</b> ${top.pct.toFixed(0)}% der Zeit auf einen Stakeholder. Falls dieser Stakeholder wegfällt oder das Hauptprojekt abgeschlossen wird, verschiebt sich das Profil schnell. Frage als Teamleader: proaktive Diversifikation oder bewusste Akzeptanz dass die Rolle so fokussiert ist?`,
    });
  }

  // Multi-Tasking sehr hoch
  if (mtFactor > 1.5) {
    findings.push({
      level: 'info',
      htmlMessage: `<b>Multi-Tasking sehr hoch (${mtFactor.toFixed(2)}x).</b> Falls als Belastung empfunden: prüfen ob einzelne Slots als Single-Task bewusst geplant werden können, oder ob hier vergessene Tracker-Stops Schatten-Stunden erzeugen.`,
    });
  }

  // Nicht-Produktiv hoch
  const nonprodMs = taetBuckets.get('Nicht produktiv') || 0;
  const nonprodPct = totalNaiveMs > 0 ? (nonprodMs / totalNaiveMs) * 100 : 0;
  if (nonprodPct > 45) {
    findings.push({
      level: 'info',
      htmlMessage: `<b>Nicht-Produktiv-Anteil bei ${nonprodPct.toFixed(0)}%.</b> Lohnt ein Blick: welche der Top-Projekte dort sind wirklich nötig, welche könnten asynchron oder als kürzere Slots laufen?`,
    });
  }

  // Coverage schwach
  if (daysThin >= 5) {
    findings.push({
      level: 'info',
      htmlMessage: `<b>${daysThin} Tage mit Tracking-Coverage unter 60%.</b> Auf den schwächsten Tagen ist die Detail-Verteilung im Report weniger belastbar — für wichtige Reports ggf. nachvollziehen wo die untrackten Stunden hingingen.`,
    });
  }

  // ── Out-of-Scope-Triage pro Top-Stakeholder ──────────────────────
  // Reaktiv-Verdacht: ein Stakeholder mit substanziellem Anteil, der
  // überdurchschnittlich viele Mini-Einträge (<15min) bindet. Klassisches
  // Muster für „ad-hoc-Anfragen außerhalb des Mandats".
  for (const sp of stakeholderProfiles) {
    if (sp.microTaskPct >= 40 && sp.entriesCount >= 5) {
      findings.push({
        level: 'warn',
        htmlMessage: `<b>Reaktiv-Verdacht ${htmlEsc(sp.name)}:</b> ${sp.microTaskPct.toFixed(0)}% der Einträge sind unter 15 Minuten (Ø ${fmtHours(sp.avgEntryMs)}). Bei ${sp.pct.toFixed(0)}% Gesamtanteil deutet das auf ad-hoc-Aufträge hin. Empfehlung: Triage-Layer einziehen (Mailbox / fixe Sprechzeiten), damit kleine Anfragen gebündelt statt im Strom abgefangen werden.`,
      });
    }
  }

  // Out-of-Scope-Verdacht: hoher Nicht-produktiv-Anteil bei einem
  // Stakeholder. Heißt: viel Zeit wird gebunden, aber kein Output entsteht.
  for (const sp of stakeholderProfiles) {
    if (sp.nonprodPct >= 40 && sp.ms >= 2 * 60 * 60_000) {
      findings.push({
        level: 'warn',
        htmlMessage: `<b>Out-of-Scope-Verdacht ${htmlEsc(sp.name)}:</b> ${sp.nonprodPct.toFixed(0)}% der gebundenen Zeit (${fmtHours(sp.ms)}) ist als „Nicht produktiv" verbucht. Frage als Teamleader: ist das Beziehungspflege, die später Output erzeugt — oder fließt hier Steuerung in einen Stakeholder, der eigentlich nicht zum Kernauftrag gehört?`,
      });
    }
  }

  // Format-Anomalie: hoher Meeting-Anteil bei einem Stakeholder, der
  // eigentlich asynchron läuft. Wichtig für eine Kommunikationsfunktion,
  // die Output liefern soll statt nur abzustimmen.
  for (const sp of stakeholderProfiles) {
    if (sp.meetingHeavyPct >= 50 && sp.ms >= 2 * 60 * 60_000) {
      findings.push({
        level: 'info',
        htmlMessage: `<b>Meeting-lastiges Format ${htmlEsc(sp.name)}:</b> ${sp.meetingHeavyPct.toFixed(0)}% der Zeit in synchronen Formaten (Meeting/Telefon/Workshop). Lohnt der Check: welche dieser Termine könnten zu einer Mail oder einem 1-Pager komprimiert werden? Bei einer Output-Funktion ist Async-First meist die Effizienz-Reserve.`,
      });
    }
  }

  // Doku-Disziplin: Stakeholder mit substanziellem Anteil aber kaum
  // Notizen — Nachvollziehbarkeit leidet, gerade für Coach/Chef-Reports.
  for (const sp of stakeholderProfiles) {
    if (sp.notizPct <= 20 && sp.pct >= 15 && sp.entriesCount >= 8) {
      findings.push({
        level: 'info',
        htmlMessage: `<b>Doku-Lücke ${htmlEsc(sp.name)}:</b> Nur ${sp.notizPct.toFixed(0)}% der Einträge haben eine Notiz, bei ${sp.pct.toFixed(0)}% Gesamtanteil. Im Coaching-/Review-Gespräch fehlt der Kontext, was inhaltlich passiert ist. Eine 1-Wort-Notiz pro Slot ist meist genug.`,
      });
    }
  }

  // Hochlast: mehrere Tage über 10h Präsenz hintereinander. Coach- und
  // Teamleader-Signal — Burnout-Vorstufe, falls keine Erholung dazwischen.
  if (weekday.highLoadDaysCount >= 3) {
    findings.push({
      level: 'warn',
      htmlMessage: `<b>${weekday.highLoadDaysCount} Tage mit ≥10h Präsenz</b> im Zeitraum. Kein Drama bei vereinzelten Spitzen — wenn das aber ein Muster wird, lohnt der Blick auf Belastungssteuerung. Frage: was würde es brauchen, damit diese Tage planbar einkürzbar sind?`,
    });
  }

  // Wochenend-Anteil
  if (weekday.weekendMs > 0 && totalWallMs > 0) {
    const weekendShare = (weekday.weekendMs / totalWallMs) * 100;
    if (weekendShare >= 8) {
      findings.push({
        level: 'info',
        htmlMessage: `<b>Wochenend-Anteil ${weekendShare.toFixed(0)}%</b> (${fmtHours(weekday.weekendMs)}). Falls bewusst geplant (Deadlines, Reisetage): okay. Falls regelmäßig: Indikator dass die Wochentag-Kapazität nicht reicht — strukturelle statt akute Frage.`,
      });
    }
  }

  if (findings.length === 0) {
    findings.push({
      level: 'ok',
      htmlMessage:
        'Keine roten Flaggen — Verteilung plausibel, Datenqualität in Ordnung, Mix gesund.',
    });
  }

  // Title je nach Scope
  const titleByScope: Record<ReportScope, string> = {
    self: 'Mein Report',
    member: `Report – ${subjectName}`,
    team: `Team-Report – ${subjectName}`,
  };

  // Narrative HTML (mehrere Paragraphen)
  const narrativeHtml = generateNarrativeHtml({
    range,
    workingDays,
    weeksCount: weeks.length,
    scope,
    subjectName,
    breakdowns,
    avgWall,
    avgPres,
    mtFactor,
    coverage,
    productivePct,
    nonprodPct,
    konzeptPct:
      totalNaiveMs > 0
        ? ((taetBuckets.get('Konzeption') || 0) / totalNaiveMs) * 100
        : 0,
    konzeptMs: taetBuckets.get('Konzeption') || 0,
    fmtBuckets: breakdowns.formate,
    trend,
    daysGood,
    daysOk,
    daysThin,
    stakeholderProfiles,
    weekday,
    totalWallMs,
  });

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
      totalWallclockMs: totalWallMs,
      totalPresenceMs: totalPresMs,
      multiTaskingFactor: mtFactor,
      coverage,
      avgWallclockMsPerDay: avgWall,
      avgPresenceMsPerDay: avgPres,
      entriesCount: nonAbsence.length,
      workingDays,
      productivePct,
      productiveMs,
    },
    perMember,
    breakdowns,
    weeks,
    coverage: {
      daysGood,
      daysOk,
      daysThin,
      lowCoverageDays: lowCovDays.slice(0, 8),
    },
    trend,
    stakeholderProfiles,
    weekday,
    absences,
    findings,
    narrativeHtml,
  };
  return data;
}

/* ─────────────────────────────────────────────────────────────────────
   Narrative-Generator — qualitatives Management-Summary als HTML
   ───────────────────────────────────────────────────────────────────── */

interface NarrativeOpts {
  range: ReportRange;
  workingDays: number;
  weeksCount: number;
  scope: ReportScope;
  subjectName: string;
  breakdowns: ReportData['breakdowns'];
  avgWall: number;
  avgPres: number;
  mtFactor: number;
  coverage: number;
  productivePct: number;
  nonprodPct: number;
  konzeptPct: number;
  konzeptMs: number;
  fmtBuckets: BreakdownRow[];
  trend: ReportData['trend'];
  daysGood: number;
  daysOk: number;
  daysThin: number;
  stakeholderProfiles: StakeholderProfile[];
  weekday: WeekdayProfile;
  totalWallMs: number;
}

export function generateNarrativeHtml(o: NarrativeOpts): string {
  const paras: string[] = [];

  const topSh = o.breakdowns.stakeholders[0];
  if (!topSh) {
    return '<p>Keine Daten im Zeitraum.</p>';
  }

  // Para 1: Stakeholder-Charakter — datengetrieben nach Konzentration.
  //   pct ≥ 50%: klar konzentriert
  //   30–50%:    Schwerpunkt + Breite
  //   <30%:      breit verteilt
  paras.push(buildStakeholderPara(o, topSh));

  // Para 2: Projekt-Verteilung — basiert auf Top-2-Anteil UND Anzahl
  // Projekte. Verhindert den vorherigen Pseudo-Insight, dass eine "scheinbare
  // Breite" immer "klare Kraftbündelung" wäre.
  if (o.breakdowns.projekte.length >= 2) {
    paras.push(buildProjektPara(o));
  } else if (o.breakdowns.projekte.length === 1) {
    const only = o.breakdowns.projekte[0];
    paras.push(
      `<b>Wo die Stunden hingehen.</b> Einziges Projekt im Zeitraum: &laquo;${htmlEsc(only.name)}&raquo; — keine Verteilung zu analysieren.`
    );
  }

  // Para 2b: Mandanten-Steckbriefe — ein Mini-Dossier pro Stakeholder
  // mit substanziellem Anteil. Liefert dem Coach/Teamleader/Chef einen
  // schnellen, datengetriebenen Eindruck pro wichtigem Stakeholder ohne
  // dass er die Breakdown-Tabellen durchgehen muss.
  const steckbriefe = buildSteckbriefePara(o);
  if (steckbriefe) paras.push(steckbriefe);

  // Para 3: Modus
  const prodJudge =
    o.productivePct >= 50
      ? 'starker Output-Modus'
      : o.productivePct >= 40
        ? 'ausgeglichener Mix von Output und Steuerung'
        : 'stark steuerungs- und abstimmungslastiger Modus';

  const totalFmt = o.fmtBuckets.reduce((a, b) => a + b.ms, 0);
  const einzel = o.fmtBuckets.find((f) => f.name === 'Einzelarbeit');
  const einzelPct = einzel && totalFmt > 0 ? (einzel.ms / totalFmt) * 100 : 0;
  const asynJudge =
    einzelPct > 75
      ? ', asynchron-dominiert (auffallend wenige Meetings für eine Kommunikationsfunktion — Abstimmung läuft offenbar primär über Mail/Telefon)'
      : '';
  const mtJudge =
    o.mtFactor > 1.3
      ? `. Multi-Tasking-Faktor ${o.mtFactor.toFixed(2)} — du trackst ~${((o.mtFactor - 1) * 100).toFixed(0)}% mehr Aufgabenzeit als reine Wallclock, klares Indiz für parallel laufende Stränge`
      : '';

  paras.push(
    `<b>Wie gearbeitet wird.</b> ${prodJudge}: ${o.productivePct.toFixed(0)}% Produktiv, ${o.nonprodPct.toFixed(0)}% Nicht-produktiv${o.konzeptMs > 0 ? `, ${o.konzeptPct.toFixed(0)}% Konzeption` : ''}${asynJudge}${mtJudge}.`
  );

  // Para 3b: Wochenrhythmus + Tagesextremwerte
  const rhythmus = buildRhythmusPara(o);
  if (rhythmus) paras.push(rhythmus);

  // Para 4: Trend
  if (o.trend.growth.length > 0 || o.trend.decline.length > 0) {
    const parts: string[] = [];
    if (o.trend.growth.length > 0) {
      const descs = o.trend.growth
        .slice(0, 3)
        .map(
          (t) =>
            `<b>${htmlEsc(t.name)}</b> wuchs von ${t.firstPct.toFixed(0)}% auf ${t.secondPct.toFixed(0)}%`
        )
        .join(', ');
      parts.push(`Gewinner: ${descs}`);
    }
    if (o.trend.decline.length > 0) {
      const descs = o.trend.decline
        .slice(0, 3)
        .map(
          (t) =>
            `<b>${htmlEsc(t.name)}</b> fiel von ${t.firstPct.toFixed(0)}% auf ${t.secondPct.toFixed(0)}%`
        )
        .join(', ');
      parts.push(`Verlierer: ${descs}`);
    }
    paras.push(
      `<b>Verschiebung im Zeitraum.</b> Vergleicht man die erste mit der zweiten Periodenhälfte: ${parts.join('. ')}.`
    );
  }

  // Para 4b: Out-of-Scope-Aufmerksamkeit — datengetrieben aus
  // stakeholderProfiles. Wird nur eingefügt, wenn mind. ein Profil
  // ein auffälliges Muster zeigt.
  const oos = buildOutOfScopePara(o);
  if (oos) paras.push(oos);

  // Para 5: Datenqualität
  const covPct = o.coverage * 100;
  const covMeaning =
    covPct >= 85
      ? 'die Detail-Insights sind belastbar — fast alles, was passiert ist, ist auch erfasst'
      : covPct >= 70
        ? 'die Detail-Insights tragen; kleinere Lücken sind die Regel'
        : covPct >= 55
          ? 'die Tendenz stimmt, aber bei Detail-Kennzahlen mit Vorsicht — etwa ein Drittel der Anwesenheit ist nicht in Slots'
          : 'Detail-Aggregationen sind tendenziell zu niedrig — die echte Verteilung dürfte breiter sein';

  paras.push(
    `<b>Wie sicher die Zahlen sind.</b> Ø ${fmtHours(o.avgPres)} Präsenz / ${fmtHours(o.avgWall)} Wallclock pro aktivem Tag — Period-Coverage <b>${covPct.toFixed(0)}%</b> (${covMeaning}). Verteilung: ${o.daysGood} Tage ≥80%, ${o.daysOk} Tage 60–80%${o.daysThin > 0 ? `, ${o.daysThin} Tage unter 60% (Detail-Aussagen dort wackelig)` : ', keine Tage unter 60%'}.`
  );

  return paras.map((p) => `<p>${p}</p>`).join('\n');
}

/**
 * Para 1 — Stakeholder-Charakter. Die Tonalität (konzentriert / Schwerpunkt
 * + Breite / breit verteilt) hängt am Top-1-Anteil. Der Kontext-Halbsatz
 * (folgen mit Abstand / dahinter erkennbar / substanzielle Breite) hängt
 * am Top-3-Anteil. Bewusst zwei orthogonale Achsen, damit der Text die
 * Form der Verteilung trifft, nicht nur die Spitze.
 */
function buildStakeholderPara(
  o: NarrativeOpts,
  topSh: BreakdownRow
): string {
  const shCount = o.breakdowns.stakeholders.length;
  const header = `Im Zeitraum <b>${htmlEsc(o.range.label)}</b> (${o.workingDays} aktive Tage, ${o.weeksCount} Wochen)`;

  if (shCount === 1) {
    return `${header} zeigt sich ein Single-Stakeholder-Profil: <b>${htmlEsc(topSh.name)}</b> bindet 100% der erfassten Zeit.`;
  }

  // Lead-Satz: Charakter nach Top-1-Anteil.
  let lead: string;
  if (topSh.pct >= 50) {
    lead = `zeigt sich ein klar konzentriertes Arbeitsprofil. <b>${htmlEsc(topSh.name)}</b> bindet ${topSh.pct.toFixed(0)}% der erfassten Zeit`;
  } else if (topSh.pct >= 30) {
    lead = `zeigt sich ein Schwerpunkt-getragenes Profil. <b>${htmlEsc(topSh.name)}</b> führt mit ${topSh.pct.toFixed(0)}%`;
  } else {
    lead = `zeigt sich ein breit verteiltes Profil. <b>${htmlEsc(topSh.name)}</b> hält die Spitze mit nur ${topSh.pct.toFixed(0)}%`;
  }

  // Kontext-Halbsatz: Form der Verteilung nach Top-3-Anteil.
  const others = o.breakdowns.stakeholders
    .slice(1, 4)
    .map((s) => htmlEsc(s.name))
    .join(', ');
  const top3 = o.breakdowns.stakeholders
    .slice(0, 3)
    .reduce((sum, s) => sum + s.pct, 0);

  let context: string;
  if (top3 >= 80) {
    context = `, dahinter ${others} mit deutlichem Abstand. Top-3 bündeln ${top3.toFixed(0)}% — wenig Streuung`;
  } else if (top3 >= 60) {
    context = `, dahinter ${others} mit erkennbaren Anteilen. Top-3 ${top3.toFixed(0)}% — Mischlage`;
  } else {
    context = `, dahinter ${others} und weitere mit substanziellen Anteilen. Top-3 nur ${top3.toFixed(0)}% — echte Breite`;
  }

  return `${header} ${lead}${context}.`;
}

/**
 * Para 2 — Projekt-Verteilung. Zwei Achsen: Top-2-Anteil (Konzentration)
 * und Projekt-Anzahl (Portfolio-Breite). Aus der Kombination ergeben sich
 * vier qualitative Klassen — schmales Portfolio, Kraftbündelung trotz
 * Portfolio, Mischlage, echte Breite.
 */
function buildProjektPara(o: NarrativeOpts): string {
  const tp1 = o.breakdowns.projekte[0];
  const tp2 = o.breakdowns.projekte[1];
  const projCount = o.breakdowns.projekte.length;
  const top2 = tp1.pct + tp2.pct;
  const lead = `&laquo;${htmlEsc(tp1.name)}&raquo; (${tp1.pct.toFixed(0)}%) und &laquo;${htmlEsc(tp2.name)}&raquo; (${tp2.pct.toFixed(0)}%)`;

  if (projCount <= 3) {
    // Schmales Portfolio: Konzentration ist hier Folge der Anzahl, nicht
    // der Auswahl — entsprechend einordnen.
    return `<b>Wo die Stunden hingehen.</b> Schmales Projekt-Portfolio (${projCount}): ${lead} sind die Hauptlast (zusammen ${top2.toFixed(0)}%). Konzentration durch geringe Anzahl, nicht durch Schwerpunktsetzung — Projektwechsel würden das Bild stark verschieben.`;
  }

  if (top2 >= 70) {
    return `<b>Wo die Stunden hingehen.</b> ${lead} binden zusammen ${top2.toFixed(0)}% der Zeit. Die scheinbare Breite (${projCount} Projekte) täuscht — klare Kraftbündelung. Operativ effizient, aber bei Top-Abschluss verschiebt sich das Bild rasch.`;
  }

  if (top2 >= 40) {
    return `<b>Wo die Stunden hingehen.</b> ${lead} führen mit zusammen ${top2.toFixed(0)}%, dahinter ein erkennbares Portfolio aus ${projCount - 2} weiteren Projekten. Mischlage — parallele Steuerung sichtbar, Kontextwechsel-Kosten nennenswert.`;
  }

  // top2 < 40 % bei ≥4 Projekten: echte Breite.
  return `<b>Wo die Stunden hingehen.</b> Breit verteiltes Portfolio aus ${projCount} Projekten: ${lead} an der Spitze, aber zusammen nur ${top2.toFixed(0)}%. Hohe Diversifikation, Kontextwechsel-Kosten substanziell — kein dominanter Schwerpunkt.`;
}

/**
 * Para 2b — Mandanten-Steckbriefe. Pro Top-Stakeholder ein bis zwei
 * Sätze mit Top-Projekt, Hauptaktivität, Format-Schwerpunkt und Doku-
 * Disziplin. Hört bei drei Profilen auf, damit der Report nicht zur
 * Aufzählung wird.
 *
 * Liefert `null` wenn keine Stakeholder-Profile vorliegen (Edge-Case
 * Kleinzeitraum oder Single-Stakeholder).
 */
function buildSteckbriefePara(o: NarrativeOpts): string | null {
  const profiles = o.stakeholderProfiles.slice(0, 3);
  if (profiles.length === 0) return null;

  const lines = profiles.map((p) => {
    const parts: string[] = [];
    parts.push(
      `<b>${htmlEsc(p.name)}</b> &middot; ${p.pct.toFixed(0)}% &middot; ${fmtHours(p.ms)} an ${p.daysActive} Tagen`
    );
    const inhalt: string[] = [];
    if (p.topProjekt && p.topProjekt.name !== '—') {
      inhalt.push(
        `vor allem &laquo;${htmlEsc(p.topProjekt.name)}&raquo; (${p.topProjekt.pct.toFixed(0)}%)`
      );
    }
    if (p.topTaetigkeit && p.topTaetigkeit.name !== '—') {
      inhalt.push(
        `${htmlEsc(p.topTaetigkeit.name)} (${p.topTaetigkeit.pct.toFixed(0)}%)`
      );
    }
    if (p.topFormat && p.topFormat.name !== '—') {
      inhalt.push(
        `Format ${htmlEsc(p.topFormat.name)} (${p.topFormat.pct.toFixed(0)}%)`
      );
    }
    if (inhalt.length > 0) parts.push(inhalt.join(', '));

    const marker: string[] = [];
    if (p.microTaskPct >= 40) {
      marker.push(`${p.microTaskPct.toFixed(0)}% Mini-Slots`);
    }
    if (p.nonprodPct >= 30) {
      marker.push(`${p.nonprodPct.toFixed(0)}% nicht-produktiv`);
    }
    if (p.notizPct <= 25 && p.entriesCount >= 8) {
      marker.push(`nur ${p.notizPct.toFixed(0)}% mit Notiz`);
    }
    if (marker.length > 0) {
      parts.push(`auffällig: ${marker.join(', ')}`);
    }

    // &mdash; macht im Druck saubere Trenner zwischen den Teilsätzen.
    return `&bull;&nbsp; ${parts.join(' &mdash; ')}`;
  });

  // <br/> statt <ul>/<li>: bleibt innerhalb des <p>-Wrappers gültig,
  // den der Aufrufer um jeden Paragrafen legt.
  return `<b>Mandanten im Detail.</b><br/>${lines.join('<br/>')}`;
}

/**
 * Para 3b — Wochenrhythmus + Tagesextremwerte. Liefert auch dann etwas,
 * wenn die Verteilung gleichmäßig ist (dann „gleichmäßiges Profil").
 */
function buildRhythmusPara(o: NarrativeOpts): string | null {
  const wd = o.weekday;
  if (!wd.byDay.some((d) => d.ms > 0)) return null;

  // Variations-Indikator: höchster vs niedrigster Wochentag (nur unter
  // den nicht-leeren Tagen).
  const nonZero = wd.byDay.filter((d) => d.ms > 0);
  const hi = nonZero.reduce((a, b) => (a.ms > b.ms ? a : b));
  const lo = nonZero.reduce((a, b) => (a.ms < b.ms ? a : b));
  const spread = hi.ms > 0 ? (hi.ms - lo.ms) / hi.ms : 0; // 0..1

  let pattern: string;
  if (spread < 0.3) {
    pattern = `gleichmäßiges Wochenprofil — alle aktiven Wochentage tragen ähnlich bei`;
  } else if (spread < 0.6) {
    pattern = `<b>${hi.label}</b> ist der stärkste Wochentag (${hi.pct.toFixed(0)}% der Zeit), <b>${lo.label}</b> der ruhigste`;
  } else {
    pattern = `stark schwankendes Wochenprofil — <b>${hi.label}</b> trägt ${hi.pct.toFixed(0)}%, <b>${lo.label}</b> nur ${lo.pct.toFixed(0)}%`;
  }

  const parts: string[] = [pattern];

  // Tageextremwerte
  if (o.weekday.longestDay && o.weekday.longestDay.ms > 0) {
    parts.push(
      `längster Tag ${o.weekday.longestDay.date} mit ${fmtHours(o.weekday.longestDay.ms)} Präsenz`
    );
  }
  if (wd.highLoadDaysCount > 0) {
    parts.push(`${wd.highLoadDaysCount} Tage über 10h Präsenz`);
  }

  // Wochenend-Anteil
  if (wd.weekendMs > 0 && o.totalWallMs > 0) {
    const wePct = (wd.weekendMs / o.totalWallMs) * 100;
    if (wePct >= 5) {
      parts.push(`Wochenend-Anteil ${wePct.toFixed(0)}% (${fmtHours(wd.weekendMs)})`);
    }
  }

  return `<b>Wochenrhythmus.</b> ${parts.join('; ')}.`;
}

/**
 * Para 4b — Out-of-Scope-Aufmerksamkeit. Aggregiert die Profil-
 * Indikatoren (Reaktiv, Out-of-Scope, Meeting-lastig) zu einem
 * konkreten Handlungs-Absatz. Wird nur eingefügt, wenn mind. ein
 * Profil eine markante Auffälligkeit zeigt.
 */
function buildOutOfScopePara(o: NarrativeOpts): string | null {
  interface Hit {
    name: string;
    label: string;
    pct: number;
  }
  const reactive: Hit[] = [];
  const oos: Hit[] = [];
  const meeting: Hit[] = [];

  for (const p of o.stakeholderProfiles) {
    if (p.microTaskPct >= 40 && p.entriesCount >= 5) {
      reactive.push({ name: p.name, label: 'Reaktiv', pct: p.microTaskPct });
    }
    if (p.nonprodPct >= 40 && p.ms >= 2 * 60 * 60_000) {
      oos.push({ name: p.name, label: 'Out-of-Scope', pct: p.nonprodPct });
    }
    if (p.meetingHeavyPct >= 50 && p.ms >= 2 * 60 * 60_000) {
      meeting.push({ name: p.name, label: 'Meeting-lastig', pct: p.meetingHeavyPct });
    }
  }

  if (reactive.length + oos.length + meeting.length === 0) return null;

  const lines: string[] = [];
  if (reactive.length > 0) {
    const list = reactive
      .map((h) => `${htmlEsc(h.name)} (${h.pct.toFixed(0)}% Mini-Slots)`)
      .join(', ');
    lines.push(
      `<b>Reaktiv-Druck</b> bei ${list} — viele kleine Slots deuten auf ad-hoc-Anfragen außerhalb planbaren Mandats. Triage-Layer (fixe Sprechzeiten, Mailbox-First) gibt Stunden zurück.`
    );
  }
  if (oos.length > 0) {
    const list = oos
      .map((h) => `${htmlEsc(h.name)} (${h.pct.toFixed(0)}% nicht-produktiv)`)
      .join(', ');
    lines.push(
      `<b>Scope-Frage</b> bei ${list} — hohe Beziehungsarbeit oder Steuerung ohne sichtbaren Output. Ist diese Bindung strategisch gewollt, oder ein historisches Erbe das geprüft gehört?`
    );
  }
  if (meeting.length > 0) {
    const list = meeting
      .map((h) => `${htmlEsc(h.name)} (${h.pct.toFixed(0)}% Meetings)`)
      .join(', ');
    lines.push(
      `<b>Async-Reserve</b> bei ${list} — synchron-lastig für eine Kommunikationsfunktion. Welche dieser Termine könnten als Brief/1-Pager/Mail komprimiert werden?`
    );
  }

  return `<b>Was die Aufmerksamkeit kostet.</b> ${lines.join(' ')}`;
}

function isoWeek(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dayNum = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((dt.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return `${dt.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}
