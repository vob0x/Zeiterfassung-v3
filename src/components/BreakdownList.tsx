/**
 * BreakdownList — Wiederverwendbare Aufschlüsselung der Einträge nach
 * einer Dimension (Stakeholder, Projekt, Tätigkeit, Format).
 *
 * Naive Summe der Eintragsdauern pro Wert dieser Dimension. Sortiert
 * absteigend nach Stunden. Optional Top-N (sonst alle).
 *
 * Stakeholder hat Multistakeholder-Semantik: ein Eintrag mit zwei
 * Stakeholdern zählt unter beiden voll (Naive-Attribution). Andere
 * Dimensionen sind single-valued, kein Multistakeholder-Edge.
 *
 * Bar-Visualisierung: Anteil am Gesamttotal der Liste. Damit summieren
 * sich die Prozent für Single-Value-Dimensionen auf 100%. Bei
 * Stakeholdern mit Multi-Attribution kann das Total der Buckets über
 * der Netto-Erfassungszeit liegen — die Prozente bleiben korrekt
 * relativ zueinander, summieren aber weiterhin zu 100%.
 */

import { useMemo } from 'react';
import type { TimeEntry } from '@/types';
import { getEffectiveDurationMs } from '@/lib/wallclock';
import { isAbsenceEntry } from '@/lib/absences';
import { formatHoursAdaptive } from '@/lib/utils';

export type Dimension = 'stakeholder' | 'projekt' | 'taetigkeit' | 'format';

interface Props {
  title: string;
  entries: TimeEntry[];
  dimension: Dimension;
  /** Maximum-Anzahl Zeilen, default 10 (Top-N). null = alle. */
  maxRows?: number | null;
  /** Akzent-Farbe (Tailwind/CSS-Color). */
  accent?: string;
}

interface Row {
  key: string;
  hours: number;
}

export default function BreakdownList({
  title,
  entries,
  dimension,
  maxRows = 10,
  accent = '#C9A962',
}: Props) {
  const rows = useMemo<Row[]>(() => {
    const buckets = new Map<string, number>();
    for (const e of entries) {
      if (isAbsenceEntry(e)) continue;
      const dur = getEffectiveDurationMs(e);
      if (dur <= 0) continue;
      if (dimension === 'stakeholder') {
        // Multistakeholder: Naive-Attribution — voll auf jedem
        const sh = Array.isArray(e.stakeholder)
          ? e.stakeholder
          : e.stakeholder
            ? [e.stakeholder]
            : [];
        if (sh.length === 0) {
          buckets.set('—', (buckets.get('—') || 0) + dur);
        } else {
          for (const s of sh) {
            const key = s || '—';
            buckets.set(key, (buckets.get(key) || 0) + dur);
          }
        }
      } else {
        const key = (e[dimension] || '—') as string;
        buckets.set(key, (buckets.get(key) || 0) + dur);
      }
    }
    const list = Array.from(buckets.entries()).map(([key, ms]) => ({
      key,
      hours: ms / 3_600_000,
    }));
    list.sort((a, b) => b.hours - a.hours);
    return list;
  }, [entries, dimension]);

  const total = rows.reduce((acc, r) => acc + r.hours, 0);
  const visible = maxRows == null ? rows : rows.slice(0, maxRows);
  const truncated = maxRows != null && rows.length > maxRows;

  return (
    <div
      className="rounded-lg p-3"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: `1px solid ${accent}30`,
      }}
    >
      <div
        className="text-xs uppercase tracking-widest mb-2"
        style={{ color: 'var(--text-muted)' }}
      >
        {title}
      </div>

      {rows.length === 0 ? (
        <div className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
          —
        </div>
      ) : (
        <ul className="space-y-1.5">
          {visible.map((r) => {
            const pct = total > 0 ? (r.hours / total) * 100 : 0;
            const pctRounded = Math.round(pct);
            const barWidth = Math.max(2, pct);
            // Prozent-Label nur in der Bar, wenn die Bar breit genug ist —
            // sonst rechts daneben hinter der Stunden-Angabe.
            const labelInside = pct >= 12;
            return (
              <li
                key={r.key}
                className="text-xs"
                style={{ color: 'var(--text)' }}
              >
                <div className="flex items-baseline justify-between gap-2 mb-0.5">
                  <span
                    className="truncate"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {r.key}
                  </span>
                  <span
                    className="font-mono"
                    style={{
                      color: 'var(--text-muted)',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 6,
                    }}
                  >
                    {!labelInside && pctRounded > 0 && (
                      <span style={{ fontSize: 10, opacity: 0.7 }}>
                        {pctRounded}%
                      </span>
                    )}
                    <span>{formatHoursAdaptive(r.hours * 3_600_000)}</span>
                  </span>
                </div>
                {/* Bar */}
                <div
                  style={{
                    height: 14,
                    borderRadius: 3,
                    background: `${accent}15`,
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      width: `${barWidth}%`,
                      height: '100%',
                      background: accent,
                      opacity: 0.75,
                      transition: 'width 0.4s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      paddingRight: labelInside ? 5 : 0,
                      boxSizing: 'border-box',
                    }}
                  >
                    {labelInside && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 600,
                          color: '#1c1a17',
                          letterSpacing: '0.02em',
                          fontFamily:
                            'ui-monospace, SFMono-Regular, Menlo, monospace',
                        }}
                      >
                        {pctRounded}%
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
          {truncated && (
            <li className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
              … +{rows.length - (maxRows ?? 0)}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
