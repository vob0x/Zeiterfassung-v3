/**
 * Lead-Renderer — Steuerungs-Cockpit für Teamleader im 1:1.
 *
 * Zweck: 5-Minuten-Vorbereitungs-Papier vor einem 1:1. Drei Cockpit-
 * Karten (Belastung, Schwerpunkt, Datenqualität) als Ampel-System, dann
 * Mandanten-Dossiers für die Top-Stakeholder mit konkreter Lead-Frage
 * pro Dossier, Drift-Tabelle, kuratierte Findings, drei Hebel fürs 1:1.
 *
 * Was bewusst fehlt: Coach-Reflexionsfragen, Board-Hero, Headline-Block
 * im Chef-Stil. Lead ist Cockpit-Logik.
 */

import type { ReportData } from '../reportData';
import {
  esc,
  fmtHours,
  fmtHoursShort,
  renderDriftArrow,
  renderFindings,
  renderStakeholderDossier,
} from './shared';

export function renderLeadBody(data: ReportData): string {
  return `
    ${buildCockpit(data)}
    <h2>Mandanten-Dossiers</h2>
    ${buildDossiers(data)}
    ${buildDriftSection(data)}
    ${buildFindingsSection(data)}
    ${buildHebel(data)}
    ${buildKpiAnhang(data)}
  `;
}

/**
 * Cockpit mit drei Karten: Belastung, Schwerpunkt, Datenqualität.
 * Jede Karte hat eine Ampel-Klasse (warn/ok/neutral) und eine
 * Sub-Aussage mit Frage-Tendenz.
 */
function buildCockpit(data: ReportData): string {
  const k = data.kpis;
  const cards: string[] = [];

  // ── Belastung ────────────────────────────────────────────────────
  let belastungClass: 'ampel-warn' | 'ampel-ok' | '' = '';
  let belastungValue: string;
  let belastungSub: string;
  const hi = data.weekday.highLoadDaysCount;
  if (hi >= 3) {
    belastungClass = 'ampel-warn';
    belastungValue = `${hi} Tage > 10h`;
    belastungSub = `Belastungs-Muster sichtbar. Frage im 1:1: was treibt diese Spitzen — Deadline, Engpass, Auswahl?`;
  } else if (hi >= 1) {
    belastungValue = `${hi} Tag${hi === 1 ? '' : 'e'} > 10h`;
    belastungSub = `Vereinzelte Spitzen, kein Muster. Im Auge behalten ohne Drama.`;
  } else {
    belastungClass = 'ampel-ok';
    belastungValue = `Ø ${fmtHoursShort(k.avgPresenceMsPerDay)} / Tag`;
    belastungSub = `Belastung im üblichen Bereich, keine Spitzen über 10 h.`;
  }
  cards.push(`<div class="lead-three-card ${belastungClass}">
    <div class="lead-three-h">Belastung</div>
    <div class="lead-three-v">${belastungValue}</div>
    <div class="lead-three-s">${belastungSub}</div>
  </div>`);

  // ── Schwerpunkt ──────────────────────────────────────────────────
  const top = data.breakdowns.stakeholders[0];
  let schwerpunktClass: 'ampel-warn' | 'ampel-ok' | '' = '';
  let schwerpunktValue: string;
  let schwerpunktSub: string;
  if (top) {
    schwerpunktValue = `${top.pct.toFixed(0)}% ${esc(top.name)}`;
    if (top.pct >= 60) {
      schwerpunktClass = 'ampel-warn';
      schwerpunktSub = `Klumpen-Risiko. Bewusst gewollt oder strategische Diversifikation überfällig?`;
    } else if (top.pct >= 35) {
      schwerpunktSub = `Erkennbarer Schwerpunkt mit Portfolio drumherum. Tragend, aber nicht erdrückend.`;
    } else {
      schwerpunktClass = 'ampel-ok';
      schwerpunktSub = `Breit verteilt — keine Konzentrations-Frage akut.`;
    }
  } else {
    schwerpunktValue = '—';
    schwerpunktSub = 'Zu wenig Datenbasis für Schwerpunkt-Aussage.';
  }
  cards.push(`<div class="lead-three-card ${schwerpunktClass}">
    <div class="lead-three-h">Schwerpunkt</div>
    <div class="lead-three-v">${schwerpunktValue}</div>
    <div class="lead-three-s">${schwerpunktSub}</div>
  </div>`);

  // ── Datenqualität ────────────────────────────────────────────────
  const covPct = k.coverage * 100;
  let dqClass: 'ampel-warn' | 'ampel-ok' | '' = '';
  let dqValue = `${covPct.toFixed(0)}% Coverage`;
  let dqSub: string;
  if (covPct >= 80) {
    dqClass = 'ampel-ok';
    dqSub = 'Datenbasis trägt — 1:1-Aussagen belastbar.';
  } else if (covPct >= 60) {
    dqSub = 'Datenbasis brauchbar mit kleineren Lücken.';
  } else {
    dqClass = 'ampel-warn';
    dqSub = 'Datenbasis schwach — Detail-Aussagen mit Vorbehalt führen.';
  }
  if (data.drift) {
    const dCov = (data.drift.coverageSecond - data.drift.coverageFirst) * 100;
    if (Math.abs(dCov) >= 10) {
      dqValue += ` (${dCov > 0 ? '↑' : '↓'} ${Math.abs(dCov).toFixed(0)}pp)`;
      dqSub = dCov > 0
        ? `Datenbasis verbessert sich — Tracking-Disziplin steigt.`
        : `Tracking-Disziplin sinkt — ansprechen im 1:1.`;
    }
  }
  cards.push(`<div class="lead-three-card ${dqClass}">
    <div class="lead-three-h">Datenqualität</div>
    <div class="lead-three-v">${dqValue}</div>
    <div class="lead-three-s">${dqSub}</div>
  </div>`);

  return `<div class="lead-three">${cards.join('')}</div>`;
}

