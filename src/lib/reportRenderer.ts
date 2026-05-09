/**
 * reportRenderer — Rendert ReportData als Standalone-HTML (printable +
 * downloadable). Bewusst nur Strings + Browser-APIs, keine React-
 * Abhängigkeit — der Output kann auch ohne die App existieren.
 *
 * Drei Ausgabe-Pfade:
 *   - renderReportHtml(data)          → vollständiges HTML-Dokument als String
 *   - openReportPrintWindow(data)     → öffnet Druckdialog im neuen Fenster
 *   - downloadReportHtml(data, name)  → triggert .html-Download im Browser
 *
 * CSS ist inline im HTML — kein externer Stylesheet, damit das HTML
 * standalone funktioniert (E-Mail-Anhang, Speichern auf Disk etc.).
 */

import type { ReportData, BreakdownRow, PerMemberRow } from './reportData';
import { formatHoursAdaptive } from './utils';

/** HTML-escape für untrusted strings (Eintrags-Werte aus Decrypt). */
function esc(s: string | undefined | null): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderBreakdownTable(rows: BreakdownRow[], maxRows: number = 15): string {
  if (rows.length === 0) {
    return '<p class="muted">—</p>';
  }
  const visible = rows.slice(0, maxRows);
  const hidden = rows.length - visible.length;

  const lines = visible
    .map(
      (r) => `
    <tr>
      <td class="name">${esc(r.name)}</td>
      <td class="num">${esc(formatHoursAdaptive(r.ms))}</td>
      <td class="num pct">${Math.round(r.pct)}%</td>
      <td class="bar">
        <div class="bar-track"><div class="bar-fill" style="width:${Math.max(2, r.pct).toFixed(1)}%"></div></div>
      </td>
    </tr>`
    )
    .join('');

  const more =
    hidden > 0
      ? `<tr><td colspan="4" class="muted small">… +${hidden} weitere</td></tr>`
      : '';

  return `
    <table class="breakdown">
      <tbody>${lines}${more}</tbody>
    </table>
  `;
}

function renderPerMember(rows: PerMemberRow[]): string {
  if (rows.length === 0) return '';
  const lines = rows
    .map(
      (r) => `
    <tr>
      <td class="name">${esc(r.codename)}${r.role === 'admin' ? ' <span class="badge">Admin</span>' : ''}</td>
      <td class="num">${esc(formatHoursAdaptive(r.ms))}</td>
      <td class="num pct">${Math.round(r.pct)}%</td>
      <td class="num">${r.entriesCount}</td>
      <td class="bar">
        <div class="bar-track"><div class="bar-fill" style="width:${Math.max(2, r.pct).toFixed(1)}%"></div></div>
      </td>
    </tr>`
    )
    .join('');
  return `
    <h3>Per Mitglied</h3>
    <table class="breakdown">
      <thead>
        <tr><th>Mitglied</th><th class="num">Stunden</th><th class="num">%</th><th class="num">Einträge</th><th></th></tr>
      </thead>
      <tbody>${lines}</tbody>
    </table>
  `;
}

function renderAbsences(absences: ReportData['absences']): string {
  if (absences.length === 0) return '';
  const lines = absences
    .map(
      (a) =>
        `<li><span class="name">${esc(a.type)}</span> <span class="muted">×${a.count}</span></li>`
    )
    .join('');
  return `
    <h3>Abwesenheiten</h3>
    <ul class="absences">${lines}</ul>
  `;
}

