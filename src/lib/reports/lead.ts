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
  interpretCoverage,
  interpretParallelFactor,
  interpretProductivePct,
  renderChangePointSection,
  renderDriftArrow,
  renderFindingsBlock,
  renderStakeholderDossier,
} from './shared';

export function renderLeadBody(data: ReportData): string {
  return `
    ${buildCockpit(data)}
    ${renderChangePointSection(data, 4)}
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
    belastungValue = `${hi} lange Tage`;
    belastungSub = `An ${hi} Tagen lag zwischen erstem und letztem Eintrag mehr als 10 Stunden — überdurchschnittlich lange Tage. <b>Im Gespräch fragen:</b> Was treibt diese Spitzen — Deadline, Personalengpass, bewusste Entscheidung? Und wirkt der Rhythmus tragfähig oder zehrt er?`;
  } else if (hi >= 1) {
    belastungValue = `${hi} lange${hi === 1 ? 'r' : ''} Tag${hi === 1 ? '' : 'e'}`;
    belastungSub = `Vereinzelte lange Tage über 10 Stunden, aber kein durchgängiges Muster. <b>Kurz anhaken:</b> War an diesen Tagen etwas Besonderes — Abgabe, Workshop, Reise — oder bewusst gewählte Intensität?`;
  } else {
    belastungClass = 'ampel-ok';
    belastungValue = `Ø ${fmtHoursShort(k.avgPresenceMsPerDay)} / Tag`;
    belastungSub = `Keine Tage über 10 Stunden, solide Routine. <b>Verstärker-Frage:</b> Was hilft dabei, diesen Rhythmus zu halten — und wo steckt die Reserve für besondere Phasen?`;
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
      schwerpunktSub = `Über ${top.pct.toFixed(0)}% der Zeit in einen einzigen Mandanten — Klumpen-Risiko. Wenn dieser Auftrag wegfällt, ändert sich die Auslastung schlagartig. <b>Im Gespräch fragen:</b> Ist diese Konzentration strategisch gewollt, oder steht Diversifikation als Auftrag an?`;
    } else if (top.pct >= 35) {
      schwerpunktSub = `${top.pct.toFixed(0)}% bei ${esc(top.name)} — klar erkennbarer Hauptmandant mit gesundem Portfolio daneben. <b>Im Gespräch fragen:</b> Stimmen die Anteile zur strategischen Wunsch-Mischung, oder driftet die Realität schleichend von der Planung weg?`;
    } else {
      schwerpunktClass = 'ampel-ok';
      schwerpunktSub = `Spitzenanteil bei ${top.pct.toFixed(0)}% — Arbeitszeit verteilt sich breit über mehrere Mandanten. <b>Im Gespräch fragen:</b> Ist die Verteilung bewusst-divers, oder fehlt ein klarer Schwerpunkt? Welche zwei Mandanten sollen in der nächsten Periode mehr Gewicht bekommen?`;
    }
  } else {
    schwerpunktValue = '—';
    schwerpunktSub = 'Zu wenig Datenbasis für eine Schwerpunkt-Aussage — im Gespräch nicht thematisieren.';
  }
  cards.push(`<div class="lead-three-card ${schwerpunktClass}">
    <div class="lead-three-h">Schwerpunkt</div>
    <div class="lead-three-v">${schwerpunktValue}</div>
    <div class="lead-three-s">${schwerpunktSub}</div>
  </div>`);

  // ── Datenqualität ────────────────────────────────────────────────
  const covPct = k.coverage * 100;
  let dqClass: 'ampel-warn' | 'ampel-ok' | '' = '';
  let dqValue = `${covPct.toFixed(0)}% erfasst`;
  let dqSub: string;
  if (covPct >= 80) {
    dqClass = 'ampel-ok';
    dqSub = `${covPct.toFixed(0)}% des Anwesenheitsfensters lückenlos erfasst — Detail-Aussagen tragen. <b>Im Gespräch:</b> Tracking ist hier kein Thema — nur kurze Anerkennung, dann zu Inhalten.`;
  } else if (covPct >= 60) {
    dqSub = `${covPct.toFixed(0)}% erfasst — brauchbar, mit kleineren Lücken. Tendenzen sind belastbar, Minuten-genaue Vergleiche weniger. <b>Frage am Rand:</b> Gibt es einen bestimmten Tages-Übergang (Mittag, Feierabend) der gern fehlt, oder Themen die schwer zu tracken sind?`;
  } else {
    dqClass = 'ampel-warn';
    dqSub = `Nur ${covPct.toFixed(0)}% des Tages erfasst — größere Lücken. Tendenzen stimmen, Detail-Aussagen mit Vorbehalt. <b>Im Gespräch fragen:</b> Braucht die Tracking-Routine Unterstützung — weniger Kategorien, einfachere Bedienung, fester Reminder?`;
  }
  if (data.drift) {
    const dCov = (data.drift.coverageSecond - data.drift.coverageFirst) * 100;
    if (Math.abs(dCov) >= 10) {
      dqValue += ` (${dCov > 0 ? '↑' : '↓'} ${Math.abs(dCov).toFixed(0)}pp)`;
      dqSub = dCov > 0
        ? `${covPct.toFixed(0)}% erfasst — Tracking-Disziplin steigt deutlich gegenüber der ersten Hälfte. <b>Im Gespräch:</b> Was hat den Unterschied gemacht — neuer Reminder, einfacheres Setup, mehr Übung? Verstärken, was funktioniert.`
        : `${covPct.toFixed(0)}% erfasst — Tracking-Disziplin sinkt in der zweiten Hälfte um ${Math.abs(dCov).toFixed(0)}pp. <b>Im Gespräch fragen:</b> Was ist passiert — neue Aufgaben-Art, technisches Problem, Motivations-Einbruch? Routine ansprechen, bevor die Datenbasis ganz wegbricht.`;
    }
  }
  cards.push(`<div class="lead-three-card ${dqClass}">
    <div class="lead-three-h">Tracking-Qualität</div>
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
  const f = renderFindingsBlock(data, 'lead');
  if (!f) return '';
  return `<h2>Was Aufmerksamkeit verdient</h2>${f}`;
}