/**
 * Bis zu drei Mandanten-Dossiers. Aus stakeholderProfiles, gefiltert auf
 * die Profile mit ≥ 10 % Anteil. Wenn keine Profile da sind: knapper
 * Hinweis statt leere Sektion.
 */
function buildDossiers(data: ReportData): string {
  const profiles = data.stakeholderProfiles.slice(0, 3);
  if (profiles.length === 0) {
    return `<p class="muted">Zu wenig Daten für Mandanten-Dossiers — keine Stakeholder mit ≥ 10 % Anteil im Zeitraum.</p>`;
  }
  return `<div class="lead-dossiers">
    ${profiles.map((p) => renderStakeholderDossier(p)).join('')}
  </div>`;
}

/**
 * Drift-Tabelle, kompakt. Nur die zwei für Lead relevantesten Achsen:
 * Top-Stakeholder-Anteil und Tracking-Coverage.
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
    <td>Tracking-Coverage</td>
    <td class="num">${(d.coverageFirst * 100).toFixed(0)}%</td>
    <td class="num">${(d.coverageSecond * 100).toFixed(0)}%</td>
    <td class="num">${renderDriftArrow((d.coverageSecond - d.coverageFirst) * 100)}</td>
  </tr>`);

  if (Math.abs(d.distinctShSecond - d.distinctShFirst) >= 2) {
    rows.push(`<tr>
      <td>aktive Stakeholder</td>
      <td class="num">${d.distinctShFirst}</td>
      <td class="num">${d.distinctShSecond}</td>
      <td class="num">${renderDriftArrow(d.distinctShSecond - d.distinctShFirst, 1)}</td>
    </tr>`);
  }

  return `<h2>Verschiebung im Zeitraum</h2>
  <table class="lead-drift">
    <thead><tr><th>Achse</th><th class="num">1. Hälfte</th><th class="num">2. Hälfte</th><th class="num">Δ</th></tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table>`;
}

function buildFindingsSection(data: ReportData): string {
  const f = renderFindings(data.findings, 'lead');
  if (!f) return '';
  return `<h2>Was im 1:1 Gewicht hat</h2>${f}`;
}

/**
 * Drei Hebel fürs 1:1 — die konkreten Aktionen, die der Teamleader
 * mitnehmen soll. Datengetrieben aus den auffälligsten Mustern.
 */
