/**
 * QuickShortcuts — Top-N häufigste Combos als One-Click-Buttons.
 *
 * Default 5 Buttons, einklappbar wenn keine Combos vorhanden (z.B.
 * frischer User ohne Historie). Kein User-Pinning in M3c — Auto-Top-5
 * derived aus entriesStore, voll server-first-konform.
 */

import { useMemo } from 'react';
import { Zap } from 'lucide-react';
import { useEntriesStore } from '@/stores/entriesStore';
import { useTimerStore } from '@/stores/timerStore';
import { useI18n } from '@/i18n';
import {
  buildCombinationStats,
  describeCombination,
  type Combination,
} from '@/lib/combinationStats';

const TOP_N = 5;

export default function QuickShortcuts() {
  const { t } = useI18n();
  const entries = useEntriesStore((s) => s.entries);
  const addSlot = useTimerStore((s) => s.addSlot);

  const top = useMemo(
    () => buildCombinationStats(entries).slice(0, TOP_N),
    [entries]
  );

  if (top.length === 0) return null;

  const apply = (c: Combination) => {
    addSlot({
      stakeholder: c.stakeholder,
      projekt: c.projekt,
      taetigkeit: c.taetigkeit,
      format: c.format,
      notiz: '',
    });
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span
        className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest"
        style={{ color: 'var(--text-muted)' }}
      >
        <Zap size={10} />
        {t('shortcuts.label')}
      </span>
      {top.map((c, i) => (
        <button
          key={i}
          type="button"
          onClick={() => apply(c)}
          className="text-xs px-2 py-1 rounded transition-colors"
          style={{
            background: 'rgba(201,169,98,0.10)',
            border: '1px solid rgba(201,169,98,0.30)',
            color: '#f5f1e8',
            maxWidth: 240,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={describeCombination(c) + `  (×${c.count})`}
        >
          {describeCombination(c)}
        </button>
      ))}
    </div>
  );
}
