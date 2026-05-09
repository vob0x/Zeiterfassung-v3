/**
 * ReportModal — Modal-Dialog zum Generieren und Editieren eines Reports.
 *
 * Workflow:
 *   1. Auf Dashboard „Report"-Button klicken → Modal öffnet
 *   2. Auto-Generierte Narrative-Texte erscheinen — User kann editieren
 *   3. Vorschau zeigt KPIs und Top-Breakdowns
 *   4. Print / Download / Schließen
 *
 * Daten-Inputs kommen vom Aufrufer (DashboardView): bereits gefilterte
 * `entries`, der `range` und der `scope`. Das Modal selbst ist „dumm" —
 * keine eigene Period- oder Scope-Logik.
 */

import { useEffect, useMemo, useState } from 'react';
import { Download, Printer, X } from 'lucide-react';
import {
  buildReportData,
  type ReportRange,
  type ReportScope,
} from '@/lib/reportData';
import {
  downloadReportHtml,
  openReportPrintWindow,
} from '@/lib/reportRenderer';
import { formatHoursAdaptive } from '@/lib/utils';
import type { TimeEntry } from '@/types';
import type { TeamMemberWithRole } from '@/types';
import { useI18n } from '@/i18n';

interface ReportModalProps {
  open: boolean;
  onClose: () => void;
  entries: TimeEntry[];
  range: ReportRange;
  scope: ReportScope;
  subjectName: string;
  /** Nur für scope === 'team'. */
  members?: TeamMemberWithRole[];
}

