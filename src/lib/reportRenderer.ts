/**
 * reportRenderer — Rendert ReportData als Standalone-HTML.
 *
 * Loop-4-Modell: qualitativer Report mit Tracking-Coverage statt Soll.
 * Keine React-Abhängigkeit, nur Strings + Browser-APIs.
 *
 * Drei Ausgabe-Pfade:
 *   - renderReportHtml(data)         → vollständiges HTML-Dokument
 *   - openReportPrintWindow(data)    → öffnet Druckdialog
 *   - downloadReportHtml(data, name) → triggert .html-Download
 */

import type { ReportData, BreakdownRow } from './reportData';

function esc(s: string | undefined | null): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmt(ms: number): string {
  if (!ms || ms <= 0) return '0:00h';
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, '0')}h`;
}

const ACTIVITY_COLORS: Record<string, string> = {
  Produktiv: '#C9A962',
  'Nicht produktiv': '#6EC49E',
  Konzeption: '#9B8EC4',
  Produktion: '#5BA4D9',
  Ferien: '#D4706E',
  Abwesend: '#D4706E',
  Krankheit: '#D4706E',
  Militär: '#D4706E',
};

function renderKpiTile(
  label: string,
  value: string,
  sub: string,
  accent: string
): string {
  return `<div class="kpi" style="border-left-color:${accent}">
    <div class="kpi-label">${esc(label)}</div>
    <div class="kpi-value">${esc(value)}</div>
    <div class="kpi-sub">${esc(sub)}</div>
  </div>`;
}

function renderBars(rows: BreakdownRow[], defaultColor: string): string {
  if (rows.length === 0) return '<p class="muted">—</p>';
  const total = rows.reduce((a, b) => a + b.ms, 0);
  const lines = rows
    .map((r) => {
      const pct = total > 0 ? (r.ms / total) * 100 : 0;
      const color = ACTIVITY_COLORS[r.name] || defaultColor;
      return `<div class="prodbar-row">
        <div class="prodbar-label">${esc(r.name)}</div>
        <div class="prodbar-track">
          <div class="prodbar-fill" style="width:${pct.toFixed(1)}%; background:${color}">${Math.round(pct)}%</div>
        </div>
        <div class="prodbar-h">${esc(fmt(r.ms))}</div>
      </div>`;
    })
    .join('');
  return `<div class="prodbars">${lines}</div>`;
}

function renderTopTable(rows: BreakdownRow[], maxRows = 8): string {
  if (rows.length === 0) return '<p class="muted">—</p>';
  const visible = rows.slice(0, maxRows);
  const lines = visible
    .map(
      (r) => `<tr>
        <td>${esc(r.name)}</td>
        <td class="num">${esc(fmt(r.ms))}</td>
        <td class="num">${Math.round(r.pct)}%</td>
        <td class="num muted">${r.count}x</td>
        <td class="bar"><div class="bar-track"><div class="bar-fill" style="width:${Math.min(r.pct, 100).toFixed(1)}%"></div></div></td>
      </tr>`
    )
    .join('');
  return `<table class="report-table">
    <thead><tr><th></th><th class="num">Stunden</th><th class="num">%</th><th class="num">N</th><th></th></tr></thead>
    <tbody>${lines}</tbody>
  </table>`;
}

export function renderReportHtml(data: ReportData): string {
  const k = data.kpis;
  const covPct = k.coverage * 100;
  const covColor =
    covPct >= 80 ? '#6EC49E' : covPct >= 60 ? '#C9A962' : '#D4706E';

  const kpisHtml = `<div class="kpis">
    ${renderKpiTile('Wallclock-Total', fmt(k.totalWallclockMs), `Ø ${fmt(k.avgWallclockMsPerDay)} pro aktivem Tag`, '#C9A962')}
    ${renderKpiTile('Präsenz-Total', fmt(k.totalPresenceMs), `Ø ${fmt(k.avgPresenceMsPerDay)} pro Tag`, '#C9A962')}
    ${renderKpiTile('Tracking-Coverage', `${covPct.toFixed(0)}%`, 'Wallclock ÷ Präsenz', covColor)}
    ${renderKpiTile('Multi-Tasking', `${k.multiTaskingFactor.toFixed(2)}x`, 'Naive ÷ Wallclock', '#C9A962')}
    ${renderKpiTile('Produktiv-Quote', `${k.productivePct.toFixed(0)}%`, `${fmt(k.productiveMs)} von ${fmt(k.totalNaiveMs)} naive`, '#C9A962')}
  </div>`;

  // Coverage-Section
  const lowCovRows = data.coverage.lowCoverageDays
    .map(
      (d) => `<tr>
        <td>${esc(d.date)}</td>
        <td class="num">${d.coveragePct.toFixed(0)}%</td>
        <td class="num">${esc(fmt(d.presenceMs))}</td>
        <td class="num">${esc(fmt(d.wallclockMs))}</td>
        <td class="num muted">${esc(fmt(d.gapMs))}</td>
      </tr>`
    )
    .join('');
  const lowCovTable =
    data.coverage.lowCoverageDays.length > 0
      ? `<h3 class="sub">Schwächste Tage</h3>
       <table class="report-table">
         <thead><tr><th>Datum</th><th class="num">Coverage</th><th class="num">Präsenz</th><th class="num">Wallclock</th><th class="num">Lücke</th></tr></thead>
         <tbody>${lowCovRows}</tbody>
       </table>`
      : '';

  const coverageHtml = `<div class="cov-buckets">
    <div class="cov-bucket cov-good"><div class="cov-num">${data.coverage.daysGood}</div><div class="cov-label">Tage <b>≥80%</b></div><div class="cov-meaning muted">Belastbare Detail-Sicht</div></div>
    <div class="cov-bucket cov-mid"><div class="cov-num">${data.coverage.daysOk}</div><div class="cov-label">Tage <b>60–80%</b></div><div class="cov-meaning muted">Mit kleineren Lücken</div></div>
    <div class="cov-bucket cov-thin"><div class="cov-num">${data.coverage.daysThin}</div><div class="cov-label">Tage <b>&lt;60%</b></div><div class="cov-meaning muted">Aussagen mit Vorsicht</div></div>
  </div>
  ${lowCovTable}`;

  // Wochen-Verlauf
  const maxWeekMs = Math.max(1, ...data.weeks.map((w) => w.wallclockMs));
  const weekRows = data.weeks
    .map((w) => {
      const barPct = (w.wallclockMs / maxWeekMs) * 100;
      const covColor2 =
        w.coverage >= 0.8 ? '#6EC49E' : w.coverage >= 0.6 ? '#C9A962' : '#D4706E';
      return `<tr>
        <td>KW ${esc(w.label)}</td>
        <td class="num">${w.activeDays}</td>
        <td class="num">${esc(fmt(w.wallclockMs))}</td>
        <td class="num" style="color:${covColor2}">${(w.coverage * 100).toFixed(0)}%</td>
        <td class="bar"><div class="bar-track"><div class="bar-fill" style="width:${barPct.toFixed(0)}%"></div></div></td>
      </tr>`;
    })
    .join('');
  const weekHtml = `<table class="report-table">
    <thead><tr><th>Woche</th><th class="num">aktive Tage</th><th class="num">Wallclock</th><th class="num">Coverage</th><th></th></tr></thead>
    <tbody>${weekRows}</tbody>
  </table>
  <p class="muted small">Bar-Skala normalisiert auf die stärkste Woche.</p>`;

  // Trend-Section
  let trendHtml = '';
  if (data.trend.growth.length === 0 && data.trend.decline.length === 0) {
    trendHtml =
      '<p class="muted">Keine signifikanten Verschiebungen zwischen erster und zweiter Periodenhälfte.</p>';
  } else {
    const growthRows = data.trend.growth
      .map(
        (t) => `<tr>
          <td>${esc(t.name)}</td>
          <td class="num">${t.firstPct.toFixed(0)}%</td>
          <td class="num">${t.secondPct.toFixed(0)}%</td>
          <td class="num" style="color:#6EC49E">+${t.deltaPct.toFixed(0)} pp</td>
        </tr>`
      )
      .join('');
    const declineRows = data.trend.decline
      .map(
        (t) => `<tr>
          <td>${esc(t.name)}</td>
          <td class="num">${t.firstPct.toFixed(0)}%</td>
          <td class="num">${t.secondPct.toFixed(0)}%</td>
          <td class="num" style="color:#D4706E">${t.deltaPct.toFixed(0)} pp</td>
        </tr>`
      )
      .join('');
    trendHtml = `
    <p class="muted small" style="margin-bottom:8px">Erste Hälfte (${data.trend.firstHalfDays} Tage, ${esc(fmt(data.trend.firstHalfMs))}) vs zweite Hälfte (${data.trend.secondHalfDays} Tage, ${esc(fmt(data.trend.secondHalfMs))}). Nur Stakeholder mit signifikanter Bewegung (≥3 Prozentpunkte) und nennenswertem Anteil.</p>
    <div class="two-col">
      <div>
        <h3>Gewachsen</h3>
        ${
          growthRows
            ? `<table class="report-table"><thead><tr><th>Stakeholder</th><th class="num">1. Hälfte</th><th class="num">2. Hälfte</th><th class="num">Δ</th></tr></thead><tbody>${growthRows}</tbody></table>`
            : '<p class="muted">—</p>'
        }
      </div>
      <div>
        <h3>Geschrumpft</h3>
        ${
          declineRows
            ? `<table class="report-table"><thead><tr><th>Stakeholder</th><th class="num">1. Hälfte</th><th class="num">2. Hälfte</th><th class="num">Δ</th></tr></thead><tbody>${declineRows}</tbody></table>`
            : '<p class="muted">—</p>'
        }
      </div>
    </div>`;
  }

  // Findings
  const findingsHtml = data.findings
    .map(
      (f) => `<div class="finding finding-${f.level}">${f.htmlMessage}</div>`
    )
    .join('');

  // Per-Member (Team)
  let perMemberHtml = '';
  if (data.perMember && data.perMember.length > 0) {
    const rows = data.perMember
      .map(
        (m) => `<tr>
          <td>${esc(m.codename)}${m.role === 'admin' ? ' <span class="badge">Admin</span>' : ''}</td>
          <td class="num">${esc(fmt(m.ms))}</td>
          <td class="num">${m.pct.toFixed(0)}%</td>
          <td class="num muted">${m.entriesCount}x</td>
          <td class="bar"><div class="bar-track"><div class="bar-fill" style="width:${Math.min(m.pct, 100).toFixed(1)}%"></div></div></td>
        </tr>`
      )
      .join('');
    perMemberHtml = `<section><h2>Per Mitglied</h2>
      <table class="report-table">
        <thead><tr><th>Mitglied</th><th class="num">Stunden</th><th class="num">%</th><th class="num">N</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
  }

  // Absences
  let absencesHtml = '';
  if (data.absences.length > 0) {
    const items = data.absences
      .map((a) => `<li>${esc(a.type)} <span class="muted">×${a.count}</span></li>`)
      .join('');
    absencesHtml = `<section><h2>Abwesenheiten</h2><ul>${items}</ul></section>`;
  }

  const generated = new Date(data.meta.generatedAt).toLocaleString('de-CH');

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>${esc(data.meta.title)} — ${esc(data.meta.range.label)}</title>
  ${STYLES}
