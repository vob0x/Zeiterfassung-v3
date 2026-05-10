/**
 * Picker — wiederverwendbares Auswahl-Element für Master-Daten.
 *
 * Zwei Modi:
 *   - mode="single" (Default): exakt ein Wert, value: string, onChange(value)
 *   - mode="multi":            mehrere Werte, value: string[], onChange(values)
 *
 * Features:
 *   - Suchbar inline (Filter)
 *   - "+ Hinzufügen: X" wenn der eingetippte Text noch nicht in den
 *     Optionen ist UND `onAdd` gesetzt ist (legt einen neuen Master-
 *     Daten-Eintrag an)
 *   - Klick außerhalb schließt
 *   - Aktuelle Auswahl als Chip(s) im Trigger
 *
 * Bewusst einfacher gehalten als v2's InlinePicker — kein Drag-Drop,
 * keine Sort, keine Aliases. Wenn das in M3b/M4 zu eng wird,
 * erweitern.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
} from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import { useI18n } from '@/i18n';

interface PickerOption {
  id: string;
  name: string;
}

interface BaseProps {
  options: PickerOption[];
  /** Optional async callback um neuen Master-Daten-Eintrag anzulegen.
   *  Wenn nicht gesetzt, ist die "+ Hinzufügen"-Action versteckt. */
  onAdd?: (name: string) => Promise<{ id: string; name: string }>;
  placeholder?: string;
  disabled?: boolean;
}

interface SingleProps extends BaseProps {
  mode?: 'single';
  value: string;
  onChange: (value: string) => void;
}

interface MultiProps extends BaseProps {
  mode: 'multi';
  value: string[];
  onChange: (values: string[]) => void;
}

type Props = SingleProps | MultiProps;

