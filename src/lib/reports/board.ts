/**
 * Board-Renderer — One-Pager für Geschäftsleitung / Verwaltungsrat.
 *
 * Zweck: strategischer Eindruck in 30 Sekunden. Keine Operativ-Details,
 * keine Findings-Listen, keine persönliche Anrede. Drei Hero-Aussagen,
 * eine Verteilungs-Visualisierung, ein Trend-Satz, fertig.
 *
 * Was bewusst fehlt: Coverage-Buckets, Stakeholder-Dossiers, Wochen-
 * Tabelle, Findings (außer ggf. Konzentrations-/Lifecycle-Hinweis
 * minimal). Board liest 30 s, nicht 5 min.
 */

import type { ReportData } from '../reportData';
import {
  esc,
  fmtHoursShort,
  renderBars,
  renderFindingsBlock,
} from './shared';

/**
 * Liefert den Body-HTML des Board-Reports. Wird vom Dispatcher für die
 * Modal-Vorschau direkt eingebettet bzw. via wrapAsDocument zum vollen
 * Dokument für Print/Download verpackt.
 */
export function renderBoardBody(data: ReportData): string {
  const k = data.kpis;
  const topSh = data.breakdowns.stakeholders[0];
  const topProj = data.breakdowns.projekte[0];
  const covPct = k.coverage * 100;

  // ── Hero-Block — drei Aussagen, fett, visuell hervorgehoben ──────
  const heroRows: string[] = [];
  heroRows.push(`<div class="board-hero-cell">
    <div class="board-hero-label">Auslastung</div>
    <div class="board-hero-value">${fmtHoursShort(k.avgPresenceMsPerDay)} <span style="font-size:14px;color:#888">/ Tag</span></div>
    <div class="board-hero-sub">Anwesenheit zwischen erstem und letztem Eintrag im Schnitt, an ${k.workingDays} Arbeitstagen. Davon Ø ${fmtHoursShort(k.avgWallclockMsPerDay)} im Tracker erfasst (Lücken zwischen Einträgen herausgerechnet — die echte Arbeitszeit kann höher liegen, falls nicht alles getrackt wurde).</div>
  </div>`);

  if (topSh && topProj) {
    heroRows.push(`<div class="board-hero-cell">
      <div class="board-hero-label">Schwerpunkte</div>
      <div class="board-hero-value">${topSh.pct.toFixed(0)}%</div>
      <div class="board-hero-sub"><b>${esc(topSh.name)}</b> bindet den Hauptteil der Arbeitszeit, das größte Projekt <b>${esc(topProj.name)}</b> liegt bei ${topProj.pct.toFixed(0)}%.</div>
    </div>`);
  } else {
    heroRows.push(`<div class="board-hero-cell">
      <div class="board-hero-label">Schwerpunkte</div>
      <div class="board-hero-value">—</div>
      <div class="board-hero-sub">Zu wenig Datenbasis für eine Aussage.</div>
    </div>`);
  }

  // Profil-Karte: Produktiv-Anteil, Datenqualität, ggf. Parallel-Index
  const profilSubParts: string[] = [];
  profilSubParts.push(
    `${covPct.toFixed(0)}% des Tages lückenlos erfasst (Tracking-Genauigkeit).`
  );
  if (k.multiTaskingFactor > 1.2) {
    profilSubParts.push(
      `Pro getrackter Arbeitsstunde fielen ${k.multiTaskingFactor.toFixed(1)} Stunden Aufgaben an — Hinweis auf parallele Mandanten-Steuerung.`
    );
  }
  heroRows.push(`<div class="board-hero-cell">
    <div class="board-hero-label">Profil</div>
    <div class="board-hero-value">${k.productivePct.toFixed(0)}% Produktiv</div>
    <div class="board-hero-sub">Anteil direkt wertschöpfender Arbeit (gegenüber Verwaltung, Abstimmung, Meetings). ${profilSubParts.join(' ')}</div>
  </div>`);

  const heroHtml = `<div class="board-hero">
    <div class="board-hero-row">${heroRows.join('')}</div>
  </div>`;

  // ── Verteilungsbild — Top-3 Stakeholder + Top-3 Projekte ─────────
  const pies = `<div class="board-pies">
    <div>
      <h3>Mandanten</h3>
      ${renderBars(data.breakdowns.stakeholders, '#C9A962', 3)}
    </div>
    <div>
      <h3>Projekte</h3>
      ${renderBars(data.breakdowns.projekte, '#9B8EC4', 3)}
    </div>
  </div>`;

  // ── Trend-Satz aus Drift ─────────────────────────────────────────
  const trendSentence = buildTrendSentence(data);

  // ── Board-Findings + Composites (REPLACE-Strategy) ──────────────
  const findings = renderFindingsBlock(data, 'board');

  // ── Disclaimer ───────────────────────────────────────────────────
  const disclaimer = `<div class="board-disclaimer">
    Tracking-Genauigkeit ${covPct.toFixed(0)}% · Zeitraum ${esc(data.meta.range.label)} · Erstellt aus ${data.kpis.entriesCount} Einträgen
  </div>`;

  return heroHtml + pies + `<div class="board-trend">${trendSentence}</div>` +
    (findings ? `<h2>Strategischer Hinweis</h2>${findings}` : '') +
    disclaimer;
}

