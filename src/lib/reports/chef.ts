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
  fmtHoursWithPct,
  formatHalfRange,
  interpretOvertime,
  renderTrackingQualityNote,
  interpretReactiveShare,
  renderBars,
  renderCrisisBanner,
  renderDriftArrow,
  renderFindingsBlock,
  renderTop3TimeFlow,
} from './shared';

export function renderChefBody(data: ReportData): string {
  return `
    ${renderCrisisBanner(data)}
    ${buildHeadlines(data)}
    ${buildTopTimeFlow(data)}
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

  // Versickerungs-Anteil (Welle 6, REPORT-PHASE-C). Tausch der
  // bisherigen Produktiv-Headline durch die ehrlichere Selbsteinschätzung
  // „Nicht produktiv". Hoher Wert ist die Warnung, nicht das Normale.
  let outputHead: string;
  if (k.leakPct < 10) {
    outputHead = `<b>Sehr fokussierte Periode:</b> nur ${k.leakPct.toFixed(0)}% der Zeit (${fmtHours(k.leakMs)}) wurden im Tracker explizit als „nicht produktiv" markiert. Versickerung nahe null — die Routine trägt, kein operativer Hebel nötig.`;
  } else if (k.leakPct < 25) {
    outputHead = `<b>Geringe Versickerung:</b> ${k.leakPct.toFixed(0)}% der Zeit (${fmtHours(k.leakMs)}) wurden als „nicht produktiv" markiert. Üblicher Anteil — leichtes Grundrauschen, kein Steuerungs-Thema.`;
  } else if (k.leakPct < 40) {
    outputHead = `<b>Auffälliger Versickerungs-Anteil:</b> ${k.leakPct.toFixed(0)} % der Zeit (${fmtHours(k.leakMs)}) wurden als „nicht produktiv" markiert. Die Person markiert diesen Anteil selbst als verloren — die Frage ist, wo sich das sammelt: welches Projekt, welcher Kontext, welche Tageszeit?`;
  } else {
    outputHead = `<b>Versickerung dominiert:</b> ${k.leakPct.toFixed(0)}% der Zeit (${fmtHours(k.leakMs)}) wurden als „nicht produktiv" markiert. Über 40 % selbst als verschwendet markiert: bevor weiter operativ gesteuert wird, identifizieren, welches Projekt oder welcher Kontext-Wechsel den größten Anteil trägt.`;
  }
  heads.push(outputHead);

  // Reaktivitäts-Index (Welle 6) — bei fremdgetriebenen Teams (Team COM)
  // ist das die wichtigste Profil-Aussage. Beschreibt die Phase, nicht
  // die Person — niedrig = Strategie, hoch = Anfragen-Last.
  const reactScale = interpretReactiveShare(k.reactivePct);
  let reactHead: string;
  if (k.reactivePct >= 60) {
    reactHead = `<b>Reaktiv-Last dominiert die Periode:</b> ${k.reactivePct.toFixed(0)}% der Arbeitszeit (${fmtHours(k.reactiveMs)}) lief in reaktiven Projekten — Medienanfragen, BGÖ, Bürger, Krise, politische Geschäfte. Eigen-Arbeit hatte kaum Raum. Strategie-Themen für die nächste Periode bewusst blocken — sonst läuft die Reaktiv-Last weiter alles andere mit weg.`;
  } else if (k.reactivePct >= 40) {
    reactHead = `<b>Belebte Reaktiv-Phase:</b> ${k.reactivePct.toFixed(0)}% der Arbeitszeit (${fmtHours(k.reactiveMs)}) in reaktiven Projekten — jede dritte bis zweite Stunde fremdgetrieben. Eigen-Arbeit kommt noch durch. Konkret prüfen: gibt es Trigger, die proaktiv geklärt werden könnten?`;
  } else if (k.reactivePct >= 20) {
    reactHead = `<b>Normaler Betrieb:</b> ${k.reactivePct.toFixed(0)} % reaktive Arbeit (${fmtHours(k.reactiveMs)}) — gesundes Verhältnis von eigener und fremdgetriebener Arbeit. Die Person konnte sowohl auf Anfragen reagieren als auch eigene Themen vorantreiben.`;
  } else {
    reactHead = `<b>Strategiephase:</b> nur ${k.reactivePct.toFixed(0)}% reaktive Arbeit (${fmtHours(k.reactiveMs)}) — die Periode hatte Raum für Eigen-Vorhaben. Konkret prüfen: ist dieser Raum produktiv genutzt worden, oder bleibt er ungefüllt? Skala-Einordnung: ${esc(reactScale.hint)}`;
  }
  heads.push(reactHead);

  // Konzentration
  const top = data.breakdowns.stakeholders[0];
  if (top) {
    let concHead: string;
    if (top.pct >= 50) {
      concHead = `<b>Klare Konzentration auf einen Mandanten:</b> <b>${esc(top.name)}</b> bindet ${top.pct.toFixed(0)} % der Zeit. Das ist ein Klumpen-Risiko: wenn dieser Auftrag wegfällt, ändert sich die Auslastung schlagartig. ${data.breakdowns.stakeholders.length} Mandanten und ${data.breakdowns.projekte.length} Projekte im Bewegungsfeld.`;
    } else if (top.pct >= 30) {
      concHead = `<b>Klar erkennbarer Hauptmandant:</b> <b>${esc(top.name)}</b> mit ${top.pct.toFixed(0)} % Anteil, daneben ein Portfolio von ${data.breakdowns.stakeholders.length} aktiven Mandanten und ${data.breakdowns.projekte.length} Projekten. Stabile Mischung, kein Klumpen.`;
    } else {
      concHead = `<b>Breit verteilte Arbeitszeit:</b> der größte Mandant (${esc(top.name)}) liegt bei nur ${top.pct.toFixed(0)} %. ${data.breakdowns.stakeholders.length} aktive Mandanten teilen sich die Aufmerksamkeit. Kein akutes Klumpen-Thema, aber eventuell ein Hinweis auf zu breite Streuung.`;
    }
    heads.push(concHead);
  }

  // Parallel-Arbeit (Multi-Tasking)
  if (k.multiTaskingFactor > 1.4) {
    heads.push(`<b>Hohe Parallel-Last:</b> pro erfasster Arbeitsstunde fielen ${k.multiTaskingFactor.toFixed(2)} h Aufgaben an. Heißt: oft liefen mehrere Themen gleichzeitig im selben Slot — bewusste Mehr-Mandanten-Steuerung, oder Hinweis auf parallel laufende Tracker, die nicht gestoppt wurden. Eine Stichprobe lohnt sich.`);
  } else if (k.multiTaskingFactor > 1.15) {
    heads.push(`<b>Moderate Parallel-Last:</b> pro erfasster Arbeitsstunde rund ${k.multiTaskingFactor.toFixed(2)} h Aufgaben gebucht. Üblicher Anteil paralleler Arbeit, etwa wenn Mandanten in einem gemeinsamen Slot besprochen werden.`);
  } else {
    heads.push(`<b>Sequenzielle Arbeit:</b> Parallel-Faktor ${k.multiTaskingFactor.toFixed(2)} — die Person macht ein Ding nach dem anderen, kaum Mehrfachzuordnung pro Slot.`);
  }

  // Welle 8 — Überstunden-Headline. Direkt nach Reaktivität, weil
  // sie das prägende operative Signal für den Linien-Chef ist: zeigt,
  // ob das Soll gehalten wurde oder nicht — vertraglich, anteilig für
  // Teilzeit-Personen.
  const otScale = interpretOvertime(k.overtimeMs, k.contractMs);
  const otRatioPct =
    k.contractMs > 0 ? (k.overtimeMs / k.contractMs) * 100 : 0;
  const wlNote =
    k.workloadPct < 100
      ? ` Bei ${k.workloadPct.toFixed(0)} % Beschäftigungsgrad anteilig gerechnet.`
      : '';
  // Welle 9 — Tracking-Disziplin-Hinweis bei ungetrackten Lücken.
  const methodNote = renderTrackingQualityNote(
    k.totalPresenceMs,
    k.totalWallclockMs,
    k.pauseDeductMs
  );
  let otHead: string;
  if (k.contractMs <= 0) {
    otHead = `<b>Überstunden:</b> zu wenig Arbeitstage im Zeitraum für eine tragfähige Aussage.`;
  } else if (k.overtimeMs > 0) {
    otHead = `<b>Überstunden ${otScale.label}:</b> ${fmtHours(k.effectiveWorkTimeMs)} Arbeitszeit (Präsenz minus 45-min-Pause) vs. ${fmtHours(k.contractMs)} Soll — +${fmtHours(k.overtimeMs)} (${otRatioPct.toFixed(0)} %).${wlNote} ${esc(otScale.hint)}${methodNote}`;
  } else {
    otHead = `<b>Unter dem Vertrags-Soll:</b> ${fmtHours(k.effectiveWorkTimeMs)} Arbeitszeit gegenüber ${fmtHours(k.contractMs)} Soll, −${fmtHours(k.undertimeMs)}.${wlNote} Urlaubsanteil, Krankheit oder geringere Auslastung — keine Mehrarbeit zu steuern.${methodNote}`;
  }
  heads.push(otHead);

  // Welle 8.4 — Attribution: in welche Projekte floss die Mehrarbeit?
  // Erscheint nur bei vorhandener Überzeit. Methoden-Hinweis bei der
  // ersten Nennung in der Brille (eingeklammert, kursiv).
  if (k.overtimeMs > 0 && data.overtimeAttribution.length > 0) {
    const top = data.overtimeAttribution.slice(0, 3);
    const parts = top.map((r) => `<b>${esc(r.projekt)}</b> (${fmtHours(r.ms)})`);
    const list =
      parts.length === 1
        ? parts[0]
        : parts.length === 2
          ? `${parts[0]} und ${parts[1]}`
          : `${parts.slice(0, -1).join(', ')} und ${parts[parts.length - 1]}`;
    heads.push(
      `<b>Mehrarbeit floss vor allem in:</b> ${list}. <span class="cp-inline">(nach Tagesreihenfolge der Slots zugeordnet)</span>`
    );
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
 * Welle 8.2 — Top-3-Zeitfresser-Block. Antwortet konkret auf
 * "Wo geht die Zeit hin?" — der Chef bekommt sofort drei Projekte
 * mit Stundenwerten, nicht nur Prozentanteile.
 */
function buildTopTimeFlow(data: ReportData): string {
  const sentence = renderTop3TimeFlow(data.breakdowns.projekte);
  if (!sentence) return '';
  return `<p class="chef-mix-hint">${sentence}</p>`;
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
        // Welle 8.2 — Stunden zusätzlich zum Anteil. Beantwortet
        // "Wo geht die Zeit hin?" konkret, nicht nur relativ.
        return `<div class="chef-pair">
          <div class="chef-pair-name">${esc(r.name)}</div>
          <div class="chef-pair-pct">${fmtHoursWithPct(r.ms, r.pct)}</div>
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
 * Format-Mix. Auf Top-5 begrenzt um nicht zu erschlagen. Voran eine
 * Aussage-Zeile mit den dominanten Anteilen — sonst sind die Bars nur
 * eine Stütze ohne Schlussfolgerung.
 */
function buildOperativerMix(data: ReportData): string {
  const topTaet = data.breakdowns.taetigkeiten[0];
  const topFormat = data.breakdowns.formate[0];
  const hints: string[] = [];
  if (topTaet && topTaet.pct >= 35) {
    hints.push(
      `Tätigkeits-Schwergewicht <b>${esc(topTaet.name)}</b> bei ${topTaet.pct.toFixed(0)}%`
    );
  }
  if (topFormat && topFormat.pct >= 45) {
    hints.push(
      `Format-Schwergewicht <b>${esc(topFormat.name)}</b> bei ${topFormat.pct.toFixed(0)}%`
    );
  }
  const hintLine =
    hints.length > 0
      ? `<p class="chef-mix-hint">${hints.join(' · ')} — dominante Achsen im Tagesgeschäft.</p>`
      : '';
  return `${hintLine}<div class="chef-matrix">
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
          reactiveShare: 'Reaktiv-Anteil',
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

  const rangeFirst = formatHalfRange(
    data.trend.firstHalfFrom,
    data.trend.firstHalfTo
  );
  const rangeSecond = formatHalfRange(
    data.trend.secondHalfFrom,
    data.trend.secondHalfTo
  );
  return `<h2>Verschiebung im Zeitraum (${rangeFirst} vs. ${rangeSecond})</h2>
  <table class="chef-drift-table">
    <thead><tr><th>Achse</th><th class="num">${rangeFirst}</th><th class="num">${rangeSecond}</th><th class="num">Veränderung</th></tr></thead>
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
 * Chef-Closing — EINE priorisierte Empfehlung, nicht die Wiederholung
 * aller Headlines. Reihenfolge: Datenqualität zuerst (sonst trägt der
 * Bericht nicht), dann Composite-Befunde, dann Klumpen, dann Multi-
 * Tasking, dann Output-Engpass. Wenn nichts greift: Routine.
 */
function buildClosing(data: ReportData): string {
  const action = pickPriorityAction(data);
  return `<div class="chef-closing">
    <b>Nächster Hebel.</b> ${action}
  </div>`;
}

/**
 * Wählt die wichtigste operative Konsequenz aus dem Datenbild aus.
 * Genau eine Empfehlung, damit der Closing-Block nicht zur Wiederholung
 * der Headlines verkommt.
 *
 * Welle 8.6 — das strukturelle Stau-Muster (Cross-Finding aus 8.5)
 * gewinnt vor allen anderen Heuristiken, weil es die Synthese-Aussage
 * ist: dort steht, was sich nicht in normaler Arbeitszeit erledigen
 * lässt, und das ist die zentrale Steuerungs-Frage.
 */
function pickPriorityAction(data: ReportData): string {
  const k = data.kpis;
  const top = data.breakdowns.stakeholders[0];

  // 0. Welle 8.6 — strukturelles Stau-Muster gewinnt vor allem.
  const stauFinding = data.findings.find(
    (f) => f.kind === 'strukturelles-stau-muster'
  );
  if (stauFinding) {
    const topOt = data.overtimeAttribution[0];
    const projekt = topOt ? esc(topOt.projekt) : 'das treibende Projekt';
    return `Steuerungs-Gespräch zu <b>${projekt}</b>: was lässt sich am Auftrags-Volumen ändern, was an der Ressourcen-Zuordnung? Solange dieses Projekt strukturell die Mehrarbeit treibt, schiebt jede andere Maßnahme nur Symptome.`;
  }

  // 1. Datenqualität — wenn das nicht steht, tragen die Detail-Schlüsse nicht.
  if (k.coverage < 0.6) {
    return `Tracking-Routine als erstes stabilisieren — die Datenbasis ist mit ${(k.coverage * 100).toFixed(0)} % zu dünn für belastbare Detail-Schlüsse aus diesem Bericht. Erst die Erfassung in den Griff bekommen, dann inhaltlich steuern.`;
  }

  // 2. Composite-Befunde — diese fassen mehrere Schwächen zusammen
  const warnComposite = data.composites.find((c) => c.level === 'warn');
  if (warnComposite) {
    return `${warnComposite.diagnosis} <b>Maßnahme:</b> ${warnComposite.hebel}`;
  }

  // 3. Klumpen-Verstärkung — strategisches Risiko, kein Detail-Thema
  if (data.drift) {
    const dShare = data.drift.top1ShareSecond - data.drift.top1ShareFirst;
    if (dShare >= 8 && data.drift.top1ShareSecond >= 50) {
      return `Klumpen-Risiko bei <b>${esc(data.drift.topShNameSecond)}</b> verstärkt sich (${data.drift.top1ShareFirst.toFixed(0)}% → ${data.drift.top1ShareSecond.toFixed(0)}%). Entweder Diversifikation als bewussten Auftrag für die nächsten Wochen setzen, oder die strategische Großmandat-Logik schriftlich bestätigen.`;
    }
  }

  // 4. Multi-Tasking auffällig — Hygiene oder bewusste Wahl
  if (k.multiTaskingFactor > 1.5) {
    return `Parallel-Faktor ${k.multiTaskingFactor.toFixed(2)} — pro echter Arbeitsstunde wurden über 1.5 h Aufgaben gebucht. Konkret: Tracker-Hygiene prüfen (vergessene laufende Tracker bei Wechseln) — falls die Disziplin steht, bewusste Mehr-Mandanten-Steuerung im Team-Standard verankern.`;
  }

  // 5. Hoher Versickerungs-Anteil (Welle 6) — wenn die Person selbst
  // 40%+ als „nicht produktiv" markiert, ist das ein dringender
  // operativer Hinweis, unabhängig vom Hauptmandanten.
  if (k.leakPct >= 40) {
    return `Versickerungs-Anteil bei ${k.leakPct.toFixed(0)}% — über 40 % der Zeit als „nicht produktiv" selbsteingestuft. Quellen identifizieren (welche Projekte, welche Kontexte) und gezielt eingreifen — das ist nicht Tracker-Streuung, das ist eine bewusste Selbstmessung.`;
  }
  if (top && k.leakPct >= 25) {
    return `Bei <b>${esc(top.name)}</b> als Hauptmandant: Versickerungs-Anteil ${k.leakPct.toFixed(0)}% (${fmtHours(k.leakMs)}) als „nicht produktiv" markiert. Mandats-Schnitt prüfen — bindet der Auftrag in einem Maß, dass Wertschöpfung untergeht?`;
  }

  // Default: keine roten Flaggen, Routine trägt. Welle 9.3 — aktiv vs.
  // tatsächlich unauffällig trennen, "ruhig" verschwindet ganz.
  const routineActive =
    k.overtimeMs > 0 ||
    (k.contractMs > 0 && k.effectiveWorkTimeMs > k.contractMs * 1.05);
  if (routineActive) {
    return `Aktive Periode (Mehrarbeit gegenüber Soll), aber kein einzelnes Steuerungs-Thema sticht heraus. Beobachten, ob beim nächsten Bericht ein Muster sichtbar wird — bis dahin im Stand der gewohnten Steuerung weiterfahren.`;
  }
  return `Keine akuten Hebel — Lage beobachten, im Stand der gewohnten Steuerung weiterfahren. Energie für die nächste Periode anderweitig setzen.`;
}
