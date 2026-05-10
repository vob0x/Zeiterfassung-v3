/**
 * ReportModal — Modal-Dialog zum Generieren und Editieren eines Reports.
 *
 * Workflow:
 *   1. Auf Dashboard „Report"-Button klicken → Modal öffnet
 *   2. Auto-generiertes Management-Summary (HTML) erscheint im Editor
 *   3. Vorschau zeigt KPIs + Coverage-Snapshot
 *   4. Print / Download / Schließen
 *
 * Daten-Inputs kommen vom Aufrufer (DashboardView): bereits gefilterte
 * `entries`, `range` und `scope`. Das Modal selbst ist dumm — keine
 * eigene Period- oder Scope-Logik.
 *
 * Loop-4-Refactor: der Editor enthält jetzt das komplette qualitative
 * Summary als HTML (mehrere Paragraphen), nicht mehr Summary + Highlights
 * getrennt. Findings sind read-only — sie werden algorithmisch berechnet.
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
import type { TimeEntry, TeamMemberWithRole } from '@/types';
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

function fmt(ms: number): string {
  if (!ms || ms <= 0) return '0:00h';
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, '0')}h`;
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

  // Lokales Narrative-State (editierbar)
  const [narrativeHtml, setNarrativeHtml] = useState(baseData.narrativeHtml);
  useEffect(() => {
    setNarrativeHtml(baseData.narrativeHtml);
  }, [baseData]);

  // Finales Daten-Objekt mit dem aktuellen Narrative
  const finalData = useMemo(
    () => ({ ...baseData, narrativeHtml }),
    [baseData, narrativeHtml]
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const k = finalData.kpis;
  const covPct = k.coverage * 100;
  const covColor = covPct >= 80 ? '#6EC49E' : covPct >= 60 ? '#C9A962' : '#D4706E';

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
          maxWidth: 760,
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
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
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

        {/* Body */}
        <div className="px-4 py-3 space-y-3" style={{ overflowY: 'auto', flex: 1 }}>
          {/* KPI-Tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <KpiTile label={t('report.kpiWallclock')} value={fmt(k.totalWallclockMs)} />
            <KpiTile label={t('report.kpiPresence')} value={fmt(k.totalPresenceMs)} />
            <KpiTile
              label={t('report.kpiCoverage')}
              value={`${covPct.toFixed(0)}%`}
              accent={covColor}
            />
            <KpiTile
              label={t('report.kpiMultiTask')}
              value={`${k.multiTaskingFactor.toFixed(2)}x`}
            />
            <KpiTile
              label={t('report.kpiProductive')}
              value={`${k.productivePct.toFixed(0)}%`}
            />
            <KpiTile
              label={t('report.kpiDays')}
              value={`${k.workingDays}`}
              sub={t('report.kpiDaysSub')}
            />
          </div>

          {/* Coverage-Snapshot */}
          <div
            className="rounded p-3 grid grid-cols-3 gap-2 text-xs"
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border)',
            }}
          >
            <CovBucket count={finalData.coverage.daysGood} label="≥80%" color="#6EC49E" />
            <CovBucket count={finalData.coverage.daysOk} label="60–80%" color="#C9A962" />
            <CovBucket count={finalData.coverage.daysThin} label="<60%" color="#D4706E" />
          </div>

          {/* Narrative-Editor */}
          <div>
            <label
              className="text-[10px] uppercase tracking-widest block mb-1"
              style={{ color: 'var(--text-muted)' }}
            >
              {t('report.summary')}
              <span
                className="ml-2 normal-case"
                style={{ fontWeight: 400, opacity: 0.7 }}
              >
                ({t('report.summaryHint')})
              </span>
            </label>
            <textarea
              value={narrativeHtml}
              onChange={(e) => setNarrativeHtml(e.target.value)}
              rows={10}
              className="w-full text-xs rounded p-2 bg-neutral-800 border border-neutral-700 focus:border-amber-600 focus:outline-none resize-y font-mono"
              style={{ color: 'var(--text)', minHeight: 160 }}
            />
          </div>

          {/* Findings-Preview (read-only) */}
          {finalData.findings.length > 0 && (
            <div>
              <div
                className="text-[10px] uppercase tracking-widest mb-1"
                style={{ color: 'var(--text-muted)' }}
              >
                {t('report.findings')}
              </div>
              <div className="space-y-1.5">
                {finalData.findings.map((f, i) => {
                  const color =
                    f.level === 'warn'
                      ? '#D4706E'
                      : f.level === 'info'
                        ? '#6EC49E'
                        : '#5BA4D9';
                  return (
                    <div
                      key={i}
                      className="text-xs rounded p-2"
                      style={{
                        background: `${color}1a`,
                        border: `1px solid ${color}55`,
                        color: 'var(--text)',
                      }}
                      // findings sind read-only und aus eigenem Datensatz (kein User-Input)
                      dangerouslySetInnerHTML={{ __html: f.htmlMessage }}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Per-Member preview (Team) */}
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
                  maxHeight: 120,
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
                    <span className="font-mono" style={{ color: 'var(--text-muted)' }}>
                      {fmt(m.ms)} · {m.pct.toFixed(0)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
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

function KpiTile({
  label,
  value,
  sub,
  accent = '#C9A962',
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      className="rounded p-2"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${accent}`,
      }}
    >
      <div
        className="text-[10px] uppercase tracking-widest"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </div>
      <div className="text-base font-bold font-mono" style={{ color: '#C9A962' }}>
        {value}
      </div>
      {sub && (
        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function CovBucket({
  count,
  label,
  color,
}: {
  count: number;
  label: string;
  color: string;
}) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '6px 4px',
        borderLeft: `3px solid ${color}`,
        background: 'rgba(255,255,255,0.02)',
      }}
    >
      <div
        className="text-lg font-bold font-mono"
        style={{ color: 'var(--text)' }}
      >
        {count}
      </div>
      <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
        {label}
      </div>
    </div>
  );
}
