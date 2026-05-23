/**
 * Coach-Renderer — Selbst-Spiegel für die Person selbst.
 *
 * Zweck: persönliche Reflexion, warmes „du", datengetriebene Fragen
 * statt Vorhalt. Wenig Tabellen, mehr Erzählung. Drei Mini-KPIs, ein
 * Wochenrhythmus-Strip, 2–3 Paragrafen, dann 3 Reflexionsfragen.
 *
 * Was bewusst fehlt: Top-N-Tabellen, Per-Member, Compliance-Findings,
 * Detail-Tabellen mit Stunden-Zellen. Coach liest 2 min für Spiegel,
 * nicht für Audit.
 */

import type { ReportData } from '../reportData';
import {
  esc,
  fmtHoursShort,
  dayPartLabel,
  rhythmLabel,
} from './shared';

export function renderCoachBody(data: ReportData): string {
  const tagline = buildTagline(data);
  const minikpi = buildMiniKpi(data);
  const weekstrip = buildWeekstrip(data);
  const paragraphs = buildCoachParagraphs(data);
  const questions = buildReflectionQuestions(data);
  const disclaimer = buildDisclaimer(data);

  return `
    <div class="coach-tagline">${tagline}</div>
    ${minikpi}
    ${weekstrip}
    <div class="coach-narrative">${paragraphs}</div>
    ${questions}
    ${disclaimer}
  `;
}

/**
 * Eine Beobachtung in einem Satz — das auffälligste Datenmuster
 * herausgegriffen, persönlich formuliert.
 */
function buildTagline(data: ReportData): string {
  const k = data.kpis;
  const hi = data.weekday.highLoadDaysCount;
  const we = data.weekday.weekendMs;
  const rhythm = data.rhythm.consistency.rhythm;
  const deep = data.slotLength.deepFocusPct;
  const top = data.breakdowns.stakeholders[0];

  // Reihenfolge: die menschlich wichtigste Beobachtung zuerst.
  if (hi >= 3) {
    return `Diese ${data.kpis.workingDays} Tage trugen ${hi} Tage über 10 Stunden — eine substanzielle Wegstrecke. Was hat dich getragen, was hat dir gefehlt?`;
  }
  if (we > 0 && k.totalWallclockMs > 0) {
    const wePct = (we / k.totalWallclockMs) * 100;
    if (wePct >= 10) {
      return `Auf das Wochenende fielen ${wePct.toFixed(0)}% deiner Stunden — das verdient einen kurzen Moment der Bewusstmachung.`;
    }
  }
  if (deep >= 50) {
    return `Mehr als die Hälfte deiner Zeit lief in tiefen Slots über zwei Stunden — eine seltene und wertvolle Qualität.`;
  }
  if (deep < 20 && data.slotLength.totalCount >= 30) {
    return `Deine Stunden verteilen sich auf viele kurze Slots — Tiefe war diesmal Mangelware, der Tag war fragmentiert.`;
  }
  if (rhythm === 'fix') {
    return `Dein Tagesablauf trug einen festen Rhythmus — Start- und Endzeiten lagen eng beieinander.`;
  }
  if (rhythm === 'gleitend') {
    return `Dein Tagesablauf war gleitend — Anfangs- und Endzeiten verteilten sich breit über den Zeitraum.`;
  }
  if (top && top.pct >= 50) {
    return `Mehr als die Hälfte deiner Zeit floss zu <b>${esc(top.name)}</b>. Eine klare Wahl — bewusst oder umstandsbedingt?`;
  }
  return `Eine ruhige Periode ohne große Auffälligkeiten — solide Routine, kein Drama in den Zahlen.`;
}

/** Drei persönlich relevante KPIs — Präsenz, Hochlast, Wochenende. */
function buildMiniKpi(data: ReportData): string {
  const k = data.kpis;
  const presPerDay = fmtHoursShort(k.avgPresenceMsPerDay);
  const hochlast = data.weekday.highLoadDaysCount;
  const wePct =
    data.weekday.weekendMs > 0 && k.totalWallclockMs > 0
      ? ((data.weekday.weekendMs / k.totalWallclockMs) * 100).toFixed(0) + '%'
      : '0%';

  return `<div class="coach-minikpi">
    <div class="coach-minikpi-tile">
      <div class="coach-minikpi-value">${presPerDay}</div>
      <div class="coach-minikpi-label">Ø Präsenz pro Tag</div>
    </div>
    <div class="coach-minikpi-tile">
      <div class="coach-minikpi-value">${hochlast}</div>
      <div class="coach-minikpi-label">Tage über 10h</div>
    </div>
    <div class="coach-minikpi-tile">
      <div class="coach-minikpi-value">${wePct}</div>
      <div class="coach-minikpi-label">Wochenend-Anteil</div>
    </div>
  </div>`;
}

