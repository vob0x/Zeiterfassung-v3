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
  buildNextActionData,
  esc,
  fmtHours,
  formatHalfRange,
  interpretCoverage,
  interpretLeakPct,
  interpretOvertime,
  interpretParallelFactor,
  interpretReactiveShare,
  renderChangePointSection,
  renderCrisisBanner,
  renderDriftArrow,
  renderFindingsBlock,
  renderStakeholderDossier,
  renderTop3TimeFlow,
} from './shared';

export function renderLeadBody(data: ReportData): string {
  return `
    ${renderCrisisBanner(data)}
    ${buildCockpit(data)}
    ${renderChangePointSection(data, 4)}
    <h2>Mandanten-Dossiers</h2>
    ${buildDossiers(data)}
    ${buildTopTimeFlow(data)}
    ${buildDriftSection(data)}
    ${buildFindingsSection(data)}
    ${buildHebel(data)}
    ${buildNextAction(data)}
    ${buildKpiAnhang(data)}
  `;
}

/**
 * Welle 8.6 — eine konkrete 1:1-Frage, dialogisch formuliert. Liest
 * den Priority-Stack aus shared.buildNextActionData und wickelt das
 * Ergebnis in das Lead-Sprachregister (dialogisch, Frage statt
 * Anweisung).
 */
function buildNextAction(data: ReportData): string {
  const a = buildNextActionData(data);
  let sentence = '';
  switch (a.kind) {
    case 'strukturelles-stau-muster':
      sentence = `Im nächsten 1:1 mit der Person über <b>${esc(a.subject || '—')}</b> sprechen: was lässt sich am Auftrag konkret ändern (Volumen, Schnittstelle, Erwartung), damit dieses Projekt nicht weiter strukturell die Mehrarbeit treibt?`;
      break;
    case 'high-load-days-stau':
      sentence = `Im nächsten 1:1: die langen Tage benennen und die Stau-Frage stellen — welche Anfragen drücken Eigenarbeit in die Spitzen-Tage, was lässt sich vorab abräumen oder bündeln?`;
      break;
    case 'leak-high':
      sentence = `Im nächsten 1:1 nachhaken, wo der Versickerungs-Anteil von ${(a.value ?? 0).toFixed(0)} % konkret entsteht — welches Projekt, welcher Kontext? Selbsteinschätzung als „nicht produktiv" benennt die Quelle, wenn man sie gemeinsam ansieht.`;
      break;
    case 'reactive-high':
      sentence = `Im nächsten 1:1 fragen: bei ${(a.value ?? 0).toFixed(0)} % reaktiver Arbeit — was ist von der Eigenarbeit auf der Strecke geblieben, und braucht das gemeinsam Schutzraum?`;
      break;
    case 'klumpen-risiko':
      sentence = `Im nächsten 1:1 mit der Person über die Konzentration auf <b>${esc(a.subject || '—')}</b> sprechen (${(a.value ?? 0).toFixed(0)} % der Zeit) — strategisch gewollt, oder Diversifikation als Auftrag?`;
      break;
    case 'routine':
      sentence = `Im 1:1 ohne Krisen-Punkte: welche zwei Mandanten sollen in der nächsten Periode bewusst mehr Gewicht bekommen, welche weniger?`;
      break;
  }
  return `<div class="lead-hebel" style="margin-top:18px">
    <h3>Frage fürs nächste 1:1</h3>
    <div class="lead-hebel-item">${sentence}</div>
  </div>`;
}

/**
 * Cockpit mit drei Karten: Belastung, Schwerpunkt, Datenqualität.
 * Jede Karte hat eine Ampel-Klasse (warn/ok/neutral) und eine
 * Sub-Aussage mit Frage-Tendenz.
 */
