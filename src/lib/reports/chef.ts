/**
 * Chef-Renderer — Linien-Brief für operative Steuerung.
 *
 * Zweck: 3-Minuten-Lese-Erlebnis für den Linienchef. Vier fette Headlines
 * oben, dann Schwerpunkt-Matrix (Stakeholder × Projekte mit Drift-
 * Pfeilen), operativer Mix (Format + Tätigkeit), Drift-Tabelle, kuratierte
 * Findings. Kein „du", keine Reflexions-Fragen, keine Mandanten-Dossiers
 * im Coaching-Ton.
 *
 * Was bewusst fehlt: Coach-Fragen, Lead-Dossier-Karten, Board-Hero,
 * Slot-Längen-Histogramm im Detail.
 */

import type { ReportData } from '../reportData';
import {
  esc,
  fmtHours,
  fmtHoursShort,
  renderBars,
  renderDriftArrow,
  renderFindings,
} from './shared';

export function renderChefBody(data: ReportData): string {
  return `
    ${buildHeadlines(data)}
    <h2>Schwerpunkt-Matrix</h2>
    ${buildSchwerpunkt(data)}
    <h2>Operativer Mix</h2>
    ${buildOperativerMix(data)}
    ${buildDriftSection(data)}
    ${buildFindingsSection(data)}
    ${buildClosing(data)}
  `;
}

/**
 * Vier fette Headlines: Output-Modus, Konzentration, Multi-Tasking,
 * Datenbasis. Diese vier sind die Linien-Steuerungs-Achsen.
 */
function buildHeadlines(data: ReportData): string {
  const k = data.kpis;
  const heads: string[] = [];

  // Output-Modus
  const prodLabel =
    k.productivePct >= 50
      ? 'Output-Modus dominant'
      : k.productivePct >= 40
        ? 'Output und Steuerung ausgeglichen'
        : 'Steuerungs-lastig — Output unter 40%';
  heads.push(`<b>${prodLabel}.</b> ${k.productivePct.toFixed(0)}% Produktiv-Quote bei ${fmtHours(k.productiveMs)} produktiver Zeit.`);

  // Konzentration
  const top = data.breakdowns.stakeholders[0];
  if (top) {
    const conc =
      top.pct >= 50
        ? 'klar konzentriert'
        : top.pct >= 30
          ? 'getragener Schwerpunkt'
          : 'breit verteilt';
    heads.push(`<b>Verteilung ${conc}.</b> <b>${esc(top.name)}</b> führt mit ${top.pct.toFixed(0)}%, ${data.breakdowns.stakeholders.length} aktive Stakeholder, ${data.breakdowns.projekte.length} Projekte.`);
  }

  // Multi-Tasking
  if (k.multiTaskingFactor > 1.4) {
    heads.push(`<b>Hoher Parallelitäts-Faktor (${k.multiTaskingFactor.toFixed(2)}x).</b> Entweder bewusste Parallel-Steuerung oder Hinweis auf vergessene Tracker — prüfen lohnt.`);
  } else if (k.multiTaskingFactor > 1.15) {
    heads.push(`<b>Moderates Parallelitäts-Niveau (${k.multiTaskingFactor.toFixed(2)}x).</b> Naive ${fmtHoursShort(k.totalNaiveMs)} vs Wallclock ${fmtHoursShort(k.totalWallclockMs)}.`);
  } else {
    heads.push(`<b>Sequentielle Arbeitsweise (Faktor ${k.multiTaskingFactor.toFixed(2)}x).</b> Tracker laufen einzeln, Naive und Wallclock fast deckungsgleich.`);
  }

  // Datenbasis
  const covPct = k.coverage * 100;
  const covLabel =
    covPct >= 80
      ? 'Datenbasis tragend'
      : covPct >= 60
        ? 'Datenbasis brauchbar mit Lücken'
        : 'Datenbasis schwach — Detail-Aussagen unter Vorbehalt';
  heads.push(`<b>${covLabel} (Coverage ${covPct.toFixed(0)}%).</b> ${data.coverage.daysGood} Tage ≥80%, ${data.coverage.daysOk} Tage 60–80%, ${data.coverage.daysThin} Tage <60%.`);

  return `<div class="chef-headlines">
    ${heads.map((h) => `<div class="chef-headline">${h}</div>`).join('')}
  </div>`;
}