function buildHebel(data: ReportData): string {
  const hebel: string[] = [];

  // Konzentrations-Hebel
  const top = data.breakdowns.stakeholders[0];
  if (top && top.pct >= 50) {
    hebel.push(
      `<b>${esc(top.name)}-Klumpen</b> bei ${top.pct.toFixed(0)}% — Fokussierung strategisch gewollt, oder Diversifikations-Auftrag?`
    );
  }

  // OOS-Hebel — auffälligster Stakeholder
  const oosSh = data.stakeholderProfiles
    .filter(
      (p) =>
        p.nonprodPct >= 30 || p.microTaskPct >= 30 || p.meetingHeavyPct >= 50
    )
    .sort((a, b) => b.pct - a.pct)[0];
  if (oosSh) {
    const marker: string[] = [];
    if (oosSh.microTaskPct >= 30) marker.push(`${oosSh.microTaskPct.toFixed(0)}% Mini-Slots`);
    if (oosSh.nonprodPct >= 30) marker.push(`${oosSh.nonprodPct.toFixed(0)}% nicht-produktiv`);
    if (oosSh.meetingHeavyPct >= 50) marker.push(`${oosSh.meetingHeavyPct.toFixed(0)}% Meetings`);
    hebel.push(
      `<b>Mandat ${esc(oosSh.name)}</b> (${marker.join(', ')}): Triage-Layer oder Scope-Klärung?`
    );
  }

  // Belastung
  if (data.weekday.highLoadDaysCount >= 3) {
    hebel.push(
      `<b>Belastungs-Muster</b>: ${data.weekday.highLoadDaysCount} Tage > 10h — was ist der Engpass, der diese Spitzen erzwingt?`
    );
  }

  // Burst
  if (data.rhythm.burst.longBurstCount >= 3) {
    hebel.push(
      `<b>${data.rhythm.burst.longBurstCount} Slot-Ketten > 3h ohne Pause</b> — Pausen-Disziplin oder strukturelle Frage?`
    );
  }

  // Doku-Disziplin global
  if (data.disziplin.notizCoverage < 30 && data.kpis.entriesCount >= 30) {
    hebel.push(
      `<b>Doku-Lücke global</b>: nur ${data.disziplin.notizCoverage.toFixed(0)}% mit Notiz — im Review fehlt der Kontext. Eine 1-Wort-Disziplin einführen?`
    );
  }

  // Coverage-Drift
  if (data.drift) {
    const dCov = (data.drift.coverageSecond - data.drift.coverageFirst) * 100;
    if (dCov <= -10) {
      hebel.push(
        `<b>Datenqualität</b> fällt ab (Coverage ${(data.drift.coverageFirst * 100).toFixed(0)}% → ${(data.drift.coverageSecond * 100).toFixed(0)}%) — Tracking-Routine im 1:1 ansprechen.`
      );
    }
  }

  if (hebel.length === 0) {
    hebel.push(
      `Keine roten Flaggen — gutes Signal. Frage zur Vorlage: welche zwei Stakeholder bekommen in der nächsten Periode bewusst mehr/weniger Anteil?`
    );
  }

  const items = hebel
    .slice(0, 3)
    .map((h) => `<div class="lead-hebel-item">${h}</div>`)
    .join('');
  return `<div class="lead-hebel">
    <h3>Drei Hebel fürs 1:1</h3>
    ${items}
  </div>`;
}

/** Knapper KPI-Anhang am Ende — Referenzwerte für Detail-Fragen. */
function buildKpiAnhang(data: ReportData): string {
  const k = data.kpis;
  return `<div class="lead-kpi-mini">
    <div>Wallclock-Total <b>${fmtHours(k.totalWallclockMs)}</b></div>
    <div>Präsenz-Total <b>${fmtHours(k.totalPresenceMs)}</b></div>
    <div>Multi-Tasking <b>${k.multiTaskingFactor.toFixed(2)}x</b></div>
    <div>Produktiv-Quote <b>${k.productivePct.toFixed(0)}%</b></div>
  </div>`;
}
