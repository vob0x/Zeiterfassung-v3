/**
 * EntriesView — der Einträge-Tab.
 *
 * Komponenten:
 *   - ManualEntry oben (für nachträgliches Erfassen)
 *   - Globale Search-Box (Substring über alle Felder)
 *   - Filter-Block (Welle 12.0): 4 Multi-Select-Dropdowns
 *     (Stakeholder / Projekt / Tätigkeit / Format) + Notiz-Substring-
 *     Input + Reset-Button. Werte aus masterStore.
 *   - Filter-Chip-Strip (1 Chip pro aktivem Wert je Dimension)
 *   - Liste aller eigenen Einträge mit klickbaren Werten (Drill-Down)
 *   - Backup-Export-Block am Ende
 *
 * Filter-Modell (uiStore.entriesFilter): multi-dim & multi-value. Jede
 * Dimension trägt eine Werte-Liste (OR innerhalb), Dimensionen werden
 * mit AND verknüpft. Klick auf einen Eintragswert ersetzt die Auswahl
 * der jeweiligen Dim auf genau diesen Wert (Drill-Down-Semantik);
 * Multi-Select erfolgt über die Dropdowns im Filter-Block.
 */

import { useMemo, useRef, useState, useEffect } from 'react';
import {
  CheckSquare,
  ChevronDown,
  Download,
  FileJson,
  FileSpreadsheet,
  Filter as FilterIcon,
  Pencil,
  Search,
  Square,
  X,
} from 'lucide-react';
import { useEntriesStore } from '@/stores/entriesStore';
import { useMasterStore } from '@/stores/masterStore';
import {
  useUiStore,
  hasActiveFilter,
  hasAnyFilter,
  type EntriesFilter,
  type EntriesFilterDim,
} from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useI18n } from '@/i18n';
import { downloadBackupJson, downloadBackupCsv } from '@/lib/backup';
import ManualEntry from './ManualEntry';
import EditEntryModal from './EditEntryModal';
import BatchEditBar from './BatchEditBar';
import type { TimeEntry } from '@/types';

/**
 * Pure Function: Prüft ob ein Eintrag dem Multi-Dim-Filter entspricht.
 * Logik:
 *   - Pro Dimension: leeres / fehlendes Array = pass-through. Sonst muss
 *     der Eintrags-Wert in der Auswahl liegen (OR innerhalb). Stakeholder
 *     ist multi-valued am Eintrag: matcht wenn IRGENDEINER der Eintrags-
 *     Stakeholder in der Filter-Auswahl auftaucht.
 *   - Dimensionen werden mit AND kombiniert.
 *   - search ist case-insensitive Substring-Match über alle relevanten
 *     Felder (Datum, Zeit, alle Dimensionen, Notiz). AND mit den Chips.
 *   - notiz ist Substring-Match nur auf das Notiz-Feld. AND mit allem.
 */
