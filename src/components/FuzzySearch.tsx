/**
 * FuzzySearch — Live-Search über die Eintrags-Historie.
 *
 * User tippt → Dropdown zeigt passende Combinations (sortiert nach
 * Häufigkeit). Enter oder Click → addSlot mit allen 4 Dimensionen
 * vorbelegt. So spart man die 4-Picker-Klick-Sequenz für wiederkehrende
 * Tasks.
 *
 * Kein neuer State — alle Daten kommen derived aus `entriesStore.entries`.
 * Vollständig server-first-konform.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useEntriesStore } from '@/stores/entriesStore';
import { useTimerStore } from '@/stores/timerStore';
import { useI18n } from '@/i18n';
import {
  buildCombinationStats,
  filterCombinations,
  describeCombination,
  type Combination,
} from '@/lib/combinationStats';

const MAX_SUGGESTIONS = 8;

export default function FuzzySearch() {
  const { t } = useI18n();
  const entries = useEntriesStore((s) => s.entries);
  const addSlot = useTimerStore((s) => s.addSlot);

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Memo: alle Combinations einmal pro entries-Wechsel berechnen.
  const allCombos = useMemo(() => buildCombinationStats(entries), [entries]);

  // Memo: gefilterte Combos nach query.
  const suggestions = useMemo(
    () => filterCombinations(allCombos, query).slice(0, MAX_SUGGESTIONS),
    [allCombos, query]
  );

  // Highlight zurücksetzen bei query-Wechsel
  useEffect(() => {
    setHighlight(0);
  }, [query]);

  // Outside-click schließt
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent | TouchEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('touchstart', onDocClick);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('touchstart', onDocClick);
    };
  }, [open]);

  // Globaler Keystroke-Capture — wie in v2: lostippen ohne erst ins
  // Suchfeld zu klicken. Nur wenn nichts anderes Fokus hat (kein
  // Input/Textarea/Button/Link/contenteditable), keine Modifier-Keys
  // gedrückt sind, und es ein druckbares Zeichen ist (key.length === 1).
  // Der erste getippte Buchstabe landet via setQuery in der Suche, danach
  // läuft alles über den nativen onChange-Handler weiter.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Skip wenn andere Element Fokus hat (User tippt schon woanders)
      const active = document.activeElement;
      if (active && active !== document.body) {
        const tag = active.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          tag === 'BUTTON' ||
          tag === 'A' ||
          (active as HTMLElement).isContentEditable
        ) {
          return;
        }
      }
      // Skip wenn Modifier-Keys gedrückt (Cmd+R, Ctrl+F, etc. nicht abfangen)
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Skip wenn kein druckbares Zeichen
      if (e.key.length !== 1) return;

      e.preventDefault();
      inputRef.current?.focus();
      setQuery((q) => q + e.key);
      setOpen(true);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const apply = (c: Combination) => {
    addSlot({
      stakeholder: c.stakeholder,
      projekt: c.projekt,
      taetigkeit: c.taetigkeit,
      format: c.format,
      notiz: '',
    });
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      e.currentTarget.blur();
      return;
    }
    if (!suggestions.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (suggestions[highlight]) apply(suggestions[highlight]);
    }
  };

  const showDropdown = open && suggestions.length > 0;
  const showEmpty =
    open && suggestions.length === 0 && allCombos.length > 0 && query.trim();

  return (
    <div ref={wrapperRef} className="relative" style={{ minWidth: 0 }}>
      <div
        className="flex items-center gap-2 px-2.5 py-1.5 rounded"
        style={{
          background: '#25221e',
          border: '1px solid var(--border)',
        }}
      >
        <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={t('fuzzy.placeholder')}
          className="flex-1 bg-transparent border-none outline-none text-xs"
          style={{ color: '#f5f1e8', minWidth: 0 }}
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            className="p-0.5 hover:opacity-70"
            style={{ color: 'var(--text-muted)' }}
            aria-label={t('fuzzy.clear')}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {(showDropdown || showEmpty) && (
        <div
          className="absolute z-30 left-0 right-0 mt-1 rounded shadow-lg overflow-hidden"
          style={{
            background: '#25221e',
            border: '1px solid var(--border)',
            maxHeight: 320,
          }}
        >
          {showEmpty ? (
            <div
              className="px-3 py-2 text-xs italic"
              style={{ color: 'var(--text-muted)' }}
            >
              {t('fuzzy.noMatch')}
            </div>
          ) : (
            <ul style={{ overflow: 'auto', maxHeight: 320 }}>
              {suggestions.map((c, i) => {
                const active = i === highlight;
                return (
                  <li key={i}>
                    <button
                      type="button"
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => apply(c)}
                      className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2"
                      style={{
                        background: active
                          ? 'rgba(201,169,98,0.18)'
                          : 'transparent',
                        color: '#f5f1e8',
                      }}
                    >
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {describeCombination(c)}
                      </span>
                      <span
                        className="font-mono"
                        style={{
                          fontSize: 10,
                          color: 'var(--text-muted)',
                          flexShrink: 0,
                        }}
                      >
                        ×{c.count}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
