/**
 * reportRenderer — Dispatcher zu den brillenspezifischen Renderern.
 *
 * Welle 4 hat den Universal-Renderer durch vier eigenständige
 * Brillen-Renderer ersetzt (lib/reports/board, coach, lead, chef).
 * Dieses Modul macht nur noch zwei Dinge:
 *   1. Dispatcher Body-Render je nach data.lens → der richtige Renderer
 *   2. wrap + download/print wie bisher
 *
 * Die Modal-Vorschau ruft `renderReportBody(data)` direkt auf und
 * embedded das HTML in einen Vorschau-Container. Print/Download rufen
 * `renderReportHtml(data)` für das vollständige Dokument.
 */

import type { ReportData, ReportLens } from './reportData';
import { wrapAsDocument } from './reports/shared';
import { renderBoardBody } from './reports/board';
import { renderCoachBody } from './reports/coach';
import { renderLeadBody } from './reports/lead';
import { renderChefBody } from './reports/chef';

/** Dispatcher Lens → Body-Renderer. Exhaustiv typchecked. */
const LENS_RENDERERS: Record<ReportLens, (d: ReportData) => string> = {
  board: renderBoardBody,
  coach: renderCoachBody,
  lead: renderLeadBody,
  chef: renderChefBody,
};

const LENS_LABELS: Record<ReportLens, string> = {
  coach: 'Coach',
  lead: 'Teamleader',
  chef: 'Direktion',
  board: 'Geschäftsleitung',
};

/**
 * Liefert nur den Body-HTML der Brille — ohne `<html>`-Hülle, ohne
 * `<style>`-Block. Für die Modal-Vorschau. Die Vorschau läuft in einem
 * iframe mit eigenen Styles oder embedded in einem Container.
 */
export function renderReportBody(data: ReportData): string {
  return LENS_RENDERERS[data.lens](data);
}

/**
 * Liefert das vollständige HTML-Dokument inkl. `<style>` und Document-
 * Wrapper. Für Print + Download.
 */
export function renderReportHtml(data: ReportData): string {
  const body = LENS_RENDERERS[data.lens](data);
  return wrapAsDocument(data, body, LENS_LABELS[data.lens]);
}

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
  return `report-${data.lens}-${safeSubject || 'team'}-${data.meta.range.from}.html`;
}

/**
 * Style-Block separat exportiert — für die Modal-Vorschau, die das Body-
 * HTML eines Brillen-Renderers in einem isolierten Container darstellt.
 * Direktes <style>-Tag-Einbinden in den Body würde die App-Styles
 * kontaminieren, daher empfiehlt der Aufrufer ein iframe oder
 * Shadow-DOM.
 */
export { REPORT_STYLES } from './reports/shared';
