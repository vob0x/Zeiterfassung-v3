/**
 * ReportModal — Brille auswählen, Live-Vorschau, Print/Download.
 *
 * Welle 4: keine Textarea mehr. Reports sind automatisiert und zielgruppen-
 * optimiert; was du in der Vorschau siehst, ist exakt das, was Print und
 * Download produzieren. Der Lens-Picker oben wechselt die Brille, die
 * Vorschau rendert den brillenspezifischen HTML-Body in einem iframe
 * (Style-Isolation gegen die App-Styles).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Printer, X } from 'lucide-react';
import {
  buildReportData,
  type ReportLens,
  type ReportRange,
  type ReportScope,
} from '@/lib/reportData';
import {
  downloadReportHtml,
  openReportPrintWindow,
  renderReportBody,
  REPORT_STYLES,
} from '@/lib/reportRenderer';
import type { ProjectCategory, TimeEntry, TeamMemberWithRole } from '@/types';
import { useI18n } from '@/i18n';
import { useMasterStore } from '@/stores/masterStore';
import { useAuthStore } from '@/stores/authStore';
import { useTeamStore } from '@/stores/teamStore';

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

  // Default-Brille: Coach (Selbst-Reflexion ist der typische Einstieg).
  const [lens, setLens] = useState<ReportLens>('coach');

  // Welle 6 — Projekt-Klassifikationen aus dem masterStore. Wird an
  // buildReportData übergeben, damit der Reaktivitäts-Index, Krisen-
  // Modus und die Mikro-Slot-Re-Interpretation greifen können. Map
  // Projektname → Kategorie. Wenn die Spalte leer ist, fällt der Code
  // im buildReportData auf die Heuristik aus dem Namen zurück.
  const projects = useMasterStore((s) => s.projects);
  const projectCategories = useMemo(() => {
    const m = new Map<string, ProjectCategory>();
    for (const p of projects) {
      if (p.category) m.set(p.name, p.category);
    }
    return m;
  }, [projects]);

  // Welle 8 — Beschäftigungsgrad. Self: eigener Workload aus team_members
  // (Solo-User ohne Team: Default 100). Team: gewichteter Schnitt über
  // alle Mitglieder, gewichtet nach der Member-Anzahl Einträge im Range
  // (Member ohne Daten zählen nicht mit), Fallback einfacher Schnitt.
  // Member-Scope: der einzelne Member.
  const profileId = useAuthStore((s) => s.profile?.id);
  const teamMembers = useTeamStore((s) => s.members);
  const workloadPct = useMemo(() => {
    if (scope === 'self') {
      const me = teamMembers.find((m) => m.user_id === profileId);
      return me?.workload_pct ?? 100;
    }
    if (scope === 'member') {
      const m = members.find((mm) => mm.user_id === profileId);
      // 'member' (foreign view): scopen wir auf den gerade ausgewählten
      // Member, dessen Daten in entries[] kommen. Wir nehmen den
      // einzigen, der in members[] steckt.
      const single = members[0];
      return (single?.workload_pct ?? m?.workload_pct ?? 100);
    }
    // team: gewichteter Durchschnitt
    if (members.length === 0) return 100;
    const counts = new Map<string, number>();
    for (const e of entries) {
      counts.set(e.user_id, (counts.get(e.user_id) || 0) + 1);
    }
    let weightedSum = 0;
    let totalWeight = 0;
    for (const m of members) {
      const w = counts.get(m.user_id) ?? 0;
      weightedSum += (m.workload_pct ?? 100) * w;
      totalWeight += w;
    }
    if (totalWeight > 0) return weightedSum / totalWeight;
    // Fallback: einfacher Schnitt, wenn keine Einträge mapbar sind
    const simpleSum = members.reduce(
      (a, m) => a + (m.workload_pct ?? 100),
      0
    );
    return simpleSum / members.length;
  }, [scope, profileId, teamMembers, members, entries]);

  const data = useMemo(
    () =>
      buildReportData(entries, {
        scope,
        range,
        subjectName,
        lens,
        members: members.map((m) => ({
          user_id: m.user_id,
          codename: m.codename,
          role: m.role,
        })),
        projectCategories,
        workloadPct,
      }),
    [
      entries,
      range,
      scope,
      subjectName,
      members,
      lens,
      projectCategories,
      workloadPct,
    ]
  );

  const bodyHtml = useMemo(() => renderReportBody(data), [data]);

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
          maxWidth: 880,
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
              {data.meta.title}
            </div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {data.meta.range.label}
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
          <LensPicker lens={lens} onChange={setLens} t={t} />
          <ReportPreview bodyHtml={bodyHtml} />
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-4 py-3"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <button
            type="button"
            onClick={() => downloadReportHtml(data)}
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
            onClick={() => openReportPrintWindow(data)}
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

/**
 * Vorschau via iframe — Style-Isolation gegen die dunkle App-UI. Das
 * iframe lädt das gleiche STYLE-Block, das auch Print/Download verwenden,
 * deshalb sieht die Vorschau identisch aus wie der Output.
 */
function ReportPreview({ bodyHtml }: { bodyHtml: string }) {
  const ref = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = ref.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"/>${REPORT_STYLES}</head><body>${bodyHtml}</body></html>`);
    doc.close();
  }, [bodyHtml]);

  return (
    <div
      style={{
        background: '#fdfbf6',
        borderRadius: 6,
        border: '1px solid var(--border)',
        overflow: 'hidden',
      }}
    >
      <iframe
        ref={ref}
        title="Report-Vorschau"
        style={{
          width: '100%',
          height: '60vh',
          border: 'none',
          display: 'block',
        }}
      />
    </div>
  );
}

/**
 * LensPicker — vier Brillen. Aktive ist gold gerahmt, Hint-Text pro
 * Kachel erklärt den Zweck. Bewusst kein Dropdown — die vier Optionen
 * sichtbar machen.
 */
function LensPicker({
  lens,
  onChange,
  t,
}: {
  lens: ReportLens;
  onChange: (l: ReportLens) => void;
  t: (k: string) => string;
}) {
  const options: Array<{ key: ReportLens; label: string; hint: string }> = [
    { key: 'coach', label: t('report.lens.coach'), hint: t('report.lens.coachHint') },
    { key: 'lead', label: t('report.lens.lead'), hint: t('report.lens.leadHint') },
    { key: 'chef', label: t('report.lens.chef'), hint: t('report.lens.chefHint') },
    { key: 'board', label: t('report.lens.board'), hint: t('report.lens.boardHint') },
  ];
  return (
    <div>
      <div
        className="text-[10px] uppercase tracking-widest mb-1"
        style={{ color: 'var(--text-muted)' }}
      >
        {t('report.lens.label')}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        {options.map((o) => {
          const active = o.key === lens;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => onChange(o.key)}
              title={o.hint}
              className="text-left rounded p-2 transition-colors"
              style={{
                background: active
                  ? 'rgba(201,169,98,0.18)'
                  : 'rgba(255,255,255,0.02)',
                border: active
                  ? '1px solid #C9A962'
                  : '1px solid var(--border)',
                color: active ? '#C9A962' : 'var(--text)',
              }}
            >
              <div
                className="text-xs"
                style={{ fontWeight: active ? 600 : 500 }}
              >
                {o.label}
              </div>
              <div
                className="text-[10px] mt-0.5"
                style={{ color: 'var(--text-muted)' }}
              >
                {o.hint}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
