/**
 * Wallclock-/Präsenz-/Naive-Berechnungen.
 *
 * Drei zentrale Begriffe (siehe ARCHITECTURE.md Sektion 1):
 *
 *   - **Naive Summe**: Σ aller Eintragsdauern. Multitasking zählt
 *     mehrfach. Für „wieviel wurde Stakeholder X zugeordnet".
 *   - **Wallclock-Union**: pro Tag die Vereinigung der Tracker-aktiven
 *     Intervalle. Überlappende Tasks werden kollabiert. Für „während
 *     wie vieler Stunden lief mindestens ein Timer".
 *   - **Präsenzzeit**: pro Tag das Brutto-Fenster (erster Eintrag-Start
 *     → letzter Eintrag-Ende). Lücken inkludiert. Für „wie lange war
 *     ich heute am Arbeiten".
 *
 * Coverage = Wallclock / Präsenz in % — Anteil der Tagesfenster der mit
 * Trackern abgedeckt ist.
 *
 * Ungleichungskette:
 *     Naive ≥ Wallclock ≤ Präsenz
 */

import { isAbsenceEntry, isOvertimeDate } from './absences';

interface EntryLike {
  date: string;
  start_time: string;
  end_time: string;
  duration_ms?: number;
  taetigkeit?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Helfer: HH:MM → Minuten-of-day. Behandelt overnight-wrap (end < start).
// ─────────────────────────────────────────────────────────────────────────

function toMin(time: string | undefined): number | null {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

// ─────────────────────────────────────────────────────────────────────────
// Mitternachts-Spillover — Erkennung von Einträgen, die durch das Split-
// ten eines Über-Mitternacht-Timers auf den Folgetag „getropft" sind.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Hilfsfunktion: vorheriger Kalendertag im YYYY-MM-DD-Format. Lokale TZ.
 * Rein deterministisch, ohne Date.parse-Quirks.
 */
function previousISODate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const prev = new Date(y, m - 1, d - 1);
  const py = prev.getFullYear();
  const pm = String(prev.getMonth() + 1).padStart(2, '0');
  const pd = String(prev.getDate()).padStart(2, '0');
  return `${py}-${pm}-${pd}`;
}

/**
 * Liefert die Menge aller Daten, deren Einträge ein '23:59'-Tail haben.
 * Genau das ist die Signatur, die `splitTimerSpanAtMidnight` an der
 * Tagesgrenze schreibt — also ein zuverlässiger Indikator dafür, dass am
 * Folgetag ein 00:00-Eintrag als Spillover beginnt.
 */
export function buildSplitTailDates(entries: EntryLike[]): Set<string> {
  const out = new Set<string>();
  for (const e of entries) {
    if (e.end_time === '23:59' && e.date) out.add(e.date);
  }
  return out;
}

/**
 * Hat dieser Eintrag eine Overnight-Wrap-Signatur — also start_time
 * nach end_time? Eindeutiger Marker für Legacy-Mitternachts-Einträge
 * aus der Zeit vor dem Splitter (ein normaler Eintrag hat das nie,
 * weil Form-Validation in ManualEntry/EditEntryModal end>start fordert).
 */
export function isOvernightWrap(entry: EntryLike): boolean {
  const s = toMin(entry.start_time);
  const en = toMin(entry.end_time);
  return s != null && en != null && en < s;
}

/**
 * Ist `entry` ein Mitternachts-Spillover? Zwei Pfade — beide werden
 * für die Präsenz-Berechnung wie der Vortag behandelt.
 *
 *   1. **Neuer Split** (post-Fix): start_time '00:00' UND der Vortag
 *      taucht in `splitTails` auf (= hat einen '23:59'-Tail).
 *
 *   2. **Legacy-Overnight** (pre-Fix): start_time > end_time. Vor dem
 *      Split-Fix wurde ein Über-Mitternacht-Timer als einzelner Eintrag
 *      mit date=Stop-Tag, start=23:37, end=00:09 gespeichert. Solche
 *      Einträge gehören semantisch zum Vortag.
 *
 * Falscher-Positiv-Fall (Nachtschicht, die genau 00:00 startet und
 * deren Vortag zufällig 23:59 endete) ist in der Praxis vernachlässigbar.
 */
export function isMidnightSpillover(
  entry: EntryLike,
  splitTails: Set<string>
): boolean {
  if (!entry.date || !entry.start_time || !entry.end_time) return false;

  // Pfad 1: neuer, sauberer Split.
  if (
    entry.start_time === '00:00' &&
    splitTails.has(previousISODate(entry.date))
  ) {
    return true;
  }

  // Pfad 2: Legacy-Daten mit overnight-wrap-Signatur.
  return isOvernightWrap(entry);
}

/**
 * Effektive Dauer in ms — bevorzugt das gespeicherte `duration_ms`,
 * fällt zurück auf Berechnung aus start/end falls nicht gesetzt.
 */
export function getEffectiveDurationMs(e: EntryLike): number {
  if (e.duration_ms && e.duration_ms > 0) return e.duration_ms;
  const s = toMin(e.start_time);
  let en = toMin(e.end_time);
  if (s == null || en == null) return 0;
  if (en < s) en += 24 * 60;
  return Math.max(0, (en - s) * 60_000);
}

// ─────────────────────────────────────────────────────────────────────────
// Naive Summe — Σ aller Eintragsdauern.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Σ der Eintragsdauern (Naive). Optional Absences ausfiltern, was die
 * üblichste Anwendung ist (KPI „Heute gearbeitet" soll keine Ferien-
 * Stunden enthalten).
 */
export function computeNaiveSumMs(
  entries: EntryLike[],
  options: { excludeAbsences?: boolean } = { excludeAbsences: true }
): number {
  const filtered = options.excludeAbsences
    ? entries.filter((e) => !isAbsenceEntry(e))
    : entries;
  return filtered.reduce((sum, e) => sum + getEffectiveDurationMs(e), 0);
}

// ─────────────────────────────────────────────────────────────────────────
// Wallclock-Union — Per-Day-Intervall-Vereinigung.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Wallclock-Union eines einzelnen Tages: kollabiert Überlappungen,
 * gibt netto-Zeit zurück in ms.
 */
export function computeUnionMs(
  dayEntries: Array<{ start_time: string; end_time: string }>
): number {
  if (!dayEntries.length) return 0;
  const intervals: [number, number][] = [];
  for (const e of dayEntries) {
    const s = toMin(e.start_time);
    let en = toMin(e.end_time);
    if (s == null || en == null) continue;
    if (en < s) en += 24 * 60; // overnight-wrap
    if (en > s) intervals.push([s, en]);
  }
  if (!intervals.length) return 0;
  intervals.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [[...intervals[0]] as [number, number]];
  for (let i = 1; i < intervals.length; i++) {
    const [s, e] = intervals[i];
    const last = merged[merged.length - 1];
    if (s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged.reduce((sum, [s, e]) => sum + (e - s), 0) * 60_000;
}

/**
 * Wallclock-Union über mehrere Tage. Pro Tag bucket'en, pro Bucket
 * unionieren, dann summieren. Optional Absences ausfiltern.
 */
export function computeWallClockMs(
  entries: EntryLike[],
  options: { excludeAbsences?: boolean } = { excludeAbsences: true }
): number {
  const filtered = options.excludeAbsences
    ? entries.filter((e) => !isAbsenceEntry(e))
    : entries;

  const byDate = new Map<string, EntryLike[]>();
  for (const e of filtered) {
    if (!e.date) continue;
    const list = byDate.get(e.date);
    if (list) list.push(e);
    else byDate.set(e.date, [e]);
  }

  let total = 0;
  byDate.forEach((dayEntries) => {
    total += computeUnionMs(dayEntries);
  });
  return total;
}

/**
 * Wallclock-Union INCLUDING aktiver Timer-Slots. Für die Live-Anzeige
 * im Timer-Tab — Slots werden als virtuelle [now − elapsed, now]
 * Intervalle eingerechnet, bevor unioniert wird. So bleibt der Wert
 * stabil beim Stop: das virtuelle Intervall wird durch einen echten
 * Eintrag mit identischen Boundaries ersetzt, die Union ändert sich
 * nicht.
 */
export function computeLiveWallClockMs(
  savedEntries: EntryLike[],
  runningSlots: Array<{ elapsedMs: number; isPaused?: boolean }>,
  now: Date = new Date()
): number {
  const todayISO = formatDateISO(now);
  const virtualEntries: EntryLike[] = [];
  const nowMin = now.getHours() * 60 + now.getMinutes();
  for (const s of runningSlots) {
    if (!s || s.isPaused || !s.elapsedMs || s.elapsedMs < 1000) continue;
    const startMin = nowMin - Math.floor(s.elapsedMs / 60_000);
    const fmt = (m: number) => {
      const mod = ((m % (24 * 60)) + 24 * 60) % (24 * 60);
      const h = Math.floor(mod / 60);
      const mm = mod % 60;
      return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    };
    const start_time = fmt(startMin);
    const end_time = fmt(nowMin);
    if (start_time === end_time) continue;
    virtualEntries.push({ date: todayISO, start_time, end_time });
  }
  return computeWallClockMs([...savedEntries, ...virtualEntries], {
    excludeAbsences: true,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Präsenzzeit — Brutto-Fenster pro Tag, abzüglich langer Tageslücken.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Welle 10.2 — Schwelle, ab der eine Lücke zwischen Tracker-Segmenten
 * als „echter Unterbruch" gilt und aus der Präsenz herausgerechnet
 * wird (kein Pausen-Anteil mehr). Wert: 120 Minuten = 2 Stunden.
 *
 * Hintergrund: ohne diese Korrektur landet ein Tag wie
 *   08:00–18:00 (regulär) + 22:00–23:00 (Abend-Catch-up)
 * mit 15 h Präsenz im Bericht, obwohl 4 h Feierabend dazwischen
 * lagen. 2 h ist die robuste Schwelle: länger als jede vernünftige
 * Mittagspause, kürzer als jede typische Abend-Pause vor späterer
 * Arbeit.
 */
const LONG_GAP_MIN = 120;

/**
 * Präsenzzeit eines einzelnen Tages: vom frühesten Eintrag-Start bis
 * zum spätesten Eintrag-Ende, ABZÜGLICH aller Lücken ≥ 2 h zwischen
 * Tracker-Segmenten (Welle 10.2). Kurze Lücken (Mittag, Kaffee)
 * bleiben drin und werden vom 45-min-Standard-Pausen-Abzug in der
 * Überstunden-Rechnung erfasst.
 */
export function computePresenceForDayMs(
  dayEntries: Array<{ start_time: string; end_time: string }>
): number {
  if (dayEntries.length === 0) return 0;
  // Intervalle in Minuten parsen
  const ivs: Array<[number, number]> = [];
  for (const e of dayEntries) {
    const s = toMin(e.start_time);
    let en = toMin(e.end_time);
    if (s == null || en == null) continue;
    if (en < s) en += 24 * 60;
    ivs.push([s, en]);
  }
  if (ivs.length === 0) return 0;
  // Chronologisch sortieren und überlappende Slots vereinigen — Lücken
  // existieren nur zwischen vereinigten Segmenten.
  ivs.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [[ivs[0][0], ivs[0][1]]];
  for (let i = 1; i < ivs.length; i++) {
    const [s, e] = ivs[i];
    const last = merged[merged.length - 1];
    if (s <= last[1]) {
      if (e > last[1]) last[1] = e;
    } else {
      merged.push([s, e]);
    }
  }
  // Brutto-Fenster und Summe der langen Lücken
  const raw = merged[merged.length - 1][1] - merged[0][0];
  let longGapSum = 0;
  for (let i = 1; i < merged.length; i++) {
    const gap = merged[i][0] - merged[i - 1][1];
    if (gap >= LONG_GAP_MIN) longGapSum += gap;
  }
  return Math.max(0, (raw - longGapSum) * 60_000);
}

/**
 * Präsenzzeit über mehrere Tage. Pro Tag bucket'en, jedes Bucket-
 * Brutto-Fenster summieren. Optional Absences ausfiltern (für „wie
 * lange war ich gearbeitet" sind Ferien irrelevant).
 *
 * Mitternachts-Spillover (00:00-Einträge nach einem 23:59-Tail des
 * Vortages) werden ausgefiltert — sie sind technisch Vortags-Arbeit
 * und sollen das Präsenz-Fenster des Folgetages nicht künstlich
 * vorverlegen.
 */
export function computePresenceMs(
  entries: EntryLike[],
  options: { excludeAbsences?: boolean } = { excludeAbsences: true }
): number {
  const filtered = options.excludeAbsences
    ? entries.filter((e) => !isAbsenceEntry(e))
    : entries;

  const splitTails = buildSplitTailDates(filtered);

  const byDate = new Map<string, EntryLike[]>();
  for (const e of filtered) {
    if (!e.date) continue;
    if (isMidnightSpillover(e, splitTails)) continue;
    const list = byDate.get(e.date);
    if (list) list.push(e);
    else byDate.set(e.date, [e]);
  }

  let total = 0;
  byDate.forEach((dayEntries) => {
    total += computePresenceForDayMs(dayEntries);
  });
  return total;
}

/**
 * Präsenzzeit für HEUTE inkl. laufender Timer-Slots. Slots erweitern
 * das `latest`-End, falls der jüngste Slot später läuft als der letzte
 * gespeicherte Eintrag endet.
 *
 * `previousDayHadSplitTail` aktiviert die Spillover-Erkennung: wenn
 * gestern ein '23:59'-Tail existiert, werden heute alle 00:00-Einträge
 * als Mitternachts-Spillover behandelt und nicht als Präsenz-Start
 * gewertet. Der Caller kennt seinen Daten-Pool und liefert das Flag —
 * das hält die Signatur stabil ohne Cross-Day-Lookup hier drin.
 */
export function computeLivePresenceMs(
  savedEntriesToday: EntryLike[],
  runningSlots: Array<{ elapsedMs: number; isPaused?: boolean }>,
  now: Date = new Date(),
  previousDayHadSplitTail: boolean = false
): number {
  let earliest: number | null = null;
  let latest: number | null = null;
  for (const e of savedEntriesToday) {
    if (isAbsenceEntry(e)) continue;
    // Spillover-Pfad 1: neuer Split — heute '00:00' + Vortag hatte Tail.
    if (previousDayHadSplitTail && e.start_time === '00:00') continue;
    // Spillover-Pfad 2: Legacy-Eintrag mit overnight-wrap-Signatur.
    if (isOvernightWrap(e)) continue;
    const s = toMin(e.start_time);
    const en = toMin(e.end_time);
    if (s == null || en == null) continue;
    if (earliest == null || s < earliest) earliest = s;
    if (latest == null || en > latest) latest = en;
  }

  // Running Slots erweitern das Brutto-Fenster:
  //   - earliest: now - elapsed (falls früher als alle Saved)
  //   - latest:   now (falls später als alle Saved)
  const nowMin = now.getHours() * 60 + now.getMinutes();
  for (const s of runningSlots) {
    if (!s || s.isPaused || !s.elapsedMs || s.elapsedMs < 1000) continue;
    const startMin = nowMin - Math.floor(s.elapsedMs / 60_000);
    if (earliest == null || startMin < earliest) earliest = startMin;
    if (latest == null || nowMin > latest) latest = nowMin;
  }

  if (earliest == null || latest == null) return 0;
  return Math.max(0, (latest - earliest) * 60_000);
}

// ─────────────────────────────────────────────────────────────────────────
// Tracking-Lücken — Tagesfenster minus Tracker-aktive Zeit.
// ─────────────────────────────────────────────────────────────────────────

export interface TrackingGap {
  start: string; // HH:MM
  end: string;   // HH:MM
  durationMs: number;
}

/**
 * Findet Lücken im Tracking eines Tages. Brutto-Fenster (frühester
 * Start → spätester End) wird gegen die unionisierten Tracker-
 * Intervalle aufgespannt, alles dazwischen ist eine Lücke.
 *
 * minGapMinutes filtert mini-Lücken (Default 5min) — ein 1-min-Schnipsel
 * zwischen zwei Tasks ist keine echte Tracking-Lücke, das ist Task-
 * Switching-Latenz.
 *
 * `gapMs` summiert NUR die gelisteten Lücken — d.h. die Anzeige
 * `N Lücken · Mmin insgesamt` ist intern konsistent (`Σ gaps[].duration ===
 * gapMs`). Nicht das echte Brutto-minus-Tracked, was sub-min-Lücken
 * inkludieren würde — Coverage % berechnet das aus trackedMs/bruttoMs
 * separat und korrekt.
 */
export function findTrackingGaps(
  entries: EntryLike[],
  options: { date: string; minGapMinutes?: number } = { date: '' }
): { gaps: TrackingGap[]; bruttoMs: number; trackedMs: number; gapMs: number } {
  const minGap = options.minGapMinutes ?? 5;
  const dayEntries = (
    options.date ? entries.filter((e) => e.date === options.date) : entries
  ).filter((e) => !isAbsenceEntry(e));

  if (!dayEntries.length) {
    return { gaps: [], bruttoMs: 0, trackedMs: 0, gapMs: 0 };
  }

  const intervals: [number, number][] = [];
  for (const e of dayEntries) {
    const s = toMin(e.start_time);
    let en = toMin(e.end_time);
    if (s == null || en == null) continue;
    if (en < s) en += 24 * 60;
    if (en > s) intervals.push([s, en]);
  }
  if (!intervals.length) {
    return { gaps: [], bruttoMs: 0, trackedMs: 0, gapMs: 0 };
  }
  intervals.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [[...intervals[0]] as [number, number]];
  for (let i = 1; i < intervals.length; i++) {
    const [s, e] = intervals[i];
    const last = merged[merged.length - 1];
    if (s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }

  const bruttoMin = merged[merged.length - 1][1] - merged[0][0];
  const trackedMin = merged.reduce((sum, [s, e]) => sum + (e - s), 0);

  const fmt = (m: number) => {
    const mod = m % (24 * 60);
    const h = Math.floor(mod / 60);
    const mm = mod % 60;
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  };

  const gaps: TrackingGap[] = [];
  let listedGapMin = 0;
  for (let i = 1; i < merged.length; i++) {
    const gapDuration = merged[i][0] - merged[i - 1][1];
    if (gapDuration < minGap) continue;
    gaps.push({
      start: fmt(merged[i - 1][1]),
      end: fmt(merged[i][0]),
      durationMs: gapDuration * 60_000,
    });
    listedGapMin += gapDuration;
  }
  // Größte Lücken nach oben — die sind die actionableste.
  gaps.sort((a, b) => b.durationMs - a.durationMs);

  return {
    gaps,
    bruttoMs: bruttoMin * 60_000,
    trackedMs: trackedMin * 60_000,
    gapMs: listedGapMin * 60_000,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Überzeit — Wallclock-Union der Wochenend-/Feiertags-Arbeit.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Überzeit: Wallclock-Union der Einträge an Wochenenden + Feiertagen,
 * Absences ausgeschlossen. Wallclock und nicht Naive, weil paralleles
 * Wochenend-Arbeiten keinen Doppel-Überzeit-Anspruch generiert.
 */
export function computeOvertimeWallClockMs(entries: EntryLike[]): number {
  const overtime = entries.filter(
    (e) => !isAbsenceEntry(e) && isOvertimeDate(e.date)
  );
  return computeWallClockMs(overtime);
}

// ─────────────────────────────────────────────────────────────────────────
// Date-Helper — re-export von utils.ts für lokalen Gebrauch
// ─────────────────────────────────────────────────────────────────────────

function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
