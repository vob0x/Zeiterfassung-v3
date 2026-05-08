/**
 * EntriesView — der Einträge-Tab.
 *
 * M4a-Scope: ManualEntry oben (für nachträgliches Erfassen), Liste
 * aller Einträge unten mit Delete-Button. Filter + Inline-Edit + Sort
 * kommen in M4b/M5.
 */

import { useEntriesStore } from '@/stores/entriesStore';
import { useI18n } from '@/i18n';
import ManualEntry from './ManualEntry';

export default function EntriesView() {
  const { t } = useI18n();
  const entries = useEntriesStore((s) => s.entries);
  const deleteEntry = useEntriesStore((s) => s.deleteEntry);

  return (
    <section className="space-y-4">
      <ManualEntry />

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
            {entries.length}
          </span>
        </div>
        <ul className="text-xs text-neutral-300 space-y-1">
          {entries.slice(0, 50).map((e) => (
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
          {entries.length > 50 && (
            <li className="text-neutral-500">
              … {entries.length - 50} {t('list.nMore')}
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}
