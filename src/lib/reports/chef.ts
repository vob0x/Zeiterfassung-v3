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

import type { ChangePointMetric, ReportData } from '../reportData';
import {
  esc,
  fmtHours,
  renderBars,
  renderDriftArrow,
  renderFindingsBlock,
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

  // Output-Anteil
  let outputHead: string;
  if (k.productivePct >= 50) {
    outputHead = `<b>Der Bericht zeigt eine produktive Periode:</b> ${k.productivePct.toFixed(0)}% der Zeit lief auf direkt wertschöpfende Aufgaben (${fmtHours(k.productiveMs)}). Der Rest war Steuerung, Abstimmung, Verwaltung — normaler Anteil.`;
  } else if (k.productivePct >= 40) {
    outputHead = `<b>Produktive Arbeit und Steuerung halten sich die Waage:</b> ${k.productivePct.toFixed(0)}% der Zeit war direkt wertschöpfend (${fmtHours(k.productiveMs)}). Solide Mischung, kein Output-Engpass.`;
  } else {
    outputHead = `<b>Auffällig wenig direkte Wertschöpfung:</b> nur ${k.productivePct.toFixed(0)}% der Zeit lief auf produktive Aufgaben (${fmtHours(k.productiveMs)}). Konkret heißt das: der Großteil des Tages ist Verwaltung, Abstimmung, Meetings — gewollt (z.B. Führungs-Rolle) oder Hinweis, dass Wertschöpfungs-Zeit untergeht.`;
  }
  heads.push(outputHead);

  // Konzentration
  const top = data.breakdowns.stakeholders[0];
  if (top) {
    let concHead: string;
    if (top.pct >= 50) {
      concHead = `<b>Klare Konzentration auf einen Mandanten:</b> <b>${esc(top.name)}</b> bindet ${top.pct.toFixed(0)}% der Zeit. Konkret heißt das Klumpen-Risiko: wenn dieser Auftrag wegfällt, ändert sich die Auslastung schlagartig. ${data.breakdowns.stakeholders.length} Mandanten und ${data.breakdowns.projekte.length} Projekte im Bewegungsfeld.`;
    } else if (top.pct >= 30) {
      concHead = `<b>Klar erkennbarer Hauptmandant:</b> <b>${esc(top.name)}</b> mit ${top.pct.toFixed(0)}% Anteil, daneben ein Portfolio von ${data.breakdowns.stakeholders.length} aktiven Mandanten und ${data.breakdowns.projekte.length} Projekten. Stabile Mischung, kein Klumpen.`;
    } else {
      concHead = `<b>Breit verteilte Arbeitszeit:</b> der größte Mandant (${esc(top.name)}) liegt bei nur ${top.pct.toFixed(0)}%. Konkret heißt das: ${data.breakdowns.stakeholders.length} aktive Mandanten teilen sich die Aufmerksamkeit. Kein akutes Klumpen-Thema, aber eventuell Hinweis auf zu breite Streuung.`;
    }
    heads.push(concHead);
  }

  // Parallel-Arbeit (Multi-Tasking)
  if (k.multiTaskingFactor > 1.4) {
    heads.push(`<b>Hohe Parallel-Last:</b> pro echter Arbeitsstunde fielen ${k.multiTaskingFactor.toFixed(2)}h Aufgaben an. Konkret heißt das: oft liefen mehrere Themen gleichzeitig im selben Slot — bewusste Mehr-Mandanten-Steuerung, oder Hinweis auf parallel laufende Tracker, die nicht gestoppt wurden. Stichprobe lohnt sich.`);
  } else if (k.multiTaskingFactor > 1.15) {
    heads.push(`<b>Moderate Parallel-Last:</b> pro echter Arbeitsstunde rund ${k.multiTaskingFactor.toFixed(2)}h Aufgaben gebucht. Üblicher Anteil paralleler Arbeit, z.B. wenn Mandanten in einem gemeinsamen Slot besprochen werden.`);
  } else {
    heads.push(`<b>Sequenzielle Arbeit:</b> Parallel-Faktor ${k.multiTaskingFactor.toFixed(2)} — die Person macht ein Ding nach dem anderen, kaum Mehrfachzuordnung pro Slot.`);
  }

  // Tracking-Datenqualität
  const covPct = k.coverage * 100;
  let covHead: string;
  if (covPct >= 80) {
    covHead = `<b>Belastbare Datenbasis:</b> ${covPct.toFixed(0)}% des Anwesenheitsfensters sind lückenlos erfasst. Detail-Aussagen unten sind tragend (${data.coverage.daysGood} Tage gut erfasst, ${data.coverage.daysOk} mit kleinen Lücken, ${data.coverage.daysThin} unter 60%).`;
  } else if (covPct >= 60) {
    covHead = `<b>Datenbasis brauchbar, aber mit Lücken:</b> ${covPct.toFixed(0)}% des Anwesenheitsfensters lückenlos erfasst. Tendenzen sind belastbar, minuten-genaue Vergleiche weniger (${data.coverage.daysGood} Tage gut, ${data.coverage.daysOk} mittel, ${data.coverage.daysThin} schwach erfasst).`;
  } else {
    covHead = `<b>Schwache Datenbasis:</b> nur ${covPct.toFixed(0)}% des Tages sind erfasst — der Rest sind Lücken zwischen den Einträgen. Detail-Aussagen mit Vorbehalt führen, Tendenzen bleiben gültig (${data.coverage.daysGood} Tage gut, ${data.coverage.daysOk} mittel, ${data.coverage.daysThin} schwach erfasst).`;
  }
  heads.push(covHead);

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
    <td>Anteil größter Mandant</td>
    <td class="num">${d.top1ShareFirst.toFixed(0)}% (${esc(d.topShNameFirst)})</td>
    <td class="num">${d.top1ShareSecond.toFixed(0)}% (${esc(d.topShNameSecond)})</td>
    <td class="num">${renderDriftArrow(d.top1ShareSecond - d.top1ShareFirst)}</td>
  </tr>`);

  rows.push(`<tr>
    <td>Anteil größtes Projekt</td>
    <td class="num">${d.top1ProjShareFirst.toFixed(0)}% (${esc(d.topProjNameFirst)})</td>
    <td class="num">${d.top1ProjShareSecond.toFixed(0)}% (${esc(d.topProjNameSecond)})</td>
    <td class="num">${renderDriftArrow(d.top1ProjShareSecond - d.top1ProjShareFirst)}</td>
  </tr>`);

  rows.push(`<tr>
    <td>Anzahl aktiver Mandanten</td>
    <td class="num">${d.distinctShFirst}</td>
    <td class="num">${d.distinctShSecond}</td>
    <td class="num">${renderDriftArrow(d.distinctShSecond - d.distinctShFirst, 1)}</td>
  </tr>`);

  rows.push(`<tr>
    <td>Tracking-Genauigkeit</td>
    <td class="num">${(d.coverageFirst * 100).toFixed(0)}%</td>
    <td class="num">${(d.coverageSecond * 100).toFixed(0)}%</td>
    <td class="num">${renderDriftArrow((d.coverageSecond - d.coverageFirst) * 100)}</td>
  </tr>`);

  // Projekt-Lebenszyklus-Zeile
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

  // Welle 5a — wenn Change-Points vorhanden, knappe Liste der Top-3
  // unterhalb der Drift-Tabelle. Chef-Bericht bleibt damit kompakt.
  let cpBlock = '';
  if (data.changePoints.length > 0) {
    const top3 = data.changePoints.slice(0, 3);
    const lines = top3
      .map((cp) => {
        const arrow = cp.deltaSign === 'up' ? '↑' : '↓';
        const color =
          (cp.metric === 'meeting' && cp.deltaSign === 'up') ||
          (cp.metric === 'multiTasking' && cp.deltaSign === 'up') ||
          (cp.metric === 'deepFocus' && cp.deltaSign === 'down') ||
          (cp.metric === 'coverage' && cp.deltaSign === 'down')
            ? '#D4706E'
            : '#888';
        const labels: Record<ChangePointMetric, string> = {
          wallclock: 'Arbeitsstunden',
          meeting: 'Termin-Anteil',
          deepFocus: 'Konzentrations-Anteil',
          multiTasking: 'Parallel-Last',
          topStakeholder: 'Anteil Hauptmandant',
          coverage: 'Tracking-Genauigkeit',
        };
        const persistMark =
          cp.context.persistence === 'haelt-an'
            ? ' <span style="color:#D4706E;font-size:10px;font-weight:600">·  hält an</span>'
            : cp.context.persistence === 'einmalig'
              ? ' <span style="color:#3a8d6e;font-size:10px">· einmalig</span>'
              : '';
        return `<li><b>${esc(cp.weekLabel)}</b>: ${labels[cp.metric]} <span style="color:${color}">${arrow}</span>${persistMark} <span style="color:#aaa">(vs. ${cp.baselineWeekCount} Wo. davor)</span></li>`;
      })
      .join('');
    cpBlock = `<div class="cp-inline" style="margin-top:10px"><b>Auffällige Wochen-Brüche</b> (Details + Handlungs-Hinweise unter „Operative Hinweise"):<ul style="margin:4px 0 0 18px;padding:0;font-size:12px;color:#555;list-style:disc">${lines}</ul></div>`;
  }

  return `<h2>Verschiebung im Zeitraum (1. vs. 2. Hälfte)</h2>
  <table class="chef-drift-table">
    <thead><tr><th>Achse</th><th class="num">1. Hälfte</th><th class="num">2. Hälfte</th><th class="num">Veränderung</th></tr></thead>
    <tbody>${rows.join('')}${lifecycleRow}</tbody>
  </table>
  ${cpBlock}`;
}

