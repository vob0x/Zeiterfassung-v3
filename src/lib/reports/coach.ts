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
  buildNextActionData,
  esc,
  fmtHours,
  fmtHoursShort,
  dayPartSentence,
  rhythmLabel,
  interpretOvertime,
  renderTrackingQualityNote,
  renderCrisisBanner,
  renderTop3TimeFlow,
} from './shared';

export function renderCoachBody(data: ReportData): string {
  const tagline = buildTagline(data);
  const minikpi = buildMiniKpi(data);
  const weekstrip = buildWeekstrip(data);
  // Stärken-Block — bewusste Anerkennung, was diese Periode getragen hat.
  // Coach-Brille war bisher asymmetrisch zugunsten der Sorgen; positive
  // Muster verdienen dieselbe Sichtbarkeit.
  const strengths = buildStrengthsBlock(data);
  const paragraphs = buildCoachParagraphs(data);
  const topTimeFlow = buildTopTimeFlow(data);
  const questions = buildReflectionQuestions(data);
  const nextAction = buildNextAction(data);
  const disclaimer = buildDisclaimer(data);

  // Composite-Block wurde entfernt — er überlappte mit den narrativen
  // Change-Point-Paragrafen, hat den Coach-Bericht aufgeblasen und im
  // 2-Minuten-Modus erschlagen. Die operativ-strategische Schicht
  // bleibt Lead / Chef / Board vorbehalten.
  //
  // Welle 8.2 — Top-3-Zeitfresser als kurzer Stunden-Satz zwischen
  // narrativen Paragrafen und den Reflexionsfragen. Konkrete Antwort
  // auf "Wo geht die Zeit hin?" in Stunden.
  return `
    ${renderCrisisBanner(data)}
    <div class="coach-tagline">${tagline}</div>
    ${minikpi}
    ${weekstrip}
    ${strengths}
    <div class="coach-narrative">${paragraphs}</div>
    ${topTimeFlow}
    ${questions}
    ${nextAction}
    ${disclaimer}
  `;
}

/**
 * Welle 8.6 — eine konkrete Sache für die nächste Woche, persönlich
 * formuliert (du, fragend statt befehlend). Liest den Priority-Stack
 * aus shared.buildNextActionData und wickelt das Ergebnis in das
 * Coach-Sprachregister (persönlich, Frage statt Anweisung).
 */
function buildNextAction(data: ReportData): string {
  const a = buildNextActionData(data);
  let sentence = '';
  switch (a.kind) {
    case 'strukturelles-stau-muster':
      sentence = `Frag dich für <b>${esc(a.subject || '—')}</b>: was an diesem Projekt würde sich ändern, wenn du nur die reguläre Arbeitszeit dafür hättest — und mit wem im Team kannst du diese Frage konkret in der nächsten Woche besprechen?`;
      break;
    case 'high-load-days-stau':
      sentence = `Frag dich vor der nächsten Woche: welcher der langen Tage war wirklich nötig — und welcher hat sich nur ergeben, weil Anfragen zwischendurch dazwischen kamen?`;
      break;
    case 'leak-high':
      sentence = `Greif dir in der nächsten Woche einen Slot, den du im Nachhinein als „nicht produktiv" markiert hast, und probier aus: was hätte ihn von vornherein vermeidbar gemacht — eine Absage, eine kurze Mail, ein Format-Wechsel?`;
      break;
    case 'reactive-high':
      sentence = `Such dir in der nächsten Woche eine einzige Stunde, die nicht reaktiv läuft, und block sie bewusst — was würdest du in dieser Stunde tun, wenn nichts reinkäme?`;
      break;
    case 'klumpen-risiko':
      sentence = `Beim nächsten Wochen-Start: welcher der anderen Mandanten braucht diese Woche eine bewusste Stunde von dir — auch wenn <b>${esc(a.subject || '—')}</b> drückt?`;
      break;
    case 'routine':
      sentence = `Eine ruhige Periode — nimm dir für die nächste Woche eine Sache vor, die nicht reagieren ist, sondern gestalten. Was wäre das konkret?`;
      break;
  }
  return `<div class="coach-questions">
    <h3>Eine Sache für nächste Woche</h3>
    <div class="coach-q-item">${sentence}</div>
  </div>`;
}