/**
 * Schwerpunkt-Matrix: Top-3 Stakeholder mit Drift-Pfeil + Top-3 Projekte
 * mit Drift-Pfeil. Drift kommt aus der Periodenhälfte-Differenz.
 */
function buildSchwerpunkt(data: ReportData): string {
  const driftForSh = (name: string): number | null => {
    const g = data.trend.growth.find((t) => t.name === name);
    if (g) return g.deltaPct;
    const d = data.trend.decline.find((t) => t.name === name);
    if (d) return d.deltaPct;
    return null;
  };

  const renderColumn = (
    title: string,
    rows: typeof data.breakdowns.stakeholders,
    withDrift: boolean
  ) => {
    const items = rows
      .slice(0, 3)
      .map((r) => {
        const d = withDrift ? driftForSh(r.name) : null;
        const driftCell =
          d !== null
            ? `<div class="chef-pair-drift">${renderDriftArrow(d)}</div>`
            : '<div class="chef-pair-drift" style="color:#888">·</div>';
        return `<div class="chef-pair">
          <div class="chef-pair-name">${esc(r.name)}</div>
          <div class="chef-pair-pct">${r.pct.toFixed(0)}%</div>
          ${driftCell}
        </div>`;
      })
      .join('');
    return `<div>
      <h3>${title}</h3>
      ${items || '<p class="muted">—</p>'}
    </div>`;
  };

  return `<div class="chef-matrix">
    ${renderColumn('Top-Stakeholder', data.breakdowns.stakeholders, true)}
    ${renderColumn('Top-Projekte', data.breakdowns.projekte, false)}
  </div>`;
}

/**
 * Operativer Mix als zwei horizontale Bar-Strips: Tätigkeits-Mix und
 * Format-Mix. Auf Top-5 begrenzt um nicht zu erschlagen.
 */
function buildOperativerMix(data: ReportData): string {
  return `<div class="chef-matrix">
    <div>
      <h3>Tätigkeits-Mix</h3>
      ${renderBars(data.breakdowns.taetigkeiten, '#888', 5)}
    </div>
    <div>
      <h3>Format-Mix</h3>
      ${renderBars(data.breakdowns.formate, '#D4956A', 5)}
    </div>
  </div>`;
}

/**
 * Drift-Tabelle: 1. vs 2. Hälfte als kompakte Tabelle. Nur wenn Drift
 * berechnet werden konnte (≥ 2 Tage pro Hälfte).
 */
