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

import type { ProjectCategory, TimeEntry } from '@/types';
import { effectiveCategoryWithDefault } from './projectClassifier';
import {
  buildSplitTailDates,
  computeNaiveSumMs,
  computeUnionMs,
  computePresenceForDayMs,
  isMidnightSpillover,
} from './wallclock';
import { isAbsenceEntry } from './absences';

export type ReportScope = 'self' | 'member' | 'team';

/**
 * Perspektive, aus der das Narrative gelesen werden soll. Beeinflusst
 * NICHT die berechneten Daten — nur die Closing-Para mit gerichteten
 * Fragen und Empfehlungen.
 *
 *   - **coach**: Selbst-Reflexion, persönliche Anrede, Rhythmus &
 *     Energie & Doku.
 *   - **lead**: Teamleader-Steuerung, Belastung & Mandat &
 *     Konzentrations-Risiko.
 *   - **chef**: Operative Effizienz, Output-Quote & Trends &
 *     Datenbasis.
 *   - **board**: Geschäftsleitung, knappe strategische Headlines.
 */
export type ReportLens = 'coach' | 'lead' | 'chef' | 'board';

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
  /** % der Meeting-Zeit dieses Stakeholders, die als 'Nicht produktiv'
   *  verbucht ist. Hoch = Meetings binden Zeit ohne Output. */
  meetingNonprodPct: number;
  /** Anzahl distinkter Formate. >=4 = format-zersplittert. */
  formatSpread: number;
}

/**
 * Konzentrations- und Coverage-Drift zwischen erster und zweiter
 * Periodenhälfte. Beantwortet: verstärkt oder lockert sich der
 * Schwerpunkt, öffnet oder schließt sich das Portfolio, wird die
 * Tracking-Qualität besser oder schlechter?
 */