/**
 * Welle 8.2 — Top-3-Zeitfresser-Satz für den Coach. Persönlicher
 * Ton, etwas zurückhaltender visuell als bei Lead/Chef.
 */
function buildTopTimeFlow(data: ReportData): string {
  const sentence = renderTop3TimeFlow(data.breakdowns.projekte);
  if (!sentence) return '';
  return `<p class="coach-para">${sentence}</p>`;
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
    return `An ${hi} von ${data.kpis.workingDays} Arbeitstagen warst du über zehn Stunden im Tracker. Was hat dich an diesen Tagen so lange gehalten — und was ist davon liegen geblieben?`;
  }
  if (we > 0 && k.totalWallclockMs > 0) {
    const wePct = (we / k.totalWallclockMs) * 100;
    if (wePct >= 10) {
      return `${wePct.toFixed(0)}% deiner Stunden fielen aufs Wochenende. War das gewollt — oder reichten die Wochentage nicht?`;
    }
  }
  if (deep >= 50) {
    return `Über die Hälfte deiner Zeit lief in Blöcken über zwei Stunden — viel zusammenhängende Tiefe. Was hat die langen Slots möglich gemacht?`;
  }
  if (deep < 20 && data.slotLength.totalCount >= 30) {
    return `Deine Stunden verteilen sich auf viele kurze Slots — kaum Blöcke über zwei Stunden. Wo könnte im Wochenplan ein freier Vormittag stehen?`;
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
          ? `Dein Hauptmandat <b>${esc(top.name)}</b> nahm ${top.pct.toFixed(0)}% — klar erkennbar, aber kein Monopol. Daneben hattest du ein eigenes Portfolio.`
          : `Du hast breit verteilt — <b>${esc(top.name)}</b> an der Spitze, aber nur mit ${top.pct.toFixed(0)}%. Viele Mandanten teilen sich deine Aufmerksamkeit.`;
    paras.push(seg);
  }

  // Rhythmus + Tagesteil. Welle 9.1: Grammatik fixen, "mittags-zentriert"
  // konkret übersetzen, "gemischt" weglassen. Welle 9.2: Rhythmus-Block
  // erst ab 3 Arbeitstagen — bei kürzeren Reports gar keine Aussage.
  const burstPart =
    burst.longestBurstMin >= 240
      ? ` Deine längste Slot-Kette ohne Pause: ${Math.round(burst.longestBurstMin / 60)} Stunden am ${esc(burst.longestBurstDate || '')}.`
      : '';
  if (data.kpis.workingDays >= 3) {
    const rhythmDesc = rhythmLabel(rhythm);
    const partSentence = dayPartSentence(part);
    if (partSentence) {
      paras.push(
        `Du hast mit einem ${rhythmDesc} gearbeitet. ${partSentence}${burstPart}`
      );
    } else {
      paras.push(
        `Du hast mit einem ${rhythmDesc} gearbeitet.${burstPart}`
      );
    }
  } else if (burstPart) {
    paras.push(burstPart.trim());
  }

  // Fokus-Tiefe
  if (data.slotLength.totalCount >= 20) {
    if (deep >= 50) {
      paras.push(
        `Was auffällt: ${deep.toFixed(0)}% deiner Zeit fielen auf Slots über zwei Stunden — du hast dir Tiefe geleistet. In einer Periode mit vielen Anfragen und kurzen Terminen kein Selbstläufer.`
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

  // Welle 6 — Reaktivitäts-Paragraf. Erscheint nur bei klaren
  // Profilen: hohe Anfragen-Last (fremdgetrieben) oder umgekehrt sehr
  // strategie-lastig (selbstgesteuert). Mittlere Bereiche bleiben
  // unkommentiert — die Coach-Brille soll nicht alles erzählen.
  if (data.kpis.reactivePct >= 50) {
    paras.push(
      `Eine fremdgetriebene Periode: ${data.kpis.reactivePct.toFixed(0)}% deiner Arbeitszeit lief in reaktiven Projekten — Medienanfragen, Bürgeranfragen, BGÖ, politische Geschäfte. Das ist Auftragsdienst, kein Mangel an Eigen-Initiative. Frage trotzdem: hat sich in der Periode auch nur eine Stunde eigene Vorausplanung untergebracht, oder war alles Reaktion?`
    );
  } else if (data.kpis.reactivePct < 15 && data.kpis.workingDays >= 10) {
    paras.push(
      `Diese Periode war eher Strategie als Reaktion: nur ${data.kpis.reactivePct.toFixed(0)}% in reaktiven Projekten. Du hattest Raum für eigene Vorhaben — was ist konkret aus diesem Raum entstanden, und ist es das, was du dir vorgenommen hattest?`
    );
  }

  // Welle 8 — Überstunden-Narrativ. Persönlicher Bezug auf den
  // Energiehaushalt, nicht buchhalterische Aussage. Erscheint, wenn
  // ein Vertrags-Soll vorhanden ist UND die Mehrarbeit auffällig ist
  // (mind. 5 %), sowie spiegelnd auch bei deutlicher Unterzeit. Welle
  // 8.4 — Attribution wird dezent angehängt, mit Methoden-Hinweis bei
  // der ersten Nennung im Coach-Bericht.
  if (data.kpis.contractMs > 0) {
    const otScaleCoach = interpretOvertime(
      data.kpis.overtimeMs,
      data.kpis.contractMs
    );
    const otRatioPct =
      (data.kpis.overtimeMs / data.kpis.contractMs) * 100;
    const topOt = data.overtimeAttribution[0];
    const attrSentence = topOt
      ? ` Nach Stunde 8:24 lief vor allem <b>${esc(topOt.projekt)}</b> — das ist auch das Projekt, das in den langen Tagen dominierte. <i>(nach Tagesreihenfolge der Slots zugeordnet.)</i>`
      : '';
    // Welle 9 — Tracking-Disziplin-Note, falls Tracker-Lücken außerhalb
    // des 45-min-Pausenabzugs auffällig sind.
    const methodSentence = renderTrackingQualityNote(
      data.kpis.totalPresenceMs,
      data.kpis.totalWallclockMs,
      data.kpis.pauseDeductMs
    );
    if (otScaleCoach.level === 'high') {
      paras.push(
        `Du warst in dieser Periode <b>${fmtHours(data.kpis.totalPresenceMs)}</b> präsent — abzüglich Pausen-Schnitt <b>${fmtHours(data.kpis.effectiveWorkTimeMs)}</b> Arbeitszeit. Das sind <b>${fmtHours(data.kpis.overtimeMs)}</b> über dem Vertrags-Soll von ${fmtHours(data.kpis.contractMs)} (${otRatioPct.toFixed(0)} % Mehrarbeit). Das ist nicht mehr Schwankung, das ist strukturell — Vertragszeit reicht für diesen Arbeitsanfall nicht aus.${attrSentence}${methodSentence} Geht das auf Dauer, oder fehlt dir am Wochenende schon die Erholung für die nächste Woche?`
      );
    } else if (otScaleCoach.level === 'elevated') {
      paras.push(
        `Zur Einordnung: nach Präsenz minus 45-min-Pause hast du rund <b>${fmtHours(data.kpis.overtimeMs)}</b> über dem Vertrags-Soll gearbeitet (${otRatioPct.toFixed(0)} %). Eine Periode lässt sich so überbrücken, mehrere hintereinander zehren an der Reserve.${attrSentence}${methodSentence} War das eine vorübergehende Phase, oder das neue Normal?`
      );
    } else if (data.kpis.undertimeMs > 30 * 60 * 60_000) {
      // > 30 h unter Soll — meist Urlaub/Krankheit, einmal kurz benennen
      paras.push(
        `Die Periode lag <b>${fmtHours(data.kpis.undertimeMs)}</b> unter dem Vertrags-Soll — Urlaubstage, Krankheit oder eine reduzierte Auslastung. Wenn es Erholung war: hat sie getragen, oder reicht sie für das, was als Nächstes kommt?${methodSentence}`
      );
    }
  }

  // Welle 6 — Versickerungs-Block. Erscheint nur, wenn der Anteil
  // bewusst markierter „nicht produktiver" Zeit über 25 % liegt. Coach-
  // Ton: deine Bewertung, nicht die der Daten — also was war es?
  if (data.kpis.leakPct >= 25) {
    const topNonprodSh = data.stakeholderProfiles
      .filter((p) => p.nonprodPct >= 30 && p.entriesCount >= 5)
      .sort((a, b) => b.nonprodPct - a.nonprodPct)[0];
    const wo = topNonprodSh
      ? ` Der größte Anteil davon steckte in der Arbeit für <b>${esc(topNonprodSh.name)}</b> (${topNonprodSh.nonprodPct.toFixed(0)}% dieser Mandant-Slots).`
      : '';
    paras.push(
      `Was zu denken gibt: ${data.kpis.leakPct.toFixed(0)}% deiner Zeit hast du selbst als „nicht produktiv" markiert. Das ist deine Bewertung, nicht die der Daten — du hast diese Slots aktiv so eingestuft.${wo} Welche dieser Slots würdest du im Nachhinein anders setzen — beim nächsten Mal sagen oder gar nicht erst zusagen?`
    );
  }

  // Welle 5a — Coach-spezifische ChangePoints in Prosa. Nur EIN
  // narrativer Bruch, der relevanteste. Mehr macht den Coach-Bericht
  // zu lang — zwei narrative Brüche fühlten sich wie ein zweiter
  // Report im Report an.
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
        case 'reactiveShare':
          // Welle 6 — beide Richtungen sind coach-relevant: Spitze =
          // fremdgetriebene Woche; Einbruch = unerwartete Eigen-Phase
          return true;
        default:
          return false;
      }
    })
    .slice(0, 1);
  for (const cp of coachCPs) {
    const wk = esc(cp.weekLabel);
    let sentence = '';
    switch (cp.metric) {
      case 'wallclock':
        sentence = `In ${wk} bist du auf ${cp.currentValue.toFixed(1)} Arbeitsstunden gekommen — gegenüber Schnitt ${cp.baselineValue.toFixed(1)} h in den ${cp.baselineWeekCount} Wochen davor. Das sind rund ${Math.abs(cp.deltaAbsolute).toFixed(0)} Stunden mehr als sonst. Was war in dieser Woche anders — Deadline, Krise, oder nachgeholte Arbeit aus vorherigen Tagen?`;
        break;
      case 'deepFocus':
        sentence = `Auffällig: in ${wk} fiel der Anteil deiner konzentrierten Arbeit (Blöcke über zwei Stunden am Stück) auf ${cp.currentValue.toFixed(0)} % — sonst lag er bei ${cp.baselineValue.toFixed(0)} %. Die Woche war fragmentierter, mehr Stückwerk statt zusammenhängender Arbeit. Was hat dich da unterbrochen — Termine, Anfragen, oder eine grundsätzlich andere Aufgabenstellung?`;
        break;
      case 'multiTasking':
        sentence = `Auch die Parallel-Last ist in ${wk} hochgegangen — pro Arbeitsstunde fielen ${cp.currentValue.toFixed(2)}h Aufgaben an statt sonst ${cp.baselineValue.toFixed(2)}h. Das heißt: mehrere Themen liefen öfter gleichzeitig im selben Slot. Hattest du das Gefühl, an zu vielen Sachen gleichzeitig zu sitzen — oder war das eine bewusste Mehr-Mandanten-Woche?`;
        break;
      case 'meeting':
        sentence = `In ${wk} ist dein Termin-Anteil deutlich gestiegen — ${cp.currentValue.toFixed(0)} % der Arbeitszeit in Meetings und Calls (gegenüber Ø ${cp.baselineValue.toFixed(0)} %). Weniger Zeit für eigene stille Arbeit. Hast du die Termine selbst gewollt, oder sind sie von außen reingerutscht?`;
        break;
      case 'coverage':
        sentence = `Die Tracking-Disziplin hat in ${wk} nachgelassen — nur ${cp.currentValue.toFixed(0)}% des Tages waren lückenlos erfasst, sonst ${cp.baselineValue.toFixed(0)}%. Eine vergessliche Woche, eine besonders dichte Woche ohne Tracking-Pause, oder fehlt der Tag-Anfang/das Tag-Ende?`;
        break;
      case 'reactiveShare':
        sentence =
          cp.deltaSign === 'up'
            ? `In ${wk} stand fremdgetriebene Arbeit besonders im Vordergrund — ${cp.currentValue.toFixed(0)}% der Woche in reaktiven Projekten (Anfragen, BGÖ, Krise), sonst ${cp.baselineValue.toFixed(0)}%. Was war der Auslöser — ein Vorfall, eine Anhörung, eine mediale Welle? Wie hast du das Eigene daneben aufrecht erhalten?`
            : `In ${wk} hattest du ungewöhnlich viel Raum für Eigen-Arbeit — nur ${cp.currentValue.toFixed(0)}% reaktive Projekte (sonst ${cp.baselineValue.toFixed(0)}%). Wofür hast du den Raum konkret genutzt — Strategie-Arbeit, Konzept, Aufholen?`;
        break;
    }
    if (sentence) {
      // Falls der Bruch nicht einmalig war, das anhängen — als Person
      // ist die Frage 'einmalig oder neuer Zustand' relevant.
      if (cp.context.persistence === 'haelt-an') {
        sentence += ` Und das war nicht nur diese eine Woche — auch die Folgewoche lag im selben Muster. Eher der neue Zustand als ein Ausreißer.`;
      } else if (cp.context.persistence === 'einmalig') {
        sentence += ` Tröstlich: schon in der Folgewoche ging es Richtung deines üblichen Schnitts zurück.`;
      }
      paras.push(sentence);
    }
  }

  return paras.map((p) => `<p class="coach-para">${p}</p>`).join('\n');
}