export default function ReportModal({
  open,
  onClose,
  entries,
  range,
  scope,
  subjectName,
  members = [],
}: ReportModalProps) {
  const { t } = useI18n();

  // Frische Report-Daten generieren bei jeder Öffnung — die Eingabedaten
  // (entries, range, scope, subject) sind die Identitäts-Schlüssel.
  const baseData = useMemo(
    () =>
      buildReportData(entries, {
        scope,
        range,
        subjectName,
        members: members.map((m) => ({
          user_id: m.user_id,
          codename: m.codename,
          role: m.role,
        })),
      }),
    [entries, range, scope, subjectName, members]
  );

  // Lokale Narrative-States, damit der User editieren kann ohne dass
  // ein Re-Compute beim Tippen den Text überschreibt.
  const [summary, setSummary] = useState(baseData.narratives.summary);
  const [highlights, setHighlights] = useState(baseData.narratives.highlights);

  // Wenn die Eingabedaten sich ändern (Modal frisch geöffnet, andere
  // Period etc.), Narratives neu setzen.
  useEffect(() => {
    setSummary(baseData.narratives.summary);
    setHighlights(baseData.narratives.highlights);
  }, [baseData]);

  // Final-Datenobjekt mit aktuellen Narratives für Render/Download/Print
  const finalData = useMemo(
    () => ({
      ...baseData,
      narratives: { summary, highlights },
    }),
    [baseData, summary, highlights]
  );

  // ESC-Key schließt
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('report.title')}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: 16,
        overflow: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1c1a17',
          border: '1px solid var(--border)',
          borderRadius: 8,
          width: '100%',
          maxWidth: 720,
          maxHeight: 'calc(100vh - 32px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between gap-2 px-4 py-3"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="min-w-0">
            <div
              className="text-xs uppercase tracking-widest"
              style={{ color: 'var(--text-muted)' }}
            >
              {t('report.title')}
            </div>
            <div
              className="text-base font-medium truncate"
              style={{ color: '#C9A962' }}
            >
              {finalData.meta.title}
            </div>
            <div
              className="text-xs"
              style={{ color: 'var(--text-muted)' }}
            >
              {finalData.meta.range.label}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded hover:bg-neutral-800"
            style={{ color: 'var(--text-muted)' }}
            aria-label={t('app.close')}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body — scrollbar */}
        <div
          className="px-4 py-3 space-y-3"
          style={{ overflowY: 'auto', flex: 1 }}
        >
          {/* KPIs */}
          <div
            className="grid grid-cols-2 sm:grid-cols-4 gap-2"
          >
            <KpiTile
              label={t('report.kpiHours')}
              value={formatHoursAdaptive(finalData.kpis.totalNaiveMs)}
            />
            <KpiTile
              label={t('report.kpiDays')}
              value={String(finalData.kpis.workingDays)}
            />
            <KpiTile
              label={t('report.kpiAvg')}
              value={formatHoursAdaptive(finalData.kpis.avgPerDayMs)}
            />
            <KpiTile
              label={t('report.kpiEntries')}
              value={String(finalData.kpis.entriesCount)}
            />
          </div>

          {/* Narrative-Editor: Zusammenfassung */}
          <div>
            <label
              className="text-[10px] uppercase tracking-widest block mb-1"
              style={{ color: 'var(--text-muted)' }}
            >
              {t('report.summary')}
            </label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              className="w-full text-xs rounded p-2 bg-neutral-800 border border-neutral-700 focus:border-amber-600 focus:outline-none resize-y"
              style={{ color: 'var(--text)', minHeight: 60 }}
            />
          </div>

          {/* Narrative-Editor: Highlights */}
          <div>
            <label
              className="text-[10px] uppercase tracking-widest block mb-1"
              style={{ color: 'var(--text-muted)' }}
            >
              {t('report.highlights')}
            </label>
            <textarea
              value={highlights}
              onChange={(e) => setHighlights(e.target.value)}
              rows={3}
              className="w-full text-xs rounded p-2 bg-neutral-800 border border-neutral-700 focus:border-amber-600 focus:outline-none resize-y"
              style={{ color: 'var(--text)', minHeight: 60 }}
            />
          </div>

          {/* Per-Member Vorschau (nur bei team scope) */}
          {finalData.perMember && finalData.perMember.length > 0 && (
            <div>
              <div
                className="text-[10px] uppercase tracking-widest mb-1"
                style={{ color: 'var(--text-muted)' }}
              >
                {t('report.perMember')}
              </div>
              <ul
                className="text-xs rounded p-2 space-y-1"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid var(--border)',
                  maxHeight: 140,
                  overflowY: 'auto',
                }}
              >
                {finalData.perMember.map((m) => (
                  <li
                    key={m.userId}
                    className="flex items-center justify-between gap-2"
                  >
                    <span style={{ color: 'var(--text)' }}>
                      {m.codename}
                      {m.role === 'admin' && (
                        <span
                          className="ml-1.5 text-[9px] uppercase tracking-widest"
                          style={{ color: '#C9A962' }}
                        >
                          ★
                        </span>
                      )}
                    </span>
                    <span
                      className="font-mono"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {formatHoursAdaptive(m.ms)} · {Math.round(m.pct)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Top-3 Breakdowns als Vorschau */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <BreakdownPreview
              title={t('list.stakeholdersCount')}
              rows={finalData.breakdowns.stakeholders.slice(0, 5)}
            />
            <BreakdownPreview
              title={t('list.projectsCount')}
              rows={finalData.breakdowns.projekte.slice(0, 5)}
            />
            <BreakdownPreview
              title={t('list.activitiesCount')}
              rows={finalData.breakdowns.taetigkeiten.slice(0, 5)}
            />
            <BreakdownPreview
              title={t('list.formatsCount')}
              rows={finalData.breakdowns.formate.slice(0, 5)}
            />
          </div>
        </div>

        {/* Footer mit Actions */}
        <div
          className="flex items-center justify-end gap-2 px-4 py-3"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <button
            type="button"
            onClick={() => downloadReportHtml(finalData)}
            className="text-xs py-1.5 px-3 rounded flex items-center gap-1.5"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
            }}
          >
            <Download size={12} />
            {t('report.download')}
          </button>
          <button
            type="button"
            onClick={() => openReportPrintWindow(finalData)}
            className="text-xs py-1.5 px-3 rounded flex items-center gap-1.5 font-medium"
            style={{
              background: '#C9A962',
              color: '#1c1a17',
              border: '1px solid #C9A962',
            }}
          >
            <Printer size={12} />
            {t('report.print')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Sub-Komponenten
   ───────────────────────────────────────────────────────────────────── */

function KpiTile({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded p-2"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid var(--border)',
      }}
    >
      <div
        className="text-[10px] uppercase tracking-widest"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </div>
      <div
        className="text-base font-bold font-mono"
        style={{ color: '#C9A962' }}
      >
        {value}
      </div>
    </div>
  );
}

function BreakdownPreview({
  title,
  rows,
}: {
  title: string;
  rows: { name: string; ms: number; pct: number }[];
}) {
  if (rows.length === 0) return null;
  return (
    <div
      className="rounded p-2"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid var(--border)',
      }}
    >
      <div
        className="text-[10px] uppercase tracking-widest mb-1"
        style={{ color: 'var(--text-muted)' }}
      >
        {title}
      </div>
      <ul className="text-xs space-y-0.5">
        {rows.map((r, i) => (
          <li
            key={`${r.name}-${i}`}
            className="flex items-baseline justify-between gap-2"
          >
            <span
              className="truncate"
              style={{ color: 'var(--text)', flex: 1 }}
              title={r.name}
            >
              {r.name}
            </span>
            <span
              className="font-mono"
              style={{ color: 'var(--text-muted)' }}
            >
              {Math.round(r.pct)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