/** Mini-Bar pro Wochentag — kein Hardcore-Chart, nur ein zarter Strip. */
function buildWeekstrip(data: ReportData): string {
  const days = data.weekday.byDay;
  if (!days.some((d) => d.ms > 0)) return '';
  const maxMs = Math.max(...days.map((d) => d.ms));
  // Reihenfolge: Mo, Di, Mi, Do, Fr, Sa, So (statt So=0)
  const ORDER = [1, 2, 3, 4, 5, 6, 0];
  const tiles = ORDER.map((dow) => {
    const d = days.find((x) => x.dow === dow);
    if (!d) return '';
    const h = maxMs > 0 ? Math.max(2, Math.round((d.ms / maxMs) * 56)) : 2;
    const isWE = dow === 0 || dow === 6;
    return `<div class="coach-weekstrip-day">
      <div class="coach-weekstrip-bar" style="height:${h}px;background:${isWE ? '#D4956A' : '#C9A962'}"></div>
      <div class="coach-weekstrip-label">${d.label}</div>
    </div>`;
  }).join('');
  return `<div class="coach-weekstrip">${tiles}</div>`;
}

/**
 * 2–3 kurze persönliche Paragrafen. Datengetrieben, „du"-Anrede, fragend
 * statt urteilend. Order: Schwerpunkt → Rhythmus/Tagesteil → Fokus-Tiefe.
 */
