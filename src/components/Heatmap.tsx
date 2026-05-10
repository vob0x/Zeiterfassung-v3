/**
 * Heatmap — Stakeholder × Projekt-Matrix mit Intensitäts-Färbung.
 *
 * Naive-Attribution: ein Eintrag mit zwei Stakeholdern und einem Projekt
 * zählt unter beiden Stakeholder-Zeilen voll. Cell-Werte können also
 * scheinbar widersprüchlich aufaddieren (Σ Spalte ≠ Σ Zeile bei Multi-
 * Stakeholder-Einträgen) — das ist der Kompromiss von Multistakeholder.
 *
 * Cells ohne Stunden bleiben transparent (—). Aktive Cells färben sich
 * proportional zur Intensität (max-Wert in der Matrix).
 *
 * Stakeholder/Projekt sind Strings — leere/fehlende Werte landen im
 * "—"-Bucket.
 */

import { useMemo } from 'react';
import type { TimeEntry } from '@/types';
import { getEffectiveDurationMs } from '@/lib/wallclock';
import { isAbsenceEntry } from '@/lib/absences';
import { formatHoursAdaptive } from '@/lib/utils';

interface Props {
  title: string;
  entries: TimeEntry[];
}

interface Cell {
  stakeholder: string;
  projekt: string;
  hours: number;
}

export default function Heatmap({ title, entries }: Props) {
  const { stakeholders, projekte, matrix, maxHours, totalHours } =
    useMemo(() => {
      const stakeholderSet = new Set<string>();
      const projektSet = new Set<string>();
      const m = new Map<string, Map<string, number>>();
      let totalMs = 0;

      for (const e of entries) {
        if (isAbsenceEntry(e)) continue;
        const dur = getEffectiveDurationMs(e);
        if (dur <= 0) continue;
        const projekt = (e.projekt || '—').trim() || '—';
        const sh = Array.isArray(e.stakeholder)
          ? e.stakeholder
          : e.stakeholder
            ? [e.stakeholder]
            : [];
        const list = sh.length === 0 ? ['—'] : sh.map((s) => s || '—');

        for (const stakeholder of list) {
          stakeholderSet.add(stakeholder);
          projektSet.add(projekt);
          const inner = m.get(stakeholder) || new Map<string, number>();
          inner.set(projekt, (inner.get(projekt) || 0) + dur);
          m.set(stakeholder, inner);
          totalMs += dur;
        }
      }

      const sortedSh = Array.from(stakeholderSet).sort();
      const sortedPr = Array.from(projektSet).sort();

      let max = 0;
      for (const inner of m.values()) {
        for (const v of inner.values()) {
          if (v > max) max = v;
        }
      }

      return {
        stakeholders: sortedSh,
        projekte: sortedPr,
        matrix: m,
        maxHours: max / 3_600_000,
        totalHours: totalMs / 3_600_000,
      };
    }, [entries]);

  const getCell = (sh: string, pr: string): Cell | null => {
    const v = matrix.get(sh)?.get(pr);
    if (!v) return null;
    return { stakeholder: sh, projekt: pr, hours: v / 3_600_000 };
  };

  return (
    <div
      className="rounded-lg p-3"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(201,169,98,0.18)',
      }}
    >
      <div
        className="text-xs uppercase tracking-widest mb-2"
        style={{
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <span>{title}</span>
        {totalHours > 0 && (
          <span
            className="font-mono"
            style={{ fontSize: 11, color: 'var(--text-muted)' }}
          >
            Σ {formatHoursAdaptive(totalHours * 3_600_000)}
          </span>
        )}
      </div>

      {stakeholders.length === 0 || projekte.length === 0 ? (
        <div className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
          —
        </div>
      ) : (
        // overflowX:auto schafft den Scroll-Container für position:sticky
        // auf der ersten Spalte. Background auf den sticky-Zellen ist
        // opak (#1c1a17, App-Theme), damit scrollende Daten-Zellen nicht
        // durchscheinen — die Card hat semi-transparenten Hintergrund.
        <div style={{ overflowX: 'auto' }}>
          <table
            className="text-xs"
            style={{
              borderCollapse: 'collapse',
              minWidth: '100%',
              tableLayout: 'fixed',
            }}
          >
            <thead>
              <tr>
                <th
                  className="text-left pb-1.5 pr-2"
                  style={{
                    fontWeight: 500,
                    color: 'var(--text-muted)',
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    width: 140,
                    position: 'sticky',
                    left: 0,
                    background: '#1c1a17',
                    // höher als Body-Sticky, damit Header oben-links über
                    // scrollenden Body-Cells bleibt
                    zIndex: 2,
                    borderRight: '1px solid rgba(201,169,98,0.18)',
                  }}
                ></th>
                {projekte.map((p) => (
                  <th
                    key={p}
                    className="text-center pb-1.5 px-1"
                    style={{
                      fontWeight: 500,
                      color: 'var(--text-muted)',
                      fontSize: 10,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      minWidth: 60,
                      maxWidth: 100,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={p}
                  >
                    {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stakeholders.map((sh) => (
                <tr key={sh}>
                  <td
                    className="pr-2 py-1"
                    style={{
                      color: 'var(--text)',
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      width: 140,
                      position: 'sticky',
                      left: 0,
                      background: '#1c1a17',
                      zIndex: 1,
                      borderRight: '1px solid rgba(201,169,98,0.18)',
                    }}
                    title={sh}
                  >
                    {sh}
                  </td>
                  {projekte.map((pr) => {
                    const cell = getCell(sh, pr);
                    if (!cell) {
                      return (
                        <td
                          key={pr}
                          className="text-center px-1 py-1"
                          style={{ color: 'var(--text-muted)', fontSize: 10 }}
                        >
                          —
                        </td>
                      );
                    }
                    const intensity =
                      maxHours > 0 ? cell.hours / maxHours : 0;
                    const opacity = Math.max(0.15, intensity);
                    return (
                      <td
                        key={pr}
                        className="text-center px-1 py-1"
                        style={{
                          background: `rgba(201,169,98,${opacity * 0.55})`,
                          color: '#f5f1e8',
                          fontFamily: 'var(--font-mono, monospace)',
                          fontSize: 10,
                          borderRadius: 2,
                        }}
                        title={`${sh} · ${pr}: ${cell.hours.toFixed(2)}h`}
                      >
                        {formatHoursAdaptive(cell.hours * 3_600_000)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