/**
 * Drei Hebel fürs 1:1 — die konkreten Themen, die der Teamleader im
 * Mitarbeitergespräch ansprechen sollte. Datengetrieben.
 */
function buildHebel(data: ReportData): string {
  const hebel: string[] = [];

  // Klumpen-Hebel
  const top = data.breakdowns.stakeholders[0];
  if (top && top.pct >= 50) {
    hebel.push(
      `<b>Klumpen-Risiko bei ${esc(top.name)}</b> — mehr als die Hälfte der Zeit fließt in einen einzigen Mandanten. Frage: ist diese Konzentration strategisch gewollt, oder ist Diversifikation ein Auftrag für die nächsten Wochen?`
    );
  }

  // Auffälligster Mandant — Sammelhebel über mehrere Auffälligkeiten
  const oosSh = data.stakeholderProfiles
    .filter(
      (p) =>
        p.nonprodPct >= 30 || p.microTaskPct >= 30 || p.meetingHeavyPct >= 50
    )
    .sort((a, b) => b.pct - a.pct)[0];
  if (oosSh) {
    const marker: string[] = [];
    if (oosSh.microTaskPct >= 30)
      marker.push(`${oosSh.microTaskPct.toFixed(0)}% kurze Einträge`);
    if (oosSh.nonprodPct >= 30)
      marker.push(`${oosSh.nonprodPct.toFixed(0)}% nicht-produktiv`);
    if (oosSh.meetingHeavyPct >= 50)
      marker.push(`${oosSh.meetingHeavyPct.toFixed(0)}% in Terminen`);
    let frage = '';
    if (oosSh.microTaskPct >= 30) {
      frage = `Lässt sich ein Sammel-Termin etablieren (feste Sprechzeit), damit nicht jede Anfrage einzeln den Tag bricht?`;
    } else if (oosSh.meetingHeavyPct >= 50) {
      frage = `Welche dieser Termine wären als Mail / kurzes 1-Pager schneller — und für beide Seiten besser?`;
    } else {
      frage = `Geht hier viel Zeit in Verwaltung und Beziehungspflege — bewusst investiert, oder dehnt sich der Auftrag aus?`;
    }
    hebel.push(
      `<b>Mandat ${esc(oosSh.name)}</b> fällt mit ${marker.join(', ')} auf. ${frage}`
    );
  }

  // Belastungs-Muster
  if (data.weekday.highLoadDaysCount >= 3) {
    hebel.push(
      `<b>${data.weekday.highLoadDaysCount} besonders lange Tage</b> (über 10h Anwesenheit) im Zeitraum. Konkret heißt das: kein einmaliger Ausreißer, sondern ein wiederkehrendes Muster. Was ist der Engpass dahinter — fehlende Ressourcen, schlechte Priorisierung, oder bewusst gewählte Intensität?`
    );
  }

  // Lange Arbeitsphasen ohne Pause
  if (data.rhythm.burst.longBurstCount >= 3) {
    hebel.push(
      `<b>${data.rhythm.burst.longBurstCount} Arbeitsphasen über 3 Stunden ohne erfasste Pause</b>. Pausen sind nicht im Kalender, oder sie werden eingeplant aber nicht eingehalten? Beides hat andere Hebel.`
    );
  }

  // Doku-Lücke global
  if (data.disziplin.notizCoverage < 30 && data.kpis.entriesCount >= 30) {
    hebel.push(
      `<b>Nur ${data.disziplin.notizCoverage.toFixed(0)}% der Einträge haben einen Kommentar</b>. Konkret heißt das: beim nächsten Review (in 4 Wochen, oder bei einer Übergabe) fehlt der Kontext zu den meisten Slots. Ein-Wort-Disziplin reicht oft — als Standard im Team setzen?`
    );
  }

  // Tracking-Verschlechterung
  if (data.drift) {
    const dCov = (data.drift.coverageSecond - data.drift.coverageFirst) * 100;
    if (dCov <= -10) {
      hebel.push(
        `<b>Tracking-Genauigkeit fällt ab</b> — von ${(data.drift.coverageFirst * 100).toFixed(0)}% in der ersten Hälfte auf ${(data.drift.coverageSecond * 100).toFixed(0)}% in der zweiten. Konkret heißt das: die Datenbasis für künftige Berichte wird schlechter, wenn der Trend so weitergeht. Tracking-Routine ansprechen, bevor das Werkzeug seinen Wert verliert.`
      );
    }
  }

  if (hebel.length === 0) {
    hebel.push(
      `Keine roten Flaggen im Datenbild — gutes Signal. Im Gespräch ohne Krisen-Punkte arbeiten: welche zwei Mandanten sollen in der nächsten Periode bewusst mehr Gewicht bekommen, welche weniger?`
    );
  }

  const items = hebel
    .slice(0, 3)
    .map((h) => `<div class="lead-hebel-item">${h}</div>`)
    .join('');
  return `<div class="lead-hebel">
    <h3>Drei Themen fürs Mitarbeitergespräch</h3>
    ${items}
  </div>`;
}