/**
 * Trend-Satz für Board. Welle 5a: bevorzugt topStakeholder-ChangePoint
 * (datierter Bruch ist präziser als Halbzeit-Drift). Fällt zurück auf
 * Drift, dann Lifecycle, dann stabil.
 */
function buildTrendSentence(data: ReportData): string {
  // Welle 5a — datierter Bruch beim Top-Stakeholder, wenn vorhanden
  const cpTop = data.changePoints.find((c) => c.metric === 'topStakeholder');
  if (cpTop) {
    const wk = data.weeks.find((w) => w.label === cpTop.weekLabel);
    const shName = wk?.topStakeholderName ?? '—';
    if (cpTop.deltaSign === 'up') {
      return `<b>Konzentrations-Sprung in ${esc(cpTop.weekLabel)}:</b> <b>${esc(shName)}</b> springt von Ø ${cpTop.baselineValue.toFixed(0)}% auf ${cpTop.currentValue.toFixed(0)}% — gegenüber den vorherigen ${cpTop.baselineWeekCount} Wochen ein deutlicher Bruch.`;
    }
    return `<b>Konzentrations-Wechsel in ${esc(cpTop.weekLabel)}:</b> Spitzen-Anteil sinkt von Ø ${cpTop.baselineValue.toFixed(0)}% auf ${cpTop.currentValue.toFixed(0)}% — das Portfolio rebalanciert sich.`;
  }

  if (data.drift) {
    const dTop = data.drift.top1ShareSecond - data.drift.top1ShareFirst;
    if (Math.abs(dTop) >= 5) {
      if (dTop > 0) {
        return `<b>Konzentration verstärkt sich:</b> <b>${esc(data.drift.topShNameSecond)}</b> bindet in der zweiten Hälfte ${data.drift.top1ShareSecond.toFixed(0)}% (vorher ${data.drift.top1ShareFirst.toFixed(0)}%).`;
      }
      return `<b>Konzentration lockert sich:</b> Spitzen-Anteil sinkt von ${data.drift.top1ShareFirst.toFixed(0)}% auf ${data.drift.top1ShareSecond.toFixed(0)}% — Aufmerksamkeit streut sich.`;
    }
  }
  if (data.projektLifecycle.newcomers.length > 0) {
    const n = data.projektLifecycle.newcomers[0];
    return `<b>Portfolio in Bewegung:</b> neues Projekt <b>${esc(n.name)}</b> ist in der zweiten Hälfte hinzugekommen.`;
  }
  if (data.projektLifecycle.vanished.length > 0) {
    const v = data.projektLifecycle.vanished[0];
    return `<b>Portfolio in Bewegung:</b> Projekt <b>${esc(v.name)}</b> ist in der zweiten Hälfte ausgelaufen.`;
  }
  return `<b>Stabile Verteilung</b> über den Zeitraum — keine substanzielle Verschiebung der Schwerpunkte.`;
}
