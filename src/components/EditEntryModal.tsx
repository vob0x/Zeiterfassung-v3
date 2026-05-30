/**
 * EditEntryModal — Modal-Dialog zum nachträglichen Editieren eines
 * Time-Entry.
 *
 * Inhalt: dieselben Felder wie ManualEntry (Datum, Von/Bis, alle 4
 * Master-Dims, Notiz) — aber pre-filled aus dem übergebenen Entry und
 * ohne Range-Logik (genau 1 Eintrag, kein Multi-Day-Insert).
 *
 * Save-Pfad: `entriesStore.updateEntry(id, patch)`. Bei Erfolg schließt
 * sich das Modal; bei Fehler bleibt es offen und zeigt die Nachricht.
 *
 * Mount: gerendert von EntriesView wenn `editingEntryId !== null`. Esc
 * und Click auf den Backdrop schließen.
 */

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useEntriesStore } from '@/stores/entriesStore';
import { useMasterStore } from '@/stores/masterStore';
import { useIsAdmin } from '@/hooks/useRole';
import { useNotizSuggestions } from '@/hooks/useNotizSuggestions';
import { useI18n } from '@/i18n';
import { isAbsenceActivity } from '@/lib/absences';
import Picker from './Picker';
import type { TimeEntry } from '@/types';

interface FormState {
  date: string;
  start_time: string;
  end_time: string;
  stakeholder: string[];
  projekt: string;
  taetigkeit: string;
  format: string;
  notiz: string;
}

function fromEntry(e: TimeEntry): FormState {
  return {
    date: e.date,
    start_time: e.start_time,
    end_time: e.end_time,
    stakeholder: Array.isArray(e.stakeholder)
      ? e.stakeholder
      : e.stakeholder
        ? [e.stakeholder]
        : [],
    projekt: e.projekt || '',
    taetigkeit: e.taetigkeit || '',
    format: e.format || '',
    notiz: e.notiz || '',
  };
}

function computeDurationMs(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if ([sh, sm, eh, em].some(Number.isNaN)) return 0;
  const diff = eh * 60 + em - (sh * 60 + sm);
  return Math.max(0, diff) * 60_000;
}

interface EditEntryModalProps {
  entry: TimeEntry;
  onClose: () => void;
}

