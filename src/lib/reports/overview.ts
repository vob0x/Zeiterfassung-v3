/**
 * Übersicht-Renderer — sachlicher One-Pager ohne Brillen-Sprache.
 *
 * Zweck: Ein Blick auf die zentralen Zahlen — Auslastung, Überzeit,
 * Belastung, Versickerung — und der Leser weiß Bescheid. Keine
 * Reflexions-Fragen, keine Gesprächs-Anker, keine "nächster Hebel"-
 * Empfehlung. Wer mehr will, nimmt eine andere Brille.
 */

import type { ReportData } from '../reportData';
import {
  esc,
  fmtHours,
  fmtHoursShort,
  interpretLeakPct,
  interpretOvertime,
  renderTrackingQualityNote,
  renderCrisisBanner,
} from './shared';

export function renderOverviewBody(data: ReportData): string {
  const k = data.kpis;
  const cards: string[] = [];

  // 1. Auslastung — Präsenz pro Tag
  cards.push(`<div class="overview-card">
    <div class="overview-label">Auslastung</div>
    <div class="overview-value">${fmtHoursShort(k.avgPresenceMsPerDay)} <span class="overview-unit">/ Tag</span></div>
    <div class="overview-sub">Anwesenheit zwischen erstem und letztem Eintrag, an ${k.workingDays} Arbeitstagen. Erfasste Tracker-Zeit: ${fmtHoursShort(k.avgWallclockMsPerDay)}/Tag.</div>
  </div>`);

  // 2. Überzeit — Saldo mit Skala
  const otScale = interpretOvertime(k.overtimeMs, k.contractMs);
  let otValue: string;
  let otSub: string;
  if (k.contractMs <= 0) {
    otValue = '—';
    otSub = 'Zu wenig Arbeitstage für eine Aussage.';
  } else if (k.overtimeMs > 0) {
    const wlNote = k.workloadPct < 100 ? ` (bei ${k.workloadPct.toFixed(0)} % Beschäftigung)` : '';
    otValue = `+${fmtHours(k.overtimeMs)} <span class="scale-badge scale-${otScale.level}">${otScale.label}</span>`;
    otSub = `Arbeitszeit ${fmtHours(k.effectiveWorkTimeMs)} vs. Soll ${fmtHours(k.contractMs)}${wlNote}. Präsenz minus 45-min-Pause als Vergleichsbasis.`;
  } else if (k.undertimeMs > 0) {
    otValue = `−${fmtHours(k.undertimeMs)}`;
    otSub = `Arbeitszeit ${fmtHours(k.effectiveWorkTimeMs)} — ${fmtHours(k.undertimeMs)} unter Soll von ${fmtHours(k.contractMs)}.`;
  } else {
    otValue = '0:00h';
    otSub = `Arbeitszeit exakt auf Vertrags-Soll von ${fmtHours(k.contractMs)}.`;
  }
  const methodNote = renderTrackingQualityNote(
    k.totalPresenceMs,
    k.totalWallclockMs,
    k.pauseDeductMs
  );
  cards.push(`<div class="overview-card">
    <div class="overview-label">Überzeit</div>
    <div class="overview-value">${otValue}</div>
    <div class="overview-sub">${otSub}${methodNote}</div>
  </div>`);

  // 3. Belastung — 10-h-Tage
  const hi = data.weekday.highLoadDaysCount;
  const longDayRatio = k.workingDays > 0 ? hi / k.workingDays : 0;
  let belValue: string;
  let belSub: string;
  if (hi === 0) {
    belValue = '0 Tage';
    belSub = 'Kein Tag über 10 Stunden — die gesundheitliche Schwelle wurde gehalten.';
  } else {
    const ratioPct = Math.round(longDayRatio * 100);
    const belClass = longDayRatio > 0.2 ? 'scale-low' : 'scale-normal';
    const belLabel = longDayRatio > 0.2 ? 'auffällig' : 'im Rahmen';
    belValue = `${hi} Tage <span class="scale-badge ${belClass}">${belLabel}</span>`;
    belSub = `${hi} von ${k.workingDays} Arbeitstagen über 10 Stunden — das sind ${ratioPct} %. Schwelle: 1 Tag pro Woche (~20 %).`;
  }
  cards.push(`<div class="overview-card">
    <div class="overview-label">Belastung (10-h-Tage)</div>
    <div class="overview-value">${belValue}</div>
    <div class="overview-sub">${belSub}</div>
  </div>`);

  // 4. Versickerung — Anteil selbst-markiert „nicht produktiv"
  const leakScale = interpretLeakPct(k.leakPct);
  cards.push(`<div class="overview-card">
    <div class="overview-label">Versickerung</div>
    <div class="overview-value">${k.leakPct.toFixed(0)} % <span class="scale-badge scale-${leakScale.level}">${leakScale.label}</span></div>
    <div class="overview-sub">${fmtHours(k.leakMs)} als „nicht produktiv" markiert (Selbsteinschätzung). ${esc(leakScale.hint)}</div>
  </div>`);

  // Headline-Satz: wenn ein Befund auffällig ist, in einem Satz zusammenfassen
  let headline = '';
  if (k.overtimeMs > 0 && otScale.level === 'high') {
    headline = `<b>Strukturelle Mehrarbeit.</b> ${fmtHours(k.overtimeMs)} über Vertrags-Soll, ${hi} lange Tage — der Vertrags-Rahmen reichte nicht aus.`;
  } else if (hi >= 2 && longDayRatio > 0.2) {
    headline = `<b>Häufige lange Tage.</b> ${hi} von ${k.workingDays} Arbeitstagen über 10 Stunden — wiederkehrendes Belastungs-Muster.`;
  } else if (k.leakPct >= 40) {
    headline = `<b>Versickerung dominant.</b> Über 40 % der Zeit selbst als „nicht produktiv" markiert.`;
  } else if (k.contractMs > 0 && otScale.level === 'elevated') {
    headline = `<b>Mehrarbeit über dem Vertrags-Soll.</b> ${fmtHours(k.overtimeMs)} zusätzlich, im auffälligen Bereich.`;
  } else if (k.contractMs > 0 && k.overtimeMs === 0 && k.undertimeMs <= 0) {
    headline = `<b>Vertrags-Soll exakt eingehalten</b> — Arbeitszeit deckt das Vertrags-Soll.`;
  } else if (k.undertimeMs > 30 * 60 * 60_000) {
    headline = `<b>Unter Vertrags-Soll.</b> Urlaubstage, Krankheit oder geringere Auslastung.`;
  } else {
    headline = `<b>Im Rahmen.</b> Keine Schwelle dieser Periode auffällig überschritten.`;
  }

  const generated = new Date(data.meta.generatedAt).toLocaleString('de-CH');
  const disclaimer = `<div class="overview-disclaimer">
    Erstellt aus ${data.kpis.entriesCount} Einträgen · ${data.kpis.workingDays} Arbeitstage · Tracking-Genauigkeit ${(data.kpis.coverage * 100).toFixed(0)} % · Stand ${esc(generated)}
  </div>`;

  return `
    ${renderCrisisBanner(data)}
    <div class="overview-headline">${headline}</div>
    <div class="overview-grid">${cards.join('')}</div>
    ${disclaimer}
  `;
}
