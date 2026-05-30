/**
 * useNotizSuggestions — Top-100 häufigste Notizen aus den vorhandenen
 * Einträgen, für Auto-Suggest via HTML `<datalist>`.
 *
 * Zweck: konsistente Notiz-Sprache. Wer „Überarbeitung 1. Loop" einmal
 * tippt, bekommt es beim nächsten Eintrag als Vorschlag — ohne dass
 * irgendwo eine Notiz-Verwaltungs-Maske entstehen muss.
 *
 * Form:
 *   - Quelle: `entriesStore.entries` (eigene Einträge — Team-Notizen
 *     sind nicht zwingend in der eigenen Sprache, deshalb nur eigene)
 *   - Frequenz-Map über `.trim()`-normalisierte Notizen
 *   - Leere Notizen werden ignoriert
 *   - Sortiert absteigend nach Häufigkeit, bei Gleichstand lexikalisch
 *   - Top 100 (mehr macht datalist im Browser träge)
 *
 * Performance: `useMemo` über `entries`-Referenz — Recompute nur bei
 * Store-Update.
 */

import { useMemo } from 'react';
import { useEntriesStore } from '@/stores/entriesStore';

const MAX_SUGGESTIONS = 100;

export function useNotizSuggestions(): string[] {
  const entries = useEntriesStore((s) => s.entries);

  return useMemo(() => {
    const freq = new Map<string, number>();
    for (const e of entries) {
      const n = (e.notiz ?? '').trim();
      if (!n) continue;
      freq.set(n, (freq.get(n) ?? 0) + 1);
    }
    return Array.from(freq.entries())
      .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
      .slice(0, MAX_SUGGESTIONS)
      .map(([n]) => n);
  }, [entries]);
}