function buildFindingsSection(data: ReportData): string {
  const f = renderFindingsBlock(data, 'chef');
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
          ? `Schwerpunkt verstärkt sich von ${data.drift.top1ShareFirst.toFixed(0)}% auf ${data.drift.top1ShareSecond.toFixed(0)}% — Klumpen-Risiko wird größer, ein einzelner Mandanten-Wegfall hätte spürbarere Folgen.`
          : `Schwerpunkt lockert sich von ${data.drift.top1ShareFirst.toFixed(0)}% auf ${data.drift.top1ShareSecond.toFixed(0)}% — das Portfolio öffnet sich, mehr Mandanten teilen sich die Aufmerksamkeit.`
      );
    }
  }

  if (k.multiTaskingFactor > 1.5) {
    messages.push(
      `Parallel-Faktor von ${k.multiTaskingFactor.toFixed(2)} ist substantiell. Konkret heißt das: pro echter Arbeitsstunde wurden ${k.multiTaskingFactor.toFixed(2)}h Aufgaben gezählt — entweder ist Tracker-Disziplin zu prüfen, oder die Mehr-Mandanten-Steuerung ist bewusst so gewählt.`
    );
  }

  if (k.coverage < 0.7) {
    messages.push(
      `Tracking-Genauigkeit nur ${(k.coverage * 100).toFixed(0)}%. Konkret heißt das: die Detail-Verteilungen unten sind tendenziell konservativ — die echte Lage könnte breiter sein als hier ausgewiesen, weil ein guter Teil des Tages außerhalb der Einträge liegt.`
    );
  }

  if (top && k.productivePct < 35) {
    messages.push(
      `Produktiver Anteil unter 35% bei <b>${esc(top.name)}</b> als Hauptmandant — Output-Aktivitäten (direkte Wertschöpfung) sind dünn gegenüber Steuerung/Verwaltung. Ist das so gewollt?`
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
