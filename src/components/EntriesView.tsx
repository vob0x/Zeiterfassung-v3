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

import { useMemo } from 'react';
import { Download, FileJson, FileSpreadsheet, X } from 'lucide-react';
import { useEntriesStore } from '@/stores/entriesStore';
import {
  useUiStore,
  hasActiveFilter,
  type EntriesFilter,
  type EntriesFilterDim,
} from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useI18n } from '@/i18n';
import { downloadBackupJson, downloadBackupCsv } from '@/lib/backup';
import ManualEntry from './ManualEntry';
import type { TimeEntry } from '@/types';

/**
 * Prüft ob ein Eintrag dem Multi-Dim-Filter entspricht. Stakeholder ist
 * multi-valued (Naive-Attribution) — Eintrag matched, wenn der Filter-
 * Wert in der Liste auftaucht. Andere Dimensionen sind single-valued
 * Strict-Equality.
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
  return true;
}

export default function EntriesView() {
  const { t } = useI18n();
  const entries = useEntriesStore((s) => s.entries);
  const deleteEntry = useEntriesStore((s) => s.deleteEntry);
  const filter = useUiStore((s) => s.entriesFilter);
  const setFilterDim = useUiStore((s) => s.setEntriesFilterDim);
  const clearFilter = useUiStore((s) => s.clearEntriesFilter);
  const codename = useAuthStore((s) => s.profile?.codename) || 'export';

  const active = hasActiveFilter(filter);

  const filtered = useMemo(() => {
    if (!active) return entries;
    return entries.filter((e) => entryMatchesFilter(e, filter));
  }, [entries, filter, active]);

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

      {active && (
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

      <div
        className="rounded-lg p-4"
        style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(201,169,98,0.18)',
        }}
      >
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-xs uppercase tracking-widest text-neutral-500">
            {t('list.entriesCount')}
          </span>
          <span className="text-2xl font-bold" style={{ color: '#C9A962' }}>
            {filtered.length}
          </span>
        </div>
        <ul className="text-xs text-neutral-300 space-y-1">
          {filtered.slice(0, 50).map((e) => (
            <EntryRow
              key={e.id}
              entry={e}
              filter={filter}
              onValueClick={onValueClick}
              onDelete={() => {
                if (confirm(t('entry.deleteConfirm'))) deleteEntry(e.id);
              }}
              t={t}
            />
          ))}
          {filtered.length > 50 && (
            <li className="text-neutral-500">
              … {filtered.length - 50} {t('list.nMore')}
            </li>
          )}
          {filtered.length === 0 && active && (
            <li className="italic text-neutral-500">
              {t('entries.filterEmpty')}
            </li>
          )}
        </ul>
      </div>

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

/** Eine einzelne Zeile — alle 4 Dimensionen + Notiz sind klickbar. */
function EntryRow({
  entry,
  filter,
  onValueClick,
  onDelete,
  t,
}: {
  entry: TimeEntry;
  filter: EntriesFilter;
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
    <li className="flex items-center justify-between gap-2 py-0.5">
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