/**
 * „Was trägt" — Anerkennung der positiven Muster im Datenbild.
 *
 * Coach-Brille kann fast nur Auffälligkeiten ausweisen — wer alles
 * richtig macht, bekommt im Schlimmsten den Generic-Satz „eine ruhige
 * Periode". Diese Sektion gibt positiven Mustern eigenen Platz. Es
 * werden zwei bis drei tatsächlich vorhandene Stärken anerkannt,
 * nicht erfundene Komplimente — wenn nichts greift, fällt der Block
 * weg.
 */
function buildStrengthsBlock(data: ReportData): string {
  const items: string[] = [];
  const k = data.kpis;
  const hi = data.weekday.highLoadDaysCount;
  const we = data.weekday.weekendMs;
  const deep = data.slotLength.deepFocusPct;
  const rhythm = data.rhythm.consistency.rhythm;
  const covPct = k.coverage * 100;
  const notizCov = data.disziplin.notizCoverage;

  // Tiefe Arbeit — Slots über 2h sind selten genug, um sie zu würdigen
  if (data.slotLength.totalCount >= 20 && deep >= 40) {
    items.push(
      `<b>Tiefe ist da:</b> ${deep.toFixed(0)}% deiner Zeit lief in Blöcken über zwei Stunden — du hast dir Konzentration geleistet. Das ist eine Qualität, die in fragmentierten Wochen schnell verloren geht.`
    );
  }

  // Doku-Disziplin
  if (notizCov >= 60 && data.kpis.entriesCount >= 20) {
    items.push(
      `<b>Doku-Disziplin trägt:</b> ${notizCov.toFixed(0)}% deiner Einträge haben eine Notiz. In drei Monaten weißt du noch, was du an jedem Slot gemacht hast — beim nächsten Review oder bei einer Übergabe ist das der Unterschied zwischen Rekonstruktion und Nachlesen.`
    );
  }

  // Verlässlicher Tagesrhythmus
  if (rhythm === 'fix' || rhythm === 'rhythmisch') {
    items.push(
      rhythm === 'fix'
        ? `<b>Verlässlicher Rhythmus:</b> deine Start- und Endzeiten lagen eng beieinander. Das gibt dem Tag eine Form, an der du dich orientieren kannst — und anderen ein Zeitfenster, in dem du erreichbar bist.`
        : `<b>Rhythmischer Tagesablauf:</b> du hast wiedererkennbare Phasen, kein chaotisches Hin und Her.`
    );
  }

  // Tracking-Disziplin
  if (covPct >= 80 && data.kpis.entriesCount >= 30) {
    items.push(
      `<b>Tracking-Routine sitzt:</b> ${covPct.toFixed(0)}% des Tages lückenlos erfasst. Damit tragen die Detail-Aussagen in diesem Bericht — Drift-Pfeile, Slot-Längen, Wochen-Brüche.`
    );
  }

  // Keine Überlast-Tage — Bahnen halten ist ebenso eine Leistung
  if (hi === 0 && data.kpis.workingDays >= 10) {
    items.push(
      `<b>Bahnen gehalten:</b> kein einziger Tag über 10 Stunden — die Grenze hat in dieser Periode gehalten.`
    );
  }

  // Wochenende geschützt
  if (we === 0 && k.totalWallclockMs > 0 && data.kpis.workingDays >= 10) {
    items.push(
      `<b>Wochenende geschützt:</b> null erfasste Arbeitszeit am Wochenende — Samstag und Sonntag waren in dieser Periode wirklich frei.`
    );
  }

  // Saubere serielle Arbeit
  if (k.multiTaskingFactor <= 1.1 && k.entriesCount >= 30) {
    items.push(
      `<b>Saubere Sequenz:</b> Parallel-Faktor ${k.multiTaskingFactor.toFixed(2)} — du arbeitest weitgehend ein Ding nach dem anderen, statt mehrere Themen gleichzeitig im selben Slot zu mischen. Das macht die Erfassung sauber und die Arbeit klarer.`
    );
  }

  // Welle 6 — Triage-Leistung. Bei Teams mit hohem Reaktivitäts-Anteil
  // (>=30%) ist das Bewältigen vieler kurzer Anfragen eine eigene
  // Qualität, die in normalen Reports unsichtbar bleibt.
  if (k.reactivePct >= 30 && !k.hasCrisisSlots) {
    const reactiveHours = Math.round(k.reactiveMs / 3_600_000);
    items.push(
      `<b>Triage trägt:</b> ${k.reactivePct.toFixed(0)}% deiner Zeit (rund ${reactiveHours}h) lief in reaktiven Projekten — Anfragen, BGÖ, politische Vorstöße. Das ist Auftrags-Bewältigung, die im klassischen Produktivitäts-Maß nicht auftaucht, aber dein eigentliches Stellenprofil ausmacht.`
    );
  }

  if (items.length === 0) return '';

  // Maximal drei — sonst wird der Block zur Streichelseite
  const top = items.slice(0, 3);
  return `<div class="coach-strengths">
    <h3>Was trägt</h3>
    ${top.map((s) => `<div class="coach-strength-item">${s}</div>`).join('')}
  </div>`;
}