export interface ConcentrationDrift {
  top1ShareFirst: number;     // % Stakeholder
  top1ShareSecond: number;
  topShNameFirst: string;
  topShNameSecond: string;
  distinctShFirst: number;    // Anzahl aktiver Stakeholder
  distinctShSecond: number;
  top1ProjShareFirst: number; // % Projekt
  top1ProjShareSecond: number;
  topProjNameFirst: string;
  topProjNameSecond: string;
  distinctProjFirst: number;
  distinctProjSecond: number;
  coverageFirst: number;      // 0..1
  coverageSecond: number;
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

/**
 * Tagesteil-Verteilung — wo im Tag fällt die Arbeit an?
 * Morning 06–12 · Afternoon 12–18 · Evening 18–23 · Night 23–06.
 * dominantPart = Tagesteil mit ≥ 40 % Anteil, sonst 'gemischt'.
 */
export interface DayPartProfile {
  morningMs: number;
  afternoonMs: number;
  eveningMs: number;
  nightMs: number;
  dominantPart: 'morgens' | 'mittags' | 'abends' | 'nachts' | 'gemischt';
  dominantPct: number;
}

/**
 * Rhythmus-Festigkeit — wie konstant ist der Tagesablauf?
 * Spreads in Minuten (Standardabweichung der Tages-Start/End-Zeiten).
 * weekConsistencyCV = Variationskoeffizient der Wochen-Wallclock.
 *
 * Klassifikation:
 *   'fix':        Start-Spread < 45 min UND End-Spread < 60 min
 *   'rhythmisch': Start-Spread < 90 min UND End-Spread < 120 min
 *   'gleitend':   alles darüber
 */
export interface RhythmConsistency {
  startSpreadMin: number;
  endSpreadMin: number;
  rhythm: 'fix' | 'rhythmisch' | 'gleitend';
  weekConsistencyCV: number | null;
}

/**
 * Slot-Längen-Histogramm. Bins: micro < 15min · short 15–60 · medium 60–120
 * · long 120–240 · deep > 240. deepFocusPct = Anteil ZEIT in Long+Deep-Slots.
 */
export interface SlotLengthHistogram {
  microCount: number;
  shortCount: number;
  mediumCount: number;
  longCount: number;
  deepCount: number;
  totalCount: number;
  deepFocusPct: number;
}

/**
 * Erfassungs-Disziplin — wie nachvollziehbar wurde erfasst?
 *   notizCoverage:    % Einträge mit Notiz (≥1 Zeichen).
 *   notizMedianChars: Median-Länge der vorhandenen Notizen.
 *   editedPct:        % Einträge updated_at > created_at + 30 s.
 */
export interface ErfassungsDisziplin {
  notizCoverage: number;
  notizMedianChars: number;
  editedPct: number;
}

/**
 * Belastungs-Muster: längste Slot-Kette ohne Pause >15 min in Minuten.
 * longBurstCount = Anzahl Slot-Ketten >180 min ohne Pause.
 */
export interface BurstPattern {
  longestBurstMin: number;
  longestBurstDate: string | null;
  longBurstCount: number;
}

/**
 * Projekt-Lebenszyklus — neu im Range, im Range ausgelaufen.
 * Vergleich 1. vs 2. Hälfte mit Mindest-Schwelle 1 h pro Projekt
 * (sonst Rauschen durch Einzelslots).
 */
export interface ProjektLifecycle {
  newcomers: BreakdownRow[];
  vanished: BreakdownRow[];
}

/**
 * Multi-Stakeholder-Quote — % Einträge mit ≥ 2 Stakeholdern parallel.
 * Indikator für Parallel-Mandate; geht über den globalen mtFactor hinaus.
 */
export interface MultiTaskingProfile {
  multiStakeholderPct: number;
}

/**
 * Datenqualitäts-Issues — gehen NICHT in den Report, sondern in den
 * Manage-Tab. Disziplin-Themen sollen am Datenort gelöst werden, nicht
 * im Bericht angeprangert sein.
 */
export interface DataQualityIssue {
  type: 'duplicate-taetigkeit';
  message: string;
  /** Konkrete Werte, die im Manage-Tab sichtbar gemacht werden. */
  items: string[];
}

/**
 * Eine Finding ist zielgruppenklassifiziert. Wenn `audiences` undefined
 * ist, gilt das Finding für alle Brillen. Die Klassifikation hält ein
 * Coach-Report von Compliance-Findings und einen Board-Report von
 * Detail-Hinweisen frei.
 */
/**
 * Welle 5c — internes Label pro Finding, damit Composite-Detektoren
 * Evidenz finden ohne htmlMessage-Pattern-Matching. Optional, fehlt
 * bei einzelnen Findings (z.B. OK-Fallback).
 */
export type FindingKind =
  | 'very-long-day'
  | 'klumpen-risiko'
  | 'mt-high'
  | 'nonprod-high'
  | 'coverage-thin'
  | 'reactive-stakeholder'
  | 'oos-stakeholder'
  | 'meeting-heavy-stakeholder'
  | 'meetings-without-output'
  | 'notes-gap-stakeholder'
  | 'high-load-days'
  | 'weekend-share'
  | 'low-deep-focus'
  | 'longest-burst'
  | 'many-bursts'
  | 'week-volatility'
  | 'project-movement'
  | 'change-point';

export interface Finding {
  level: 'warn' | 'info' | 'ok';
  htmlMessage: string;
  audiences?: ReportLens[];
  /** Optionales Label für Composite-Erkennung in Welle 5c. */
  kind?: FindingKind;
}

/**
 * Welle 5c — Composite-Finding: mehrere schwache Einzel-Findings, die
 * dasselbe Bild zeichnen, werden zu einem starken Befund mit Diagnose
 * + Hebel zusammengeführt. Display-Strategie pro Brille ist
 * unterschiedlich (siehe shared.filterFindingsForLens):
 *   Chef + Board:  Composite ersetzt seine Evidence-Findings im Display
 *   Coach + Lead:  Composite erscheint ZUSÄTZLICH zu den Einzel-Findings
 */
export type CompositeFindingId =
  | 'operative-ueberlast'
  | 'reaktive-phase'
  | 'konzentrations-verlust'
  | 'fokus-erosion';

export interface CompositeFinding {
  id: CompositeFindingId;
  level: 'warn' | 'info';
  /** Headline-Satz: was das Bild zeigt. */
  diagnosis: string;
  /** Konkreter Hebel — eine zitierte Frage oder Anweisung. */
  hebel: string;
  /** Indices in findings[], die das Composite ausgelöst haben. */
  evidenceFindings: number[];
  audiences: ReportLens[];
}

/**
 * Welle 5b — UserBaseline: personalisierte Statistik aus dem aktuellen
 * Range, mit der bestehende fixe Schwellen ersetzt werden. Ziel: für
 * jemand mit 6h-Median-Tagen ist ein 10h-Tag bemerkenswert, für jemand
 * mit 11h-Median ist er normal. Beide bekommen jetzt nicht mehr dasselbe
 * Finding.
 *
 * isReliable === false bedeutet: zu wenig Beobachtungen (< 10 aktive
 * Tage), Detektor fällt auf die alten fixen Schwellen zurück.
 */
export interface UserBaseline {
  observations: number;
  isReliable: boolean;
  dayWallclockMs: { median: number; mad: number; p90: number };
  dayPresenceMs: { median: number; mad: number; p90: number };
  /** Slot-Längen aus allen erfassten Einträgen. */
  slotLengthMs: { median: number; p90: number };
  /** Pro-Tag-MT-Faktor (Naive/Wallclock je Tag), Median über die Tage. */
  multiTaskingFactor: { median: number };
}

/**
 * Welle 5a — Change-Point: ein erkannter Bruch in einer wöchentlichen
 * Zeitreihe. Detektor läuft hybrid (Z-Score wenn >=6 Wochen, %-Schwelle
 * bei 3-5 Wochen, gar nicht bei <3). Pro Metrik wird höchstens ein
 * Change-Point geliefert — derjenige mit dem stärksten Bruch.
 */
export type ChangePointMetric =
  | 'wallclock'
  | 'meeting'
  | 'deepFocus'
  | 'multiTasking'
  | 'topStakeholder'
  | 'coverage';

/**
 * Welle 5a / Klartext+Kontext-Pass — zusätzlicher Kontext pro Change-
 * Point, der bei der Interpretation hilft: was lief sonst noch in der
 * Bruch-Woche, ist es einmalig oder hält es an, was sind konkrete
 * Snapshot-Daten der Bruch-Woche.
 */
export interface ChangePointContext {
  /**
   * Andere Metriken, die in derselben Woche ebenfalls als Change-Point
   * gefeuert haben — Hinweis auf zusammenhängende Verschiebung. Leer,
   * wenn dieser Bruch alleinsteht.
   */
  coOccurringMetrics: Array<{
    metric: ChangePointMetric;
    deltaSign: 'up' | 'down';
  }>;
  /**
   * Wert der direkten Folgewoche in derselben Metrik (gleiche Einheit
   * wie baselineValue/currentValue). Null, wenn keine Folgewoche oder
   * zu wenig Tracking. Hilft beim 'einmalig oder hält das an?'-Check.
   */
  nextWeekValue: number | null;
  /**
   * Persistenz-Einordnung basierend auf nextWeekValue:
   * - 'einmalig': Folgewoche liegt näher an Baseline als am Bruch
   * - 'haelt-an': Folgewoche liegt näher am Bruch als an Baseline
   * - 'unklar': keine Folgewoche im Range, oder genau dazwischen
   */
  persistence: 'einmalig' | 'haelt-an' | 'unklar';
  /**
   * Snapshot der Bruch-Woche — wer/was dominierte sie, jenseits der
   * Bruch-Metrik selbst. Hilft Lesern, sich die Woche konkret
   * vorzustellen.
   */
  weekSnapshot: {
    topStakeholderName: string;
    topStakeholderShare: number;
    meetingShare: number;
    deepFocusShare: number;
    multiTaskingFactor: number;
    wallclockHours: number;
    coverage: number;
  };
}

export interface ChangePoint {
  metric: ChangePointMetric;
  weekLabel: string;
  /** Median der Wochen VOR dem Bruch — im Einheits-System der Metrik. */
  baselineValue: number;
  /** Wert in der Bruch-Woche. */
  currentValue: number;
  /** currentValue - baselineValue. */
  deltaAbsolute: number;
  deltaSign: 'up' | 'down';
  /** Detektor-Modus: 'zscore' (>=6 Wochen) oder 'percent' (3-5 Wochen). */
  mode: 'zscore' | 'percent';
  /** Bei 'zscore' der MAD-basierte Z-Score, sonst NaN. */
  zScore: number;
  /** Bei 'percent' die relative Abweichung, sonst NaN. */
  pctDelta: number;
  baselineWeekCount: number;
  /** Zusatz-Kontext für die Interpretation. */
  context: ChangePointContext;
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
    /**
     * Welle 6 — Versickerungs-Modell. Anteil der naiv getrackten Zeit,
     * die mit Tätigkeit „Nicht produktiv" markiert wurde. Hoher Wert =
     * Warnung (Person selbst markiert mehr Zeit als versickert).
     * Komplementär zu productivePct, aber unabhängig (zwischen beidem
     * liegt z.B. „Konzeption" und andere produktive Tätigkeiten).
     */
    leakMs: number;
    leakPct: number;
    /**
     * Welle 6 — Reaktivitäts-Index. Anteil der getrackten Wallclock-
     * Zeit in Projekten der Kategorie `reaktiv` (Flowstopper).
     * Beschreibend, nicht wertend — beschreibt das Profil der Periode.
     */
    reactiveMs: number;
    reactivePct: number;
    /**
     * Welle 6 — Anteil der Wallclock-Zeit in Projekten der Kategorie
     * `planbar`. Komplementär zur Reaktivitäts-Achse, dient für
     * Konsistenz-Checks und Coach-Narrative.
     */
    plannableMs: number;
    plannablePct: number;
    /**
     * Welle 6 — Krisen-Indikator. True, wenn in der Periode mindestens
     * ein Slot in einem Krisen-Projekt getrackt wurde. Steuert den
     * Krisen-Modus in den Brillen (gedämpfte Warnungen).
     */
    hasCrisisSlots: boolean;
  };
  perMember?: PerMemberRow[];
  breakdowns: {
    stakeholders: BreakdownRow[];
    projekte: BreakdownRow[];
    taetigkeiten: BreakdownRow[];
    formate: BreakdownRow[];
  };
  /**
   * Pro-Woche-Aggregat, sortiert chronologisch. Welle 5a hat vier
   * Felder additiv ergänzt — `meetingShare`, `deepFocusShare`,
   * `multiTaskingFactor`, `topStakeholderShare`. Alte Renderer, die
   * nur die Basis-Felder nutzen, sind nicht betroffen.
   */
  weeks: Array<{
    label: string;
    activeDays: number;
    wallclockMs: number;
    presenceMs: number;
    coverage: number;
    /** Anteil der Wallclock-Zeit in Meeting-Formaten (0..1). */
    meetingShare: number;
    /** Anteil der Wallclock-Zeit in Slots >= 120 Minuten (0..1). */
    deepFocusShare: number;
    /** naive / wallclock dieser Woche — Parallelitäts-Indikator. */
    multiTaskingFactor: number;
    /** Anteil des größten Stakeholders dieser Woche (0..1). */
    topStakeholderShare: number;
    /** Name des Top-Stakeholders — für Change-Point-Texte. */
    topStakeholderName: string;
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
  /** Konzentrations-Drift 1. vs 2. Periodenhälfte. */
  drift: ConcentrationDrift | null;
  /** Tagesteil-Modus + Rhythmus-Festigkeit + Burst. Phase A. */
  rhythm: {
    dayPart: DayPartProfile;
    consistency: RhythmConsistency;
    burst: BurstPattern;
  };
  /** Slot-Längen-Histogramm + Tiefen-Fokus-Quote. Phase A. */
  slotLength: SlotLengthHistogram;
  /** Erfassungs-Disziplin (Notiz + Edit-Quote). Phase A. */
  disziplin: ErfassungsDisziplin;
  /** Multi-Stakeholder-Quote. Phase A. */
  multitasking: MultiTaskingProfile;
  /** Projekt-Lebenszyklus 1. vs 2. Hälfte. Phase A. */
  projektLifecycle: ProjektLifecycle;
  /**
   * Welle 5a — erkannte Wochen-Brüche pro Metrik (max. 1 pro Metrik),
   * sortiert nach Stärke des Bruchs absteigend. Leeres Array, wenn der
   * Range zu kurz ist (< 3 verwertbare Wochen).
   */
  changePoints: ChangePoint[];
  /**
   * Welle 5b — personalisierte Statistik-Baseline aus dem aktuellen
   * Range. Wird von den Detektoren der Findings benutzt, um Schwellen
   * an die Person anzupassen (Hochlast / lange Tage / Burst / MT-Faktor).
   */
  baseline: UserBaseline;
  /**
   * Welle 5c — Composite-Findings (mehrere schwache Signale →
   * ein starker Befund mit Diagnose + Hebel). Sortiert nach Severity.
   */
  composites: CompositeFinding[];
  /** Lens, mit der dieser Report generiert wurde (für den Dispatcher). */
  lens: ReportLens;
  absences: AbsenceCount[];
  findings: Finding[];
  /** Datenqualitäts-Issues für den Manage-Tab. NICHT im Report sichtbar. */
  dataQualityIssues: DataQualityIssue[];
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
  /** Lens für die Closing-Para. Default 'coach'. */
  lens?: ReportLens;
  /**
   * Welle 6 — Projekt-Klassifikation. Map Projektname → Kategorie. Wird
   * genutzt für Reaktivitäts-Index, Krisen-Modus und Mikro-Slot-Re-
   * Interpretation. Wenn nicht übergeben, fällt die Berechnung auf die
   * Heuristik aus dem Projektnamen zurück.
   */
  projectCategories?: Map<string, ProjectCategory>;
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
    let meetingNonprodMs = 0;
    let totalShMs = 0;
    const formatSet = new Set<string>();
    for (const e of shEntries) {
      const ms = e.duration_ms || 0;
      totalShMs += ms;
      if (ms > 0 && ms < MICRO_TASK_MS) microCount += 1;
      if ((e.notiz || '').trim().length > 0) notizCount += 1;
      const fmt = (e.format || '').trim();
      if (fmt) {
        formatSet.add(fmt);
        if (isMeetingFormat(fmt)) {
          meetingMs += ms;
          if (normalizeTaetigkeit(e.taetigkeit) === 'Nicht produktiv') {
            meetingNonprodMs += ms;
          }
        }
      }
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
      meetingNonprodPct:
        meetingMs > 0 ? (meetingNonprodMs / meetingMs) * 100 : 0,
      formatSpread: formatSet.size,
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
   Phase-A-Datenpunkte: Tageszeit, Rhythmus, Slot-Länge, Disziplin,
   Burst, Lifecycle, Multi-Stakeholder.
   Alle reine Funktionen — Input nonAbsence-Einträge / Maps, Output Struct.
   ───────────────────────────────────────────────────────────────────── */

/** HH:MM → Minuten seit Mitternacht. Robust gegen leere Strings. */
function timeToMin(hhmm: string): number {
  if (!hhmm || hhmm.length < 4) return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Verteilt die Eintrags-Dauer auf die vier Tagesteile, indem die [start,end]-
 * Spanne mit den jeweiligen Tagesteil-Fenstern verschnitten wird. So zählt
 * ein Slot 11:30–13:00 anteilig in 'morgens' UND 'mittags' — kein Bucket-
 * Effekt wo nur die Startzeit zählt.
 */
function buildDayPartProfile(entries: TimeEntry[]): DayPartProfile {
  // Fenster in Minuten seit Mitternacht
  const WINDOWS: Array<['morgens' | 'mittags' | 'abends' | 'nachts', number, number]> = [
    ['morgens', 6 * 60, 12 * 60],
    ['mittags', 12 * 60, 18 * 60],
    ['abends', 18 * 60, 23 * 60],
    ['nachts', 23 * 60, 24 * 60], // 23:00–24:00 — der Rest 00:00–06:00 wird unten gespiegelt
  ];
  let morningMs = 0;
  let afternoonMs = 0;
  let eveningMs = 0;
  let nightMs = 0;

  for (const e of entries) {
    if (isAbsenceEntry(e)) continue;
    const s = timeToMin(e.start_time);
    let en = timeToMin(e.end_time);
    if (en < s) en = s + Math.round((e.duration_ms || 0) / 60_000); // overnight-Fallback
    // 00:00–06:00 → nightMs
    if (s < 6 * 60) {
      const overlap = Math.max(0, Math.min(en, 6 * 60) - s);
      nightMs += overlap * 60_000;
    }
    for (const [part, ws, we] of WINDOWS) {
      const overlap = Math.max(0, Math.min(en, we) - Math.max(s, ws));
      if (overlap <= 0) continue;
      const ms = overlap * 60_000;
      if (part === 'morgens') morningMs += ms;
      else if (part === 'mittags') afternoonMs += ms;
      else if (part === 'abends') eveningMs += ms;
      else nightMs += ms;
    }
  }

  const total = morningMs + afternoonMs + eveningMs + nightMs;
  const parts: Array<[DayPartProfile['dominantPart'], number]> = [
    ['morgens', morningMs],
    ['mittags', afternoonMs],
    ['abends', eveningMs],
    ['nachts', nightMs],
  ];
  const sorted = [...parts].sort((a, b) => b[1] - a[1]);
  const [topName, topMs] = sorted[0];
  const dominantPct = total > 0 ? (topMs / total) * 100 : 0;
  const dominantPart: DayPartProfile['dominantPart'] =
    dominantPct >= 40 ? topName : 'gemischt';

  return {
    morningMs,
    afternoonMs,
    eveningMs,
    nightMs,
    dominantPart,
    dominantPct,
  };
}

/** Standardabweichung einer Zahlenreihe. */
function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Berechnet Rhythmus-Festigkeit:
 *   - Tages-Anfangs- und End-Spreads als σ über alle aktiven Tage
 *   - Wochen-CV = σ / Ø der Wochen-Wallclock (nur wenn ≥ 2 Wochen Daten)
 * Klassifikation 'fix' / 'rhythmisch' / 'gleitend' steht im Interface.
 */
function buildRhythmConsistency(
  byDay: Map<string, TimeEntry[]>,
  weeks: Array<{ wallclockMs: number }>
): RhythmConsistency {
  const startMins: number[] = [];
  const endMins: number[] = [];
  byDay.forEach((es) => {
    let firstStart = Infinity;
    let lastEnd = -Infinity;
    for (const e of es) {
      if (isAbsenceEntry(e)) continue;
      const s = timeToMin(e.start_time);
      const en = timeToMin(e.end_time);
      if (s < firstStart) firstStart = s;
      if (en > lastEnd) lastEnd = en;
    }
    if (firstStart !== Infinity) startMins.push(firstStart);
    if (lastEnd !== -Infinity) endMins.push(lastEnd);
  });
  const startSpread = stdDev(startMins);
  const endSpread = stdDev(endMins);

  let rhythm: RhythmConsistency['rhythm'];
  if (startSpread < 45 && endSpread < 60) rhythm = 'fix';
  else if (startSpread < 90 && endSpread < 120) rhythm = 'rhythmisch';
  else rhythm = 'gleitend';

  let weekCV: number | null = null;
  if (weeks.length >= 2) {
    const vals = weeks.map((w) => w.wallclockMs);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    if (mean > 0) weekCV = stdDev(vals) / mean;
  }

  return {
    startSpreadMin: startSpread,
    endSpreadMin: endSpread,
    rhythm,
    weekConsistencyCV: weekCV,
  };
}

/**
 * Slot-Längen-Histogramm + Tiefen-Fokus-Quote. Bins entsprechen den
 * üblichen Arbeits-Phasen (Mini-Antwort, Normal-Slot, Vertiefung, Fokus-
 * Block, Tiefenarbeit). deepFocusPct ist eine Zeit-Quote, keine Count-
 * Quote — sonst würde viel-aber-kurz dasselbe Signal geben wie wenig-
 * aber-tief.
 */
function buildSlotLengthHistogram(entries: TimeEntry[]): SlotLengthHistogram {
  const MICRO = 15 * 60_000;
  const SHORT = 60 * 60_000;
  const MEDIUM = 120 * 60_000;
  const LONG = 240 * 60_000;
  let micro = 0;
  let short = 0;
  let medium = 0;
  let long = 0;
  let deep = 0;
  let total = 0;
  let deepFocusMs = 0;
  let totalMs = 0;
  for (const e of entries) {
    if (isAbsenceEntry(e)) continue;
    const ms = e.duration_ms || 0;
    if (ms <= 0) continue;
    total += 1;
    totalMs += ms;
    if (ms < MICRO) micro += 1;
    else if (ms < SHORT) short += 1;
    else if (ms < MEDIUM) medium += 1;
    else if (ms < LONG) {
      long += 1;
      deepFocusMs += ms;
    } else {
      deep += 1;
      deepFocusMs += ms;
    }
  }
  return {
    microCount: micro,
    shortCount: short,
    mediumCount: medium,
    longCount: long,
    deepCount: deep,
    totalCount: total,
    deepFocusPct: totalMs > 0 ? (deepFocusMs / totalMs) * 100 : 0,
  };
}

/**
 * Erfassungs-Disziplin. notizMedianChars wird ausschließlich über die
 * NICHT-leeren Notizen berechnet, damit der Median nicht von der
 * Notiz-Coverage verdeckt wird.
 *
 * editedPct: ein Eintrag gilt als „nachträglich angepasst", wenn
 * updated_at mindestens 30 s nach created_at liegt. Anlage und sofortige
 * Korrektur fällt damit nicht ins Gewicht.
 */
function buildErfassungsDisziplin(entries: TimeEntry[]): ErfassungsDisziplin {
  if (entries.length === 0) {
    return { notizCoverage: 0, notizMedianChars: 0, editedPct: 0 };
  }
  const notizLengths: number[] = [];
  let withNotiz = 0;
  let edited = 0;
  for (const e of entries) {
    if (isAbsenceEntry(e)) continue;
    const n = (e.notiz || '').trim();
    if (n.length > 0) {
      withNotiz += 1;
      notizLengths.push(n.length);
    }
    if (e.created_at && e.updated_at) {
      const c = new Date(e.created_at).getTime();
      const u = new Date(e.updated_at).getTime();
      if (Number.isFinite(c) && Number.isFinite(u) && u - c > 30_000) {
        edited += 1;
      }
    }
  }
  notizLengths.sort((a, b) => a - b);
  const median =
    notizLengths.length === 0
      ? 0
      : notizLengths[Math.floor(notizLengths.length / 2)];
  const nonAbsenceCount = entries.filter((e) => !isAbsenceEntry(e)).length;
  return {
    notizCoverage:
      nonAbsenceCount > 0 ? (withNotiz / nonAbsenceCount) * 100 : 0,
    notizMedianChars: median,
    editedPct:
      nonAbsenceCount > 0 ? (edited / nonAbsenceCount) * 100 : 0,
  };
}

/**
 * Burst-Erkennung pro Tag: aufeinanderfolgende Slots ohne Pause > 15 min
 * werden zu einer Kette aggregiert. Die längste Kette und die Anzahl der
 * Ketten > 180 min werden zurückgeliefert.
 *
 * Funktioniert sortiert nach start_time. Über-Mitternacht-Spillover bleibt
 * unberücksichtigt — der Helper sieht jeden Tag isoliert.
 */
function buildBurstPattern(byDay: Map<string, TimeEntry[]>): BurstPattern {
  const PAUSE_THRESHOLD_MIN = 15;
  const LONG_BURST_MIN = 180;
  let maxBurst = 0;
  let maxBurstDate: string | null = null;
  let longBurstCount = 0;

  byDay.forEach((es, date) => {
    const slots = es
      .filter((e) => !isAbsenceEntry(e) && e.start_time && e.end_time)
      .map((e) => ({
        s: timeToMin(e.start_time),
        en: Math.max(timeToMin(e.end_time), timeToMin(e.start_time)),
      }))
      .sort((a, b) => a.s - b.s);
    if (slots.length === 0) return;

    let curStart = slots[0].s;
    let curEnd = slots[0].en;
    const closeAndCheck = () => {
      const burstLen = curEnd - curStart;
      if (burstLen > maxBurst) {
        maxBurst = burstLen;
        maxBurstDate = date;
      }
      if (burstLen >= LONG_BURST_MIN) longBurstCount += 1;
    };

    for (let i = 1; i < slots.length; i++) {
      const gap = slots[i].s - curEnd;
      if (gap <= PAUSE_THRESHOLD_MIN) {
        curEnd = Math.max(curEnd, slots[i].en);
      } else {
        closeAndCheck();
        curStart = slots[i].s;
        curEnd = slots[i].en;
      }
    }
    closeAndCheck();
  });

  return {
    longestBurstMin: maxBurst,
    longestBurstDate: maxBurstDate,
    longBurstCount,
  };
}

/**
 * Projekt-Lebenszyklus. Projekte, die NUR in der zweiten Hälfte mit ≥ 1 h
 * vorkommen, gelten als „neu im Range". Analog für „ausgelaufen".
 */
function buildProjektLifecycle(
  firstEntries: TimeEntry[],
  secondEntries: TimeEntry[]
): ProjektLifecycle {
  const MIN_MS = 60 * 60_000;
  const firstProj = buildBreakdown(firstEntries, 'projekt');
  const secondProj = buildBreakdown(secondEntries, 'projekt');
  const firstSet = new Set(firstProj.map((r) => r.name));
  const secondSet = new Set(secondProj.map((r) => r.name));
  const newcomers = secondProj.filter(
    (r) => !firstSet.has(r.name) && r.ms >= MIN_MS && r.name !== '—'
  );
  const vanished = firstProj.filter(
    (r) => !secondSet.has(r.name) && r.ms >= MIN_MS && r.name !== '—'
  );
  return { newcomers, vanished };
}

/**
 * Multi-Stakeholder-Quote. Zählt Einträge mit ≥ 2 Stakeholdern in der
 * stakeholder[]-Liste.
 */
function buildMultiTaskingProfile(entries: TimeEntry[]): MultiTaskingProfile {
  let multi = 0;
  let total = 0;
  for (const e of entries) {
    if (isAbsenceEntry(e)) continue;
    total += 1;
    const list = Array.isArray(e.stakeholder)
      ? e.stakeholder
      : e.stakeholder
        ? [e.stakeholder]
        : [];
    if (list.length >= 2) multi += 1;
  }
  return {
    multiStakeholderPct: total > 0 ? (multi / total) * 100 : 0,
  };
}

/* ─────────────────────────────────────────────────────────────────────
   Welle 5a — Change-Point-Detection auf wöchentlichen Zeitreihen
   ───────────────────────────────────────────────────────────────────── */

/** Median einer Zahlen-Liste. Liefert 0 bei leerer Liste. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Median Absolute Deviation. Robuster als StdDev gegen Ausreißer. */
function mad(values: number[]): number {
  if (values.length === 0) return 0;
  const m = median(values);
  return median(values.map((v) => Math.abs(v - m)));
}

/**
 * Selektor für eine Wochen-Metrik. Liefert null, wenn die Woche für
 * diese Metrik nicht zählt (z.B. weil zu wenig aktive Tage).
 */
interface CPMetricSpec {
  metric: ChangePointMetric;
  getValue: (w: ReportData['weeks'][number]) => number;
  /** Relevanz-Schwelle: |current - baseline| muss mindestens so groß sein. */
  minDelta: number;
}

const CP_METRIC_SPECS: CPMetricSpec[] = [
  {
    metric: 'wallclock',
    getValue: (w) => w.wallclockMs / 3_600_000, // in Stunden
    minDelta: 4, // mind. 4h Unterschied zur Baseline
  },
  {
    metric: 'meeting',
    getValue: (w) => w.meetingShare * 100, // in Prozentpunkten
    minDelta: 10,
  },
  {
    metric: 'deepFocus',
    getValue: (w) => w.deepFocusShare * 100,
    minDelta: 10,
  },
  {
    metric: 'multiTasking',
    getValue: (w) => w.multiTaskingFactor,
    minDelta: 0.3,
  },
  {
    metric: 'topStakeholder',
    getValue: (w) => w.topStakeholderShare * 100,
    minDelta: 15,
  },
  {
    metric: 'coverage',
    getValue: (w) => w.coverage * 100,
    minDelta: 15,
  },
];

/**
 * Detektiert pro Metrik den schwerwiegendsten Wochen-Bruch.
 * Hybrid-Strategie: Z-Score (MAD-basiert) bei >= 6 verwertbaren Wochen,
 * %-Schwelle bei 3-5, gar keine Detection bei < 3.
 *
 * "Verwertbar" = activeDays >= 2 (sonst zu wenig Beobachtung).
 */
function buildChangePoints(weeks: ReportData['weeks']): ChangePoint[] {
  const useable = weeks.filter((w) => w.activeDays >= 2);
  if (useable.length < 3) return [];

  const mode: 'zscore' | 'percent' =
    useable.length >= 6 ? 'zscore' : 'percent';

  const result: ChangePoint[] = [];

  for (const spec of CP_METRIC_SPECS) {
    const values = useable.map(spec.getValue);

    let best: {
      idx: number;
      delta: number;
      zScore: number;
      pctDelta: number;
    } | null = null;

    if (mode === 'zscore') {
      // Detektor läuft auf Positionen [2 .. len-2], damit baseline
      // und Tail jeweils mindestens 2 Wochen umfassen.
      for (let i = 2; i < values.length - 1; i++) {
        const baseline = values.slice(0, i);
        const med = median(baseline);
        const m = mad(baseline);
        // MAD von 0 (alle Baseline-Werte identisch) → keine Streuung →
        // Z-Score unendlich. Fallback: prozentual rechnen.
        if (m === 0) {
          const delta = values[i] - med;
          const pct = med !== 0 ? Math.abs(delta / med) : 1;
          if (Math.abs(delta) >= spec.minDelta && pct >= 0.3) {
            if (!best || Math.abs(delta) > Math.abs(best.delta)) {
              best = { idx: i, delta, zScore: NaN, pctDelta: pct };
            }
          }
          continue;
        }
        // 1.4826 = Konsistenz-Faktor MAD→σ unter Normalverteilung
        const z = (values[i] - med) / (1.4826 * m);
        const delta = values[i] - med;
        if (Math.abs(z) >= 2.5 && Math.abs(delta) >= spec.minDelta) {
          if (!best || Math.abs(z) > Math.abs(best.zScore)) {
            best = { idx: i, delta, zScore: z, pctDelta: NaN };
          }
        }
      }
    } else {
      // %-Schwellen-Modus für kürzere Reihen
      for (let i = 1; i < values.length; i++) {
        const baseline = values.slice(0, i);
        const med = median(baseline);
        const delta = values[i] - med;
        const pct = med !== 0 ? Math.abs(delta / med) : delta !== 0 ? 1 : 0;
        if (pct >= 0.3 && Math.abs(delta) >= spec.minDelta) {
          if (!best || Math.abs(delta) > Math.abs(best.delta)) {
            best = { idx: i, delta, zScore: NaN, pctDelta: pct };
          }
        }
      }
    }

    if (best) {
      const baselineSlice = values.slice(0, best.idx);
      const breakWeek = useable[best.idx];
      const nextWeek = useable[best.idx + 1]; // kann undefined sein
      const nextWeekValue = nextWeek ? spec.getValue(nextWeek) : null;

      result.push({
        metric: spec.metric,
        weekLabel: breakWeek.label,
        baselineValue: median(baselineSlice),
        currentValue: values[best.idx],
        deltaAbsolute: best.delta,
        deltaSign: best.delta >= 0 ? 'up' : 'down',
        mode,
        zScore: best.zScore,
        pctDelta: best.pctDelta,
        baselineWeekCount: baselineSlice.length,
        context: {
          // Wird im 2. Pass gefüllt — initial leer.
          coOccurringMetrics: [],
          nextWeekValue,
          persistence: 'unklar',
          weekSnapshot: {
            topStakeholderName: breakWeek.topStakeholderName,
            topStakeholderShare: breakWeek.topStakeholderShare,
            meetingShare: breakWeek.meetingShare,
            deepFocusShare: breakWeek.deepFocusShare,
            multiTaskingFactor: breakWeek.multiTaskingFactor,
            wallclockHours: breakWeek.wallclockMs / 3_600_000,
            coverage: breakWeek.coverage,
          },
        },
      });
    }
  }

  // 2. Pass — Persistenz pro Change-Point. Vergleicht Folgewoche mit
  // Baseline und Bruch-Wert: wenn die Folgewoche näher am Bruch liegt,
  // hält der Bruch an; liegt sie näher an der Baseline, war's einmalig.
  for (const cp of result) {
    const nv = cp.context.nextWeekValue;
    if (nv === null) {
      cp.context.persistence = 'unklar';
      continue;
    }
    const distToBaseline = Math.abs(nv - cp.baselineValue);
    const distToBreak = Math.abs(nv - cp.currentValue);
    if (distToBaseline < distToBreak * 0.7) {
      cp.context.persistence = 'einmalig';
    } else if (distToBreak < distToBaseline * 0.7) {
      cp.context.persistence = 'haelt-an';
    } else {
      cp.context.persistence = 'unklar';
    }
  }

  // 3. Pass — Co-Occurrence. Für jeden Change-Point: welche anderen
  // Change-Points fielen in dieselbe Woche? Indikator für eine
  // 'kollabierende Woche', in der mehrere Metriken gleichzeitig kippen.
  const byWeek = new Map<string, ChangePoint[]>();
  for (const cp of result) {
    const list = byWeek.get(cp.weekLabel) || [];
    list.push(cp);
    byWeek.set(cp.weekLabel, list);
  }
  for (const cp of result) {
    const sameWeek = byWeek.get(cp.weekLabel) || [];
    cp.context.coOccurringMetrics = sameWeek
      .filter((other) => other.metric !== cp.metric)
      .map((other) => ({ metric: other.metric, deltaSign: other.deltaSign }));
  }

  // Sortierung: stärkster Bruch zuerst. Bei Z-Score-Modus über |zScore|,
  // bei Percent-Modus über |deltaAbsolute / minDelta| (normalisiert).
  const specByMetric = new Map(CP_METRIC_SPECS.map((s) => [s.metric, s]));
  result.sort((a, b) => {
    if (a.mode === 'zscore' && b.mode === 'zscore') {
      return Math.abs(b.zScore) - Math.abs(a.zScore);
    }
    const aSpec = specByMetric.get(a.metric)!;
    const bSpec = specByMetric.get(b.metric)!;
    return (
      Math.abs(b.deltaAbsolute) / bSpec.minDelta -
      Math.abs(a.deltaAbsolute) / aSpec.minDelta
    );
  });

  return result;
}

/* ─────────────────────────────────────────────────────────────────────
   Welle 5b — UserBaseline (personalisierte Statistik)
   ───────────────────────────────────────────────────────────────────── */

/** P-Perzentil mit linearer Interpolation (zwischen den Stützstellen). */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const frac = rank - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
}

/**
 * Baut die personalisierte Baseline aus dem aktuellen Range. Liefert
 * eine Struktur, die in den Findings als Vergleichsmaßstab dient.
 */
function buildUserBaseline(
  dayWallMsMap: Map<string, number>,
  dayPresMsMap: Map<string, number>,
  dayNaiveMsMap: Map<string, number>,
  entries: TimeEntry[]
): UserBaseline {
  // Pro-Tag-Statistik aus den Map-Werten
  const dayWallValues: number[] = [];
  dayWallMsMap.forEach((v) => {
    if (v > 0) dayWallValues.push(v);
  });
  const dayPresValues: number[] = [];
  dayPresMsMap.forEach((v) => {
    if (v > 0) dayPresValues.push(v);
  });

  // Pro-Tag-MT-Faktor (Naive/Wallclock je Tag). Nur Tage mit
  // wallMs > 0 fließen ein.
  const dayMtValues: number[] = [];
  dayWallMsMap.forEach((wallMs, d) => {
    if (wallMs <= 0) return;
    const naive = dayNaiveMsMap.get(d) || 0;
    dayMtValues.push(naive / wallMs);
  });

  // Slot-Längen aus allen Einträgen
  const slotLengthValues: number[] = entries
    .map((e) => e.duration_ms || 0)
    .filter((v) => v > 0);

  const observations = dayWallValues.length;
  const isReliable = observations >= 10;

  return {
    observations,
    isReliable,
    dayWallclockMs: {
      median: median(dayWallValues),
      mad: mad(dayWallValues),
      p90: percentile(dayWallValues, 90),
    },
    dayPresenceMs: {
      median: median(dayPresValues),
      mad: mad(dayPresValues),
      p90: percentile(dayPresValues, 90),
    },
    slotLengthMs: {
      median: median(slotLengthValues),
      p90: percentile(slotLengthValues, 90),
    },
    multiTaskingFactor: {
      median: median(dayMtValues),
    },
  };
}

/**
 * Welle 5a Kontext-Pass — generiert pro Change-Point vier optionale
 * Kontext-Sätze in einfacher Sprache. Wird sowohl von der Findings-
 * Emission als auch vom Renderer (Kartendarstellung) konsumiert.
 *
 * Liefert nur Sätze, die wirklich Mehrwert bringen — bei „unklarer"
 * Persistenz und ohne Co-Occurrence bleibt z.B. `cooccurrence` leer.
 */
export interface ChangePointNarrative {
  /** „Gleichzeitig kippte auch X und Y" — leerer String, wenn der Bruch alleinsteht. */
  cooccurrence: string;
  /** „Hält an" / „einmalig" — leer wenn unklar oder Folgewoche fehlt. */
  persistence: string;
  /** Konkreter Snapshot der Bruch-Woche (was dominierte sie). */
  snapshot: string;
  /** Konkreter Handlungs-Hinweis pro Metrik. */
  actionHint: string;
}

function metricLabelDe(m: ChangePointMetric): string {
  switch (m) {
    case 'wallclock':
      return 'die Arbeitsstunden';
    case 'meeting':
      return 'der Termin-Anteil';
    case 'deepFocus':
      return 'der Anteil konzentrierter Arbeit';
    case 'multiTasking':
      return 'die Parallel-Last';
    case 'topStakeholder':
      return 'der Anteil des Hauptmandanten';
    case 'coverage':
      return 'die Tracking-Genauigkeit';
  }
}

export function describeChangePointContext(
  cp: ChangePoint
): ChangePointNarrative {
  const ctx = cp.context;

  // ── Co-Occurrence: andere Metriken in derselben Woche ────────────
  let cooccurrence = '';
  if (ctx.coOccurringMetrics.length > 0) {
    const parts = ctx.coOccurringMetrics.map((co) => {
      const lbl = metricLabelDe(co.metric);
      const dir = co.deltaSign === 'up' ? 'stieg' : 'fiel';
      return `${lbl} ${dir}`;
    });
    if (parts.length === 1) {
      cooccurrence = `In derselben Woche bewegte sich ${parts[0]} ebenfalls deutlich — es war keine isolierte Verschiebung, sondern Teil eines größeren Bildes.`;
    } else {
      const last = parts.pop()!;
      cooccurrence = `In derselben Woche kippten gleichzeitig mehrere Dinge: ${parts.join(', ')} und ${last}. Das deutet auf eine Woche hin, in der sich die Arbeitsweise grundsätzlich verändert hat — nicht nur ein einzelner Ausschlag.`;
    }
  }

  // ── Persistenz: einmalig vs. hält an ─────────────────────────────
  let persistence = '';
  if (ctx.persistence === 'einmalig' && ctx.nextWeekValue !== null) {
    persistence = `Schon in der Folgewoche ist der Wert wieder Richtung Schnitt zurückgekehrt — das war eher ein Einzelmoment als ein dauerhafter Wechsel.`;
  } else if (ctx.persistence === 'haelt-an' && ctx.nextWeekValue !== null) {
    persistence = `Das Muster hält an: auch die Folgewoche bleibt nahe am Bruch-Niveau. Es ist also nicht ein einmaliger Ausschlag, sondern ein neuer Zustand — falls das so weitergeht, lohnt es sich, das Thema strategisch einzuordnen.`;
  }

  // ── Snapshot der Bruch-Woche — was dominierte sie? ───────────────
  const ws = ctx.weekSnapshot;
  const snapshotBits: string[] = [];
  if (ws.topStakeholderName && ws.topStakeholderName !== '—') {
    snapshotBits.push(
      `der größte Mandant war <b>${htmlEsc(ws.topStakeholderName)}</b> mit ${(ws.topStakeholderShare * 100).toFixed(0)}% der Wochenzeit`
    );
  }
  snapshotBits.push(`insgesamt ${ws.wallclockHours.toFixed(1)}h Arbeitszeit`);
  if (ws.meetingShare >= 0.25) {
    snapshotBits.push(
      `${(ws.meetingShare * 100).toFixed(0)}% in Terminen/Calls`
    );
  }
  if (ws.deepFocusShare >= 0.25) {
    snapshotBits.push(
      `${(ws.deepFocusShare * 100).toFixed(0)}% in Blöcken über 2h`
    );
  }
  const snapshot =
    snapshotBits.length > 0
      ? `Zur Einordnung der Woche selbst: ${snapshotBits.join(', ')}.`
      : '';

  // ── Handlungs-Hinweis pro Metrik ─────────────────────────────────
  let actionHint = '';
  switch (cp.metric) {
    case 'wallclock':
      actionHint =
        cp.deltaSign === 'up'
          ? `Was du tun könntest: in den Einträgen dieser Woche nachschauen, ob die Mehrarbeit zu einem konkreten Ergebnis geführt hat — oder ob sie sich auf vieles Kleines verteilt hat, das einzeln nicht erinnerungswürdig war.`
          : `Was du tun könntest: prüfen, ob alles, was die Woche kosten sollte, tatsächlich passiert ist — falls geplant. Falls ungeplant: was hat dich weniger arbeiten lassen, war es Urlaub, weniger Anfragen, oder eine Pause aus Erschöpfung?`;
      break;
    case 'meeting':
      actionHint =
        cp.deltaSign === 'up'
          ? `Was du tun könntest: durch die Termine dieser Woche scrollen und für jeden die Frage stellen: lag am Ende ein konkretes Ergebnis vor (Entscheidung, Mail, Dokument)? Die ohne klares Ergebnis sind die ersten Kandidaten, beim nächsten Mal abzusagen oder durch eine Mail zu ersetzen.`
          : `Was du tun könntest: vergleichen, was in dieser termin-armen Woche an Output entstanden ist gegenüber einer durchschnittlichen Woche. Lässt sich das Muster (z.B. ein bewusster termin-freier Tag pro Woche) etablieren?`;
      break;
    case 'deepFocus':
      actionHint =
        cp.deltaSign === 'down'
          ? `Was du tun könntest: im Kalender der Folgewochen einen 3-4-Stunden-Block ohne Termine reservieren — auch wenn er „leer" aussieht. Das ist die einzige Stelle, an der konzentrierte Arbeit praktisch entstehen kann.`
          : `Was du tun könntest: festhalten, was diese Woche zusammenhängende Arbeit ermöglicht hat — leerer Kalender, bewusste Block-Planung, externer Schutz? Solche Bedingungen lassen sich teilweise reproduzieren.`;
      break;
    case 'multiTasking':
      actionHint =
        cp.deltaSign === 'up'
          ? `Was du tun könntest: an einem Tag dieser Woche stichprobenartig schauen, ob mehrere Tracker tatsächlich gleichzeitig liefen, weil mehrere Themen parallel besprochen wurden — oder ob ein Tracker vergessen wurde zu stoppen. Beides hat andere Hebel.`
          : `Was du tun könntest: nichts. Sequenzielle Arbeit ist meist gesünder als parallele — die Frage ist eher, ob sich das wiederholen lässt.`;
      break;
    case 'topStakeholder':
      actionHint =
        cp.deltaSign === 'up'
          ? `Was du tun könntest: Mandanten-Gespräch oder Mandanten-Akte aus dieser Woche anschauen — was hat den Sprung ausgelöst (Großauftrag, Eskalation, neuer Scope)? Daraus folgt die Frage: ist das jetzt der neue Anteil, oder nur diese eine Woche?`
          : `Was du tun könntest: schauen, welcher andere Mandant in dieser Woche den Platz übernommen hat. Bewusste Verschiebung — oder ist der bisherige Hauptmandant einfach in eine ruhigere Phase gerutscht?`;
      break;
    case 'coverage':
      actionHint =
        cp.deltaSign === 'down'
          ? `Was du tun könntest: eine fixe Uhrzeit am Tagesende für Nacherfassung etablieren (z.B. 17:30, 5 Minuten) — verhindert, dass das Tracking weiter wegbröckelt.`
          : `Was du tun könntest: festhalten, was den Anstoß für die bessere Disziplin gegeben hat — eine neue Routine, weniger hektische Woche, andere Aufgabenart? Damit lässt sich die Disziplin verteidigen.`;
      break;
  }

  return { cooccurrence, persistence, snapshot, actionHint };
}

/* ─────────────────────────────────────────────────────────────────────
   Welle 5c — Composite-Detektoren
   ───────────────────────────────────────────────────────────────────── */

/**
 * Liefert die Indices aller Findings, die zu einer der gegebenen
 * kind-Werte passen. Wird von den Composite-Detektoren benutzt, um
 * evidenceFindings zu sammeln.
 */
function findIndicesByKind(
  findings: Finding[],
  kinds: FindingKind[]
): number[] {
  const set = new Set(kinds);
  const result: number[] = [];
  findings.forEach((f, i) => {
    if (f.kind && set.has(f.kind)) result.push(i);
  });
  return result;
}

interface CompositeBuildInput {
  findings: Finding[];
  changePoints: ChangePoint[];
  stakeholders: BreakdownRow[];
  trend: ReportData['trend'];
  projektLifecycle: ProjektLifecycle;
  slotLength: SlotLengthHistogram;
}

/**
 * Baut die Composite-Findings aus den Einzel-Findings + Roh-Daten.
 * Vier hartkodierte Diagnosen, siehe docs/REPORT-PHASE-B-PLAN.md
 * Sektion C.
 */
function buildComposites(input: CompositeBuildInput): CompositeFinding[] {
  const composites: CompositeFinding[] = [];
  const f = input.findings;

  const mtIdx = findIndicesByKind(f, ['mt-high']);
  const meetingIdx = findIndicesByKind(f, [
    'meeting-heavy-stakeholder',
    'meetings-without-output',
  ]);
  const coverageOrBurstIdx = findIndicesByKind(f, [
    'coverage-thin',
    'longest-burst',
    'many-bursts',
  ]);
  const reactiveIdx = findIndicesByKind(f, ['reactive-stakeholder']);
  const burstIdx = findIndicesByKind(f, ['longest-burst', 'many-bursts']);
  const klumpenIdx = findIndicesByKind(f, ['klumpen-risiko']);
  const deepFocusFindingIdx = findIndicesByKind(f, ['low-deep-focus']);

  // ── operative-ueberlast ─────────────────────────────────────────
  // mt-high UND (meeting-heavy ODER meetings-without-output) UND
  // (coverage-thin ODER longest-burst ODER many-bursts).
  if (
    mtIdx.length > 0 &&
    meetingIdx.length > 0 &&
    coverageOrBurstIdx.length > 0
  ) {
    composites.push({
      id: 'operative-ueberlast',
      level: 'warn',
      diagnosis:
        'Das Bild ist operative Überlastung: viele Themen laufen parallel, die Termin-Dichte ist hoch, und die Datenqualität bzw. die Pausen-Disziplin leiden mit. Solche Wochen sind selten produktiv — sie kosten überproportional Energie für unterproportional viel Output.',
      hebel:
        'Welche der Termine dieser Periode endeten ohne klares Ergebnis (Entscheidung, Mail, Dokument)? Die sind die ersten Kandidaten zum Streichen — und Streichen ist meistens befreiender als Verschieben.',
      evidenceFindings: [
        ...mtIdx,
        ...meetingIdx,
        ...coverageOrBurstIdx,
      ],
      audiences: ['lead', 'chef'],
    });
  }

  // ── reaktive-phase ──────────────────────────────────────────────
  // reactive-stakeholder UND (longest-burst ODER many-bursts) UND
  // keine projekt-newcomers (also: viel Aktivität, aber keine neuen
  // Linien).
  if (
    reactiveIdx.length > 0 &&
    burstIdx.length > 0 &&
    input.projektLifecycle.newcomers.length === 0
  ) {
    composites.push({
      id: 'reaktive-phase',
      level: 'warn',
      diagnosis:
        'Hohe Aktivität, aber Aktivität ohne neue Linien: das ist ein reaktives Muster, nicht ein gestaltendes. Du arbeitest viel an dem, was reinkommt, aber nichts substanziell Neues hat in diesem Zeitraum den Boden berührt.',
      hebel:
        'Welcher Mandant löst am meisten Ad-hoc-Slots aus? Ein Sammel-Termin (feste Sprechzeit pro Woche, Mail-Triage am Tagesende) gibt typischerweise mehrere Stunden pro Woche zurück — Zeit, in der dann wirklich Neues angeschoben werden kann.',
      evidenceFindings: [...reactiveIdx, ...burstIdx],
      audiences: ['coach', 'lead'],
    });
  }

  // ── konzentrations-verlust ──────────────────────────────────────
  // klumpen-risiko (Top > 35%) UND topStakeholder-ChangePoint (down)
  // UND trend.decline enthält einen Top-Stakeholder mit >= 10pp Verlust.
  const topShDown = input.changePoints.find(
    (c) => c.metric === 'topStakeholder' && c.deltaSign === 'down'
  );
  const declineSubstantial = input.trend.decline.find(
    (t) => Math.abs(t.deltaPct) >= 10
  );
  if (klumpenIdx.length > 0 && topShDown && declineSubstantial) {
    const cpIdx = findIndicesByKind(f, ['change-point']);
    composites.push({
      id: 'konzentrations-verlust',
      level: 'warn',
      diagnosis: `Schwerpunkt auf einen Mandanten, aber dieser verliert in der Periode Boden. Konkret: ${input.stakeholders[0]?.name ? `<b>${htmlEsc(input.stakeholders[0].name)}</b> bindet noch ${input.stakeholders[0].pct.toFixed(0)}%` : 'der bisherige Hauptmandant bleibt nominell vorne'}, aber das Profil ist sichtbar im Umbau. Das ist nicht zwingend schlecht — aber es ist ein strategischer Moment.`,
      hebel:
        'Ist dieser Verlust strategisch gewollt (Skalierung anderer Mandate, bewusster Rückzug)? Oder ungeplant (Eskalation, Kundenfrust, ein Vertrag läuft aus)? Die Antwort darauf bestimmt, ob jetzt Vertriebs-Aktivität, ein Kunden-Gespräch oder ein Abschluss-Planning gefragt ist.',
      evidenceFindings: [...klumpenIdx, ...cpIdx],
      audiences: ['lead', 'chef', 'board'],
    });
  }

  // ── fokus-erosion ───────────────────────────────────────────────
  // deepFocus-ChangePoint (down) UND multiTasking-ChangePoint (up)
  // UND low-deep-focus-Finding (deepFocusPct < 20%).
  const deepFocusDown = input.changePoints.find(
    (c) => c.metric === 'deepFocus' && c.deltaSign === 'down'
  );
  const mtUp = input.changePoints.find(
    (c) => c.metric === 'multiTasking' && c.deltaSign === 'up'
  );
  if (
    deepFocusDown &&
    mtUp &&
    deepFocusFindingIdx.length > 0
  ) {
    const cpIdx = findIndicesByKind(f, ['change-point']);
    composites.push({
      id: 'fokus-erosion',
      level: 'warn',
      diagnosis:
        'Der Anteil konzentrierter Arbeit fällt synchron zu steigender Parallel-Last — das ist Fokus-Erosion, nicht nur ein punktuell schlechter Tag. Konzentrierte Phasen werden seltener UND gleichzeitig laufen mehr Themen gleichzeitig: zwei Anzeichen derselben Bewegung.',
      hebel:
        'Welchen Wochentag könntest du als nächstes für einen 4-Stunden-Block ohne Kalendertermine blocken? Einen Tag, der nicht „leer" ist, sondern reserviert für die Arbeit, die nur in Stille entsteht.',
      evidenceFindings: [...deepFocusFindingIdx, ...cpIdx],
      audiences: ['coach', 'chef'],
    });
  }

  return composites;
}

/* ─────────────────────────────────────────────────────────────────────
   Datenqualität
   ───────────────────────────────────────────────────────────────────── */

/**
 * Tippfehler-Detection für Tätigkeit. Wandert aus den Findings in die
 * dataQualityIssues — dort gehört es hin, weil es ein Disziplin-Issue
 * ist, kein Report-Befund. Wird vom Manage-Tab direkt aufgerufen.
 */
export function detectDataQualityIssues(entries: TimeEntry[]): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  const taetCount = new Map<string, number>();
  for (const e of entries) {
    const t = e.taetigkeit || '';
    if (!t) continue;
    taetCount.set(t, (taetCount.get(t) || 0) + 1);
  }
  const taetKeys = Array.from(taetCount.keys());
  for (let i = 0; i < taetKeys.length; i++) {
    for (let j = i + 1; j < taetKeys.length; j++) {
      const a = taetKeys[i];
      const b = taetKeys[j];
      if (
        a.trim().toLowerCase().replace(/\.$/, '') ===
        b.trim().toLowerCase().replace(/\.$/, '')
      ) {
        issues.push({
          type: 'duplicate-taetigkeit',
          message: `„${a}" (${taetCount.get(a)}x) und „${b}" (${taetCount.get(b)}x) sind dieselbe Tätigkeit mit unterschiedlicher Schreibweise.`,
          items: [a, b],
        });
      }
    }
  }
  return issues;
}

/* ─────────────────────────────────────────────────────────────────────
   Hauptfunktion
   ───────────────────────────────────────────────────────────────────── */

export function buildReportData(
  entries: TimeEntry[],
  opts: BuildOptions
): ReportData {
  const { scope, range, subjectName, members = [], lens = 'coach' } = opts;

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
  // Welle 5b — pro-Tag naive-Summe für UserBaseline (MT-Faktor je Tag).
  const dayNaiveMs = new Map<string, number>();
  byDay.forEach((es, d) => {
    const w = computeUnionMs(es);
    const presenceEntries = es.filter(
      (e) => !isMidnightSpillover(e, splitTails)
    );
    const p = computePresenceForDayMs(presenceEntries);
    const naiveSum = es.reduce((sum, e) => sum + (e.duration_ms || 0), 0);
    dayWallMs.set(d, w);
    dayPresMs.set(d, p);
    dayNaiveMs.set(d, naiveSum);
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

  // Welle 6 — Versickerungs-Modell. Tätigkeit „Nicht produktiv" wird
  // von der Person bewusst gesetzt, wenn ein Slot sich im Nachhinein
  // als verschwendet anfühlt. Der Anteil ist der Versickerungs-Index.
  const leakMs = taetBuckets.get('Nicht produktiv') || 0;
  const leakPct =
    totalNaiveMs > 0 ? (leakMs / totalNaiveMs) * 100 : 0;

  // Welle 6 — Reaktivitäts-Index. Jeder Slot wird über sein Projekt
  // einer Kategorie zugeordnet (gespeichert oder via Heuristik). Die
  // Reaktivitäts-Quote ist Wallclock-basiert, weil wir die echte Last
  // an Flowstoppern messen wollen, nicht die naive Summe (in der
  // parallele Tracker doppelt zählen).
  const projCatMap = opts.projectCategories ?? new Map();
  const categoryWallMs: Record<ProjectCategory | 'null', number> = {
    reaktiv: 0,
    planbar: 0,
    routine: 0,
    'fuehrung-admin': 0,
    abwesenheit: 0,
    null: 0,
  };
  let hasCrisisSlots = false;
  for (const e of nonAbsence) {
    if (!e.projekt) {
      categoryWallMs.null += e.duration_ms || 0;
      continue;
    }
    const cat = effectiveCategoryWithDefault(
      projCatMap.get(e.projekt) ?? null,
      e.projekt
    );
    categoryWallMs[cat] += e.duration_ms || 0;
    if (cat === 'reaktiv' && /kris/i.test(e.projekt)) {
      hasCrisisSlots = true;
    }
  }
  const reactiveMs = categoryWallMs.reaktiv;
  const plannableMs = categoryWallMs.planbar;
  const categoryDenomMs =
    categoryWallMs.reaktiv +
    categoryWallMs.planbar +
    categoryWallMs.routine +
    categoryWallMs['fuehrung-admin'];
  const reactivePct =
    categoryDenomMs > 0 ? (reactiveMs / categoryDenomMs) * 100 : 0;
  const plannablePct =
    categoryDenomMs > 0 ? (plannableMs / categoryDenomMs) * 100 : 0;

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

  // Wochen-Aggregat. Welle 5a erweitert: pro Woche werden zusätzlich
  // Entries gesammelt, damit wir meetingShare/deepFocusShare/MT-Faktor/
  // topStakeholderShare ableiten können.
  const weekMap = new Map<
    string,
    {
      wallMs: number;
      presMs: number;
      days: Set<string>;
      entries: TimeEntry[];
    }
  >();
  for (const [d, es] of byDay) {
    const wk = isoWeek(d);
    const existing = weekMap.get(wk);
    const cur: {
      wallMs: number;
      presMs: number;
      days: Set<string>;
      entries: TimeEntry[];
    } = existing
      ? existing
      : { wallMs: 0, presMs: 0, days: new Set<string>(), entries: [] };
    cur.wallMs += dayWallMs.get(d) || 0;
    cur.presMs += dayPresMs.get(d) || 0;
    cur.days.add(d);
    for (const e of es) cur.entries.push(e);
    weekMap.set(wk, cur);
  }
  const weeks = Array.from(weekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, v]) => {
      // Meeting-Anteil: Wallclock-anteilige Berechnung — wir summieren
      // duration_ms aller Meeting-Format-Einträge und teilen durch die
      // Wochen-Wallclock. Approximation (kein echtes "Meeting-Wallclock"),
      // aber konsistent mit dem bestehenden Format-Mix.
      let meetingDurMs = 0;
      let deepFocusDurMs = 0;
      let naiveDurMs = 0;
      const shMap = new Map<string, number>();
      for (const e of v.entries) {
        const d = e.duration_ms || 0;
        naiveDurMs += d;
        if (isMeetingFormat(e.format || '')) meetingDurMs += d;
        if (d >= 120 * 60_000) deepFocusDurMs += d;
        // Stakeholder-Verteilung (Multi-Stakeholder: voll auf jedem)
        const list = Array.isArray(e.stakeholder)
          ? e.stakeholder
          : e.stakeholder
            ? [e.stakeholder]
            : [];
        const targets = list.length === 0 ? ['—'] : list.map((s) => s || '—');
        for (const t of targets) shMap.set(t, (shMap.get(t) || 0) + d);
      }
      const shStakeholderTotal = Array.from(shMap.values()).reduce(
        (a, b) => a + b,
        0
      );
      let topShName = '—';
      let topShMs = 0;
      shMap.forEach((ms, name) => {
        if (ms > topShMs) {
          topShMs = ms;
          topShName = name;
        }
      });
      const wallMs = v.wallMs;
      return {
        label,
        activeDays: v.days.size,
        wallclockMs: wallMs,
        presenceMs: v.presMs,
        coverage: v.presMs > 0 ? wallMs / v.presMs : 1,
        meetingShare: wallMs > 0 ? meetingDurMs / wallMs : 0,
        deepFocusShare: wallMs > 0 ? deepFocusDurMs / wallMs : 0,
        multiTaskingFactor: wallMs > 0 ? naiveDurMs / wallMs : 1,
        topStakeholderShare:
          shStakeholderTotal > 0 ? topShMs / shStakeholderTotal : 0,
        topStakeholderName: topShName,
      };
    });

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

  // Konzentrations-Drift: vergleicht Top-1-Anteil und Portfolio-Breite
  // zwischen den beiden Halbzeiten. Null bei sehr kleinem Sample
  // (< 2 Tage pro Hälfte) — zu volatil für sinnvolle Aussagen.
  const drift: ConcentrationDrift | null =
    firstDates.size >= 2 && secondDates.size >= 2
      ? buildConcentrationDrift(
          firstEntries,
          secondEntries,
          dayWallMs,
          dayPresMs,
          firstDates,
          secondDates
        )
      : null;

  const absences = countAbsences(entries);

  // Detail-Profile pro Top-Stakeholder + Wochentag-Verteilung
  const stakeholderProfiles = buildStakeholderProfiles(
    nonAbsence,
    totalNaiveMs,
    breakdowns.stakeholders
  );

  // Phase-A-Datenpunkte: alle vor den Findings, damit die Findings sie
  // referenzieren können.
  const dayPart = buildDayPartProfile(nonAbsence);
  const rhythmCons = buildRhythmConsistency(byDay, weeks);
  const burst = buildBurstPattern(byDay);
  const rhythm = { dayPart, consistency: rhythmCons, burst };
  const slotLength = buildSlotLengthHistogram(nonAbsence);
  const disziplin = buildErfassungsDisziplin(nonAbsence);
  const multitasking = buildMultiTaskingProfile(nonAbsence);
  const projektLifecycle = buildProjektLifecycle(firstEntries, secondEntries);
  const dataQualityIssues = detectDataQualityIssues(entries);
  const weekday = buildWeekdayProfile(dayWallMs, dayPresMs);

  // Welle 5a — Change-Points auf der wöchentlichen Zeitreihe.
  const changePoints = buildChangePoints(weeks);

  // Welle 5b — UserBaseline für personalisierte Schwellen in Findings.
  const baseline = buildUserBaseline(
    dayWallMs,
    dayPresMs,
    dayNaiveMs,
    nonAbsence
  );

  // ─── Findings (zielgruppen-klassifiziert) ──────────────────────────
  // Jedes Finding bekommt audiences[] mit. Begründung pro Klassifikation
  // im Kommentar — die Heuristik: wer kann mit der Aussage etwas tun?
  // Coach = Selbst-Reflexion, Lead = 1:1-Steuerung, Chef = Linien-
  // Steuerung, Board = strategische Headlines. Tippfehler-Finding ist
  // raus aus dem Report (→ dataQualityIssues für den Manage-Tab).
  const findings: Finding[] = [];

  // Sehr lange Tage: personalisiert via UserBaseline. Schwelle ist
  // max(12h, baseline.dayWallclockMs.p90 * 1.3) — wenn baseline
  // unreliable, Fallback auf den alten festen 14h-Wert.
  const veryLongThresholdMs = baseline.isReliable
    ? Math.max(12 * 60 * 60_000, baseline.dayWallclockMs.p90 * 1.3)
    : 14 * 60 * 60_000;
  const veryLongDays: Array<{ date: string; ms: number }> = [];
  dayWallMs.forEach((ms, d) => {
    if (ms > veryLongThresholdMs) veryLongDays.push({ date: d, ms });
  });
  if (veryLongDays.length > 0) {
    veryLongDays.sort((a, b) => b.ms - a.ms);
    const examples = veryLongDays
      .slice(0, 3)
      .map((x) => `${x.date} (${fmtHours(x.ms)})`)
      .join(', ');
    const baselineSentence = baseline.isReliable
      ? ` Zur Einordnung: dein typischer Tag hat ${fmtHours(baseline.dayWallclockMs.median)} getrackte Arbeitszeit, deine längsten 10% liegen bei mindestens ${fmtHours(baseline.dayWallclockMs.p90)} — die obigen Tage sprengen auch diese Spitze.`
      : ` Mit weniger als 10 erfassten Tagen ist die persönliche Vergleichsbasis dünn — die Schwelle ist hier fix auf 14 Stunden gesetzt.`;
    findings.push({
      level: 'info',
      kind: 'very-long-day',
      audiences: ['coach', 'lead', 'chef'],
      htmlMessage: `<b>${veryLongDays.length} außergewöhnlich lange${veryLongDays.length === 1 ? 'r' : ''} Tag${veryLongDays.length === 1 ? '' : 'e'}</b> (${examples}). Konkret heißt das: an diesen Tagen wurde substanziell mehr Arbeit erfasst, als selbst deine längsten gewöhnlichen Tage haben. Häufige Ursache: mehrere Tage wurden in einem Rutsch nacherfasst — für sauberere Statistiken auf die echten Tage zurückverteilen.${baselineSentence}`,
    });
  }

  // Konzentrations-Risiko (Klumpen): Lead, Chef, Board.
  if (
    breakdowns.stakeholders.length > 0 &&
    breakdowns.stakeholders[0].pct > 35
  ) {
    const top = breakdowns.stakeholders[0];
    findings.push({
      level: 'info',
      kind: 'klumpen-risiko',
      audiences: ['lead', 'chef', 'board'],
      htmlMessage: `<b>Klumpen-Risiko bei ${htmlEsc(top.name)}:</b> ${top.pct.toFixed(0)}% der gesamten Arbeitszeit fließen in diesen einen Mandanten. Konkret heißt das: wenn dieser Auftrag wegfällt oder sich der Schwerpunkt verschiebt, ändert sich die Auslastung schlagartig — entweder bewusste Strategie (z.B. Großmandat) oder Hinweis, dass Diversifikation überfällig ist.`,
    });
  }

  // Parallel-Arbeit auffällig: personalisiert. Schwelle ist
  // max(1.4, baseline.median * 1.4) — relativ zur typischen
  // Parallelitäts-Stärke dieser Person.
  const mtThreshold = baseline.isReliable
    ? Math.max(1.4, baseline.multiTaskingFactor.median * 1.4)
    : 1.5;
  if (mtFactor > mtThreshold) {
    const baselineSentence = baseline.isReliable
      ? ` Zur Einordnung: dein typischer Tag hat Parallel-Faktor ${baseline.multiTaskingFactor.median.toFixed(2)} — der aktuelle Wert liegt deutlich darüber.`
      : ` Mit weniger als 10 erfassten Tagen ist die persönliche Vergleichsbasis dünn — die Schwelle ist hier fix auf 1.5 gesetzt.`;
    findings.push({
      level: 'info',
      kind: 'mt-high',
      audiences: ['lead', 'chef'],
      htmlMessage: `<b>Auffällig viel Parallel-Arbeit:</b> pro getrackter Arbeitsstunde fielen ${mtFactor.toFixed(2)}h Aufgaben an. Konkret heißt das: oft liefen mehrere Themen gleichzeitig im selben Slot (z.B. mehrere Stakeholder gleichzeitig zugewiesen). Entweder bewusste Mehr-Mandanten-Steuerung — oder vergessene Tracker, die nicht gestoppt wurden. Lohnt sich, ein paar Stichproben zu prüfen.${baselineSentence}`,
    });
  }

  // Nicht-Produktiv-Anteil hoch: Lead, Chef.
  const nonprodMs = taetBuckets.get('Nicht produktiv') || 0;
  const nonprodPct = totalNaiveMs > 0 ? (nonprodMs / totalNaiveMs) * 100 : 0;
  if (nonprodPct > 45) {
    findings.push({
      level: 'info',
      kind: 'nonprod-high',
      audiences: ['lead', 'chef'],
      htmlMessage: `<b>Knapp die Hälfte als „nicht produktiv" verbucht:</b> ${nonprodPct.toFixed(0)}% der Zeit. Konkret heißt das: Verwaltung, Abstimmung, Beziehungspflege, Wartezeit — Dinge, die nötig sind, aber kein direktes Ergebnis liefern. Welche der Top-Projekte in dieser Kategorie sind wirklich notwendig, welche könnten asynchron (per Mail / Tool) oder kürzer laufen?`,
    });
  }

  // Tracking-Coverage schwach: alle Brillen (Datenqualitäts-Disclaimer).
  if (daysThin >= 5) {
    findings.push({
      level: 'info',
      kind: 'coverage-thin',
      audiences: ['coach', 'lead', 'chef', 'board'],
      htmlMessage: `<b>${daysThin} Tage mit lückenhaftem Tracking</b> (unter 60% des Anwesenheitsfensters erfasst). Konkret heißt das: zwischen erstem und letztem Eintrag dieser Tage klaffen größere Lücken — die Detail-Verteilung (Mandant, Tätigkeit) ist an diesen Tagen weniger belastbar. Tendenzaussagen über den ganzen Zeitraum bleiben gültig.`,
    });
  }

  // ── Pro-Stakeholder-Auffälligkeiten ──────────────────────────────
  // Reaktiv-Muster: viele kleine Einträge deuten auf ad-hoc-Strom.
  for (const sp of stakeholderProfiles) {
    if (sp.microTaskPct >= 40 && sp.entriesCount >= 5) {
      findings.push({
        level: 'warn',
        kind: 'reactive-stakeholder',
        audiences: ['coach', 'lead'],
        htmlMessage: `<b>${htmlEsc(sp.name)} ist ein Ad-hoc-Mandant:</b> ${sp.microTaskPct.toFixed(0)}% der Einträge sind unter 15 Minuten lang (Schnitt ${fmtHours(sp.avgEntryMs)} pro Eintrag), bei ${sp.pct.toFixed(0)}% Gesamtanteil. Konkret heißt das: dieser Mandant löst viele kleine, kurze Aktionen aus, die deine Konzentration unterbrechen. Ein Sammel-Termin (z.B. feste Stunde am Tag, in der man die Anfragen bündelt) gibt typischerweise mehrere Stunden Tiefenarbeit pro Woche zurück.`,
      });
    }
  }

  // Auftrag-außerhalb-des-Mandats-Verdacht (früher "Out-of-Scope"): Lead.
  for (const sp of stakeholderProfiles) {
    if (sp.nonprodPct >= 40 && sp.ms >= 2 * 60 * 60_000) {
      findings.push({
        level: 'warn',
        kind: 'oos-stakeholder',
        audiences: ['lead'],
        htmlMessage: `<b>${htmlEsc(sp.name)}: viel Zeit außerhalb des eigentlichen Auftrags?</b> ${sp.nonprodPct.toFixed(0)}% der gebundenen Zeit (${fmtHours(sp.ms)}) ist als „nicht produktiv" verbucht — also Verwaltung, Abstimmung, Beziehungspflege. Konkret heißt das: bei diesem Mandanten gehst du nicht direkt am Ergebnis arbeiten, sondern an Drumherum. Bewusste Beziehungspflege bei einem strategischen Kunden, oder dehnt sich der Auftrag stillschweigend aus?`,
      });
    }
  }

  // Meeting-lastiger Mandant: Lead + Chef.
  for (const sp of stakeholderProfiles) {
    if (sp.meetingHeavyPct >= 50 && sp.ms >= 2 * 60 * 60_000) {
      findings.push({
        level: 'info',
        kind: 'meeting-heavy-stakeholder',
        audiences: ['lead', 'chef'],
        htmlMessage: `<b>${htmlEsc(sp.name)}: Mandant mit hohem Termin-Anteil.</b> ${sp.meetingHeavyPct.toFixed(0)}% der Zeit für diesen Mandanten lief in Meetings, Calls oder Workshops. Konkret heißt das: über die Hälfte der Arbeit findet in Live-Terminen statt, nicht in eigener stiller Arbeit. Welche dieser Termine wären als kurze Mail oder 1-Seiten-Notiz schneller erledigt?`,
      });
    }
  }

  // Meetings-ohne-Output-Verdacht: Lead + Chef.
  for (const sp of stakeholderProfiles) {
    if (
      sp.meetingHeavyPct >= 30 &&
      sp.meetingNonprodPct >= 50 &&
      sp.ms >= 2 * 60 * 60_000
    ) {
      findings.push({
        level: 'warn',
        kind: 'meetings-without-output',
        audiences: ['lead', 'chef'],
        htmlMessage: `<b>${htmlEsc(sp.name)}: viele Termine ohne klares Ergebnis.</b> ${sp.meetingHeavyPct.toFixed(0)}% Termin-Anteil, davon ${sp.meetingNonprodPct.toFixed(0)}% als „nicht produktiv" gebucht. Konkret heißt das: die Mehrzahl dieser Termine endet nicht mit einer konkreten Lieferung (Entscheidung, Dokument, Mail). Im 1:1 ansprechen: für jeden wiederkehrenden Termin eine Output-Frage stellen — was ist die Ergebnis-Erwartung, andernfalls Format-Wechsel oder Absage.`,
      });
    }
  }

  // Lückenhafte Dokumentation pro Mandant: Coach + Lead.
  for (const sp of stakeholderProfiles) {
    if (sp.notizPct <= 20 && sp.pct >= 15 && sp.entriesCount >= 8) {
      findings.push({
        level: 'info',
        kind: 'notes-gap-stakeholder',
        audiences: ['coach', 'lead'],
        htmlMessage: `<b>Lückenhafte Notizen bei ${htmlEsc(sp.name)}:</b> nur ${sp.notizPct.toFixed(0)}% der Einträge tragen einen Kommentar, bei ${sp.pct.toFixed(0)}% Gesamtanteil. Konkret heißt das: in ein paar Monaten oder beim Review wirst du nicht mehr wissen, was du in den Slots „${htmlEsc(sp.name)}" eigentlich gemacht hast. Eine ein-Wort-Notiz pro Eintrag reicht meist schon (z.B. „Telefon Müller", „Konzept v2").`,
      });
    }
  }

  // Belastungs-Spitzen: personalisiert. Statt fixer 10h-Schwelle:
  // baseline.dayPresenceMs.p90 (mindestens 8h absolut, damit das auch
  // bei Teilzeit-Personen sinnvoll bleibt). Fallback: 10h fest.
  const highLoadThresholdMs = baseline.isReliable
    ? Math.max(8 * 60 * 60_000, baseline.dayPresenceMs.p90)
    : 10 * 60 * 60_000;
  let personalizedHighLoadCount = 0;
  dayPresMs.forEach((ms) => {
    if (ms >= highLoadThresholdMs) personalizedHighLoadCount += 1;
  });
  const highLoadHoursLabel = `${Math.round(highLoadThresholdMs / 3_600_000)}`;
  if (personalizedHighLoadCount >= 3) {
    const baselineSentence = baseline.isReliable
      ? ` Zur Einordnung: das ist deine persönliche Schwelle — der typische Tag liegt bei ${fmtHours(baseline.dayPresenceMs.median)} Anwesenheit, die längsten 10% bei mindestens ${fmtHours(baseline.dayPresenceMs.p90)}.`
      : ` Mit weniger als 10 erfassten Tagen ist die persönliche Vergleichsbasis dünn — die Schwelle ist hier fix auf 10 Stunden gesetzt.`;
    findings.push({
      level: 'warn',
      kind: 'high-load-days',
      audiences: ['coach', 'lead', 'chef'],
      htmlMessage: `<b>${personalizedHighLoadCount} besonders lange Tage</b> mit mindestens ${highLoadHoursLabel} Stunden Anwesenheit. Konkret heißt das: zwischen erstem und letztem Eintrag dieser Tage lagen mindestens ${highLoadHoursLabel} Stunden — für diese Person überdurchschnittlich lang. Ein einzelner solcher Tag ist kein Drama; drei oder mehr deuten auf ein Belastungs-Muster, das einen Blick auf die Steuerung verdient: Deadline-Stau, Personal-Engpass, oder einfach Phase.${baselineSentence}`,
    });
  }

  // Wochenend-Arbeit: Coach + Lead.
  if (weekday.weekendMs > 0 && totalWallMs > 0) {
    const weekendShare = (weekday.weekendMs / totalWallMs) * 100;
    if (weekendShare >= 8) {
      findings.push({
        level: 'info',
        kind: 'weekend-share',
        audiences: ['coach', 'lead'],
        htmlMessage: `<b>${weekendShare.toFixed(0)}% der Arbeit am Wochenende</b> (${fmtHours(weekday.weekendMs)} Samstag/Sonntag). Konkret heißt das: ein knappes Zehntel der Stunden lag außerhalb der regulären Wochentage. Bewusst geplant (z.B. Großprojekt mit fixer Deadline), oder reichen die Wochentage strukturell nicht mehr aus?`,
      });
    }
  }

  // Wenig konzentrierte Arbeit: Coach + Chef.
  if (slotLength.totalCount >= 30 && slotLength.deepFocusPct < 20) {
    findings.push({
      level: 'info',
      kind: 'low-deep-focus',
      audiences: ['coach', 'chef'],
      htmlMessage: `<b>Stückwerk-Muster:</b> nur ${slotLength.deepFocusPct.toFixed(0)}% der Arbeitszeit lief in zusammenhängenden Blöcken über 2 Stunden. Konkret heißt das: der größte Teil des Tages bestand aus kurzen Stücken (Termine, kleine Aufgaben, Unterbrechungen). Wo könnte ein 4-Stunden-Block ohne Kalendertermine im Wochenplan stehen — auch wenn er „leer" aussieht?`,
    });
  }

  // Lange Arbeitsphasen ohne Pause: personalisiert. Schwelle (in
  // Minuten) ist max(180min, baseline.slot.p90 * 1.5 / 60_000) —
  // relativ zur typischen Slot-Länge der Person. Fallback: 240min.
  const burstThresholdMinPers = baseline.isReliable
    ? Math.max(180, (baseline.slotLengthMs.p90 * 1.5) / 60_000)
    : 240;
  if (rhythm.burst.longestBurstMin >= burstThresholdMinPers) {
    const baselineSentence = baseline.isReliable
      ? ` Zur Einordnung: deine typische Slot-Länge ist ${fmtHours(baseline.slotLengthMs.median)}, die längsten 10% deiner Slots gehen bis ${fmtHours(baseline.slotLengthMs.p90)} — die ${Math.round(rhythm.burst.longestBurstMin / 60)}h-Phase ist also auch für dich substanziell lang.`
      : ` Mit weniger als 10 erfassten Tagen ist die persönliche Vergleichsbasis dünn — die Schwelle ist hier fix auf 4 Stunden gesetzt.`;
    findings.push({
      level: 'info',
      kind: 'longest-burst',
      audiences: ['coach'],
      htmlMessage: `<b>Längste Arbeitsphase am Stück: ${Math.round(rhythm.burst.longestBurstMin / 60)}h ohne erfasste Pause</b> am ${htmlEsc(rhythm.burst.longestBurstDate ?? '')}. Konkret heißt das: an diesem Tag lief mindestens ein Stück über die für dich übliche Slot-Länge hinaus ohne sichtbare Unterbrechung. Vielleicht eine bewusste Tiefen-Phase — aber was hätte eine echte 15-Minuten-Pause dazwischen verändert (Klarheit, Energie für den Nachmittag)?${baselineSentence}`,
    });
  }
  if (rhythm.burst.longBurstCount >= 3) {
    findings.push({
      level: 'info',
      kind: 'many-bursts',
      audiences: ['lead'],
      htmlMessage: `<b>${rhythm.burst.longBurstCount} Arbeitsphasen über 3h ohne Pause</b> im Zeitraum. Konkret heißt das: das ist kein einmaliger Großprojekt-Moment, sondern ein wiederkehrendes Belastungs-Muster. Was bricht den Strom regelmäßig nicht auf — sind Pausen im Kalender, werden sie nur nicht eingehalten, oder gibt es strukturell keine Pufferzeiten?`,
    });
  }

  // Stark schwankende Wochen: Chef + Board.
  if (
    rhythm.consistency.weekConsistencyCV !== null &&
    rhythm.consistency.weekConsistencyCV >= 0.5
  ) {
    findings.push({
      level: 'info',
      kind: 'week-volatility',
      audiences: ['chef', 'board'],
      htmlMessage: `<b>Wochen mit stark schwankender Auslastung.</b> Konkret heißt das: die einzelnen Wochen im Zeitraum unterscheiden sich substantiell in den Arbeitsstunden — eine Woche mit 30h kann neben einer mit 55h stehen. Das ist nicht zwingend ein Problem (Saisonalität, Projekt-Phasen), aber wenn das Muster bleibt: ist die Planung dem nicht angepasst, oder reagieren die Ressourcen zu langsam auf das, was reinkommt?`,
    });
  }

  // Projekt-Bewegung (neu / ausgelaufen): Chef + Board.
  if (
    projektLifecycle.newcomers.length > 0 ||
    projektLifecycle.vanished.length > 0
  ) {
    const newNames = projektLifecycle.newcomers
      .slice(0, 3)
      .map((p) => `${htmlEsc(p.name)} (${fmtHours(p.ms)})`)
      .join(', ');
    const goneNames = projektLifecycle.vanished
      .slice(0, 3)
      .map((p) => `${htmlEsc(p.name)} (${fmtHours(p.ms)})`)
      .join(', ');
    const parts: string[] = [];
    if (newNames) parts.push(`neu in der zweiten Hälfte aufgetaucht: ${newNames}`);
    if (goneNames) parts.push(`in der zweiten Hälfte ausgelaufen: ${goneNames}`);
    findings.push({
      level: 'info',
      kind: 'project-movement',
      audiences: ['chef', 'board'],
      htmlMessage: `<b>Projekt-Bewegung im Zeitraum:</b> ${parts.join(' · ')}. Konkret heißt das: die Projekt-Liste am Ende der Periode unterscheidet sich substanziell von der am Anfang — neue Initiativen sind dazugekommen oder alte ausgelaufen. Gewollte Portfolio-Bewegung, oder zeigt sich hier, dass Projekte unkontrolliert starten/sterben?`,
    });
  }

  // Welle 5a — ChangePoint-Findings. Audiences-Mapping siehe Plan-Doku
  // docs/REPORT-PHASE-B-PLAN.md, Sektion A.
  // Klartext-Pass: jeder Hinweis bekommt eine knappe Beschreibung
  // ('was passiert ist') und einen 'konkret heißt das'-Zusatz mit der
  // praktischen Bedeutung. Keine Z-Score- oder Baseline-Begriffe im Text.
  for (const cp of changePoints) {
    const cpAudiences: ReportLens[] = ((): ReportLens[] => {
      switch (cp.metric) {
        case 'wallclock':
          return ['coach', 'lead', 'chef'];
        case 'meeting':
          return cp.deltaSign === 'up'
            ? ['coach', 'lead', 'chef']
            : ['lead', 'chef'];
        case 'multiTasking':
          return cp.deltaSign === 'up'
            ? ['coach', 'lead', 'chef']
            : ['lead'];
        case 'deepFocus':
          return cp.deltaSign === 'down'
            ? ['coach', 'chef']
            : ['coach'];
        case 'topStakeholder':
          return ['lead', 'chef', 'board'];
        case 'coverage':
          return cp.deltaSign === 'down'
            ? ['coach', 'lead']
            : ['coach'];
        default:
          return ['lead'];
      }
    })();

    // Pro Metrik: ein Headline-Satz (was passiert ist) + ein
    // Erklärsatz (konkret heißt das, was es bedeutet/wert sein könnte).
    let headline = '';
    let erklaerung = '';
    const wkLabel = htmlEsc(cp.weekLabel);
    const ago = `${cp.baselineWeekCount} Wochen davor`;

    switch (cp.metric) {
      case 'wallclock': {
        if (cp.deltaSign === 'up') {
          headline = `<b>${wkLabel} war eine besonders lange Woche:</b> ${cp.currentValue.toFixed(1)}h gegenüber Schnitt ${cp.baselineValue.toFixed(1)}h in den ${ago}.`;
          erklaerung = `Konkret heißt das ${Math.abs(cp.deltaAbsolute).toFixed(1)}h mehr als sonst — was war anders? Deadline, Eskalation, oder wurde Nacharbeit aus früheren Wochen jetzt erfasst?`;
        } else {
          headline = `<b>${wkLabel} war eine besonders kurze Woche:</b> nur ${cp.currentValue.toFixed(1)}h gegenüber Schnitt ${cp.baselineValue.toFixed(1)}h in den ${ago}.`;
          erklaerung = `${Math.abs(cp.deltaAbsolute).toFixed(1)}h weniger als sonst — Urlaubstage, Krankheit, oder einfach eine ruhige Woche?`;
        }
        break;
      }
      case 'meeting': {
        if (cp.deltaSign === 'up') {
          headline = `<b>${wkLabel} war eine Termin-Woche:</b> ${cp.currentValue.toFixed(0)}% der Arbeitszeit in Meetings und Calls — vorher waren es im Schnitt ${cp.baselineValue.toFixed(0)}%.`;
          erklaerung = `Konkret heißt das deutlich weniger zusammenhängende Zeit für eigene Arbeit. Welche der Termine hätten als Mail oder kurzes 1-Pager funktioniert?`;
        } else {
          headline = `<b>${wkLabel} hatte ungewöhnlich wenig Termine:</b> ${cp.currentValue.toFixed(0)}% Anteil gegenüber Schnitt ${cp.baselineValue.toFixed(0)}%.`;
          erklaerung = `Mehr Raum für eigene Arbeit — entweder eine ruhige Woche im Kalender, oder du hast Termine bewusst rausgeworfen.`;
        }
        break;
      }
      case 'deepFocus': {
        if (cp.deltaSign === 'down') {
          headline = `<b>${wkLabel} war fragmentiert:</b> nur ${cp.currentValue.toFixed(0)}% der Zeit lief in Blöcken über zwei Stunden — vorher waren es ${cp.baselineValue.toFixed(0)}%.`;
          erklaerung = `Konkret heißt das: die Woche bestand aus vielen kurzen Stücken statt zusammenhängender Arbeit. Termine, Unterbrechungen oder Ad-hoc-Anfragen haben den Tag zerschnitten.`;
        } else {
          headline = `<b>${wkLabel} hatte eine ungewöhnliche Tiefe:</b> ${cp.currentValue.toFixed(0)}% in Blöcken über zwei Stunden — gegenüber Schnitt ${cp.baselineValue.toFixed(0)}%.`;
          erklaerung = `Mehr Zeit am Stück ohne Unterbrechung — eine Qualitäts-Woche. Was hat das ermöglicht, lässt sich das wiederholen?`;
        }
        break;
      }
      case 'multiTasking': {
        if (cp.deltaSign === 'up') {
          headline = `<b>${wkLabel} war besonders parallel:</b> du hast pro getrackter Arbeitsstunde ${cp.currentValue.toFixed(2)}h Aufgaben gezählt — Schnitt sonst ${cp.baselineValue.toFixed(2)}h.`;
          erklaerung = `Konkret heißt das: mehrere Themen liefen gleichzeitig (z.B. mehrere Stakeholder im selben Slot). Bewusste Mehr-Mandanten-Steuerung oder Zerstreuung?`;
        } else {
          headline = `<b>${wkLabel} war seriell:</b> Parallel-Last ${cp.currentValue.toFixed(2)}h pro Arbeitsstunde, gegenüber Schnitt ${cp.baselineValue.toFixed(2)}h.`;
          erklaerung = `Du hast ein Ding nach dem anderen gemacht — weniger Parallel-Verarbeitung als sonst.`;
        }
        break;
      }
      case 'topStakeholder': {
        const wk = weeks.find((w) => w.label === cp.weekLabel);
        const name = wk?.topStakeholderName || 'Hauptmandant';
        if (cp.deltaSign === 'up') {
          headline = `<b>${wkLabel}: ${htmlEsc(name)} hat plötzlich viel Raum eingenommen</b> — ${cp.currentValue.toFixed(0)}% der Woche, gegenüber Schnitt ${cp.baselineValue.toFixed(0)}% in den ${ago}.`;
          erklaerung = `Konkret heißt das: ein einzelner Mandant hat in dieser Woche dominiert. Eskalation, Großauftrag, oder bewusst priorisiert?`;
        } else {
          headline = `<b>${wkLabel}: ${htmlEsc(name)} verliert Anteil</b> — ${cp.currentValue.toFixed(0)}% gegenüber Schnitt ${cp.baselineValue.toFixed(0)}%.`;
          erklaerung = `Der bisherige Hauptmandant rückt in den Hintergrund — Projekt abgeschlossen, oder andere Themen drängen rein?`;
        }
        break;
      }
      case 'coverage': {
        if (cp.deltaSign === 'down') {
          headline = `<b>${wkLabel}: Tracking-Genauigkeit eingebrochen</b> — Erfassungs-Coverage ${cp.currentValue.toFixed(0)}% gegenüber Schnitt ${cp.baselineValue.toFixed(0)}% in den ${ago}.`;
          erklaerung = `Konkret heißt das: zwischen dem ersten und letzten Eintrag eines Tages klaffen größere Lücken. Entweder eine sehr dichte Woche (wenig Zeit zum Tracken), oder die Disziplin ist hinten runtergefallen.`;
        } else {
          headline = `<b>${wkLabel}: Tracking-Genauigkeit verbessert</b> auf ${cp.currentValue.toFixed(0)}% (Schnitt ${cp.baselineValue.toFixed(0)}%).`;
          erklaerung = `Du erfasst lückenloser als sonst — gute Disziplin in einer wahrscheinlich gut planbaren Woche.`;
        }
        break;
      }
    }

    // Welle 5a Kontext-Pass — zusätzliche Sätze, die helfen, den Bruch
    // einzuordnen: was sonst noch in der Woche kippte, ob es einmalig
    // war oder anhält, Wochen-Snapshot, konkreter Handlungs-Hinweis.
    const narrative = describeChangePointContext(cp);
    const extraSentences: string[] = [];
    if (narrative.cooccurrence) extraSentences.push(narrative.cooccurrence);
    if (narrative.persistence) extraSentences.push(narrative.persistence);
    if (narrative.snapshot) extraSentences.push(narrative.snapshot);
    if (narrative.actionHint) extraSentences.push(narrative.actionHint);

    const fullMessage =
      `${headline} ${erklaerung}` +
      (extraSentences.length > 0
        ? `<br><br>${extraSentences.join(' ')}`
        : '');

    findings.push({
      level: 'info',
      kind: 'change-point',
      audiences: cpAudiences,
      htmlMessage: fullMessage,
    });
  }

  // OK-Fallback: nur wenn rein NICHTS auffällig war — alle Brillen.
  if (findings.length === 0) {
    findings.push({
      level: 'ok',
      htmlMessage:
        'Keine roten Flaggen — Verteilung plausibel, Datenqualität in Ordnung, Mix gesund.',
    });
  }

  // Welle 5c — Composite-Findings über den jetzt fertigen findings[].
  const composites = buildComposites({
    findings,
    changePoints,
    stakeholders: breakdowns.stakeholders,
    trend,
    projektLifecycle,
    slotLength,
  });

  // Title je nach Scope
  const titleByScope: Record<ReportScope, string> = {
    self: 'Mein Report',
    member: `Report – ${subjectName}`,
    team: `Team-Report – ${subjectName}`,
  };

  // Welle 4: Narrative wird vom brillenspezifischen Renderer komponiert,
  // nicht mehr hier. ReportData führt nur strukturierte Daten.

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
      leakMs,
      leakPct,
      reactiveMs,
      reactivePct,
      plannableMs,
      plannablePct,
      hasCrisisSlots,
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
    drift,
    rhythm,
    slotLength,
    disziplin,
    multitasking,
    projektLifecycle,
    changePoints,
    baseline,
    composites,
    lens,
    absences,
    findings,
    dataQualityIssues,
  };
  return data;
}

/**
 * Berechnet den Konzentrations-Drift zwischen erster und zweiter
 * Periodenhälfte: wie hat sich der Top-1-Anteil (Stakeholder + Projekt),
 * die Anzahl aktiver Stakeholder/Projekte und die Tracking-Coverage
 * verschoben?
 */
function buildConcentrationDrift(
  firstEntries: TimeEntry[],
  secondEntries: TimeEntry[],
  dayWallMs: Map<string, number>,
  dayPresMs: Map<string, number>,
  firstDates: Set<string>,
  secondDates: Set<string>
): ConcentrationDrift {
  const firstSh = buildBreakdown(firstEntries, 'stakeholder');
  const secondSh = buildBreakdown(secondEntries, 'stakeholder');
  const firstProj = buildBreakdown(firstEntries, 'projekt');
  const secondProj = buildBreakdown(secondEntries, 'projekt');

  const sumOver = (
    pool: Set<string>,
    map: Map<string, number>
  ): number => {
    let sum = 0;
    pool.forEach((d) => {
      sum += map.get(d) || 0;
    });
    return sum;
  };
  const firstWall = sumOver(firstDates, dayWallMs);
  const secondWall = sumOver(secondDates, dayWallMs);
  const firstPres = sumOver(firstDates, dayPresMs);
  const secondPres = sumOver(secondDates, dayPresMs);

  return {
    top1ShareFirst: firstSh[0]?.pct ?? 0,
    top1ShareSecond: secondSh[0]?.pct ?? 0,
    topShNameFirst: firstSh[0]?.name ?? '—',
    topShNameSecond: secondSh[0]?.name ?? '—',
    distinctShFirst: firstSh.filter((r) => r.pct >= 1).length,
    distinctShSecond: secondSh.filter((r) => r.pct >= 1).length,
    top1ProjShareFirst: firstProj[0]?.pct ?? 0,
    top1ProjShareSecond: secondProj[0]?.pct ?? 0,
    topProjNameFirst: firstProj[0]?.name ?? '—',
    topProjNameSecond: secondProj[0]?.name ?? '—',
    distinctProjFirst: firstProj.filter((r) => r.pct >= 1).length,
    distinctProjSecond: secondProj.filter((r) => r.pct >= 1).length,
    coverageFirst: firstPres > 0 ? firstWall / firstPres : 1,
    coverageSecond: secondPres > 0 ? secondWall / secondPres : 1,
  };
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
