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
}

export function generateNarrativeHtml(o: NarrativeOpts): string {
  const paras: string[] = [];

  const topSh = o.breakdowns.stakeholders[0];
  if (!topSh) {
    return '<p>Keine Daten im Zeitraum.</p>';
  }

  // Para 1: Charakter
  const others = o.breakdowns.stakeholders
    .slice(1, 4)
    .map((s) => htmlEsc(s.name))
    .join(', ');
  paras.push(
    `Im Zeitraum <b>${htmlEsc(o.range.label)}</b> (${o.workingDays} aktive Tage, ${o.weeksCount} Wochen) zeigt sich ein konzentriertes Arbeitsprofil. <b>${htmlEsc(topSh.name)}</b> bindet allein ${topSh.pct.toFixed(0)}% der erfassten Zeit — die nächsten drei (${others}) folgen mit deutlichem Abstand. Operativ: starker Schwerpunkt, wenig Streuung.`
  );

  // Para 2: Projekt-Charakter
  if (o.breakdowns.projekte.length >= 2) {
    const tp1 = o.breakdowns.projekte[0];
    const tp2 = o.breakdowns.projekte[1];
    const top2sum = tp1.pct + tp2.pct;
    paras.push(
      `<b>Wo die Stunden hingehen.</b> &laquo;${htmlEsc(tp1.name)}&raquo; (${tp1.pct.toFixed(0)}%) und &laquo;${htmlEsc(tp2.name)}&raquo; (${tp2.pct.toFixed(0)}%) binden zusammen ${top2sum.toFixed(0)}% der Zeit. Die scheinbare Breite (${o.breakdowns.projekte.length} Projekte) täuscht — klare Kraftbündelung. Operativ effizient, aber bei Projekt-Abschluss verschiebt sich das Bild rasch.`
    );
  }

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