/**
 * 2 datengetriebene Reflexionsfragen. Falls nichts auffällig: eine
 * freundliche Generisch-Frage.
 */
function buildReflectionQuestions(data: ReportData): string {
  const fragen: string[] = [];

  const longDayRatioCoach = data.kpis.workingDays > 0
    ? data.weekday.highLoadDaysCount / data.kpis.workingDays
    : 0;
  if (data.weekday.highLoadDaysCount >= 2 && longDayRatioCoach > 0.20) {
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
        `${wePct.toFixed(0)} % deiner Arbeitszeit lagen am Wochenende. Ein knappes Zehntel der Stunden ist außerhalb der Wochentage geschehen. Bewusst geplant — oder zeigt sich hier, dass die Wochentage zu eng werden? Was müsste sich ändern, damit du das in der Woche unterbringen könntest?`
      );
    }
  }

  // Lange Arbeitsphasen ohne Pause
  if (data.rhythm.burst.longestBurstMin >= 240) {
    fragen.push(
      `An deinem stärksten Tag bist du ${Math.round(data.rhythm.burst.longestBurstMin / 60)} Stunden am Stück gearbeitet, ohne dass eine Pause im Tracker auftaucht. Was hätte eine bewusste 15-Minuten-Pause in der Mitte verändert — Klarheit für den Nachmittag, mehr Energie?`
    );
  }

  // Ad-hoc-Strom an einem konkreten Mandanten. Welle 6: bei reaktiv-
  // dominanten Stakeholdern wird die Frage umgedeutet — Triage-Qualität
  // statt Sammel-Forderung.
  const reactiveSh = data.stakeholderProfiles
    .filter((p) => p.microTaskPct >= 40 && p.entriesCount >= 5)
    .sort((a, b) => b.microTaskPct - a.microTaskPct)[0];
  if (reactiveSh) {
    if (reactiveSh.reactiveCategoryShare >= 50) {
      fragen.push(
        `Bei ${esc(reactiveSh.name)} liefen ${reactiveSh.microTaskPct.toFixed(0)}% deiner Einträge in kurzen Slots — das ist Auftrags-Triage, kein Stückwerk. Frag dich nicht „wie sammle ich das", sondern: läuft die Triage rund? Gibt es Anfragen, die zu lange liegen blieben oder zwischen Stühlen fielen?`
      );
    } else {
      fragen.push(
        `Bei ${esc(reactiveSh.name)} waren ${reactiveSh.microTaskPct.toFixed(0)}% deiner Einträge kürzer als 15 Minuten — viele kleine Aktionen statt zusammenhängender Arbeit. Was würde dir helfen, diese Anfragen zu sammeln, statt jede einzeln zu beantworten?`
      );
    }
  }

  // Wenig konzentrierte Arbeit
  if (data.slotLength.totalCount >= 30 && data.slotLength.deepFocusPct < 20) {
    fragen.push(
      `Nur ${data.slotLength.deepFocusPct.toFixed(0)} % deiner Zeit lagen in Blöcken über zwei Stunden — der Rest war Stückwerk. Wo im Kalender könntest du einen Vier-Stunden-Block freihalten, auch wenn er „leer" aussieht?`
    );
  }

  if (fragen.length === 0) {
    fragen.push(
      `Wenig Auffälliges in diesem Zeitraum — dein Rhythmus trägt, die Dokumentation ist ausreichend. Gibt es trotzdem ein Thema, in dem du dir die nächste Periode mehr Tiefe (statt Breite) wünschen würdest?`
    );
  }

  // Coach-Bericht ist für 2-Minuten-Lesen — zwei Fragen mit Tiefe
  // wirken stärker als drei, die schon zur Sammelstelle werden.
  const items = fragen
    .slice(0, 2)
    .map((q) => `<div class="coach-q-item">${q}</div>`)
    .join('');
  const heading = fragen.length >= 2 ? 'Zwei Fragen zur Reflexion' : 'Eine Frage zur Reflexion';
  return `<div class="coach-questions">
    <h3>${heading}</h3>
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