/**
 * KPI-Anhang mit Benchmark-Skalen. Nackte Werte (1.23x, 47%) sind ohne
 * Maßstab nicht aussagekräftig — die Skala neben dem Wert gibt dem
 * Lead einen sofortigen Anker für Detail-Fragen im Gespräch.
 */
function buildKpiAnhang(data: ReportData): string {
  const k = data.kpis;
  const mt = interpretParallelFactor(k.multiTaskingFactor);
  const prod = interpretProductivePct(k.productivePct);
  const cov = k.coverage * 100;
  const covScale = interpretCoverage(cov);
  return `<div class="lead-kpi-mini">
    <div class="lead-kpi-tile">
      <div class="lead-kpi-h">Getrackte Zeit</div>
      <div class="lead-kpi-v">${fmtHours(k.totalWallclockMs)}</div>
      <div class="lead-kpi-s">Anwesenheit: ${fmtHours(k.totalPresenceMs)}</div>
    </div>
    <div class="lead-kpi-tile">
      <div class="lead-kpi-h">Parallel-Faktor</div>
      <div class="lead-kpi-v">${k.multiTaskingFactor.toFixed(2)}x <span class="scale-badge scale-${mt.level}">${mt.label}</span></div>
      <div class="lead-kpi-s">${mt.hint}</div>
    </div>
    <div class="lead-kpi-tile">
      <div class="lead-kpi-h">Produktiv-Anteil</div>
      <div class="lead-kpi-v">${k.productivePct.toFixed(0)}% <span class="scale-badge scale-${prod.level}">${prod.label}</span></div>
      <div class="lead-kpi-s">${prod.hint}</div>
    </div>
    <div class="lead-kpi-tile">
      <div class="lead-kpi-h">Tracking-Genauigkeit</div>
      <div class="lead-kpi-v">${cov.toFixed(0)}% <span class="scale-badge scale-${covScale.level}">${covScale.label}</span></div>
      <div class="lead-kpi-s">${covScale.hint}</div>
    </div>
  </div>`;
}