</head>
<body>
  <h1>Arbeitszeit-Report</h1>
  <div class="meta">
    <b>${esc(data.meta.subjectName)}</b> &middot; ${esc(data.meta.range.label)} &middot; ${k.workingDays} aktive Tage &middot; Erstellt ${esc(generated)}
  </div>

  <section>
    <h2>Management Summary</h2>
    <div class="summary">${data.narrativeHtml}</div>
  </section>

  <section><h2>Kennzahlen</h2>${kpisHtml}</section>

  <section><h2>Tracking-Qualität</h2>${coverageHtml}</section>

  <section><h2>Tätigkeits-Mix</h2>${renderBars(data.breakdowns.taetigkeiten, '#888')}</section>

  <section><h2>Format-Mix</h2>${renderBars(data.breakdowns.formate, '#D4956A')}</section>

  <section><h2>Wochen-Verlauf</h2>${weekHtml}</section>

  <section><h2>Schwerpunkte</h2>
    <div class="two-col">
      <div><h3>Stakeholder</h3>${renderTopTable(data.breakdowns.stakeholders)}</div>
      <div><h3>Projekte</h3>${renderTopTable(data.breakdowns.projekte)}</div>
    </div>
  </section>

  <section><h2>Verschiebungen im Zeitraum</h2>${trendHtml}</section>

  ${perMemberHtml}

  ${absencesHtml}

  <section><h2>Aus den Daten</h2>${findingsHtml}</section>

  <div class="footer">
    Methodik: Naive-Summe (jede Aufgabe voll, Multi-Stakeholder voll auf jedem). Wallclock = vereinigte Tracker-Intervalle ohne Doppelzählung. Präsenz = erster bis letzter Eintrag eines Tages. Tracking-Coverage = Wallclock ÷ Präsenz. Multi-Tasking-Faktor = Naive ÷ Wallclock. Verschiebung = Stakeholder-Anteil 1. Hälfte vs 2. Hälfte (pp = Prozentpunkte). <b>Soll-Vergleiche werden bewusst nicht ausgewiesen</b> — die Erfassung ist nicht minutengenau gedacht; statt Über-/Unterzeit gibt der Report Auskunft über die Belastbarkeit der Datenbasis.
  </div>