export default function EditEntryModal({ entry, onClose }: EditEntryModalProps) {
  const { t } = useI18n();
  const updateEntry = useEntriesStore((s) => s.updateEntry);
  const stakeholders = useMasterStore((s) => s.stakeholders);
  const projects = useMasterStore((s) => s.projects);
  const activities = useMasterStore((s) => s.activities);
  const formats = useMasterStore((s) => s.formats);
  const addStakeholder = useMasterStore((s) => s.addStakeholder);
  const addProject = useMasterStore((s) => s.addProject);
  const addActivity = useMasterStore((s) => s.addActivity);
  const addFormat = useMasterStore((s) => s.addFormat);
  const isAdmin = useIsAdmin();
  const notizSuggestions = useNotizSuggestions();

  const [form, setForm] = useState<FormState>(() => fromEntry(entry));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Wenn der Caller mid-flight einen anderen Eintrag zum Editieren
  // reinreicht (selten, aber möglich), Form re-initialisieren.
  useEffect(() => {
    setForm(fromEntry(entry));
    setError(null);
  }, [entry]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isAbsence = isAbsenceActivity(form.taetigkeit);
  const dur = computeDurationMs(form.start_time, form.end_time);
  const durMin = Math.round(dur / 60_000);

  const validate = (): string | null => {
    if (!form.date) return t('entry.fillRequired');
    if (!form.taetigkeit) return t('entry.fillRequired');
    if (isAbsence) return null; // gleiche Lockerung wie in ManualEntry
    if (!form.start_time || !form.end_time) return t('entry.fillRequired');
    if (!form.format) return t('entry.fillRequired');
    if (dur <= 0) return t('entry.invalidTimeRange');
    return null;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setBusy(true);
    try {
      await updateEntry(entry.id, {
        date: form.date,
        stakeholder: form.stakeholder,
        projekt: form.projekt,
        taetigkeit: form.taetigkeit,
        format: form.format,
        start_time: form.start_time,
        end_time: form.end_time,
        duration_ms: dur,
        notiz: form.notiz,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || t('toast.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('edit.title')}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: 16,
        overflow: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1c1a17',
          border: '1px solid var(--border)',
          borderRadius: 8,
          width: '100%',
          maxWidth: 680,
          maxHeight: 'calc(100vh - 32px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          className="flex items-center justify-between gap-2 px-4 py-3"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="min-w-0">
            <div
              className="text-xs uppercase tracking-widest"
              style={{ color: 'var(--text-muted)' }}
            >
              {t('edit.title')}
            </div>
            <div
              className="text-sm truncate"
              style={{ color: '#C9A962' }}
            >
              {entry.date} · {entry.start_time}–{entry.end_time}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded hover:bg-neutral-800"
            style={{ color: 'var(--text-muted)' }}
            aria-label={t('app.close')}
          >
            <X size={16} />
          </button>
        </div>

        <form
          onSubmit={onSubmit}
          className="grid grid-cols-2 gap-3 text-xs px-4 py-3"
          style={{ overflowY: 'auto' }}
        >
          <Field label={t('entry.date')}>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className={inputClass}
            />
          </Field>
          <div className="flex flex-col justify-end">
            <span className="text-[10px] uppercase tracking-widest text-neutral-500 mb-0.5">
              {t('entry.duration')}
            </span>
            <span
              className="text-xs font-mono py-1"
              style={{ color: durMin > 0 ? '#C9A962' : 'var(--text-muted)' }}
            >
              {durMin > 0
                ? `${Math.floor(durMin / 60)}:${String(durMin % 60).padStart(2, '0')}`
                : '—'}
            </span>
          </div>

          <Field label={t('entry.from')}>
            <input
              type="time"
              value={form.start_time}
              onChange={(e) => setForm({ ...form, start_time: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label={t('entry.to')}>
            <input
              type="time"
              value={form.end_time}
              onChange={(e) => setForm({ ...form, end_time: e.target.value })}
              className={inputClass}
            />
          </Field>

          <div className="col-span-2">
            <Field label={t('entry.stakeholder')}>
              <Picker
                mode="multi"
                options={stakeholders.map((s) => ({ id: s.id, name: s.name }))}
                value={form.stakeholder}
                onChange={(v) => setForm({ ...form, stakeholder: v })}
                onAdd={async (name) => {
                  const item = await addStakeholder(name);
                  return { id: item.id, name: item.name };
                }}
              />
            </Field>
          </div>

          <Field label={t('entry.projekt')}>
            <Picker
              options={projects.map((p) => ({ id: p.id, name: p.name }))}
              value={form.projekt}
              onChange={(v) => setForm({ ...form, projekt: v })}
              onAdd={async (name) => {
                const item = await addProject(name);
                return { id: item.id, name: item.name };
              }}
            />
          </Field>
          <Field label={t('entry.taetigkeit')}>
            <Picker
              options={activities.map((a) => ({ id: a.id, name: a.name }))}
              value={form.taetigkeit}
              onChange={(v) => setForm({ ...form, taetigkeit: v })}
              onAdd={
                isAdmin
                  ? async (name) => {
                      const item = await addActivity(name);
                      return { id: item.id, name: item.name };
                    }
                  : undefined
              }
            />
          </Field>

          {isAbsence && (
            <div
              className="col-span-2 text-xs px-3 py-2 rounded"
              style={{
                background: 'rgba(110,196,158,0.08)',
                border: '1px solid rgba(110,196,158,0.30)',
                color: '#6EC49E',
              }}
            >
              {t('entry.absenceHint')}
            </div>
          )}

          <Field label={t('entry.format')}>
            <Picker
              options={formats.map((f) => ({ id: f.id, name: f.name }))}
              value={form.format}
              onChange={(v) => setForm({ ...form, format: v })}
              onAdd={
                isAdmin
                  ? async (name) => {
                      const item = await addFormat(name);
                      return { id: item.id, name: item.name };
                    }
                  : undefined
              }
            />
          </Field>
          <Field label={t('entry.notiz')}>
            <input
              type="text"
              list="notiz-suggestions-edit"
              value={form.notiz}
              onChange={(e) => setForm({ ...form, notiz: e.target.value })}
              placeholder={t('entry.notizPlaceholder')}
              className={inputClass}
            />
            <datalist id="notiz-suggestions-edit">
              {notizSuggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>

          <div className="col-span-2 flex items-center justify-between mt-2">
            <span className="text-xs">
              {error && <span className="text-red-400">{error}</span>}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="py-1.5 px-3 rounded text-xs border border-neutral-700 hover:border-neutral-600 disabled:opacity-50"
              >
                {t('entry.cancel')}
              </button>
              <button
                type="submit"
                disabled={busy}
                className="py-1.5 px-3 rounded text-xs font-medium transition-opacity disabled:opacity-50"
                style={{ background: '#C9A962', color: '#1c1a17' }}
              >
                {busy ? t('entry.saving') : t('entry.save')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputClass =
  'w-full px-2 py-1 rounded bg-neutral-800 border border-neutral-700 focus:border-amber-600 focus:outline-none text-xs';

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="block">
      <span className="block text-[10px] uppercase tracking-widest text-neutral-500 mb-0.5">
        {label}
      </span>
      {children}
    </div>
  );
}