function buildCoachParagraphs(data: ReportData): string {
  const paras: string[] = [];
  const top = data.breakdowns.stakeholders[0];
  const part = data.rhythm.dayPart.dominantPart;
  const rhythm = data.rhythm.consistency.rhythm;
  const burst = data.rhythm.burst;
  const deep = data.slotLength.deepFocusPct;

  // Schwerpunkt — persönlich
  if (top) {
    const seg =
      top.pct >= 50
        ? `Dein Kopf war diese Periode klar bei <b>${esc(top.name)}</b> — ${top.pct.toFixed(0)}% deiner erfassten Zeit. Das ist Fokus mit Preis: andere Themen bekamen wenig Raum.`
        : top.pct >= 30
          ? `Dein Hauptmandat <b>${esc(top.name)}</b> nahm ${top.pct.toFixed(0)}% — getragen, aber nicht erdrückend. Daneben hattest du ein erkennbares Portfolio.`
          : `Du hast breit verteilt — <b>${esc(top.name)}</b> an der Spitze, aber nur mit ${top.pct.toFixed(0)}%. Viele Mandanten teilen sich deine Aufmerksamkeit.`;
    paras.push(seg);
  }

  // Rhythmus + Tagesteil
  const rhythmDesc = rhythmLabel(rhythm);
  const partDesc = dayPartLabel(part);
  const burstPart =
    burst.longestBurstMin >= 240
      ? ` Deine längste Slot-Kette ohne Pause: ${Math.round(burst.longestBurstMin / 60)} Stunden am ${esc(burst.longestBurstDate || '')}.`
      : '';
  paras.push(
    `Du arbeitetest mit einem ${rhythmDesc} und warst ${partDesc}.${burstPart}`
  );

  // Fokus-Tiefe
  if (data.slotLength.totalCount >= 20) {
    if (deep >= 50) {
      paras.push(
        `Was auffällt: ${deep.toFixed(0)}% deiner Zeit fielen auf Slots über zwei Stunden — du hast dir Tiefe geleistet. Das ist eine Qualität, die viele in der gleichen Rolle nicht haben.`
      );
    } else if (deep < 25) {
      paras.push(
        `Was nachdenklich macht: nur ${deep.toFixed(0)}% deiner Zeit lief in Slots über zwei Stunden. Der Rest war kurz, oft unter einer Stunde. Vielleicht eine fragmentierte Phase.`
      );
    }
  }

  // Doku-Bewusstsein, nur wenn auffällig
  if (data.disziplin.notizCoverage < 30 && data.kpis.entriesCount >= 20) {
    paras.push(
      `Ein Detail am Rand: nur ${data.disziplin.notizCoverage.toFixed(0)}% deiner Einträge tragen eine Notiz. In ein paar Wochen wirst du dich fragen, was du im Slot „Projekt X" eigentlich gemacht hast.`
    );
  }

  // Welle 5a — Coach-spezifische ChangePoints in Prosa. Nur die ersten
  // zwei coach-relevanten Brüche, narrativ formuliert. Wenn keine
  // coach-Brüche im Datensatz: dieser Absatz fehlt einfach.
  const coachCPs = data.changePoints
    .filter((cp) => {
      switch (cp.metric) {
        case 'wallclock':
        case 'multiTasking':
          return cp.deltaSign === 'up';
        case 'deepFocus':
        case 'coverage':
          return cp.deltaSign === 'down';
        case 'meeting':
          return cp.deltaSign === 'up';
        default:
          return false;
      }
    })
    .slice(0, 2);
  for (const cp of coachCPs) {
    const wk = esc(cp.weekLabel);
    let sentence = '';
    switch (cp.metric) {
      case 'wallclock':
        sentence = `In ${wk} bist du auf ${cp.currentValue.toFixed(1)} Arbeitsstunden gekommen — gegenüber Schnitt ${cp.baselineValue.toFixed(1)}h in den ${cp.baselineWeekCount} Wochen davor. Das sind rund ${Math.abs(cp.deltaAbsolute).toFixed(0)} Stunden mehr als sonst. Was war in dieser Woche anders — Deadline, Krise, oder nachgeholte Arbeit aus vorherigen Tagen?`;
        break;
      case 'deepFocus':
        sentence = `Auffällig: in ${wk} fiel der Anteil deiner konzentrierten Arbeit (Blöcke über 2 Stunden am Stück) auf ${cp.currentValue.toFixed(0)}% — sonst lag er bei ${cp.baselineValue.toFixed(0)}%. Konkret heißt das: die Woche war fragmentierter, mehr Stückwerk statt zusammenhängender Arbeit. Was hat dich da unterbrochen — Termine, Anfragen, oder eine grundsätzlich andere Aufgabenstellung?`;
        break;
      case 'multiTasking':
        sentence = `Auch die Parallel-Last ist in ${wk} hochgegangen — pro Arbeitsstunde fielen ${cp.currentValue.toFixed(2)}h Aufgaben an statt sonst ${cp.baselineValue.toFixed(2)}h. Das heißt: mehrere Themen liefen öfter gleichzeitig im selben Slot. Hattest du das Gefühl, an zu vielen Sachen gleichzeitig zu sitzen — oder war das eine bewusste Mehr-Mandanten-Woche?`;
        break;
      case 'meeting':
        sentence = `In ${wk} ist dein Termin-Anteil deutlich gestiegen — ${cp.currentValue.toFixed(0)}% der Arbeitszeit in Meetings und Calls (gegenüber Ø ${cp.baselineValue.toFixed(0)}%). Konkret heißt das: weniger Zeit für eigene stille Arbeit. Hast du die Termine selbst gewollt, oder sind sie von außen reingerutscht?`;
        break;
      case 'coverage':
        sentence = `Die Tracking-Disziplin hat in ${wk} nachgelassen — nur ${cp.currentValue.toFixed(0)}% des Tages waren lückenlos erfasst, sonst ${cp.baselineValue.toFixed(0)}%. Eine vergessliche Woche, eine besonders dichte Woche ohne Tracking-Pause, oder fehlt der Tag-Anfang/das Tag-Ende?`;
        break;
    }
    if (sentence) {
      // Falls der Bruch nicht einmalig war, das anhängen — als Person
      // ist die Frage 'einmalig oder neuer Zustand' relevant.
      if (cp.context.persistence === 'haelt-an') {
        sentence += ` Und das war nicht nur diese eine Woche — die Folgewoche hat das Muster mitgetragen, also ist es schon ein Stück weit ein neuer Zustand, kein Ausreißer.`;
      } else if (cp.context.persistence === 'einmalig') {
        sentence += ` Tröstlich: schon in der Folgewoche ging es Richtung deines üblichen Schnitts zurück.`;
      }
      paras.push(sentence);
    }
  }

  return paras.map((p) => `<p class="coach-para">${p}</p>`).join('\n');
}

/**
 * 3 datengetriebene Reflexionsfragen. Falls nichts auffällig: eine
 * freundliche Generisch-Frage.
 */
