/**
 * v3 App-Shell. Routing/Layout kommen sukzessive (M3+).
 *
 * Aktueller Stand (M2a): nach Login werden Einträge + Master-Daten vom
 * Server geladen, der Splash zeigt Counts und ein paar Beispiele als
 * Smoke-Test, dass der Read-Pfad funktioniert.
 */

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useEntriesStore } from '@/stores/entriesStore';
import { useMasterStore } from '@/stores/masterStore';
import AuthWall from '@/components/AuthWall';

export default function App() {
  return (
    <AuthWall>
      <Splash />
    </AuthWall>
  );
}

function Splash() {
  const profile = useAuthStore((s) => s.profile);
  const signOut = useAuthStore((s) => s.signOut);

  const entries = useEntriesStore((s) => s.entries);
  const entriesLoading = useEntriesStore((s) => s.loading);
  const entriesError = useEntriesStore((s) => s.error);
  const fetchEntries = useEntriesStore((s) => s.fetchEntries);

  const stakeholders = useMasterStore((s) => s.stakeholders);
  const projects = useMasterStore((s) => s.projects);
  const activities = useMasterStore((s) => s.activities);
  const formats = useMasterStore((s) => s.formats);
  const masterLoading = useMasterStore((s) => s.loading);
  const masterError = useMasterStore((s) => s.error);
  const fetchMaster = useMasterStore((s) => s.fetchMaster);

  // Beim Mount einmalig laden (Splash existiert nur authenticated, also
  // sind Profile + Personal Key garantiert da).
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
              Zeiterfassung
            </div>
            <div className="text-xs text-neutral-500">v3 — alpha · M2a</div>
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
              Abmelden
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

        {loading ? (
          <div className="text-sm text-neutral-400">Lade Daten vom Server…</div>
        ) : (
          <>
            <Card title="Einträge" count={entries.length}>
              {entries.slice(0, 5).map((e) => (
                <li key={e.id}>
                  <span className="font-mono text-xs">{e.date}</span>{' '}
                  {e.start_time}–{e.end_time}{' '}
                  <span className="text-neutral-400">·</span>{' '}
                  <span>
                    {Array.isArray(e.stakeholder)
                      ? e.stakeholder.join(', ')
                      : e.stakeholder || '—'}
                  </span>{' '}
                  <span className="text-neutral-400">/</span>{' '}
                  <span>{e.projekt || '—'}</span>
                </li>
              ))}
              {entries.length > 5 && (
                <li className="text-neutral-500">
                  … und {entries.length - 5} weitere
                </li>
              )}
            </Card>

            <div className="grid grid-cols-2 gap-3">
              <Card title="Stakeholder" count={stakeholders.length}>
                {stakeholders.slice(0, 5).map((s) => (
                  <li key={s.id}>{s.name}</li>
                ))}
                {stakeholders.length > 5 && (
                  <li className="text-neutral-500">
                    … +{stakeholders.length - 5}
                  </li>
                )}
              </Card>
              <Card title="Projekte" count={projects.length}>
                {projects.slice(0, 5).map((p) => (
                  <li key={p.id}>{p.name}</li>
                ))}
                {projects.length > 5 && (
                  <li className="text-neutral-500">
                    … +{projects.length - 5}
                  </li>
                )}
              </Card>
              <Card title="Tätigkeiten" count={activities.length}>
                {activities.slice(0, 5).map((a) => (
                  <li key={a.id}>{a.name}</li>
                ))}
                {activities.length > 5 && (
                  <li className="text-neutral-500">
                    … +{activities.length - 5}
                  </li>
                )}
              </Card>
              <Card title="Formate" count={formats.length}>
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
          M2a (Read-Pfad) durch. Als nächstes M2b — Write-Pfad mit
          synchronem Server-Confirm.
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
