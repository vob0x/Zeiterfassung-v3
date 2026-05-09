/**
 * ManualEntry — echte Form für manuelles Anlegen eines TimeEntry.
 *
 * M3a-Scope: Neuer Eintrag hinzufügen mit allen 5 Dimensionen
 * (Datum/Zeit + Stakeholder/Projekt/Tätigkeit/Format) und Notiz.
 * Update-Modus (vorhandenen Eintrag editieren) kommt in M4 mit der
 * Einträge-Liste.
 *
 * Validierung:
 *   - Datum + Start + End sind Pflicht
 *   - End-Zeit muss nach Start-Zeit liegen (Same-Day-Annahme; Über-
 *     Mitternacht ist explizit NICHT supported in M3a)
 *   - Tätigkeit + Format Pflicht
 *   - Stakeholder + Projekt sind optional (für reine Verwaltungs-
 *     Einträge wie „Pause" sinnvoll, kann sich der User aber selber
 *     überlegen)
 *
 * Verhalten bei Save:
 *   - addEntry() im Store, der den Server-Roundtrip macht
 *   - Bei Erfolg: Form auf Defaults zurücksetzen
 *   - Bei Fehler: Form bleibt mit eingegebenen Werten, Error-Message
 */

import { useEffect, useState } from 'react';
import { useEntriesStore } from '@/stores/entriesStore';
import { useMasterStore } from '@/stores/masterStore';
import { useIsAdmin } from '@/hooks/useRole';
import { useI18n } from '@/i18n';
import { formatDateISO } from '@/lib/utils';
import Picker from './Picker';

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

function makeDefaults(t: (k: string) => string): FormState {
  return {
    date: formatDateISO(new Date()),
    start_time: '09:00',
    end_time: '10:00',
    stakeholder: [],
    projekt: '',
    taetigkeit: t('defaults.taetigkeitProduktiv'),
    format: t('defaults.formatEinzelarbeit'),
    notiz: '',
  };
}

/** Berechnet die Dauer in ms aus Start- und End-Zeit (HH:MM). */
function computeDurationMs(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if ([sh, sm, eh, em].some(Number.isNaN)) return 0;
  const diff = eh * 60 + em - (sh * 60 + sm);
  return Math.max(0, diff) * 60_000;
}

export default function ManualEntry() {
  const { t } = useI18n();
  const addEntry = useEntriesStore((s) => s.addEntry);
  const stakeholders = useMasterStore((s) => s.stakeholders);
  const projects = useMasterStore((s) => s.projects);
  const activities = useMasterStore((s) => s.activities);
  const formats = useMasterStore((s) => s.formats);
  const addStakeholder = useMasterStore((s) => s.addStakeholder);
  const addProject = useMasterStore((s) => s.addProject);
  const addActivity = useMasterStore((s) => s.addActivity);
  const addFormat = useMasterStore((s) => s.addFormat);

  // Mitarbeiter dürfen Format/Tätigkeit nicht selbst erweitern.
  const isAdmin = useIsAdmin();

  const [form, setForm] = useState<FormState>(() => makeDefaults(t));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  // Wenn die Defaults der Master-Daten erst nach Render reinkommen
  // (Tätigkeit „Produktiv" und Format „Einzelarbeit"), fallback wird
  // automatisch durch User-Input ersetzt — kein Auto-Override.
  useEffect(() => {
    // Cleanup von ok-Message nach 3s
    if (!okMsg) return;
    const id = setTimeout(() => setOkMsg(null), 3000);
    return () => clearTimeout(id);
  }, [okMsg]);

  const validate = (): string | null => {
    if (!form.date) return t('entry.fillRequired');
    if (!form.start_time || !form.end_time) return t('entry.fillRequired');
    if (!form.taetigkeit || !form.format) return t('entry.fillRequired');
    const dur = computeDurationMs(form.start_time, form.end_time);
    if (dur <= 0) return t('entry.invalidTimeRange');
    return null;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOkMsg(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setBusy(true);
    try {
      await addEntry({
        date: form.date,
        stakeholder: form.stakeholder,
        projekt: form.projekt,
        taetigkeit: form.taetigkeit,
        format: form.format,
        start_time: form.start_time,
        end_time: form.end_time,
        duration_ms: computeDurationMs(form.start_time, form.end_time),
        notiz: form.notiz,
      });
      setForm(makeDefaults(t));
      setOkMsg(t('toast.saved'));
    } catch (err: any) {
      setError(err?.message || t('toast.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const dur = computeDurationMs(form.start_time, form.end_time);
  const durMin = Math.round(dur / 60_000);

  return (
    <details
      className="rounded-lg p-4"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(201,169,98,0.18)',
      }}
      open
    >
      <summary className="cursor-pointer text-xs uppercase tracking-widest text-neutral-500 mb-3">
        {t('entry.addManual')}
      </summary>

      <form onSubmit={onSubmit} className="grid grid-cols-2 gap-3 text-xs mt-2">
        {/* Zeile 1: Datum + Dauer-Anzeige */}
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
            {durMin > 0 ? `${Math.floor(durMin / 60)}:${String(durMin % 60).padStart(2, '0')}` : '—'}
          </span>
        </div>

        {/* Zeile 2: Von + Bis */}
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

        {/* Zeile 3: Stakeholder (multi) — full width */}
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

        {/* Zeile 4: Projekt + Tätigkeit */}
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

        {/* Zeile 5: Format + Notiz */}
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
            value={form.notiz}
            onChange={(e) => setForm({ ...form, notiz: e.target.value })}
            placeholder={t('entry.notizPlaceholder')}
            className={inputClass}
          />
        </Field>

        {/* Footer: Status + Buttons */}
        <div className="col-span-2 flex items-center justify-between mt-2">
          <span className="text-xs">
            {error && <span className="text-red-400">{error}</span>}
            {!error && okMsg && (
              <span style={{ color: '#6EC49E' }}>{okMsg}</span>
            )}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setForm(makeDefaults(t))}
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
    </details>
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
  // Bewusst <div> statt <label>: ein <button> innerhalb eines <label>
  // verhält sich in einigen Browsern unerwartet (Click-Bubbling +
  // implicit-form-submit), was das Picker-Dropdown sofort wieder
  // schließen kann.
  return (
    <div className="block">
      <span className="block text-[10px] uppercase tracking-widest text-neutral-500 mb-0.5">
        {label}
      </span>
      {children}
    </div>
  );
}