function buildDriftSection(data: ReportData): string {
  if (!data.drift) return '';
  const d = data.drift;
  const rows: string[] = [];

  rows.push(`<tr>
    <td>Top-Stakeholder-Anteil</td>
    <td class="num">${d.top1ShareFirst.toFixed(0)}% (${esc(d.topShNameFirst)})</td>
    <td class="num">${d.top1ShareSecond.toFixed(0)}% (${esc(d.topShNameSecond)})</td>
    <td class="num">${renderDriftArrow(d.top1ShareSecond - d.top1ShareFirst)}</td>
  </tr>`);

  rows.push(`<tr>
    <td>Top-Projekt-Anteil</td>
    <td class="num">${d.top1ProjShareFirst.toFixed(0)}% (${esc(d.topProjNameFirst)})</td>
    <td class="num">${d.top1ProjShareSecond.toFixed(0)}% (${esc(d.topProjNameSecond)})</td>
    <td class="num">${renderDriftArrow(d.top1ProjShareSecond - d.top1ProjShareFirst)}</td>
  </tr>`);

  rows.push(`<tr>
    <td>aktive Stakeholder</td>
    <td class="num">${d.distinctShFirst}</td>
    <td class="num">${d.distinctShSecond}</td>
    <td class="num">${renderDriftArrow(d.distinctShSecond - d.distinctShFirst, 1)}</td>
  </tr>`);

  rows.push(`<tr>
    <td>Tracking-Coverage</td>
    <td class="num">${(d.coverageFirst * 100).toFixed(0)}%</td>
    <td class="num">${(d.coverageSecond * 100).toFixed(0)}%</td>
    <td class="num">${renderDriftArrow((d.coverageSecond - d.coverageFirst) * 100)}</td>
  </tr>`);

  // Lifecycle-Zeile (separate, weil nicht-numerisch)
  let lifecycleRow = '';
  if (
    data.projektLifecycle.newcomers.length > 0 ||
    data.projektLifecycle.vanished.length > 0
  ) {
    const newNames =
      data.projektLifecycle.newcomers
        .slice(0, 2)
        .map((p) => esc(p.name))
        .join(', ') || '—';
    const goneNames =
      data.projektLifecycle.vanished
        .slice(0, 2)
        .map((p) => esc(p.name))
        .join(', ') || '—';
    lifecycleRow = `<tr>
      <td>Projekt-Bewegung</td>
      <td class="num" style="color:#888">ausgelaufen: ${goneNames}</td>
      <td class="num" style="color:#6c5a2c">neu: ${newNames}</td>
      <td class="num">·</td>
    </tr>`;
  }

  return `<h2>Verschiebung im Zeitraum</h2>
  <table class="chef-drift-table">
    <thead><tr><th>Achse</th><th class="num">1. Hälfte</th><th class="num">2. Hälfte</th><th class="num">Δ</th></tr></thead>
    <tbody>${rows.join('')}${lifecycleRow}</tbody>
  </table>`;
}

function buildFindingsSection(data: ReportData): string {
  const f = renderFindings(data.findings, 'chef');
  if (!f) return '';
  return `<h2>Operative Hinweise</h2>${f}`;
}

/**
 * Chef-Closing — knappe Aussage, keine Frage. Reine Operative-Zusammen-
 * fassung wenn nichts auffällig war, sonst spitze Konsequenz.
 */
function buildClosing(data: ReportData): string {
  const k = data.kpis;
  const top = data.breakdowns.stakeholders[0];
  const messages: string[] = [];

  if (data.drift) {
    const dShare = data.drift.top1ShareSecond - data.drift.top1ShareFirst;
    if (Math.abs(dShare) >= 8) {
      messages.push(
        dShare > 0
          ? `Schwerpunkt verstärkt sich (${data.drift.top1ShareFirst.toFixed(0)}% → ${data.drift.top1ShareSecond.toFixed(0)}%) — Konzentrations-Risiko im Auge behalten.`
          : `Schwerpunkt lockert sich (${data.drift.top1ShareFirst.toFixed(0)}% → ${data.drift.top1ShareSecond.toFixed(0)}%) — Portfolio öffnet sich.`
      );
    }
  }

  if (k.multiTaskingFactor > 1.5) {
    messages.push(
      `Parallelitäts-Faktor ${k.multiTaskingFactor.toFixed(2)}x ist substantiell — entweder Tracker-Disziplin prüfen oder Steuerung bewusst belassen.`
    );
  }

  if (k.coverage < 0.7) {
    messages.push(
      `Coverage ${(k.coverage * 100).toFixed(0)}% bedeutet: Detail-Verteilungen tendenziell konservativ, echte Lage breiter als ausgewiesen.`
    );
  }

  if (top && k.productivePct < 35) {
    messages.push(
      `Produktiv-Quote unter 35% — bei Top-Mandat <b>${esc(top.name)}</b> lohnt der Blick auf den Output-/Steuerungs-Mix.`
    );
  }

  if (messages.length === 0) {
    messages.push(
      'Stabile Linienlage — keine operativen Hebel akut nötig. Routine trägt.'
    );
  }

  return `<div class="chef-closing">
    <b>Operative Konsequenz.</b> ${messages.slice(0, 3).join(' ')}
  </div>`;
}