function buildReflectionQuestions(data: ReportData): string {
  const fragen: string[] = [];

  if (data.weekday.highLoadDaysCount >= 2) {
    fragen.push(
      `${data.weekday.highLoadDaysCount} Tage hatten über 10 Stunden zwischen erstem und letztem Eintrag — das sind sehr lange Arbeitstage. Was hat dich an diesen Tagen so lange gehalten, und kam am Ende der Output dabei raus, den du erwartet hast?`
    );
  }

  // Doku-Disziplin (an einem konkreten Mandanten festgemacht)
  const lowestNotizSh = data.stakeholderProfiles
    .filter((p) => p.entriesCount >= 8 && p.notizPct <= 30)
    .sort((a, b) => a.notizPct - b.notizPct)[0];
  if (lowestNotizSh) {
    fragen.push(
      `Bei ${esc(lowestNotizSh.name)} tragen nur ${lowestNotizSh.notizPct.toFixed(0)}% der Einträge einen Kommentar. Wenn du in drei Monaten die Slots dieses Mandanten anschaust — welche davon wären jetzt schwer einzuordnen, weil dir die kurze Notiz fehlt?`
    );
  }

  // Wochenend-Arbeit
  if (data.weekday.weekendMs > 0 && data.kpis.totalWallclockMs > 0) {
    const wePct =
      (data.weekday.weekendMs / data.kpis.totalWallclockMs) * 100;
    if (wePct >= 8) {
      fragen.push(
        `${wePct.toFixed(0)}% deiner Arbeitszeit lag am Wochenende. Konkret heißt das: ein knappes Zehntel der Stunden ist außerhalb der Wochentage geschehen. Bewusst geplant — oder zeigt sich hier, dass die Wochentage zu eng werden? Was müsste sich ändern, damit du das in der Woche unterbringen könntest?`
      );
    }
  }

  // Lange Arbeitsphasen ohne Pause
  if (data.rhythm.burst.longestBurstMin >= 240) {
    fragen.push(
      `An deinem stärksten Tag bist du ${Math.round(data.rhythm.burst.longestBurstMin / 60)} Stunden am Stück gearbeitet, ohne dass eine Pause im Tracker auftaucht. Was hätte eine bewusste 15-Minuten-Pause in der Mitte verändert — Klarheit für den Nachmittag, mehr Energie?`
    );
  }

  // Ad-hoc-Strom an einem konkreten Mandanten
  const reactiveSh = data.stakeholderProfiles
    .filter((p) => p.microTaskPct >= 40 && p.entriesCount >= 5)
    .sort((a, b) => b.microTaskPct - a.microTaskPct)[0];
  if (reactiveSh) {
    fragen.push(
      `Bei ${esc(reactiveSh.name)} waren ${reactiveSh.microTaskPct.toFixed(0)}% deiner Einträge kürzer als 15 Minuten — viele kleine Aktionen statt zusammenhängender Arbeit. Was würde dir helfen, diese Anfragen zu sammeln, statt jede einzeln zu beantworten?`
    );
  }

  // Wenig konzentrierte Arbeit
  if (data.slotLength.totalCount >= 30 && data.slotLength.deepFocusPct < 20) {
    fragen.push(
      `Nur ${data.slotLength.deepFocusPct.toFixed(0)}% deiner Zeit lag in Blöcken über zwei Stunden — der Rest war Stückwerk. Wo im Kalender könntest du einen Vier-Stunden-Block freihalten, auch wenn er „leer" aussieht?`
    );
  }

  if (fragen.length === 0) {
    fragen.push(
      `Wenig Auffälliges in diesem Zeitraum — dein Rhythmus trägt, die Dokumentation ist ausreichend. Gibt es trotzdem ein Thema, in dem du dir die nächste Periode mehr Tiefe (statt Breite) wünschen würdest?`
    );
  }

  const items = fragen
    .slice(0, 3)
    .map((q) => `<div class="coach-q-item">${q}</div>`)
    .join('');
  return `<div class="coach-questions">
    <h3>Drei Fragen zur Reflexion</h3>
    ${items}
  </div>`;
}

/** Knapper Disclaimer am Schluss — Daten-Belastbarkeit. */
function buildDisclaimer(data: ReportData): string {
  const covPct = data.kpis.coverage * 100;
  return `<div class="board-disclaimer">
    Datenbasis Coverage ${covPct.toFixed(0)}% · ${data.kpis.entriesCount} Einträge im Zeitraum · Erstellt aus ${data.kpis.workingDays} aktiven Tagen${data.disziplin.notizCoverage > 0 ? ` · ${data.disziplin.notizCoverage.toFixed(0)}% mit Notiz` : ''}
  </div>`;
}

