/**
 * v3 App-Shell. Routing/Layout kommen sukzessive (M3+).
 *
 * Aktueller Stand (M3a): Manual-Entry mit Master-Daten-Pickern
 * + Liste der eigenen Einträge mit Delete-Button.
 *
 * Was M3b bringt: TimerLane mit Click-Debounce für laufende
 * Tracker, TimerView-Layout.
 */

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useEntriesStore } from '@/stores/entriesStore';
import { useMasterStore } from '@/stores/masterStore';
import { useI18n } from '@/i18n';
import AuthWall from '@/components/AuthWall';
import ManualEntry from '@/components/ManualEntry';

export default function App() {
  return (
    <AuthWall>
      <Splash />
    </AuthWall>
  );
}

function Splash() {
  const { t } = useI18n();
  const profile = useAuthStore((s) => s.profile);
  const signOut = useAuthStore((s) => s.signOut);

  const entries = useEntriesStore((s) => s.entries);
  const entriesLoading = useEntriesStore((s) => s.loading);
  const entriesError = useEntriesStore((s) => s.error);
  const fetchEntries = useEntriesStore((s) => s.fetchEntries);
  const deleteEntry = useEntriesStore((s) => s.deleteEntry);

  const stakeholders = useMasterStore((s) => s.stakeholders);
  const projects = useMasterStore((s) => s.projects);
  const activities = useMasterStore((s) => s.activities);
  const formats = useMasterStore((s) => s.formats);
  const masterLoading = useMasterStore((s) => s.loading);
  const masterError = useMasterStore((s) => s.error);
  const fetchMaster = useMasterStore((s) => s.fetchMaster);

  useEffect(() => {
    fetchEntries();
    fetchMaster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loading = entriesLoading || masterLoading;
  const firstError = entriesError || masterError;

  return (
    <main className="min-h-screen bg-neutral-900 text-neutral-100 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <div
              className="text-xs tracking-widest uppercase"
              style={{ color: '#C9A962' }}
            >
              {t('app.title')}
            </div>
            <div className="text-xs text-neutral-500">
              {t('app.versionLabel')} · M3a
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-neutral-400">
              <span className="font-mono">{profile?.codename}</span>
            </span>
            <button
              type="button"
              onClick={signOut}
              className="text-xs underline text-neutral-500 hover:text-neutral-300"
            >
              {t('app.signOut')}
            </button>
          </div>
        </header>

        {firstError && (
          <div
            className="rounded p-3 text-xs"
            style={{
              background: 'rgba(212,112,110,0.10)',
              border: '1px solid rgba(212,112,110,0.45)',
              color: '#D4706E',
            }}
          >
            {firstError}
          </div>
        )}

        <ManualEntry />

        {loading ? (
          <div className="text-sm text-neutral-400">{t('app.loading')}</div>
        ) : (
          <>
            <Card title={t('list.entriesCount')} count={entries.length}>
              {entries.slice(0, 12).map((e) => (
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
                    {e.notiz && (
                      <span className="text-neutral-500"> · {e.notiz}</span>
                    )}
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
              {entries.length > 12 && (
                <li className="text-neutral-500">
                  … {entries.length - 12} {t('list.nMore')}
                </li>
              )}
            </Card>

            <div className="grid grid-cols-2 gap-3">
              <Card
                title={t('list.stakeholdersCount')}
                count={stakeholders.length}
              >
                {stakeholders.slice(0, 5).map((s) => (
                  <li key={s.id}>{s.name}</li>
                ))}
                {stakeholders.length > 5 && (
                  <li className="text-neutral-500">
                    … +{stakeholders.length - 5}
                  </li>
                )}
              </Card>
              <Card title={t('list.projectsCount')} count={projects.length}>
                {projects.slice(0, 5).map((p) => (
                  <li key={p.id}>{p.name}</li>
                ))}
                {projects.length > 5 && (
                  <li className="text-neutral-500">
                    … +{projects.length - 5}
                  </li>
                )}
              </Card>
              <Card
                title={t('list.activitiesCount')}
                count={activities.length}
              >
                {activities.slice(0, 5).map((a) => (
                  <li key={a.id}>{a.name}</li>
                ))}
                {activities.length > 5 && (
                  <li className="text-neutral-500">
                    … +{activities.length - 5}
                  </li>
                )}
              </Card>
              <Card title={t('list.formatsCount')} count={formats.length}>
                {formats.slice(0, 5).map((f) => (
                  <li key={f.id}>{f.name}</li>
                ))}
                {formats.length > 5 && (
                  <li className="text-neutral-500">
                    … +{formats.length - 5}
                  </li>
                )}
              </Card>
            </div>
          </>
        )}

        <div className="text-xs text-neutral-500 pt-4 border-t border-neutral-800">
          M3a (Manual-Entry mit Master-Daten-Pickern) durch. Als nächstes
          M3b — TimerLane mit Click-Debounce für laufende Tracker.
        </div>
      </div>
    </main>
  );
}

function Card({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-lg p-4"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(201,169,98,0.18)',
      }}
    >
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs uppercase tracking-widest text-neutral-500">
          {title}
        </span>
        <span className="text-2xl font-bold" style={{ color: '#C9A962' }}>
          {count}
        </span>
      </div>
      <ul className="text-xs text-neutral-300 space-y-1">{children}</ul>
    </div>
  );
}
