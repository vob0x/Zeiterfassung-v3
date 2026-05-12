/**
 * EntriesView — der Einträge-Tab.
 *
 * Komponenten:
 *   - ManualEntry oben (für nachträgliches Erfassen)
 *   - Filter-Chip-Strip (1 Chip pro aktiver Filter-Dimension, einzeln entfernbar)
 *   - Liste aller eigenen Einträge mit klickbaren Werten (Drill-Down)
 *   - Backup-Export-Block am Ende
 *
 * Filter-Modell (uiStore.entriesFilter): multi-dim, jede Dimension
 * unabhängig setzbar. Aktive Dimensionen werden mit AND verknüpft.
 * Klick auf einen Eintragswert (z.B. Stakeholder-Name) setzt die
 * jeweilige Dimension; Klick auf einen aktiven Chip entfernt sie.
 */

import { useMemo, useState } from 'react';
import {
  CheckSquare,
  Download,
  FileJson,
  FileSpreadsheet,
  Pencil,
  Search,
  Square,
  X,
} from 'lucide-react';
import { useEntriesStore } from '@/stores/entriesStore';
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
 * Prüft ob ein Eintrag dem Multi-Dim-Filter entspricht. Logik:
 *   - Chip-Filter (stakeholder/projekt/taetigkeit/format) sind Strict-
 *     Equality, kombiniert mit AND. Stakeholder ist multi-valued: matcht
 *     wenn der Filter-Wert in der Liste auftaucht.
 *   - search ist case-insensitive Substring-Match über alle relevanten
 *     Felder (Datum, Zeit, alle Dimensionen, Notiz). AND mit den Chips.
 */
function entryMatchesFilter(e: TimeEntry, f: EntriesFilter): boolean {
  if (f.stakeholder) {
    const list = Array.isArray(e.stakeholder)
      ? e.stakeholder
      : e.stakeholder
        ? [e.stakeholder]
        : [];
    if (!list.includes(f.stakeholder)) return false;
  }
  if (f.projekt && (e.projekt || '') !== f.projekt) return false;
  if (f.taetigkeit && (e.taetigkeit || '') !== f.taetigkeit) return false;
  if (f.format && (e.format || '') !== f.format) return false;

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

  return true;
}

export default function EntriesView() {
  const { t } = useI18n();
  const entries = useEntriesStore((s) => s.entries);
  const deleteEntry = useEntriesStore((s) => s.deleteEntry);
  const filter = useUiStore((s) => s.entriesFilter);
  const setFilterDim = useUiStore((s) => s.setEntriesFilterDim);
  const setSearch = useUiStore((s) => s.setEntriesSearch);
  const clearFilter = useUiStore((s) => s.clearEntriesFilter);
  const codename = useAuthStore((s) => s.profile?.codename) || 'export';

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

  /** Setzt eine Dimension oder togglet sie ab, wenn schon aktiv mit
   *  demselben Wert. Genutzt von den klickbaren Eintragswerten. */
  const onValueClick = (dim: EntriesFilterDim, value: string) => {
    if (!value || value === '—') return;
    if (filter[dim] === value) {
      setFilterDim(dim, null); // Zweitklick = Toggle ab
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
            <FilterChip
              dim="stakeholder"
              value={filter.stakeholder}
              onRemove={() => setFilterDim('stakeholder', null)}
              t={t}
            />
            <FilterChip
              dim="projekt"
              value={filter.projekt}
              onRemove={() => setFilterDim('projekt', null)}
              t={t}
            />
            <FilterChip
              dim="taetigkeit"
              value={filter.taetigkeit}
              onRemove={() => setFilterDim('taetigkeit', null)}
              t={t}
            />
            <FilterChip
              dim="format"
              value={filter.format}
              onRemove={() => setFilterDim('format', null)}
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

function FilterChip({
  dim,
  value,
  onRemove,
  t,
}: {
  dim: EntriesFilterDim;
  value: string | undefined;
  onRemove: () => void;
  t: (k: string) => string;
}) {
  if (!value) return null;
  return (
    <span
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
      <span style={{ color: '#C9A962', fontWeight: 500 }}>{value}</span>
      <button
        type="button"
        onClick={onRemove}
        className="hover:opacity-70"
        style={{ color: 'var(--text-muted)' }}
        aria-label={t('entries.removeFilter')}
      >
        <X size={10} />
      </button>
    </span>
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
                active={filter.stakeholder === s}
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
            active={filter.projekt === entry.projekt}
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
            active={filter.taetigkeit === entry.taetigkeit}
            onClick={onValueClick}
          />
        )}{' '}
        {entry.format && (
          <>
            <span className="text-neutral-500">·</span>{' '}
            <ClickableValue
              dim="format"
              value={entry.format}
              active={filter.format === entry.format}
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