function entryMatchesFilter(e: TimeEntry, f: EntriesFilter): boolean {
  if (f.stakeholder && f.stakeholder.length > 0) {
    const list = Array.isArray(e.stakeholder)
      ? e.stakeholder
      : e.stakeholder
        ? [e.stakeholder]
        : [];
    if (!list.some((s) => f.stakeholder!.includes(s))) return false;
  }
  if (f.projekt && f.projekt.length > 0) {
    if (!f.projekt.includes(e.projekt || '')) return false;
  }
  if (f.taetigkeit && f.taetigkeit.length > 0) {
    if (!f.taetigkeit.includes(e.taetigkeit || '')) return false;
  }
  if (f.format && f.format.length > 0) {
    if (!f.format.includes(e.format || '')) return false;
  }

  if (f.search) {
    const q = f.search.trim().toLowerCase();
    if (q) {
      const list = Array.isArray(e.stakeholder) ? e.stakeholder : [];
      const haystack = [
        e.date,
        e.start_time,
        e.end_time,
        ...list,
        e.projekt,
        e.taetigkeit,
        e.format,
        e.notiz,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
  }

  if (f.notiz) {
    const q = f.notiz.trim().toLowerCase();
    if (q) {
      const n = (e.notiz || '').toLowerCase();
      if (!n.includes(q)) return false;
    }
  }

  return true;
}

export default function EntriesView() {
  const { t } = useI18n();
  const entries = useEntriesStore((s) => s.entries);
  const deleteEntry = useEntriesStore((s) => s.deleteEntry);
  const filter = useUiStore((s) => s.entriesFilter);
  const setFilterDim = useUiStore((s) => s.setEntriesFilterDim);
  const toggleFilterValue = useUiStore((s) => s.toggleEntriesFilterValue);
  const setSearch = useUiStore((s) => s.setEntriesSearch);
  const setNotizFilter = useUiStore((s) => s.setEntriesNotizFilter);
  const clearFilter = useUiStore((s) => s.clearEntriesFilter);
  const codename = useAuthStore((s) => s.profile?.codename) || 'export';

  // Master-Daten für die Multi-Select-Dropdowns (Welle 12.0). Nur Namen,
  // sort_order-stabil. Dedupliziert (Team-Mode liefert Mitglieder-Rows
  // mit potenziell gleichem Namen).
  const stakeholderNames = useMasterStore((s) =>
    dedupSorted(s.stakeholders.map((x) => x.name))
  );
  const projectNames = useMasterStore((s) =>
    dedupSorted(s.projects.map((x) => x.name))
  );
  const activityNames = useMasterStore((s) =>
    dedupSorted(s.activities.map((x) => x.name))
  );
  const formatNames = useMasterStore((s) =>
    dedupSorted(s.formats.map((x) => x.name))
  );

  // Edit-Modal-State: ID des zu editierenden Eintrags oder null.
  const [editingId, setEditingId] = useState<string | null>(null);

  // Batch-Select-State: Set von Entry-IDs.
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const chipsActive = hasActiveFilter(filter);
  const anyActive = hasAnyFilter(filter);

  const filtered = useMemo(() => {
    if (!anyActive) return entries;
    return entries.filter((e) => entryMatchesFilter(e, filter));
  }, [entries, filter, anyActive]);

  // Wenn die Liste sich ändert, entferne IDs aus der Selektion, die
  // nicht mehr da sind (z.B. nach bulkDelete oder Filterwechsel).
  const visibleIds = useMemo(
    () => new Set(filtered.map((e) => e.id)),
    [filtered]
  );
  const effectiveSelected = useMemo(() => {
    const out = new Set<string>();
    for (const id of selected) if (visibleIds.has(id)) out.add(id);
    return out;
  }, [selected, visibleIds]);

  const selectedEntries = useMemo(
    () => filtered.filter((e) => effectiveSelected.has(e.id)),
    [filtered, effectiveSelected]
  );

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelected = () => setSelected(new Set());

  const toggleAllVisible = () => {
    if (effectiveSelected.size === filtered.length && filtered.length > 0) {
      clearSelected();
    } else {
      setSelected(new Set(filtered.map((e) => e.id)));
    }
  };

  const editingEntry = useMemo(
    () => (editingId ? entries.find((e) => e.id === editingId) : null) ?? null,
    [entries, editingId]
  );

  const allVisibleSelected =
    filtered.length > 0 && effectiveSelected.size === filtered.length;

  /** Klick auf einen Wert in der Eintragsliste:
   *  - Wenn die Dim aktuell genau diesen einen Wert hat: Toggle ab.
   *  - Sonst: Dim auf genau diesen Wert setzen (Drill-Down, ersetzt
   *    Mehrfachauswahl). Multi-Select läuft über die Dropdowns oben. */
  const onValueClick = (dim: EntriesFilterDim, value: string) => {
    if (!value || value === '—') return;
    const cur = filter[dim];
    if (cur && cur.length === 1 && cur[0] === value) {
      setFilterDim(dim, null);
    } else {
      setFilterDim(dim, value);
    }
  };

  return (
    <section className="space-y-4">
      <ManualEntry />

      {/* Search-Box — immer sichtbar. Suche kombiniert per AND mit Chips. */}
      <div
        className="flex items-center gap-2 px-2.5 py-1.5 rounded"
        style={{
          background: '#25221e',
          border: '1px solid var(--border)',
        }}
      >
        <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input
          type="text"
          value={filter.search || ''}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('entries.searchPlaceholder')}
          className="flex-1 bg-transparent border-none outline-none text-xs"
          style={{ color: '#f5f1e8', minWidth: 0 }}
        />
        {filter.search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="p-0.5 hover:opacity-70"
            style={{ color: 'var(--text-muted)' }}
            aria-label={t('entries.clearSearch')}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Welle 12.0 — Filter-Block. Multi-Select-Dropdowns für die vier
          Dimensionen + Notiz-Substring. Werte aus masterStore. Notiz
          bewusst Freitext (nicht 1000+ Notiz-Werte als Dropdown). */}
      <div
        className="rounded-lg p-3 space-y-2"
        style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--border)',
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <div
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest"
            style={{ color: 'var(--text-muted)' }}
          >
            <FilterIcon size={12} />
            <span>{t('entries.filterLabel')}</span>
          </div>
          <button
            type="button"
            onClick={clearFilter}
            disabled={!anyActive}
            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ color: 'var(--text-muted)' }}
            aria-label={t('entries.resetFilters')}
          >
            <X size={12} />
            {t('entries.resetFilters')}
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <MultiSelectDropdown
            label={t('entry.stakeholder')}
            options={stakeholderNames}
            selected={filter.stakeholder ?? []}
            onToggle={(v) => toggleFilterValue('stakeholder', v)}
            onClear={() => setFilterDim('stakeholder', null)}
            t={t}
          />
          <MultiSelectDropdown
            label={t('entry.projekt')}
            options={projectNames}
            selected={filter.projekt ?? []}
            onToggle={(v) => toggleFilterValue('projekt', v)}
            onClear={() => setFilterDim('projekt', null)}
            t={t}
          />
          <MultiSelectDropdown
            label={t('entry.taetigkeit')}
            options={activityNames}
            selected={filter.taetigkeit ?? []}
            onToggle={(v) => toggleFilterValue('taetigkeit', v)}
            onClear={() => setFilterDim('taetigkeit', null)}
            t={t}
          />
          <MultiSelectDropdown
            label={t('entry.format')}
            options={formatNames}
            selected={filter.format ?? []}
            onToggle={(v) => toggleFilterValue('format', v)}
            onClear={() => setFilterDim('format', null)}
            t={t}
          />
        </div>
        <div
          className="flex items-center gap-2 px-2.5 py-1.5 rounded"
          style={{
            background: '#25221e',
            border: '1px solid var(--border)',
          }}
        >
          <span
            className="text-[10px] uppercase tracking-widest"
            style={{ color: 'var(--text-muted)' }}
          >
            {t('entry.notiz')}
          </span>
          <input
            type="text"
            value={filter.notiz || ''}
            onChange={(e) => setNotizFilter(e.target.value)}
            placeholder={t('entries.notizFilterPlaceholder')}
            className="flex-1 bg-transparent border-none outline-none text-xs"
            style={{ color: '#f5f1e8', minWidth: 0 }}
          />
          {filter.notiz && (
            <button
              type="button"
              onClick={() => setNotizFilter('')}
              className="p-0.5 hover:opacity-70"
              style={{ color: 'var(--text-muted)' }}
              aria-label={t('entries.clearSearch')}
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {chipsActive && (
        <div
          className="flex items-center justify-between gap-2 px-3 py-2 rounded flex-wrap"
          style={{
            background: 'rgba(201,169,98,0.08)',
            border: '1px solid rgba(201,169,98,0.30)',
          }}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
            <span
              className="text-[10px] uppercase tracking-widest"
              style={{ color: 'var(--text-muted)' }}
            >
              {t('entries.filterLabel')}
            </span>
            <DimChips
              dim="stakeholder"
              values={filter.stakeholder}
              onRemove={(v) => toggleFilterValue('stakeholder', v)}
              t={t}
            />
            <DimChips
              dim="projekt"
              values={filter.projekt}
              onRemove={(v) => toggleFilterValue('projekt', v)}
              t={t}
            />
            <DimChips
              dim="taetigkeit"
              values={filter.taetigkeit}
              onRemove={(v) => toggleFilterValue('taetigkeit', v)}
              t={t}
            />
            <DimChips
              dim="format"
              values={filter.format}
              onRemove={(v) => toggleFilterValue('format', v)}
              t={t}
            />
            <span
              className="text-[10px] font-mono"
              style={{ color: 'var(--text-muted)' }}
            >
              · {filtered.length}
            </span>
          </div>
          <button
            type="button"
            onClick={clearFilter}
            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded hover:opacity-80"
            style={{ color: 'var(--text-muted)' }}
            aria-label={t('entries.clearFilter')}
          >
            <X size={12} />
            {t('entries.clearAllFilters')}
          </button>
        </div>
      )}

      {effectiveSelected.size > 0 && (
        <BatchEditBar
          selectedIds={Array.from(effectiveSelected)}
          selectedEntries={selectedEntries}
          onClear={clearSelected}
        />
      )}

      <div
        className="rounded-lg p-4"
        style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(201,169,98,0.18)',
        }}
      >
        <div className="flex items-baseline justify-between mb-2">
          <div className="flex items-center gap-3">
            {filtered.length > 0 && (
              <button
                type="button"
                onClick={toggleAllVisible}
                className="text-neutral-500 hover:text-neutral-300"
                aria-label={
                  allVisibleSelected
                    ? t('batch.selectNone')
                    : t('batch.selectAll')
                }
                title={
                  allVisibleSelected
                    ? t('batch.selectNone')
                    : t('batch.selectAll')
                }
              >
                {allVisibleSelected ? (
                  <CheckSquare size={14} style={{ color: '#C9A962' }} />
                ) : (
                  <Square size={14} />
                )}
              </button>
            )}
            <span className="text-xs uppercase tracking-widest text-neutral-500">
              {t('list.entriesCount')}
            </span>
          </div>
          <span className="text-2xl font-bold" style={{ color: '#C9A962' }}>
            {filtered.length}
          </span>
        </div>
        <ul className="text-xs text-neutral-300 space-y-1">
          {filtered.map((e) => (
            <EntryRow
              key={e.id}
              entry={e}
              filter={filter}
              selected={effectiveSelected.has(e.id)}
              onToggleSelected={() => toggleSelected(e.id)}
              onEdit={() => setEditingId(e.id)}
              onValueClick={onValueClick}
              onDelete={() => {
                if (confirm(t('entry.deleteConfirm'))) deleteEntry(e.id);
              }}
              t={t}
            />
          ))}
          {filtered.length === 0 && anyActive && (
            <li className="italic text-neutral-500">
              {t('entries.filterEmpty')}
            </li>
          )}
        </ul>
      </div>

      {editingEntry && (
        <EditEntryModal
          entry={editingEntry}
          onClose={() => setEditingId(null)}
        />
      )}

      {/* Backup: Export immer aller eigenen Einträge — IGNORIERT die
          aktiven Filter, weil ein Backup vollständig sein soll. */}
      {entries.length > 0 && (
        <div
          className="rounded-lg p-4"
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(201,169,98,0.18)',
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Download size={12} style={{ color: 'var(--text-muted)' }} />
            <span
              className="text-xs uppercase tracking-widest"
              style={{ color: 'var(--text-muted)' }}
            >
              {t('backup.title')}
            </span>
          </div>
          <p
            className="text-xs mb-3"
            style={{ color: 'var(--text-muted)' }}
          >
            {t('backup.hint')}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => downloadBackupJson(entries, codename)}
              className="text-xs py-1.5 px-3 rounded flex items-center gap-1.5"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
              }}
            >
              <FileJson size={12} />
              {t('backup.exportJson')}
            </button>
            <button
              type="button"
              onClick={() => downloadBackupCsv(entries, codename)}
              className="text-xs py-1.5 px-3 rounded flex items-center gap-1.5"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
              }}
            >
              <FileSpreadsheet size={12} />
              {t('backup.exportCsv')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Sub-Komponenten
   ───────────────────────────────────────────────────────────────────── */

/** Hilfsfunktion — dedupliziert und sortiert Namens-Listen. Team-Mode
 *  liefert pro Mitglied eine Master-Row mit potenziell identischem Namen;
 *  für die Filter-Dropdowns wollen wir jeden Namen nur einmal sehen. */
function dedupSorted(names: string[]): string[] {
  return Array.from(new Set(names.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
}

/** Rendert pro aktivem Wert in einer Dim einen einzeln entfernbaren Chip. */
function DimChips({
  dim,
  values,
  onRemove,
  t,
}: {
  dim: EntriesFilterDim;
  values: string[] | undefined;
  onRemove: (value: string) => void;
  t: (k: string) => string;
}) {
  if (!values || values.length === 0) return null;
  return (
    <>
      {values.map((v) => (
        <span
          key={`${dim}:${v}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs"
          style={{
            background: 'rgba(201,169,98,0.18)',
            border: '1px solid rgba(201,169,98,0.40)',
          }}
        >
          <span
            className="text-[10px] uppercase tracking-widest"
            style={{ color: 'var(--text-muted)' }}
          >
            {t(`entry.${dim}`)}:
          </span>
          <span style={{ color: '#C9A962', fontWeight: 500 }}>{v}</span>
          <button
            type="button"
            onClick={() => onRemove(v)}
            className="hover:opacity-70"
            style={{ color: 'var(--text-muted)' }}
            aria-label={t('entries.removeFilter')}
          >
            <X size={10} />
          </button>
        </span>
      ))}
    </>
  );
}

/**
 * Custom Multi-Select-Dropdown mit Checkbox-Liste. Bewusst KEIN
 * react-select / kein externer Picker — wir bleiben bei den App-eigenen
 * Patterns (vgl. Picker.tsx) und vermeiden eine weitere Lib.
 *
 * - Button zeigt Label + Selected-Count (oder Listing wenn 1-2 Werte).
 * - Klick öffnet ein absolut positioniertes Panel mit allen Optionen.
 * - Pro Option Checkbox: Klick togglet via onToggle.
 * - "Leeren"-Button im Panel-Footer löscht die ganze Dim.
 * - Outside-Click schließt das Panel.
 */
function MultiSelectDropdown({
  label,
  options,
  selected,
  onToggle,
  onClear,
  t,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
  t: (k: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (ev: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const count = selected.length;
  const summary =
    count === 0
      ? t('entries.dropdownAll')
      : count <= 2
        ? selected.join(', ')
        : `${count} ${t('picker.selected')}`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded text-xs"
        style={{
          background: '#25221e',
          border: '1px solid var(--border)',
          color: count > 0 ? '#C9A962' : 'var(--text)',
          minWidth: 0,
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span
          className="text-[10px] uppercase tracking-widest flex-shrink-0"
          style={{ color: 'var(--text-muted)' }}
        >
          {label}
        </span>
        <span className="flex-1 text-left truncate" style={{ minWidth: 0 }}>
          {summary}
        </span>
        <ChevronDown
          size={12}
          style={{ color: 'var(--text-muted)', flexShrink: 0 }}
        />
      </button>
      {open && (
        <div
          className="absolute z-30 left-0 right-0 mt-1 rounded shadow-lg"
          style={{
            background: '#1f1c19',
            border: '1px solid var(--border)',
            maxHeight: 260,
            overflowY: 'auto',
          }}
          role="listbox"
        >
          {options.length === 0 ? (
            <div
              className="px-3 py-2 text-xs italic"
              style={{ color: 'var(--text-muted)' }}
            >
              {t('picker.noMatch')}
            </div>
          ) : (
            <ul className="py-1">
              {options.map((opt) => {
                const isSel = selected.includes(opt);
                return (
                  <li key={opt}>
                    <button
                      type="button"
                      onClick={() => onToggle(opt)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-neutral-800 text-left"
                      style={{ color: isSel ? '#C9A962' : 'var(--text)' }}
                      role="option"
                      aria-selected={isSel}
                    >
                      {isSel ? (
                        <CheckSquare
                          size={12}
                          style={{ color: '#C9A962', flexShrink: 0 }}
                        />
                      ) : (
                        <Square
                          size={12}
                          style={{
                            color: 'var(--text-muted)',
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <span className="truncate">{opt}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {count > 0 && (
            <div
              className="px-2 py-1 border-t"
              style={{ borderColor: 'var(--border)' }}
            >
              <button
                type="button"
                onClick={onClear}
                className="text-[10px] uppercase tracking-widest px-1 py-0.5 hover:opacity-80"
                style={{ color: 'var(--text-muted)' }}
              >
                {t('entries.dropdownClear')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Eine einzelne Zeile — alle 4 Dimensionen + Notiz sind klickbar.
 *  Zusätzlich: Select-Checkbox vorne (für Batch-Edit) und Edit-Icon
 *  hinten (öffnet EditEntryModal). */
function EntryRow({
  entry,
  filter,
  selected,
  onToggleSelected,
  onEdit,
  onValueClick,
  onDelete,
  t,
}: {
  entry: TimeEntry;
  filter: EntriesFilter;
  selected: boolean;
  onToggleSelected: () => void;
  onEdit: () => void;
  onValueClick: (dim: EntriesFilterDim, value: string) => void;
  onDelete: () => void;
  t: (k: string) => string;
}) {
  const stakeholders = Array.isArray(entry.stakeholder)
    ? entry.stakeholder
    : entry.stakeholder
      ? [entry.stakeholder]
      : [];

  return (
    <li
      className="flex items-center justify-between gap-2 py-0.5"
      style={
        selected
          ? {
              background: 'rgba(201,169,98,0.10)',
              borderLeft: '2px solid #C9A962',
              paddingLeft: 4,
            }
          : { borderLeft: '2px solid transparent', paddingLeft: 4 }
      }
    >
      <button
        type="button"
        onClick={onToggleSelected}
        className="flex-shrink-0 text-neutral-500 hover:text-neutral-300"
        aria-label={selected ? t('batch.deselect') : t('batch.select')}
        title={selected ? t('batch.deselect') : t('batch.select')}
      >
        {selected ? (
          <CheckSquare size={12} style={{ color: '#C9A962' }} />
        ) : (
          <Square size={12} />
        )}
      </button>
      <span className="truncate flex-1 min-w-0">
        <span className="font-mono text-xs">{entry.date}</span>{' '}
        <span style={{ color: 'var(--text-muted)' }}>
          {entry.start_time}–{entry.end_time}
        </span>{' '}
        <span className="text-neutral-500">·</span>{' '}
        {stakeholders.length > 0 ? (
          stakeholders.map((s, i) => (
            <span key={s + i}>
              <ClickableValue
                dim="stakeholder"
                value={s}
                active={!!filter.stakeholder?.includes(s)}
                onClick={onValueClick}
              />
              {i < stakeholders.length - 1 && (
                <span style={{ color: 'var(--text-muted)' }}>, </span>
              )}
            </span>
          ))
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>—</span>
        )}{' '}
        <span className="text-neutral-500">/</span>{' '}
        {entry.projekt ? (
          <ClickableValue
            dim="projekt"
            value={entry.projekt}
            active={!!filter.projekt?.includes(entry.projekt)}
            onClick={onValueClick}
          />
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>—</span>
        )}{' '}
        <span className="text-neutral-500">·</span>{' '}
        {entry.taetigkeit && (
          <ClickableValue
            dim="taetigkeit"
            value={entry.taetigkeit}
            active={!!filter.taetigkeit?.includes(entry.taetigkeit)}
            onClick={onValueClick}
          />
        )}{' '}
        {entry.format && (
          <>
            <span className="text-neutral-500">·</span>{' '}
            <ClickableValue
              dim="format"
              value={entry.format}
              active={!!filter.format?.includes(entry.format)}
              onClick={onValueClick}
            />
          </>
        )}
        {entry.notiz && (
          <span style={{ color: 'var(--text-muted)' }}> · {entry.notiz}</span>
        )}
      </span>
      <button
        type="button"
        onClick={onEdit}
        className="flex-shrink-0 text-neutral-500 hover:text-amber-500 px-1 leading-none"
        aria-label={t('edit.title')}
        title={t('edit.title')}
      >
        <Pencil size={11} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="text-xs text-neutral-500 hover:text-red-400 px-2 leading-none"
        aria-label={t('entry.delete')}
      >
        ×
      </button>
    </li>
  );
}

function ClickableValue({
  dim,
  value,
  active,
  onClick,
}: {
  dim: EntriesFilterDim;
  value: string;
  active: boolean;
  onClick: (dim: EntriesFilterDim, value: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(dim, value)}
      className="hover:underline"
      style={{
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        font: 'inherit',
        color: active ? '#C9A962' : 'inherit',
        fontWeight: active ? 600 : 400,
      }}
      title={`${dim}: ${value}`}
    >
      {value}
    </button>
  );
}
