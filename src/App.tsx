/**
 * v3 App-Shell. Routing/Layout kommen sukzessive (M3+).
 *
 * Aktueller Stand (M2b): nach Login werden Einträge + Master-Daten vom
 * Server geladen. Splash hat einen Smoke-Test-Bereich: Mini-Form zum
 * Anlegen eines Test-Eintrags, Delete-Button pro Zeile. Wenn das gegen
 * die echte v2-Datenbank funktioniert (Insert + Soft-Delete propagiert
 * sich auf v2 sichtbar), ist der Write-Pfad bewiesen.
 */

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useEntriesStore } from '@/stores/entriesStore';
import { useMasterStore } from '@/stores/masterStore';
import AuthWall from '@/components/AuthWall';
import { formatDateISO } from '@/lib/utils';

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
              Zeiterfassung
            </div>
            <div className="text-xs text-neutral-500">v3 — alpha · M2b</div>
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

        <AddEntryForm />

        {loading ? (
          <div className="text-sm text-neutral-400">Lade Daten vom Server…</div>
        ) : (
          <>
            <Card title="Einträge" count={entries.length}>
              {entries.slice(0, 8).map((e) => (
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
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Eintrag löschen?')) deleteEntry(e.id);
                    }}
                    className="text-xs text-neutral-500 hover:text-red-400 px-2 leading-none"
                    aria-label="Löschen"
                  >
                    ×
                  </button>
                </li>
              ))}
              {entries.length > 8 && (
                <li className="text-neutral-500">
                  … und {entries.length - 8} weitere
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
          M2b (Write-Pfad) durch — add/update/delete synchron mit
          Server-Confirm. Als nächstes M3 — Timer + Manual-Entry mit
          richtiger UI.
        </div>
      </div>
    </main>
  );
}

/**
 * Mini-Form für Smoke-Test des Write-Pfads. Predefinierte Defaults
 * (heute, 09:00–10:00, Test-Stakeholder/Projekt/Tätigkeit/Format) damit
 * man mit einem Klick einen Eintrag anlegen kann. Wird in M3 durch die
 * echte ManualEntry-/Timer-UI ersetzt.
 */
function AddEntryForm() {
  const addEntry = useEntriesStore((s) => s.addEntry);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(() => ({
    date: formatDateISO(new Date()),
    start_time: '09:00',
    end_time: '10:00',
    stakeholder: 'Test-Stakeholder',
    projekt: 'Test-Projekt',
    taetigkeit: 'Test-Tätigkeit',
    format: 'Einzelarbeit',
    notiz: 'v3 smoke-test',
  }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      // Dauer aus Zeitspanne ableiten
      const [sh, sm] = form.start_time.split(':').map(Number);
      const [eh, em] = form.end_time.split(':').map(Number);
      let mins = eh * 60 + em - (sh * 60 + sm);
      if (mins < 0) mins += 24 * 60;
      const duration_ms = mins * 60_000;

      await addEntry({
        date: form.date,
        stakeholder: form.stakeholder ? [form.stakeholder] : [],
        projekt: form.projekt,
        taetigkeit: form.taetigkeit,
        format: form.format,
        start_time: form.start_time,
        end_time: form.end_time,
        duration_ms,
        notiz: form.notiz,
      });
    } catch (err: any) {
      setError(err?.message || 'Fehler beim Anlegen');
    } finally {
      setBusy(false);
    }
  };

  return (
    <details
      className="rounded-lg p-3"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(201,169,98,0.18)',
      }}
    >
      <summary className="cursor-pointer text-xs uppercase tracking-widest text-neutral-500">
        Smoke-Test: Eintrag anlegen
      </summary>
      <form onSubmit={onSubmit} className="grid grid-cols-2 gap-2 text-xs mt-3">
        <Field label="Datum">
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className={inputClass}
          />
        </Field>
        <div />
        <Field label="Von">
          <input
            type="time"
            value={form.start_time}
            onChange={(e) => setForm({ ...form, start_time: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="Bis">
          <input
            type="time"
            value={form.end_time}
            onChange={(e) => setForm({ ...form, end_time: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="Stakeholder">
          <input
            type="text"
            value={form.stakeholder}
            onChange={(e) => setForm({ ...form, stakeholder: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="Projekt">
          <input
            type="text"
            value={form.projekt}
            onChange={(e) => setForm({ ...form, projekt: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="Tätigkeit">
          <input
            type="text"
            value={form.taetigkeit}
            onChange={(e) => setForm({ ...form, taetigkeit: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="Format">
          <input
            type="text"
            value={form.format}
            onChange={(e) => setForm({ ...form, format: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="Notiz">
          <input
            type="text"
            value={form.notiz}
            onChange={(e) => setForm({ ...form, notiz: e.target.value })}
            className={inputClass}
          />
        </Field>
        <div />
        <div className="col-span-2 flex items-center justify-between mt-2">
          {error && <span className="text-red-400">{error}</span>}
          <button
            type="submit"
            disabled={busy}
            className="ml-auto py-1.5 px-3 rounded font-medium transition-opacity disabled:opacity-50"
            style={{ background: '#C9A962', color: '#1c1a17' }}
          >
            {busy ? 'sende…' : 'Hinzufügen'}
          </button>
        </div>
      </form>
    </details>
  );
}

const inputClass =
  'w-full px-2 py-1 rounded bg-neutral-800 border border-neutral-700 focus:border-amber-600 focus:outline-none';

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-widest text-neutral-500 mb-0.5">
        {label}
      </span>
      {children}
    </label>
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
