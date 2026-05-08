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
 * Bar-Visualisierung normalisiert auf das Maximum der Liste — der
 * längste Balken ist 100% breit, andere proportional.
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

  const max = rows.length > 0 ? rows[0].hours : 1;
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
        <ul className="space-y-1">
          {visible.map((r) => (
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
                  style={{ color: 'var(--text-muted)', flexShrink: 0 }}
                >
                  {formatHoursAdaptive(r.hours * 3_600_000)}
                </span>
              </div>
              {/* Bar */}
              <div
                style={{
                  height: 4,
                  borderRadius: 2,
                  background: `${accent}15`,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${Math.max(2, (r.hours / max) * 100)}%`,
                    height: '100%',
                    background: accent,
                    opacity: 0.7,
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>
            </li>
          ))}
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