export default function Picker(props: Props) {
  const { t } = useI18n();
  const { options, onAdd, placeholder, disabled } = props;
  const isMulti = props.mode === 'multi';
  const selectedNames: string[] = isMulti
    ? (props.value as string[])
    : props.value
      ? [props.value as string]
      : [];

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Klick außerhalb schließt
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent | TouchEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('touchstart', onDocClick);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('touchstart', onDocClick);
    };
  }, [open]);

  // Dedup nach Name (case-insensitive) — bei Team-Sharing können mehrere
  // Master-Daten-Rows mit demselben Namen existieren (eine pro Owner).
  // Im Picker zeigen wir jeden Wert genau einmal.
  const dedupedOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: typeof options = [];
    for (const o of options) {
      const key = o.name.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(o);
    }
    return out;
  }, [options]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return dedupedOptions;
    return dedupedOptions.filter((o) => o.name.toLowerCase().includes(q));
  }, [dedupedOptions, search]);

  const exactMatch = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return true; // leere Suche → kein "Add new"
    return options.some((o) => o.name.toLowerCase() === q);
  }, [options, search]);

  const selectValue = (name: string) => {
    if (isMulti) {
      const values = props.value as string[];
      if (values.includes(name)) {
        // Toggle off
        (props.onChange as MultiProps['onChange'])(
          values.filter((v) => v !== name)
        );
      } else {
        (props.onChange as MultiProps['onChange'])([...values, name]);
      }
      setSearch('');
      // Im Multi-Modus offen lassen für weitere Selektion
    } else {
      (props.onChange as SingleProps['onChange'])(name);
      setSearch('');
      setOpen(false);
    }
  };

  const handleAddNew = async () => {
    const name = search.trim();
    if (!name || !onAdd) return;
    setBusy(true);
    try {
      const created = await onAdd(name);
      selectValue(created.name);
    } catch (e) {
      // Fehler bleibt bei Caller — wir schließen einfach nicht
      console.error('[Picker] add failed:', e);
    } finally {
      setBusy(false);
    }
  };

  const removeChip = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isMulti) {
      (props.onChange as MultiProps['onChange'])(
        (props.value as string[]).filter((v) => v !== name)
      );
    } else {
      (props.onChange as SingleProps['onChange'])('');
    }
  };

  const onTriggerBlur = (_: ReactFocusEvent) => {
    // Outside-click handler kümmert sich. Hier nichts tun, sonst
    // schließt sich der Dropdown vor dem Klick auf eine Option.
  };

  return (
    <div
      ref={wrapperRef}
      className="relative"
      // min-width: 0 ist essentiell, damit der Picker im CSS-Grid-Cell
      // schrumpfen kann. Ohne das erzwingt der intrinsische Content-
      // Width des Buttons (= breite Chips + Chevron) eine Min-Width,
      // die den Container-Overflow erzeugt.
      style={{ minWidth: 0, width: '100%' }}
    >
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        onBlur={onTriggerBlur}
        disabled={disabled}
        className="w-full px-2 py-1 rounded bg-neutral-800 border border-neutral-700 hover:border-neutral-600 focus:border-amber-600 focus:outline-none text-left text-xs flex items-center gap-1 min-h-[28px] disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ minWidth: 0, overflow: 'hidden' }}
      >
        <span
          className="flex-1 flex gap-1 items-center"
          style={{
            minWidth: 0,
            overflowX: 'auto',
            // Scrollbar verstecken (Chrome + Firefox + Safari)
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {selectedNames.length === 0 ? (
            <span
              className="text-neutral-500"
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {placeholder || (isMulti ? t('picker.chooseMulti') : t('picker.chooseOne'))}
            </span>
          ) : (
            selectedNames.map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px]"
                style={{
                  background: 'rgba(201,169,98,0.18)',
                  color: '#C9A962',
                  flexShrink: 0,
                  maxWidth: '100%',
                }}
              >
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '120px',
                  }}
                >
                  {name}
                </span>
                <span
                  role="button"
                  onClick={(e) => removeChip(name, e)}
                  className="hover:opacity-70 cursor-pointer leading-none"
                  aria-label="Entfernen"
                  style={{ flexShrink: 0 }}
                >
                  <X size={10} />
                </span>
              </span>
            ))
          )}
        </span>
        <ChevronDown size={12} className="opacity-50 flex-shrink-0" />
      </button>

      {open && (
        <div
          className="absolute z-50 left-0 right-0 mt-1 rounded shadow-lg overflow-hidden"
          style={{
            background: '#25221e',
            color: '#f5f1e8', // explizit setzen, falls Eltern-Inheritance bricht
            border: '1px solid rgba(201,169,98,0.30)',
            maxHeight: '280px',
          }}
        >
          <div className="p-1.5 border-b border-neutral-700">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('picker.search')}
              autoFocus
              className="w-full px-2 py-1 rounded bg-neutral-900 border border-neutral-700 focus:border-amber-600 focus:outline-none text-xs"
              style={{ color: '#f5f1e8' }}
            />
          </div>
          <div className="max-h-[200px] overflow-y-auto">
            {options.length === 0 && (
              <div
                className="px-3 py-2 text-xs"
                style={{ color: '#877f71' }}
              >
                — noch keine Einträge —
              </div>
            )}
            {options.length > 0 && filtered.length === 0 && exactMatch && (
              <div
                className="px-3 py-2 text-xs"
                style={{ color: '#877f71' }}
              >
                {t('picker.noMatch')}
              </div>
            )}
            {filtered.map((o) => {
              const isSelected = selectedNames.includes(o.name);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => selectValue(o.name)}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-neutral-800 flex items-center gap-2"
                  style={{ color: isSelected ? '#C9A962' : '#f5f1e8' }}
                >
                  <span className="flex-1">{o.name || '—'}</span>
                  {isSelected && <span className="text-[10px]">✓</span>}
                </button>
              );
            })}
            {!exactMatch && search.trim() && onAdd && (
              <button
                type="button"
                onClick={handleAddNew}
                disabled={busy}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-neutral-800 flex items-center gap-2 border-t border-neutral-700 disabled:opacity-50"
                style={{ color: '#6EC49E' }}
              >
                <Plus size={12} />
                <span>
                  {t('picker.addNew')} <strong>{search.trim()}</strong>
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
