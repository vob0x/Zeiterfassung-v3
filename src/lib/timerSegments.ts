/**
 * timerSegments — splittet einen Timer-Span an Tagesgrenzen.
 *
 * Hintergrund: Wenn ein Timer kurz vor Mitternacht startet und nach
 * Mitternacht stoppt, würde ein einzelner Eintrag entweder dem Start-
 * oder dem Stop-Tag falsch zugeordnet (vorher: stets dem Stop-Tag → der
 * Start-Tag bekam eine Lücke). Lösung: pro Kalendertag ein Eintrag mit
 * den korrekten Start-/End-Zeiten dieses Tages und der jeweiligen
 * Teil-Dauer.
 *
 * Same-Day-Spans liefern genau ein Segment. Über-Mitternacht-Spans
 * liefern n+1 Segmente (n = Anzahl überschrittener Tagesgrenzen);
 * Mittagssegmente sind voll 00:00–23:59.
 *
 * Konvention für die End-Zeit an einer Tagesgrenze: '23:59' (statt
 * '24:00'), weil HTML-`<input type="time">` nur 00:00–23:59 akzeptiert
 * und EditEntryModal sonst leere Felder zeigen würde. Die Eintrags-
 * Dauer wird in `duration_ms` als echte Millisekunden-Differenz
 * gespeichert — die 1 Minute, die in der Display-Differenz fehlt,
 * spielt für Wallclock-Berechnungen keine Rolle, weil
 * `getEffectiveDurationMs` `duration_ms` bevorzugt.
 */

import { formatDateISO } from './utils';

export interface TimerSegment {
  date: string;        // YYYY-MM-DD
  start_time: string;  // HH:MM
  end_time: string;    // HH:MM
  duration_ms: number;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function timeOf(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function nextDayStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
}

/**
 * Teilt [start, end) an jeder Mitternachts-Grenze. Liefert für jeden
 * berührten Kalendertag genau ein Segment. Liefert `[]`, wenn
 * `end <= start`.
 */
export function splitTimerSpanAtMidnight(
  start: Date,
  end: Date
): TimerSegment[] {
  if (end <= start) return [];

  const segments: TimerSegment[] = [];
  // Defensive Cap (32 Tage) — sollte nie greifen, aber verhindert
  // Endlos-Loop bei pathologischen Date-Inputs.
  let cursor = start;
  for (let safety = 0; cursor < end && safety < 32; safety++) {
    const dayEnd = nextDayStart(cursor);
    const segmentRealEnd = end < dayEnd ? end : dayEnd;
    const isLastSegment = segmentRealEnd.getTime() === end.getTime();

    segments.push({
      date: formatDateISO(startOfDay(cursor)),
      start_time: timeOf(cursor),
      // An Tages-Grenze: '23:59' statt '24:00' (HTML-time-Input-Pflicht).
      // duration_ms unten ist die echte Dauer bis Mitternacht.
      end_time: isLastSegment ? timeOf(end) : '23:59',
      duration_ms: segmentRealEnd.getTime() - cursor.getTime(),
    });

    cursor = dayEnd;
  }

  return segments;
}