</body>
</html>`;
}

const STYLES = `<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:920px;margin:24px auto;padding:0 24px;color:#1c1a17;background:#fdfbf6;line-height:1.6}
h1{font-size:26px;margin:0 0 4px;color:#6c5a2c}
h2{font-size:17px;margin:32px 0 10px;color:#6c5a2c;border-bottom:1px solid #d8cfb6;padding-bottom:6px}
h3{font-size:13px;color:#6c5a2c;margin:8px 0 6px}
h3.sub{font-size:13px;color:#6c5a2c;margin:18px 0 8px}
.meta{color:#666;font-size:13px;margin-bottom:28px}
.meta b{color:#1c1a17}
.summary{background:#fff8eb;border-left:4px solid #C9A962;padding:18px 22px;border-radius:4px;font-size:14.5px}
.summary p{margin:0 0 12px}
.summary p:last-child{margin-bottom:0}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-top:6px}
.kpi{background:white;border:1px solid #e5dfc8;border-left-width:4px;border-radius:4px;padding:12px 14px}
.kpi-label{color:#888;font-size:11px;text-transform:uppercase;letter-spacing:0.05em}
.kpi-value{font-size:22px;font-weight:700;margin:4px 0 2px;color:#1c1a17;font-variant-numeric:tabular-nums}
.kpi-sub{color:#888;font-size:11px}
.cov-buckets{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:6px}
.cov-bucket{background:white;border:1px solid #e5dfc8;border-left-width:4px;border-radius:4px;padding:14px 16px}
.cov-good{border-left-color:#6EC49E}
.cov-mid{border-left-color:#C9A962}
.cov-thin{border-left-color:#D4706E}
.cov-num{font-size:28px;font-weight:700;color:#1c1a17;font-variant-numeric:tabular-nums;line-height:1}
.cov-label{font-size:13px;margin-top:4px}
.cov-meaning{font-size:11px;margin-top:2px}
.prodbars{display:flex;flex-direction:column;gap:8px;margin-top:4px}
.prodbar-row{display:grid;grid-template-columns:140px 1fr 80px;gap:10px;align-items:center}
.prodbar-label{font-size:13px}
.prodbar-track{height:22px;background:#efe9d6;border-radius:4px;overflow:hidden}
.prodbar-fill{height:100%;display:flex;align-items:center;justify-content:flex-end;color:#1c1a17;font-size:11px;font-weight:600;padding:0 8px;box-sizing:border-box}
.prodbar-h{font-size:13px;font-variant-numeric:tabular-nums;text-align:right;color:#888}
.report-table{width:100%;border-collapse:collapse;font-size:13px}
.report-table th{text-align:left;color:#888;font-weight:500;padding:6px 8px;border-bottom:1px solid #e5dfc8}
.report-table td{padding:5px 8px}
.report-table td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.report-table td.bar{width:200px}
.bar-track{height:8px;background:#efe9d6;border-radius:2px;overflow:hidden}
.bar-fill{height:100%;background:#C9A962}
.muted{color:#888} .small{font-size:11px;margin:4px 0 0}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.finding{padding:12px 16px;border-radius:4px;margin-bottom:8px;font-size:13.5px;line-height:1.55}
.finding-warn{background:#fff0e8;border-left:3px solid #D4706E}
.finding-info{background:#f0f8f4;border-left:3px solid #6EC49E}
.finding-ok{background:#e8f4ff;border-left:3px solid #5BA4D9}
.badge{background:#C9A962;color:#fff;font-size:9px;padding:1px 5px;border-radius:8px;text-transform:uppercase;letter-spacing:0.05em;vertical-align:middle}
.footer{margin-top:40px;padding-top:14px;border-top:1px solid #d8cfb6;color:#888;font-size:11px}
@media (max-width:640px){.two-col,.cov-buckets{grid-template-columns:1fr}.prodbar-row{grid-template-columns:100px 1fr 60px}}
@media print{body{background:white;max-width:none;padding:12mm;margin:0}.summary,.kpi,.finding,.bar-fill,.prodbar-fill,.cov-bucket{-webkit-print-color-adjust:exact;print-color-adjust:exact}h2{break-after:avoid}section{break-inside:avoid-page}}
</style>`;

export function openReportPrintWindow(data: ReportData): void {
  const html = renderReportHtml(data);
  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) {
    alert(
      'Druck-Fenster konnte nicht geöffnet werden — bitte Pop-up-Blocker prüfen.'
    );
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  setTimeout(() => {
    try {
      w.focus();
      w.print();
    } catch {
      // ignore
    }
  }, 250);
}

export function downloadReportHtml(data: ReportData, filename?: string): void {
  const html = renderReportHtml(data);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || defaultFilename(data);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function defaultFilename(data: ReportData): string {
  const safeSubject = data.meta.subjectName
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `report-${safeSubject || 'team'}-${data.meta.range.from}.html`;
}
