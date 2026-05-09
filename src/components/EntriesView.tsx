/**
 * EntriesView — der Einträge-Tab.
 *
 * ManualEntry oben (für nachträgliches Erfassen), Liste aller Einträge
 * unten mit Delete-Button. Wenn ein Drill-Down-Filter im uiStore aktiv
 * ist (z.B. nach Klick auf einen Stakeholder im Dashboard), wird oben
 * ein Filter-Chip angezeigt und die Liste entsprechend gefiltert.
 */

import { useMemo } from 'react';
import { Download, FileJson, FileSpreadsheet, X } from 'lucide-react';
import { useEntriesStore } from '@/stores/entriesStore';
import { useUiStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useI18n } from '@/i18n';
import { downloadBackupJson, downloadBackupCsv } from '@/lib/backup';
import ManualEntry from './ManualEntry';
import type { TimeEntry } from '@/types';
import type { EntriesFilter } from '@/stores/uiStore';

/**
 * Prüft, ob ein Eintrag dem Drill-Down-Filter entspricht. Stakeholder
 * ist multi-valued (Naive-Attribution) — Eintrag matched, wenn der Wert
 * in der Liste auftaucht.
 */
function entryMatchesFilter(e: TimeEntry, f: EntriesFilter): boolean {
  if (f.dimension === 'stakeholder') {
    const list = Array.isArray(e.stakeholder)
      ? e.stakeholder
      : e.stakeholder
        ? [e.stakeholder]
        : [];
    return list.includes(f.value);
  }
  return (e[f.dimension] || '') === f.value;
}

export default function EntriesView() {
  const { t } = useI18n();
  const entries = useEntriesStore((s) => s.entries);
  const deleteEntry = useEntriesStore((s) => s.deleteEntry);
  const filter = useUiStore((s) => s.entriesFilter);
  const codename = useAuthStore((s) => s.profile?.codename) || 'export';
  const clearFilter = useUiStore((s) => s.clearEntriesFilter);

  const filtered = useMemo(() => {
    if (!filter) return entries;
    return entries.filter((e) => entryMatchesFilter(e, filter));
  }, [entries, filter]);

  const filterLabel = filter
    ? t(`entry.${filter.dimension}`) // 'Stakeholder' / 'Projekt' / ...
    : '';

  return (
    <section className="space-y-4">
      <ManualEntry />

      {filter && (
        <div
          className="flex items-center justify-between gap-2 px-3 py-2 rounded"
          style={{
            background: 'rgba(201,169,98,0.08)',
            border: '1px solid rgba(201,169,98,0.30)',
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="text-[10px] uppercase tracking-widest"
              style={{ color: 'var(--text-muted)' }}
            >
              {t('entries.filterLabel')}
            </span>
            <span
              className="text-xs"
              style={{ color: 'var(--text-muted)' }}
            >
              {filterLabel}:
            </span>
            <span
              className="text-xs font-medium truncate"
              style={{ color: '#C9A962' }}
            >
              {filter.value}
            </span>
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
            {t('entries.clearFilter')}
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
            <li
              key={e.id}
              className="flex items-center justify-between gap-2 py-0.5"
            >
              <span className="truncate">
                <span className="font-mono text-xs">{e.date}</span>{' '}
                {e.start_time}–{e.end_time}{' '}
                <span className="text-neutral-500">·</span>{' '}
                {Array.isArray(e.stakeholder)
                  ? e.stakeholder.join(', ')
                  : e.stakeholder || '—'}{' '}
                <span className="text-neutral-500">/</span>{' '}
                {e.projekt || '—'}
                {e.notiz && <span className="text-neutral-500"> · {e.notiz}</span>}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (confirm(t('entry.deleteConfirm'))) deleteEntry(e.id);
                }}
                className="text-xs text-neutral-500 hover:text-red-400 px-2 leading-none"
                aria-label={t('entry.delete')}
              >
                ×
              </button>
            </li>
          ))}
          {filtered.length > 50 && (
            <li className="text-neutral-500">
              … {filtered.length - 50} {t('list.nMore')}
            </li>
          )}
          {filtered.length === 0 && filter && (
            <li className="italic text-neutral-500">
              {t('entries.filterEmpty')}
            </li>
          )}
        </ul>
      </div>

      {/* Backup: Export immer aller eigenen Einträge — IGNORIERT den
          Drill-Down-Filter, weil ein Backup vollständig sein soll.
          Bewusst kein Restore in M7 (gefährliche Operation, kommt
          später falls gebraucht). */}
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
