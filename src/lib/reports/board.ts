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
  buildNextActionData,
  esc,
  fmtHours,
  fmtHoursShort,
  interpretLeakPct,
  interpretOvertime,
  renderTrackingQualityNote,
  interpretReactiveShare,
  renderBars,
  renderCrisisBanner,
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

  // Profil-Karte: Versickerungs-Anteil (Welle 6, REPORT-PHASE-C).
  // Die Selbsteinschätzung „Nicht produktiv" ist die ehrlichere Aussage
  // als ein nackter Produktiv-Anteil — sie misst, was die Person selbst
  // als verschwendet markiert hat. Hoher Wert ist die Warnung.
  const profilSubParts: string[] = [];
  profilSubParts.push(
    `${covPct.toFixed(0)}% des Tages lückenlos erfasst (Tracking-Genauigkeit).`
  );
  if (k.multiTaskingFactor > 1.2) {
    profilSubParts.push(
      `Pro erfasster Arbeitsstunde fielen ${k.multiTaskingFactor.toFixed(1)} Stunden Aufgaben an — Hinweis auf parallele Stakeholder-Arbeit.`
    );
  }
  const leakScale = interpretLeakPct(k.leakPct);
  heroRows.push(`<div class="board-hero-cell">
    <div class="board-hero-label">Profil</div>
    <div class="board-hero-value">${k.leakPct.toFixed(0)}% Versickerung <span class="scale-badge scale-${leakScale.level}">${leakScale.label}</span></div>
    <div class="board-hero-sub">Anteil der Zeit, die im Tracker explizit als „nicht produktiv" markiert wurde — Selbsteinschätzung der Person, nicht algorithmische Bewertung. ${profilSubParts.join(' ')}</div>
  </div>`);

  // Reaktivitäts-Cell (Welle 6) — strategische Profil-Aussage. Bei
  // fremdgetriebenen Behörden-Teams ist das oft die wichtigste Cell.
  const reactScale = interpretReactiveShare(k.reactivePct);
  heroRows.push(`<div class="board-hero-cell">
    <div class="board-hero-label">Reaktivität</div>
    <div class="board-hero-value">${k.reactivePct.toFixed(0)}% <span class="scale-badge scale-${reactScale.level}">${reactScale.label}</span></div>
    <div class="board-hero-sub">Anteil der Arbeitszeit in reaktiven Projekten (Medienanfragen, BGÖ, Bürger, Krise, politische Geschäfte). Beschreibt das Profil der Periode — niedrig heißt Strategie-Raum, hoch heißt fremdgetriebener Betrieb.</div>
  </div>`);

  // Welle 8 — Überstunden-Cell. Strategische Profil-Aussage: liegt die
  // Periode unter, im Rahmen oder über dem Vertrags-Soll? Bei Teilzeit-
  // Personen anteilig gekürzt (workloadPct skaliert das Soll).
  const otScale = interpretOvertime(k.overtimeMs, k.contractMs);
  const otRatioPct =
    k.contractMs > 0 ? (k.overtimeMs / k.contractMs) * 100 : 0;
  let otValue: string;
  let otSub: string;
  if (k.contractMs <= 0) {
    otValue = '—';
    otSub = 'Zu wenig Arbeitstage im Zeitraum für eine Überstunden-Aussage.';
  } else if (k.overtimeMs > 0) {
    otValue = `+${fmtHours(k.overtimeMs)} <span class="scale-badge scale-${otScale.level}">${otScale.label}</span>`;
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
    // Welle 8.4 — Beleg: in welches Projekt floss die Mehrarbeit?
    // Methoden-Hinweis dezent (kursiv eingeklammert).
    const topOt = data.overtimeAttribution[0];
    const attrNote = topOt
      ? ` Dominantes Projekt in der Überzeit: <b>${esc(topOt.projekt)}</b> (${fmtHours(topOt.ms)}) — <i>nach Tagesreihenfolge zugeordnet.</i>`
      : '';
    otSub = `Arbeitszeit (Präsenz minus 45-min-Pause): ${fmtHours(k.effectiveWorkTimeMs)} vs. Soll ${fmtHours(k.contractMs)} (${k.workloadPct.toFixed(0)} % × 8 h 24 min × ${k.workingDays} Arbeitstage), Saldo ${otRatioPct.toFixed(0)} %.${wlNote}${methodNote}${attrNote}`;
  } else {
    otValue = `−${fmtHours(k.undertimeMs)}`;
    otSub = `Arbeitszeit (Präsenz minus Pause): ${fmtHours(k.effectiveWorkTimeMs)} — ${fmtHours(k.undertimeMs)} unter Soll von ${fmtHours(k.contractMs)}. Urlaubstage, Krankheit oder geringere Auslastung.`;
  }
  heroRows.push(`<div class="board-hero-cell">
    <div class="board-hero-label">Überstunden</div>
    <div class="board-hero-value">${otValue}</div>
    <div class="board-hero-sub">${otSub}</div>
  </div>`);

  const heroHtml = `<div class="board-hero">
    <div class="board-hero-row">${heroRows.join('')}</div>
  </div>`;

  // ── Verteilungsbild — Top-3 Stakeholder + Top-3 Projekte ─────────
  const pies = `<div class="board-pies">
    <div>
      <h3>Stakeholder</h3>
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

  // Welle 8.6 — strategischer Hebel als Headline-Zeile am Schluss.
  // Kein Absatz, kein Block — eine Aussage, eine Zeile.
  const nextAction = buildNextActionLine(data);

  return renderCrisisBanner(data) +
    heroHtml + pies + `<div class="board-trend">${trendSentence}</div>` +
    (findings ? `<h2>Strategischer Hinweis</h2>${findings}` : '') +
    nextAction +
    disclaimer;
}

/**
 * Welle 8.6 — strategische Hebel-Zeile für die kommende Periode.
 * Eine Headline, kein Absatz. Liest den Priority-Stack aus shared
 * und wickelt das Ergebnis ins Board-Register (kurz, abstrakt,
 * strategisch).
 */
function buildNextActionLine(data: ReportData): string {
  const a = buildNextActionData(data);
  let sentence = '';
  switch (a.kind) {
    case 'strukturelles-stau-muster':
      sentence = `Anforderungs-Volumen und Ressourcen-Zuordnung bei <b>${esc(a.subject || '—')}</b> auf den Prüfstand.`;
      break;
    case 'high-load-days-stau':
      sentence = `Eigenarbeit gegen Reaktiv-Druck schützen — wiederkehrende Belastungs-Spitzen begrenzen.`;
      break;
    case 'leak-high':
      sentence = `Versickerungs-Quellen identifizieren und an der Quelle eindämmen.`;
      break;
    case 'reactive-high':
      sentence = `Strategie-Räume gegen die Reaktiv-Last reservieren.`;
      break;
    case 'klumpen-risiko':
      sentence = `Bewusst entscheiden, ob die Priorisierung auf <b>${esc(a.subject || '—')}</b> so weitergetragen wird, oder ob andere Stakeholder in der kommenden Periode bewusst Raum bekommen sollen.`;
      break;
    case 'routine':
      // Welle 9.3 — aktiv vs. unauffällig differenzieren, "ruhig" raus.
      sentence = a.routineActive
        ? `Stand: aktiv (Mehrarbeit gegenüber Soll), aber keine konkrete Steuerungs-Frage akut. Beobachten und im nächsten Bericht prüfen, ob ein Muster entsteht.`
        : `Kein akuter Steuerungs-Bedarf — beim nächsten Bericht wieder schauen.`;
      break;
  }
  return `<div class="board-trend" style="background:#fff8eb;border-left:4px solid #C9A962">
    <b>Strategischer Hebel für die kommende Periode:</b> ${sentence}
  </div>`;
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
    return `<b>Konzentrations-Wechsel in ${esc(cpTop.weekLabel)}:</b> Spitzen-Anteil sinkt von Ø ${cpTop.baselineValue.toFixed(0)}% auf ${cpTop.currentValue.toFixed(0)}% — der Projekt-Mix verschiebt sich.`;
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
    return `<b>Projekt-Mix in Bewegung:</b> neues Projekt <b>${esc(n.name)}</b> ist in der zweiten Hälfte hinzugekommen.`;
  }
  if (data.projektLifecycle.vanished.length > 0) {
    const v = data.projektLifecycle.vanished[0];
    return `<b>Projekt-Mix in Bewegung:</b> Projekt <b>${esc(v.name)}</b> ist in der zweiten Hälfte ausgelaufen.`;
  }
  return `<b>Stabile Verteilung</b> über den Zeitraum — die Schwerpunkte haben sich nicht verschoben.`;
}
