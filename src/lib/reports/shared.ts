/**
 * Gemeinsame Render-Bausteine für die vier brillenspezifischen Renderer.
 *
 * Hier liegen nur Funktionen, die mehrere Renderer brauchen. Brille-
 * spezifische Logik gehört in board.ts / coach.ts / lead.ts / chef.ts.
 *
 * Die CSS-Klassen sind nach Brille semantisch getrennt (.coach-hero,
 * .lead-card, .chef-headline, .board-hero) — so kann eine Brille ihre
 * eigene visuelle Sprache haben, ohne die anderen zu beeinflussen.
 */

import type {
  BreakdownRow,
  ChangePoint,
  ChangePointMetric,
  CompositeFinding,
  Finding,
  ReportData,
  ReportLens,
  StakeholderProfile,
} from '../reportData';
import { describeChangePointContext } from '../reportData';

/* ─────────────────────────────────────────────────────────────────────
   Format-Helfer
   ───────────────────────────────────────────────────────────────────── */

export function esc(s: string | undefined | null): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function fmtHours(ms: number): string {
  if (!ms || ms <= 0) return '0:00h';
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, '0')}h`;
}

/** Kompaktes Format ohne Minuten — für Hero-Blöcke. */
export function fmtHoursShort(ms: number): string {
  if (!ms || ms <= 0) return '0h';
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
}

/* ─────────────────────────────────────────────────────────────────────
   Wiederverwendete Bausteine
   ───────────────────────────────────────────────────────────────────── */

const ACTIVITY_COLORS: Record<string, string> = {
  Produktiv: '#C9A962',
  'Nicht produktiv': '#6EC49E',
  Konzeption: '#9B8EC4',
  Produktion: '#5BA4D9',
};

/** Horizontale Balken-Liste (Top-N pro Dimension). */
export function renderBars(
  rows: BreakdownRow[],
  defaultColor: string,
  maxRows = 8
): string {
  if (rows.length === 0) return '<p class="muted">—</p>';
  const visible = rows.slice(0, maxRows);
  const total = visible.reduce((a, b) => a + b.ms, 0);
  return (
    '<div class="prodbars">' +
    visible
      .map((r) => {
        const pct = total > 0 ? (r.ms / total) * 100 : 0;
        const color = ACTIVITY_COLORS[r.name] || defaultColor;
        return `<div class="prodbar-row">
          <div class="prodbar-label">${esc(r.name)}</div>
          <div class="prodbar-track">
            <div class="prodbar-fill" style="width:${pct.toFixed(1)}%; background:${color}">${Math.round(pct)}%</div>
          </div>
          <div class="prodbar-h">${esc(fmtHours(r.ms))}</div>
        </div>`;
      })
      .join('') +
    '</div>'
  );
}

/** Drift-Indikator: ↑ / ↓ / · mit Farbe. */
export function renderDriftArrow(delta: number, sensitivity = 3): string {
  if (Math.abs(delta) < sensitivity) {
    return `<span style="color:#888">·</span>`;
  }
  const up = delta > 0;
  return `<span style="color:${up ? '#6EC49E' : '#D4706E'}">${up ? '↑' : '↓'} ${Math.abs(delta).toFixed(0)} pp</span>`;
}

/**
 * Mandanten-Dossier-Karte — für den Lead-Report. Eine pro Top-Stakeholder
 * mit Verhaltens-Markern und einer konkreten Lead-Frage.
 */
export function renderStakeholderDossier(
  profile: StakeholderProfile
): string {
  const tags: string[] = [];
  let leadQuestion = '';
  if (profile.microTaskPct >= 40) {
    tags.push(
      `<span class="tag tag-warn">${profile.microTaskPct.toFixed(0)}% kurze Einträge (&lt;15min)</span>`
    );
    leadQuestion = `Frage fürs Gespräch: dieser Mandant löst viele kleine Anfragen aus. Gibt es einen Sammel-Termin (z.B. feste Sprechzeit) — oder reagiert die Person auf jede einzelne sofort?`;
  }
  if (profile.nonprodPct >= 30) {
    tags.push(
      `<span class="tag tag-warn">${profile.nonprodPct.toFixed(0)}% nicht-produktiv</span>`
    );
    if (!leadQuestion)
      leadQuestion = `Frage fürs Gespräch: viel Zeit für Verwaltung / Abstimmung / Beziehungspflege bei diesem Mandanten. Bewusst investiert in eine wichtige Beziehung, oder dehnt sich der Auftrag stillschweigend aus?`;
  }
  if (profile.meetingHeavyPct >= 50) {
    tags.push(
      `<span class="tag tag-info">${profile.meetingHeavyPct.toFixed(0)}% in Terminen</span>`
    );
    if (!leadQuestion)
      leadQuestion = `Frage fürs Gespräch: über die Hälfte dieser Mandant-Zeit lief in Live-Terminen. Welche davon wären als Mail / kurze Notiz schneller erledigt?`;
  }
  if (profile.notizPct <= 25 && profile.entriesCount >= 8) {
    tags.push(
      `<span class="tag tag-info">nur ${profile.notizPct.toFixed(0)}% mit Notiz</span>`
    );
    if (!leadQuestion)
      leadQuestion = `Frage fürs Gespräch: Einträge bei diesem Mandanten haben selten eine Notiz. Beim Review oder Übergabe fehlt damit der Kontext — geht ein-Wort-Disziplin?`;
  }
  if (!leadQuestion) {
    leadQuestion = `Wirkt unauffällig — kein konkreter Hebel fürs Gespräch nötig.`;
  }

  const inhalt: string[] = [];
  if (profile.topProjekt && profile.topProjekt.name !== '—') {
    inhalt.push(
      `Top-Projekt: <b>${esc(profile.topProjekt.name)}</b> (${profile.topProjekt.pct.toFixed(0)}%)`
    );
  }
  if (profile.topTaetigkeit && profile.topTaetigkeit.name !== '—') {
    inhalt.push(`Tätigkeit: ${esc(profile.topTaetigkeit.name)}`);
  }
  if (profile.topFormat && profile.topFormat.name !== '—') {
    inhalt.push(`Format: ${esc(profile.topFormat.name)}`);
  }

  return `<div class="lead-card">
    <div class="lead-card-h">
      <span class="lead-card-name">${esc(profile.name)}</span>
      <span class="lead-card-share">${profile.pct.toFixed(0)}%</span>
    </div>
    <div class="lead-card-meta">${fmtHours(profile.ms)} · ${profile.daysActive} Tage · ${profile.entriesCount} Einträge</div>
    ${inhalt.length > 0 ? `<div class="lead-card-content">${inhalt.join(' · ')}</div>` : ''}
    ${tags.length > 0 ? `<div class="lead-card-tags">${tags.join(' ')}</div>` : ''}
    <div class="lead-card-q"><b>Frage fürs 1:1:</b> ${leadQuestion}</div>
  </div>`;
}

/* ─────────────────────────────────────────────────────────────────────
   Welle 5a — Change-Point-Visualisierung
   ───────────────────────────────────────────────────────────────────── */

/**
 * Mapping ChangePointMetric → menschenlesbares Label, Einheits-Formatter
 * und ein „konkret heißt das"-Erklärsatz (in Sprache, die jemand ohne
 * Tracking-Hintergrund versteht).
 */
const CP_METRIC_INFO: Record<
  ChangePointMetric,
  {
    label: string;
    format: (v: number) => string;
    /** Erklärsatz, der erscheint, wenn der Wert „up"-Richtung kippt. */
    upMeaning: string;
    /** Erklärsatz, wenn er „down"-Richtung kippt. */
    downMeaning: string;
  }
> = {
  wallclock: {
    label: 'Arbeitsstunden pro Woche',
    format: (v) => `${v.toFixed(1)}h`,
    upMeaning:
      'Du hast in dieser Woche substanziell mehr Stunden gearbeitet als in den Wochen davor.',
    downMeaning:
      'Substanziell weniger Stunden in dieser Woche — Urlaub, kurze Woche, oder ein Einbruch?',
  },
  meeting: {
    label: 'Anteil Meetings und Calls',
    format: (v) => `${v.toFixed(0)}%`,
    upMeaning:
      'Deine Woche wurde stark von Terminen geprägt — weniger Zeit für eigene Aufgaben am Stück.',
    downMeaning:
      'Weniger Termin-Last in dieser Woche — entweder Lücke im Kalender, oder du hast Termine bewusst gekürzt.',
  },
  deepFocus: {
    label: 'Konzentrations-Anteil (Blöcke über 2h)',
    format: (v) => `${v.toFixed(0)}%`,
    upMeaning:
      'Mehr Zeit am Stück ohne Unterbrechung — eine Qualitäts-Woche für Tiefe.',
    downMeaning:
      'Weniger Zeit am Stück, mehr Stückwerk. Termine oder Ad-hoc-Anfragen haben den Tag zerschnitten.',
  },
  multiTasking: {
    label: 'Parallel-Last (pro echte Stunde wieviel Aufgaben)',
    format: (v) => `${v.toFixed(2)}x`,
    upMeaning:
      'Mehr parallel laufende Themen pro Stunde — entweder bewusste Mehr-Mandanten-Steuerung oder Zerstreuung.',
    downMeaning:
      'Weniger Parallelität — du warst seriell unterwegs, ein Ding nach dem anderen.',
  },
  topStakeholder: {
    label: 'Anteil des größten Mandanten',
    format: (v) => `${v.toFixed(0)}%`,
    upMeaning:
      'Ein Mandant hat plötzlich deutlich mehr deiner Zeit gezogen — ein Großauftrag, ein Eskalations-Moment?',
    downMeaning:
      'Der bisherige Hauptmandant verliert Anteil — andere Themen rücken nach.',
  },
  coverage: {
    label: 'Tracking-Genauigkeit',
    format: (v) => `${v.toFixed(0)}%`,
    upMeaning:
      'Deine Tracking-Disziplin hat sich verbessert — du erfasst lückenloser als in den Wochen davor.',
    downMeaning:
      'Mehr Lücken zwischen erstem und letztem Eintrag des Tages — entweder eine besonders dichte Woche, oder das Tracken ist hinten runtergefallen.',
  },
};

/** Sparkline über eine wöchentliche Metrik mit Markierung der Bruch-Woche. */
export function renderWeekSparkline(
  weeks: ReportData['weeks'],
  getValue: (w: ReportData['weeks'][number]) => number,
  highlightLabel: string
): string {
  if (weeks.length < 2) return '';
  const values = weeks.map(getValue);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const W = 140;
  const H = 36;
  const stepX = weeks.length > 1 ? W / (weeks.length - 1) : 0;
  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = H - ((v - min) / span) * (H - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const highlightIdx = weeks.findIndex((w) => w.label === highlightLabel);
  let marker = '';
  if (highlightIdx >= 0) {
    const x = highlightIdx * stepX;
    const v = values[highlightIdx];
    const y = H - ((v - min) / span) * (H - 4) - 2;
    marker = `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="#D4706E" stroke="white" stroke-width="1.5"/>`;
  }
  return `<svg class="cp-sparkline" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="none">
    <polyline points="${points}" fill="none" stroke="#888" stroke-width="1.5" />
    ${marker}
  </svg>`;
}

/**
 * Karte für einen einzelnen Change-Point — mit Sparkline, Werten und
 * narrativem Text. Verwendet hauptsächlich vom Lead-Renderer.
 */
export function renderChangePointCard(
  cp: ChangePoint,
  weeks: ReportData['weeks']
): string {
  const info = CP_METRIC_INFO[cp.metric];
  // Selektor für die Sparkline: dieselbe Metrik-Funktion wie im Detektor
  const getter = (w: ReportData['weeks'][number]): number => {
    switch (cp.metric) {
      case 'wallclock':
        return w.wallclockMs / 3_600_000;
      case 'meeting':
        return w.meetingShare * 100;
      case 'deepFocus':
        return w.deepFocusShare * 100;
      case 'multiTasking':
        return w.multiTaskingFactor;
      case 'topStakeholder':
        return w.topStakeholderShare * 100;
      case 'coverage':
        return w.coverage * 100;
      default:
        return 0;
    }
  };
  const arrow = cp.deltaSign === 'up' ? '↑' : '↓';
  // Farbcodierung: rot = das ist die warnende Richtung dieser Metrik
  // (Meeting/MT up, DeepFocus/Coverage down). Grün = die positive.
  const warningUp = cp.metric === 'meeting' || cp.metric === 'multiTasking';
  const warningDown = cp.metric === 'deepFocus' || cp.metric === 'coverage';
  const isWarning =
    (warningUp && cp.deltaSign === 'up') ||
    (warningDown && cp.deltaSign === 'down');
  const arrowColor = isWarning ? '#D4706E' : '#3a8d6e';

  let label = info.label;
  if (cp.metric === 'topStakeholder') {
    const wk = weeks.find((w) => w.label === cp.weekLabel);
    if (wk?.topStakeholderName && wk.topStakeholderName !== '—') {
      label = `Anteil des Mandanten ${esc(wk.topStakeholderName)}`;
    }
  }

  const meaning =
    cp.deltaSign === 'up' ? info.upMeaning : info.downMeaning;

  // Delta in einer für Menschen direkt lesbaren Form
  let deltaText = '';
  switch (cp.metric) {
    case 'wallclock':
      deltaText = `${Math.abs(cp.deltaAbsolute).toFixed(1)}h Unterschied zum Schnitt der letzten ${cp.baselineWeekCount} Wochen`;
      break;
    case 'meeting':
    case 'deepFocus':
    case 'topStakeholder':
    case 'coverage':
      deltaText = `${Math.abs(cp.deltaAbsolute).toFixed(0)} Prozentpunkte Unterschied zum Schnitt der letzten ${cp.baselineWeekCount} Wochen`;
      break;
    case 'multiTasking':
      deltaText = `Schnitt vorher ${cp.baselineValue.toFixed(2)}, jetzt ${cp.currentValue.toFixed(2)} — Vergleichsbasis ${cp.baselineWeekCount} Wochen`;
      break;
  }

  // Kontext-Narrative: was sonst noch in dieser Woche kippte, ob es
  // einmalig war, Wochen-Snapshot, Handlungs-Hinweis.
  const narrative = describeChangePointContext(cp);

  const persistenceTag =
    cp.context.persistence === 'haelt-an'
      ? `<span class="cp-persist-tag cp-persist-stay">hält an</span>`
      : cp.context.persistence === 'einmalig'
        ? `<span class="cp-persist-tag cp-persist-once">einmalig</span>`
        : '';

  const contextBlocks: string[] = [];
  if (narrative.cooccurrence) {
    contextBlocks.push(
      `<div class="cp-card-cooccur"><b>Im Zusammenhang:</b> ${narrative.cooccurrence}</div>`
    );
  }
  if (narrative.persistence) {
    contextBlocks.push(
      `<div class="cp-card-persist"><b>Bleibt das so?</b> ${narrative.persistence}</div>`
    );
  }
  if (narrative.snapshot) {
    contextBlocks.push(
      `<div class="cp-card-snapshot"><b>Wie sah die Woche aus?</b> ${narrative.snapshot}</div>`
    );
  }
  if (narrative.actionHint) {
    contextBlocks.push(
      `<div class="cp-card-action">${narrative.actionHint}</div>`
    );
  }

  return `<div class="cp-card">
    <div class="cp-card-h">
      <span class="cp-card-week">${esc(cp.weekLabel)} ${persistenceTag}</span>
      <span class="cp-card-label">${label}</span>
    </div>
    <div class="cp-card-body">
      <div class="cp-card-trend">
        ${renderWeekSparkline(weeks, getter, cp.weekLabel)}
      </div>
      <div class="cp-card-values">
        <span class="cp-card-base">Schnitt ${info.format(cp.baselineValue)}</span>
        <span class="cp-card-arrow" style="color:${arrowColor}">${arrow}</span>
        <span class="cp-card-curr">jetzt ${info.format(cp.currentValue)}</span>
      </div>
    </div>
    <div class="cp-card-meaning">${meaning}</div>
    ${contextBlocks.join('')}
    <div class="cp-card-meta">${deltaText}</div>
  </div>`;
}

/**
 * Sektion "Wochen-Brüche" für den Lead-Renderer. Rendert bis zu N
 * Change-Points als Kartenraster. Leerer String, wenn keine Brüche
 * vorhanden.
 */
export function renderChangePointSection(
  data: ReportData,
  max = 4
): string {
  const cps = data.changePoints.slice(0, max);
  if (cps.length === 0) return '';
  const cards = cps.map((cp) => renderChangePointCard(cp, data.weeks)).join('');
  return `<h2>Wochen-Brüche im Zeitraum</h2>
    <div class="cp-grid">${cards}</div>`;
}

/**
 * Findings-Block mit Audience-Filter. Findings ohne audiences gelten für
 * alle Brillen. Veraltet — neue Renderer sollten renderFindingsBlock
 * verwenden, das auch Composites kennt.
 */
export function renderFindings(findings: Finding[], lens: ReportLens): string {
  const visible = findings.filter(
    (f) => !f.audiences || f.audiences.includes(lens)
  );
  if (visible.length === 0) return '';
  return (
    '<div class="findings-list">' +
    visible
      .map(
        (f) =>
          `<div class="finding finding-${f.level}">${f.htmlMessage}</div>`
      )
      .join('') +
    '</div>'
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Welle 5c — Composite-Findings: Brillen-spezifisches Rendering
   ───────────────────────────────────────────────────────────────────── */

const COMPOSITE_TITLES: Record<CompositeFinding['id'], string> = {
  'operative-ueberlast': 'Operative Überlastung',
  'reaktive-phase': 'Reaktive Phase',
  'konzentrations-verlust': 'Konzentrations-Verlust',
  'fokus-erosion': 'Fokus-Erosion',
};

/**
 * Nur die Composite-Karten für eine Brille, ohne Einzel-Findings.
 * Wird vom Coach-Renderer benutzt, der seine Einzel-Befunde in
 * narrativer Prosa darstellt.
 */
export function renderCompositesOnly(
  data: ReportData,
  lens: ReportLens
): string {
  const composites = data.composites.filter((c) => c.audiences.includes(lens));
  if (composites.length === 0) return '';
  const sorted = [...composites].sort((a, b) =>
    a.level === b.level ? 0 : a.level === 'warn' ? -1 : 1
  );
  return sorted
    .map((c) => {
      const evidence = c.evidenceFindings
        .map((idx) => data.findings[idx])
        .filter((f): f is Finding => f !== undefined);
      return renderCompositeCard(c, evidence);
    })
    .join('');
}

/** Eine Composite-Karte: Diagnose + Hebel + ausklappbare Evidenzen. */
function renderCompositeCard(
  comp: CompositeFinding,
  evidenceFindings: Finding[]
): string {
  const title = COMPOSITE_TITLES[comp.id];
  const evHtml =
    evidenceFindings.length > 0
      ? `<details class="composite-evidence">
           <summary>Worauf das beruht (${evidenceFindings.length} Einzelbeobachtung${evidenceFindings.length === 1 ? '' : 'en'})</summary>
           <div class="composite-evidence-list">
             ${evidenceFindings.map((f) => `<div class="composite-evidence-item">${f.htmlMessage}</div>`).join('')}
           </div>
         </details>`
      : '';
  return `<div class="composite composite-${comp.level}">
    <div class="composite-h">
      <span class="composite-tag">Befund</span>
      <span class="composite-title">${title}</span>
    </div>
    <div class="composite-diagnosis">${comp.diagnosis}</div>
    <div class="composite-hebel"><b>Was du tun könntest:</b> ${comp.hebel}</div>
    ${evHtml}
  </div>`;
}

/**
 * Composite-aware Findings-Block. Strategie pro Brille:
 *   Chef + Board: REPLACE — Composites unterdrücken ihre Evidence-Findings
 *   Coach + Lead: APPEND  — Composites stehen oben, Einzel-Findings bleiben
 *
 * Rendert oben die Composites, darunter die (ggf. gefilterten) Einzel-
 * Findings.
 */
export function renderFindingsBlock(
  data: ReportData,
  lens: ReportLens
): string {
  // Composites für diese Brille
  const composites = data.composites.filter((c) => c.audiences.includes(lens));

  // Strategie: REPLACE für Chef/Board, APPEND für Coach/Lead
  const strategy: 'replace' | 'append' =
    lens === 'chef' || lens === 'board' ? 'replace' : 'append';

  // Indices, die durch Composites konsumiert werden (nur bei replace)
  const consumed = new Set<number>();
  if (strategy === 'replace') {
    for (const c of composites) {
      for (const idx of c.evidenceFindings) consumed.add(idx);
    }
  }

  // Composites rendern
  let compositesHtml = '';
  if (composites.length > 0) {
    // Sortiere warn vor info
    const sorted = [...composites].sort((a, b) =>
      a.level === b.level ? 0 : a.level === 'warn' ? -1 : 1
    );
    compositesHtml = sorted
      .map((c) => {
        const evidence = c.evidenceFindings
          .map((idx) => data.findings[idx])
          .filter((f): f is Finding => f !== undefined);
        return renderCompositeCard(c, evidence);
      })
      .join('');
  }

  // Einzel-Findings rendern (Brillen-Filter + ggf. Consumed-Set)
  const visibleFindings = data.findings.filter((f, idx) => {
    if (consumed.has(idx)) return false;
    if (!f.audiences) return true;
    return f.audiences.includes(lens);
  });

  let findingsHtml = '';
  if (visibleFindings.length > 0) {
    findingsHtml =
      '<div class="findings-list">' +
      visibleFindings
        .map(
          (f) =>
            `<div class="finding finding-${f.level}">${f.htmlMessage}</div>`
        )
        .join('') +
      '</div>';
  }

  if (!compositesHtml && !findingsHtml) return '';
  return compositesHtml + findingsHtml;
}

/* ─────────────────────────────────────────────────────────────────────
   Style-Block — gemeinsam für alle vier Brillen.
   Klassen sind nach Brille semantisch getrennt:
   .coach-*  .lead-*  .chef-*  .board-*
   ───────────────────────────────────────────────────────────────────── */

export const REPORT_STYLES = `<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:920px;margin:24px auto;padding:0 24px;color:#1c1a17;background:#fdfbf6;line-height:1.6}
h1{font-size:26px;margin:0 0 4px;color:#6c5a2c}
h2{font-size:17px;margin:32px 0 10px;color:#6c5a2c;border-bottom:1px solid #d8cfb6;padding-bottom:6px}
h3{font-size:13px;color:#6c5a2c;margin:8px 0 6px}
.meta{color:#666;font-size:13px;margin-bottom:28px}
.meta b{color:#1c1a17}
.muted{color:#888} .small{font-size:11px;margin:4px 0 0}
.footer{margin-top:40px;padding-top:14px;border-top:1px solid #d8cfb6;color:#888;font-size:11px}

/* Findings-Block — neutral, kompakt */
.findings-list{display:flex;flex-direction:column;gap:8px;margin-top:6px}
.finding{padding:10px 14px;border-radius:4px;font-size:13.5px;line-height:1.55}
.finding-warn{background:#fff0e8;border-left:3px solid #D4706E}
.finding-info{background:#f0f8f4;border-left:3px solid #6EC49E}
.finding-ok{background:#e8f4ff;border-left:3px solid #5BA4D9}

/* Change-Points (Welle 5a + Kontext-Pass) — Wochen-Brüche pro Metrik.
   Karten sind jetzt einspaltig, weil sie Kontext-Sektionen tragen
   und sonst zu schmal werden. */
.cp-grid{display:flex;flex-direction:column;gap:14px;margin-top:8px}
.cp-card{background:white;border:1px solid #e5dfc8;border-left:3px solid #C9A962;border-radius:4px;padding:12px 16px}
.cp-card-h{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid #f0e8d2;padding-bottom:4px;margin-bottom:6px;gap:8px}
.cp-card-week{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;display:inline-flex;align-items:center;gap:8px}
.cp-persist-tag{font-size:9px;padding:1px 6px;border-radius:8px;text-transform:uppercase;letter-spacing:0.04em;font-weight:600}
.cp-persist-stay{background:#fff0e8;color:#D4706E;border:1px solid #f5d4c8}
.cp-persist-once{background:#f0f8f4;color:#3a8d6e;border:1px solid #c8e4d6}
.cp-card-label{font-size:12.5px;color:#6c5a2c;text-align:right}
.cp-card-body{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:6px 0}
.cp-card-trend{flex:0 0 auto}
.cp-sparkline{display:block}
.cp-card-values{display:flex;align-items:baseline;gap:6px;font-variant-numeric:tabular-nums;font-size:13px}
.cp-card-base{color:#888}
.cp-card-arrow{font-size:16px;font-weight:700}
.cp-card-curr{color:#1c1a17;font-weight:600;font-size:14px}
.cp-card-meaning{font-size:13px;color:#1c1a17;line-height:1.55;margin-top:8px;padding:8px 10px;background:#fff8eb;border-radius:3px}
.cp-card-cooccur,.cp-card-persist,.cp-card-snapshot{font-size:12.5px;color:#1c1a17;line-height:1.55;margin-top:8px;padding:6px 10px;background:#fdfbf6;border-left:2px solid #d8cfb6;border-radius:2px}
.cp-card-cooccur b,.cp-card-persist b,.cp-card-snapshot b{color:#6c5a2c;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:2px}
.cp-card-action{font-size:12.5px;color:#1c1a17;line-height:1.55;margin-top:8px;padding:8px 10px;background:#f0f8f4;border-left:3px solid #3a8d6e;border-radius:2px;font-style:italic}
.cp-card-meta{font-size:10.5px;color:#aaa;margin-top:8px;font-style:italic}
.cp-inline{font-size:11px;color:#888;font-style:italic}

/* Composite-Findings (Welle 5c) — Befunde, die mehrere Einzelsignale zusammenfassen */
.composite{margin:14px 0;padding:14px 18px;border-radius:6px;border:1px solid;background:white}
.composite-warn{border-color:#D4706E;background:linear-gradient(180deg,#fff4ec 0%,#ffffff 100%);border-left:4px solid #D4706E}
.composite-info{border-color:#C9A962;background:linear-gradient(180deg,#fff8eb 0%,#ffffff 100%);border-left:4px solid #C9A962}
.composite-h{display:flex;align-items:baseline;gap:8px;margin-bottom:6px}
.composite-tag{font-size:9.5px;padding:2px 8px;border-radius:8px;background:#1c1a17;color:#fff8eb;text-transform:uppercase;letter-spacing:0.08em;font-weight:700}
.composite-title{font-size:16px;font-weight:700;color:#1c1a17;font-family:var(--font-display,-apple-system)}
.composite-diagnosis{font-size:14px;color:#1c1a17;line-height:1.6;margin:8px 0}
.composite-hebel{font-size:13.5px;color:#1c1a17;line-height:1.55;margin-top:10px;padding:10px 12px;background:rgba(255,255,255,0.6);border-radius:4px;border-left:3px solid #6c5a2c}
.composite-hebel b{color:#6c5a2c;font-size:11.5px;text-transform:uppercase;letter-spacing:0.05em;display:block;margin-bottom:2px}
.composite-evidence{margin-top:10px;font-size:11.5px;color:#888}
.composite-evidence summary{cursor:pointer;padding:4px 6px;display:inline-block;font-style:italic}
.composite-evidence summary:hover{color:#6c5a2c}
.composite-evidence-list{margin-top:6px;display:flex;flex-direction:column;gap:6px;padding-left:8px;border-left:1px dashed #d8cfb6}
.composite-evidence-item{font-size:12px;color:#555;line-height:1.5;padding:6px 8px;background:#fdfbf6;border-radius:3px}

/* Wiederverwendete Balken-Liste */
.prodbars{display:flex;flex-direction:column;gap:8px;margin-top:4px}
.prodbar-row{display:grid;grid-template-columns:140px 1fr 80px;gap:10px;align-items:center}
.prodbar-label{font-size:13px}
.prodbar-track{height:22px;background:#efe9d6;border-radius:4px;overflow:hidden}
.prodbar-fill{height:100%;display:flex;align-items:center;justify-content:flex-end;color:#1c1a17;font-size:11px;font-weight:600;padding:0 8px;box-sizing:border-box}
.prodbar-h{font-size:13px;font-variant-numeric:tabular-nums;text-align:right;color:#888}

/* COACH-spezifisch — warm, persönlich, viel Weißraum */
.coach-tagline{font-size:17px;color:#1c1a17;font-style:italic;margin:18px 0 28px;padding:18px 22px;background:#fff8eb;border-left:4px solid #C9A962;border-radius:4px;line-height:1.5}
.coach-minikpi{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:24px 0}
.coach-minikpi-tile{background:white;border:1px solid #e5dfc8;border-radius:6px;padding:14px 16px;text-align:center}
.coach-minikpi-value{font-size:24px;font-weight:700;color:#6c5a2c;font-variant-numeric:tabular-nums}
.coach-minikpi-label{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.05em;margin-top:4px}
.coach-weekstrip{display:flex;gap:2px;margin:16px 0;align-items:flex-end;height:60px}
.coach-weekstrip-day{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px}
.coach-weekstrip-bar{width:100%;background:#C9A962;border-radius:2px 2px 0 0;min-height:2px}
.coach-weekstrip-label{font-size:10px;color:#888}
.coach-para{margin:14px 0;font-size:14.5px;color:#1c1a17;line-height:1.65}
.coach-questions{background:#fff8eb;border-left:4px solid #C9A962;border-radius:4px;padding:18px 22px;margin:28px 0}
.coach-questions h3{margin-top:0;color:#6c5a2c;font-size:15px}
.coach-q-item{margin:10px 0;font-size:14.5px;line-height:1.5}
.coach-q-item::before{content:'→ ';color:#C9A962;font-weight:700}

/* LEAD-spezifisch — Cockpit, Karten, Hebel */
.lead-three{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:16px 0 24px}
.lead-three-card{background:white;border:1px solid #e5dfc8;border-radius:6px;border-top:4px solid #C9A962;padding:14px 16px}
.lead-three-card.ampel-warn{border-top-color:#D4706E}
.lead-three-card.ampel-ok{border-top-color:#6EC49E}
.lead-three-h{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px}
.lead-three-v{font-size:20px;font-weight:700;color:#1c1a17;font-variant-numeric:tabular-nums;margin-bottom:2px}
.lead-three-s{font-size:12px;color:#666;line-height:1.4}
.lead-dossiers{display:flex;flex-direction:column;gap:14px;margin:14px 0}
.lead-card{background:white;border:1px solid #e5dfc8;border-radius:6px;padding:14px 18px}
.lead-card-h{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid #f0e8d2;padding-bottom:6px;margin-bottom:8px}
.lead-card-name{font-size:15px;font-weight:600;color:#6c5a2c}
.lead-card-share{font-size:18px;font-weight:700;color:#C9A962;font-variant-numeric:tabular-nums}
.lead-card-meta{font-size:11px;color:#888;margin-bottom:6px}
.lead-card-content{font-size:13px;color:#1c1a17;margin-bottom:8px;line-height:1.5}
.lead-card-tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.tag{font-size:10px;padding:2px 7px;border-radius:8px;text-transform:uppercase;letter-spacing:0.04em;font-weight:600}
.tag-warn{background:#fff0e8;color:#D4706E;border:1px solid #f5d4c8}
.tag-info{background:#f0f8f4;color:#3a8d6e;border:1px solid #c8e4d6}
.lead-card-q{font-size:12.5px;color:#1c1a17;background:#fff8eb;padding:8px 12px;border-radius:4px;border-left:3px solid #C9A962}
.lead-drift{width:100%;border-collapse:collapse;font-size:13px;margin-top:6px}
.lead-drift th{text-align:left;color:#888;font-weight:500;padding:6px 8px;border-bottom:1px solid #e5dfc8}
.lead-drift td{padding:6px 8px}
.lead-drift td.num{text-align:right;font-variant-numeric:tabular-nums}
.lead-hebel{background:#fff8eb;border-left:4px solid #C9A962;border-radius:4px;padding:18px 22px;margin:28px 0}
.lead-hebel h3{margin-top:0;color:#6c5a2c;font-size:15px}
.lead-hebel-item{margin:10px 0;font-size:14px;line-height:1.5}
.lead-hebel-item::before{content:'▸ ';color:#C9A962;font-weight:700}
.lead-kpi-mini{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;font-size:12px;margin-top:14px;padding-top:14px;border-top:1px solid #e5dfc8;color:#666}
.lead-kpi-mini b{color:#1c1a17;font-variant-numeric:tabular-nums}

/* CHEF-spezifisch — Headlines, Tabellen, knapp */
.chef-headlines{display:flex;flex-direction:column;gap:8px;margin:18px 0 24px}
.chef-headline{background:white;border:1px solid #e5dfc8;border-left:4px solid #C9A962;border-radius:4px;padding:12px 16px;font-size:14.5px;line-height:1.45}
.chef-headline b{color:#6c5a2c}
.chef-matrix{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:16px}
.chef-matrix h3{margin-top:0}
.chef-pair{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:baseline;padding:6px 0;border-bottom:1px solid #f0e8d2}
.chef-pair-name{font-size:13px;color:#1c1a17}
.chef-pair-pct{font-size:13px;color:#6c5a2c;font-weight:600;font-variant-numeric:tabular-nums}
.chef-pair-drift{font-size:11px}
.chef-drift-table{width:100%;border-collapse:collapse;font-size:13px;margin-top:10px}
.chef-drift-table th{text-align:left;color:#888;font-weight:500;padding:6px 8px;border-bottom:1px solid #e5dfc8}
.chef-drift-table td{padding:6px 8px}
.chef-drift-table td.num{text-align:right;font-variant-numeric:tabular-nums}
.chef-closing{background:#fff8eb;border-left:4px solid #C9A962;border-radius:4px;padding:16px 20px;margin:24px 0;font-size:14px;line-height:1.55}

/* BOARD-spezifisch — Hero, One-Pager, sehr knapp */
.board-hero{background:linear-gradient(135deg,#fff8eb 0%,#fdfbf6 100%);border:1px solid #d8cfb6;border-radius:8px;padding:32px 28px;margin:20px 0 28px}
.board-hero-row{display:grid;grid-template-columns:1fr;gap:20px}
.board-hero-row{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.board-hero-cell{}
.board-hero-label{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px}
.board-hero-value{font-size:24px;font-weight:700;color:#6c5a2c;font-variant-numeric:tabular-nums;line-height:1.1;margin-bottom:4px}
.board-hero-sub{font-size:12.5px;color:#1c1a17;line-height:1.45}
.board-pies{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin:24px 0}
.board-trend{font-size:14.5px;color:#1c1a17;background:white;border:1px solid #e5dfc8;border-radius:4px;padding:14px 18px;margin:20px 0;line-height:1.5}
.board-disclaimer{font-size:11px;color:#888;text-align:center;margin-top:24px}

@media (max-width:640px){
  .coach-minikpi,.lead-three,.chef-matrix,.board-hero-row,.board-pies{grid-template-columns:1fr}
  .prodbar-row{grid-template-columns:100px 1fr 60px}
  .cp-card-body{flex-direction:column;align-items:flex-start;gap:6px}
}
@media print{
  body{background:white;max-width:none;padding:12mm;margin:0}
  .coach-tagline,.lead-three-card,.lead-card,.chef-headline,.board-hero,.finding,.prodbar-fill,.lead-card-q,.coach-questions,.lead-hebel,.chef-closing,.lead-card-tags .tag,.coach-minikpi-tile,.board-trend,.cp-card,.cp-card-meaning,.cp-card-cooccur,.cp-card-persist,.cp-card-snapshot,.cp-card-action,.cp-persist-tag,.composite,.composite-warn,.composite-info,.composite-tag,.composite-hebel{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  h2{break-after:avoid}
  section{break-inside:avoid-page}
  .cp-card,.composite{break-inside:avoid}
}
</style>`;

/* ─────────────────────────────────────────────────────────────────────
   Document-Wrapper
   ───────────────────────────────────────────────────────────────────── */

/**
 * Verpackt einen Brillen-Body in ein vollständiges HTML-Dokument für
 * Print/Download. Die Body-Sektion wird vom jeweiligen Lens-Renderer
 * geliefert.
 */
export function wrapAsDocument(
  data: ReportData,
  bodyHtml: string,
  lensLabel: string
): string {
  const generated = new Date(data.meta.generatedAt).toLocaleString('de-CH');
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>${esc(data.meta.title)} — ${esc(data.meta.range.label)}</title>
  ${REPORT_STYLES}
</head>
<body>
  <h1>${esc(data.meta.title)}</h1>
  <div class="meta">
    <b>${esc(data.meta.subjectName)}</b> · ${esc(data.meta.range.label)} · ${data.kpis.workingDays} aktive Tage · Brille: <b>${esc(lensLabel)}</b> · Erstellt ${esc(generated)}
  </div>
  ${bodyHtml}
  <div class="footer">
    <b>Methodik kurz erklärt:</b>
    <i>Getrackte Zeit</i> = vereinigte Tracker-Zeit eines Tages ohne Doppelzählung (wenn zwei Tracker parallel liefen, zählt das nur einmal). Das ist eine Untergrenze der tatsächlich gearbeiteten Zeit — was nicht getrackt wurde, ist hier nicht drin.
    <i>Anwesenheit</i> = Zeit zwischen erstem und letztem Eintrag des Tages.
    <i>Tracking-Genauigkeit</i> = wie viel Prozent der Anwesenheit im Tracker erfasst ist (getrackte Zeit ÷ Anwesenheit).
    <i>Parallel-Faktor</i> = wie viele Stunden Aufgaben pro getrackter Arbeitsstunde gezählt werden (1.0 = sauber sequenziell, höher = mehrere Themen gleichzeitig im Slot).
    Soll-Vergleiche (Plan vs. Ist) sind bewusst nicht Teil dieses Berichts — die Daten beschreiben, was war, ohne Bewertung gegen ein Ziel.
  </div>
</body>
</html>`;
}

/* ─────────────────────────────────────────────────────────────────────
   Tagesteil-Label (gemeinsam für Coach + Chef Sprache)
   ───────────────────────────────────────────────────────────────────── */

export function dayPartLabel(part: string): string {
  if (part === 'morgens') return 'morgens-orientiert';
  if (part === 'mittags') return 'mittags-zentriert';
  if (part === 'abends') return 'abends-lastig';
  if (part === 'nachts') return 'nacht-aktiv';
  return 'gemischt über den Tag';
}

/** Rhythmus-Label für Sprachausgabe. */
export function rhythmLabel(r: 'fix' | 'rhythmisch' | 'gleitend'): string {
  if (r === 'fix') return 'fester Tagesrhythmus';
  if (r === 'rhythmisch') return 'rhythmischer Tagesablauf';
  return 'gleitender Tagesablauf';
}