const STYLES = `
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      max-width: 880px;
      margin: 24px auto;
      padding: 0 24px;
      color: #1c1a17;
      background: #fdfbf6;
      line-height: 1.5;
    }
    h1 { font-size: 24px; margin: 0 0 4px; color: #6c5a2c; }
    h2 { font-size: 16px; margin: 28px 0 8px; color: #6c5a2c; border-bottom: 1px solid #d8cfb6; padding-bottom: 4px; }
    h3 { font-size: 14px; margin: 16px 0 6px; color: #6c5a2c; }
    .meta { color: #666; font-size: 13px; margin-bottom: 24px; }
    .meta .label { color: #888; }
    .narrative { background: #fff8eb; border-left: 3px solid #C9A962; padding: 12px 14px; margin: 12px 0; border-radius: 3px; font-size: 14px; }
    .narrative.highlights { background: #f0f8f4; border-left-color: #6EC49E; }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin: 12px 0 8px; }
    .kpi { background: #fff; border: 1px solid #e5dfc8; border-radius: 4px; padding: 10px 14px; }
    .kpi .label { color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
    .kpi .value { color: #1c1a17; font-size: 22px; font-weight: 600; margin-top: 2px; }
    .breakdown { width: 100%; border-collapse: collapse; font-size: 13px; }
    .breakdown th { text-align: left; color: #888; font-weight: 500; padding: 4px 8px; border-bottom: 1px solid #e5dfc8; }
    .breakdown td { padding: 4px 8px; }
    .breakdown td.name { font-weight: 500; }
    .breakdown td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .breakdown td.pct { color: #888; width: 50px; }
    .breakdown td.bar { width: 200px; }
    .bar-track { height: 8px; background: #efe9d6; border-radius: 2px; overflow: hidden; }
    .bar-fill { height: 100%; background: #C9A962; }
    .badge { background: #C9A962; color: #fff; font-size: 9px; padding: 1px 5px; border-radius: 8px; text-transform: uppercase; letter-spacing: 0.05em; vertical-align: middle; }
    .muted { color: #888; }
    .small { font-size: 12px; }
    .grid-two { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 12px 0; }
    .absences { padding-left: 20px; }
    .absences li { margin: 2px 0; }
    .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #d8cfb6; color: #888; font-size: 11px; }
    @media print {
      body { background: white; max-width: none; padding: 12mm; margin: 0; }
      h1, h2, h3 { color: #6c5a2c; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .narrative, .kpi, .bar-fill, .badge { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .grid-two { grid-template-columns: 1fr 1fr; }
      h2 { break-after: avoid; }
    }
    @media (max-width: 640px) {
      .grid-two { grid-template-columns: 1fr; }
      .breakdown td.bar { display: none; }
    }
  </style>
`;

export function renderReportHtml(data: ReportData): string {
  const generated = new Date(data.meta.generatedAt).toLocaleString('de-CH');
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>${esc(data.meta.title)}</title>
  ${STYLES}
</head>
<body>
  <h1>${esc(data.meta.title)}</h1>
  <div class="meta">
    <div><span class="label">Zeitraum:</span> ${esc(data.meta.range.label)} (${esc(data.meta.range.from)} — ${esc(data.meta.range.to)})</div>
    <div><span class="label">Erstellt:</span> ${esc(generated)}</div>
  </div>

  ${data.narratives.summary ? `<div class="narrative">${esc(data.narratives.summary)}</div>` : ''}

  <h2>KPIs</h2>
  <div class="kpis">
    <div class="kpi">
      <div class="label">Erfasste Stunden</div>
      <div class="value">${esc(formatHoursAdaptive(data.kpis.totalNaiveMs))}</div>
    </div>
    <div class="kpi">
      <div class="label">Aktive Tage</div>
      <div class="value">${data.kpis.workingDays}</div>
    </div>
    <div class="kpi">
      <div class="label">Ø pro Tag</div>
      <div class="value">${esc(formatHoursAdaptive(data.kpis.avgPerDayMs))}</div>
    </div>
    <div class="kpi">
      <div class="label">Einträge</div>
      <div class="value">${data.kpis.entriesCount}</div>
    </div>
  </div>

  ${data.narratives.highlights ? `<div class="narrative highlights">${esc(data.narratives.highlights)}</div>` : ''}

  ${data.perMember && data.perMember.length > 0 ? renderPerMember(data.perMember) : ''}

  <h2>Aufschlüsselung</h2>
  <div class="grid-two">
    <div>
      <h3>Stakeholder</h3>
      ${renderBreakdownTable(data.breakdowns.stakeholders)}
    </div>
    <div>
      <h3>Projekte</h3>
      ${renderBreakdownTable(data.breakdowns.projekte)}
    </div>
    <div>
      <h3>Tätigkeiten</h3>
      ${renderBreakdownTable(data.breakdowns.taetigkeiten)}
    </div>
    <div>
      <h3>Formate</h3>
      ${renderBreakdownTable(data.breakdowns.formate)}
    </div>
  </div>

  ${renderAbsences(data.absences)}

  <div class="footer">
    Generiert mit Zeiterfassung v3 · Multi-Tasking-Anrechnung Naiv (jede Aufgabe zählt voll), Multi-Stakeholder voll auf jedem.
  </div>
</body>
</html>`;
}

/** Öffnet ein neues Fenster mit dem Report und triggert window.print(). */
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
  // Kleine Verzögerung, damit der Browser CSS rendern kann, bevor der
  // Druckdialog kommt.
  setTimeout(() => {
    try {
      w.focus();
      w.print();
    } catch {
      // ignore — User kann manuell drucken
    }
  }, 250);
}

/** Triggert den Browser-Download des Reports als .html-Datei. */
export function downloadReportHtml(
  data: ReportData,
  filename?: string
): void {
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