function buildCockpit(data: ReportData): string {
  const k = data.kpis;
  const cards: string[] = [];

  // ── Belastung (Welle 8: Überstunden + 10-h-Tage zusammen) ────────
  // Cockpit-Karte verschränkt beide Belastungs-Signale: Überstunden als
  // vertragsrelative Aussage und die 10-h-Tage als gesundheitliche
  // Schwelle (10 h absolut, nicht workload-skaliert).
  let belastungClass: 'ampel-warn' | 'ampel-ok' | '' = '';
  let belastungValue: string;
  let belastungSub: string;
  const hi = data.weekday.highLoadDaysCount;
  const otScaleLead = interpretOvertime(k.overtimeMs, k.contractMs);
  const otRatioPctLead =
    k.contractMs > 0 ? (k.overtimeMs / k.contractMs) * 100 : 0;
  const otValueLead =
    k.contractMs <= 0
      ? '—'
      : k.overtimeMs > 0
        ? `+${fmtHours(k.overtimeMs)} (${otRatioPctLead.toFixed(0)} %)`
        : `−${fmtHours(k.undertimeMs)}`;
  const longDaySentence =
    hi === 0
      ? 'Kein einziger Tag über 10 Stunden — die gesundheitliche Schwelle wurde gehalten.'
      : hi === 1
        ? '1 Tag über 10 Stunden — im Toleranzbereich.'
        : `${hi} Tage über 10 Stunden — wiederkehrendes Belastungs-Signal.`;
  const otSentence =
    k.contractMs <= 0
      ? ''
      : k.overtimeMs > 0
        ? `Mehrarbeit ${otScaleLead.label} (+${fmtHours(k.overtimeMs)} auf ${fmtHours(k.contractMs)} Sollzeit).`
        : `Unter dem Vertrags-Soll (${fmtHours(k.contractMs)}), Differenz ${fmtHours(k.undertimeMs)}.`;
  // Welle 8.4 — Attribution als zweite Zeile in der Karte (kursiv,
  // klein, mit Methoden-Hinweis). Nur bei tatsächlicher Mehrarbeit.
  let attributionLine = '';
  if (k.overtimeMs > 0 && data.overtimeAttribution.length > 0) {
    const top = data.overtimeAttribution.slice(0, 2);
    const parts = top
      .map((r) => `${esc(r.projekt)} (${fmtHours(r.ms)})`)
      .join(', ');
    attributionLine = ` <i>Mehrarbeit lief vor allem in: ${parts} — nach Tagesreihenfolge zugeordnet.</i>`;
  }
  if (otScaleLead.level === 'high' || hi >= 3) {
    belastungClass = 'ampel-warn';
    belastungSub = `${otSentence} ${longDaySentence}${attributionLine} <b>Im Gespräch fragen:</b> Was treibt diese Mehrarbeit — Deadline, Personalengpass, eine bewusste Entscheidung? Trägt der Rhythmus, oder zehrt er?`;
  } else if (otScaleLead.level === 'elevated' || hi >= 1) {
    belastungSub = `${otSentence} ${longDaySentence}${attributionLine} <b>Kurz anhaken:</b> War an diesen Tagen etwas Besonderes (Abgabe, Workshop, Reise), oder verdichtet sich das Muster?`;
  } else {
    belastungClass = 'ampel-ok';
    belastungSub = `${otSentence} ${longDaySentence} <b>Verstärker-Frage:</b> Was hilft dabei, diesen Rhythmus zu halten — und wo steckt die Reserve für besondere Phasen?`;
  }
  belastungValue =
    k.contractMs > 0
      ? `${otValueLead} · ${hi} 10-h-Tage`
      : `${hi} 10-h-Tage`;
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

  // ── Reaktivität (Welle 6, REPORT-PHASE-C) ─────────────────────────
  // Bei Team COM (NDB) ist das die entscheidende Profil-Achse: wie viel
  // der Periode war fremdgetrieben (Medienanfragen, BGÖ, Bürger,
  // Politische Geschäfte, Krise) und wie viel war Eigen-Arbeit?
  const reactScale = interpretReactiveShare(k.reactivePct);
  let reactClass: 'ampel-warn' | 'ampel-ok' | '' = '';
  if (reactScale.level === 'high') reactClass = 'ampel-warn';
  else if (reactScale.level === 'normal' && k.reactivePct < 20) reactClass = 'ampel-ok';
  const reactValue = `${k.reactivePct.toFixed(0)}% reaktiv`;
  let reactSub: string;
  if (k.reactivePct >= 60) {
    reactSub = `Über ${k.reactivePct.toFixed(0)}% der Arbeitszeit lief in reaktiven Projekten (Anfragen, BGÖ, Krise). <b>Im Gespräch fragen:</b> War das eine Eskalations-Phase oder dauerhafter Zustand? Welche Eigen-Vorhaben sind dabei liegengeblieben?`;
  } else if (k.reactivePct >= 40) {
    reactSub = `${k.reactivePct.toFixed(0)}% in reaktiven Projekten — jede dritte bis zweite Stunde war fremdgetrieben. <b>Im Gespräch fragen:</b> Welche reaktiven Themen waren die größten Treiber? Gibt es etwas, das proaktiv geklärt werden könnte?`;
  } else if (k.reactivePct >= 20) {
    reactSub = `${k.reactivePct.toFixed(0)}% reaktive Arbeit — gesundes Verhältnis von Eigen- und Anfragen-Arbeit. <b>Im Gespräch:</b> Routine trägt, kein Hebel akut nötig.`;
  } else {
    reactSub = `Nur ${k.reactivePct.toFixed(0)}% in reaktiven Projekten — die Person hatte Raum für Eigen-Vorhaben. <b>Im Gespräch fragen:</b> Was ist konkret aus diesem Raum entstanden? Wurde er für Strategie / Konzeption genutzt?`;
  }
  cards.push(`<div class="lead-three-card ${reactClass}">
    <div class="lead-three-h">Reaktivität</div>
    <div class="lead-three-v">${reactValue}</div>
    <div class="lead-three-s">${reactSub}</div>
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

  // Welle 6 — vier Karten statt drei (Reaktivität als zusätzliche Achse).
  // CSS-Klasse `lead-four` wird im Style-Block definiert.
  return `<div class="lead-four">${cards.join('')}</div>`;
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
 * Welle 8.2 — Top-3-Zeitfresser-Satz für den Lead direkt vor der
 * Drift-Tabelle. Antwortet konkret „wo geht die Zeit hin?" in
 * Stunden statt nur in Prozent — ein Anker für die Drift-Lektüre.
 */
function buildTopTimeFlow(data: ReportData): string {
  const sentence = renderTop3TimeFlow(data.breakdowns.projekte);
  if (!sentence) return '';
  return `<p class="chef-mix-hint" style="margin-top:18px">${sentence}</p>`;
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

  const rangeFirst = formatHalfRange(
    data.trend.firstHalfFrom,
    data.trend.firstHalfTo
  );
  const rangeSecond = formatHalfRange(
    data.trend.secondHalfFrom,
    data.trend.secondHalfTo
  );
  return `<h2>Verschiebung im Zeitraum (${rangeFirst} vs. ${rangeSecond})</h2>
  <table class="lead-drift">
    <thead><tr><th>Achse</th><th class="num">${rangeFirst}</th><th class="num">${rangeSecond}</th><th class="num">Δ</th></tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table>`;
}

function buildFindingsSection(data: ReportData): string {
  const f = renderFindingsBlock(data, 'lead');
  if (!f) return '';
  return `<h2>Stellen, an denen sich Nachfragen lohnt</h2>${f}`;
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

  // Auffälligster Mandant — Sammelhebel über mehrere Auffälligkeiten.
  // Welle 6: bei reaktiv-dominanten Mandanten ist „Sammel-Termin" der
  // falsche Hebel — die Person macht ihren Job. Frage wird umgedeutet
  // auf Triage-Qualität.
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
    const isReactiveDominant = oosSh.reactiveCategoryShare >= 50;
    let frage = '';
    if (oosSh.microTaskPct >= 30 && isReactiveDominant) {
      frage = `Triage-Mandant — kurze Slots sind hier der Job. Frag im Gespräch nicht „kannst du sammeln", sondern: läuft die Triage rund? Gibt es Anfragen, die zu lange liegen oder zwischen Zuständigkeiten verloren gehen?`;
    } else if (oosSh.microTaskPct >= 30) {
      frage = `Lässt sich ein Sammel-Termin etablieren (feste Sprechzeit), damit nicht jede Anfrage einzeln den Tag bricht?`;
    } else if (oosSh.meetingHeavyPct >= 50) {
      frage = `Welche dieser Termine wären als Mail oder kurzes Ein-Pager schneller — und für beide Seiten besser?`;
    } else {
      frage = `Geht hier viel Zeit in Verwaltung und Beziehungspflege — bewusst investiert, oder dehnt sich der Auftrag aus?`;
    }
    hebel.push(
      `<b>Mandat ${esc(oosSh.name)}</b> fällt mit ${marker.join(', ')} auf. ${frage}`
    );
  }

  // Belastungs-Muster
  const longDayRatioLead = data.kpis.workingDays > 0
    ? data.weekday.highLoadDaysCount / data.kpis.workingDays
    : 0;
  if (data.weekday.highLoadDaysCount >= 2 && longDayRatioLead > 0.20) {
    hebel.push(
      `<b>${data.weekday.highLoadDaysCount} besonders lange Tage</b> (über 10 h Anwesenheit) im Zeitraum. Kein einmaliger Ausreißer, sondern ein wiederkehrendes Muster. Was ist der Engpass dahinter — fehlende Ressourcen, schlechte Priorisierung, oder bewusst gewählte Intensität?`
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
      `<b>Nur ${data.disziplin.notizCoverage.toFixed(0)} % der Einträge haben einen Kommentar</b>. Beim nächsten Review (in vier Wochen, oder bei einer Übergabe) fehlt der Kontext zu den meisten Slots. Ein-Wort-Disziplin reicht oft — als Standard im Team setzen?`
    );
  }

  // Tracking-Verschlechterung
  if (data.drift) {
    const dCov = (data.drift.coverageSecond - data.drift.coverageFirst) * 100;
    if (dCov <= -10) {
      hebel.push(
        `<b>Tracking-Genauigkeit fällt ab</b> — von ${(data.drift.coverageFirst * 100).toFixed(0)} % in der ersten Hälfte auf ${(data.drift.coverageSecond * 100).toFixed(0)} % in der zweiten. Die Datenbasis für künftige Berichte wird schlechter, wenn der Trend so weitergeht. Tracking-Routine ansprechen, bevor das Werkzeug seinen Wert verliert.`
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
  // Welle 6 — Versickerungs-Modell ersetzt die Produktiv-Skala. Der
  // Wert kommt aus der bewussten „Nicht produktiv"-Markierung der
  // Person, nicht aus dem Komplement der Produktiv-Quote.
  const leak = interpretLeakPct(k.leakPct);
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
      <div class="lead-kpi-h">Versickerungs-Anteil</div>
      <div class="lead-kpi-v">${k.leakPct.toFixed(0)}% <span class="scale-badge scale-${leak.level}">${leak.label}</span></div>
      <div class="lead-kpi-s">${leak.hint}</div>
    </div>
    <div class="lead-kpi-tile">
      <div class="lead-kpi-h">Tracking-Genauigkeit</div>
      <div class="lead-kpi-v">${cov.toFixed(0)}% <span class="scale-badge scale-${covScale.level}">${covScale.label}</span></div>
      <div class="lead-kpi-s">${covScale.hint}</div>
    </div>
  </div>`;
}
