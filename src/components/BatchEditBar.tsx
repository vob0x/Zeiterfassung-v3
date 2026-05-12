/**
 * BatchEditBar — Toolbar oberhalb der Eintrags-Liste, erscheint sobald
 * mind. 1 Eintrag selektiert ist.
 *
 * Vier Aktionen:
 *   - Kategorie setzen  → eine der 4 Master-Dims für alle Ausgewählten
 *     überschreiben (Stakeholder/Projekt/Tätigkeit/Format)
 *   - Notiz setzen      → Notiz-Text bei allen Ausgewählten überschreiben
 *   - Zeit-Shift        → Start UND End-Zeit aller Ausgewählten um
 *     +/- N Minuten verschieben (Datum bleibt, Dauer bleibt)
 *   - Löschen           → Soft-Delete aller Ausgewählten
 *
 * Jede Aktion wird über ein eigenes kleines Inline-Panel ausgelöst, das
 * unter der Toolbar erscheint. So bleibt die Toolbar selbst aufgeräumt.
 *
 * Store-Aufrufe:
 *   - bulkUpdateByIds(ids, patch)
 *   - bulkDeleteByIds(ids)
 *
 * Time-Shift wird im Caller berechnet: pro Eintrag werden start/end
 * verschoben und als getrennte updates submittet (in updateEntry-Loop),
 * weil bulkUpdateByIds denselben Patch auf alle anwendet — das passt
 * für Kategorie/Notiz, aber nicht für relative Zeit-Verschiebung.
 */

import { useState } from 'react';
import {
  Clock,
  MessageSquare,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { useEntriesStore } from '@/stores/entriesStore';
import { useMasterStore } from '@/stores/masterStore';
import { useI18n } from '@/i18n';
import type { TimeEntry } from '@/types';
import Picker from './Picker';

type DimKey = 'stakeholder' | 'projekt' | 'taetigkeit' | 'format';
type Mode = null | 'category' | 'notiz' | 'shift' | 'delete';

interface BatchEditBarProps {
  selectedIds: string[];
  selectedEntries: TimeEntry[];
  onClear: () => void;
}

/** Addiert N Minuten zu einer HH:MM-Zeit, clampt auf [00:00, 23:59]. */
function shiftTime(hhmm: string, deltaMin: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  let total = h * 60 + m + deltaMin;
  total = Math.max(0, Math.min(23 * 60 + 59, total));
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

export default function BatchEditBar({
  selectedIds,
  selectedEntries,
  onClear,
}: BatchEditBarProps) {
  const { t } = useI18n();
  const bulkUpdateByIds = useEntriesStore((s) => s.bulkUpdateByIds);
  const bulkDeleteByIds = useEntriesStore((s) => s.bulkDeleteByIds);
  const updateEntry = useEntriesStore((s) => s.updateEntry);

  const stakeholders = useMasterStore((s) => s.stakeholders);
  const projects = useMasterStore((s) => s.projects);
  const activities = useMasterStore((s) => s.activities);
  const formats = useMasterStore((s) => s.formats);

  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sub-State pro Modus
  const [dim, setDim] = useState<DimKey>('projekt');
  const [dimValue, setDimValue] = useState<string>('');
  const [dimStakeholder, setDimStakeholder] = useState<string[]>([]);
  const [notiz, setNotiz] = useState('');
  const [shiftMin, setShiftMin] = useState<number>(0);

  const count = selectedIds.length;
  if (count === 0) return null;

  const closePanel = () => {
    setMode(null);
    setError(null);
    setDimValue('');
    setDimStakeholder([]);
    setNotiz('');
    setShiftMin(0);
  };

  const runCategory = async () => {
    setError(null);
    if (dim === 'stakeholder') {
      if (dimStakeholder.length === 0) {
        setError(t('entry.fillRequired'));
        return;
      }
    } else if (!dimValue.trim()) {
      setError(t('entry.fillRequired'));
      return;
    }
    setBusy(true);
    try {
      await bulkUpdateByIds(selectedIds, {
        [dim]: dim === 'stakeholder' ? dimStakeholder : dimValue,
      });
      closePanel();
      onClear();
    } catch (err: any) {
      setError(err?.message || t('toast.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const runNotiz = async () => {
    setError(null);
    setBusy(true);
    try {
      // Leerer Notiz-Text = Notiz löschen (bewusst zugelassen).
      await bulkUpdateByIds(selectedIds, { notiz });
      closePanel();
      onClear();
    } catch (err: any) {
      setError(err?.message || t('toast.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const runShift = async () => {
    setError(null);
    if (!shiftMin || Number.isNaN(shiftMin)) {
      setError(t('batch.shiftZero'));
      return;
    }
    setBusy(true);
    try {
      // Pro Eintrag eigene Werte berechnen — bulkUpdateByIds würde
      // denselben Patch auf alle anwenden, das stimmt hier nicht.
      // Wir loopen mit updateEntry; Server-Reihenfolge spielt keine
      // Rolle, weil alle unabhängig sind.
      const errors: string[] = [];
      await Promise.all(
        selectedEntries.map(async (e) => {
          const newStart = shiftTime(e.start_time, shiftMin);
          const newEnd = shiftTime(e.end_time, shiftMin);
          try {
            await updateEntry(e.id, {
              start_time: newStart,
              end_time: newEnd,
            });
          } catch (err: any) {
            errors.push(err?.message || 'update failed');
          }
        })
      );
      if (errors.length > 0) {
        setError(errors[0]);
        return;
      }
      closePanel();
      onClear();
    } catch (err: any) {
      setError(err?.message || t('toast.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const runDelete = async () => {
    setError(null);
    setBusy(true);
    try {
      await bulkDeleteByIds(selectedIds);
      closePanel();
      onClear();
    } catch (err: any) {
      setError(err?.message || t('toast.deleteFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="rounded"
      style={{
        background: 'rgba(201,169,98,0.08)',
        border: '1px solid rgba(201,169,98,0.30)',
      }}
    >
      {/* Header-Zeile mit Counter + Aktion-Buttons */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span
            className="text-[10px] uppercase tracking-widest"
            style={{ color: 'var(--text-muted)' }}
          >
            {t('batch.selected')}
          </span>
          <span
            className="text-xs font-mono px-2 py-0.5 rounded"
            style={{
              background: 'rgba(201,169,98,0.22)',
              color: '#C9A962',
              fontWeight: 600,
            }}
          >
            {count}
          </span>
          <button
            type="button"
            onClick={onClear}
            className="text-[10px] flex items-center gap-1 hover:opacity-80"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={10} />
            {t('batch.clearSelection')}
          </button>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <ActionBtn
            icon={<Tag size={12} />}
            label={t('batch.setCategory')}
            active={mode === 'category'}
            onClick={() => setMode(mode === 'category' ? null : 'category')}
          />
          <ActionBtn
            icon={<MessageSquare size={12} />}
            label={t('batch.setNotiz')}
            active={mode === 'notiz'}
            onClick={() => setMode(mode === 'notiz' ? null : 'notiz')}
          />
          <ActionBtn
            icon={<Clock size={12} />}
            label={t('batch.shift')}
            active={mode === 'shift'}
            onClick={() => setMode(mode === 'shift' ? null : 'shift')}
          />
          <ActionBtn
            icon={<Trash2 size={12} />}
            label={t('batch.delete')}
            active={mode === 'delete'}
            danger
            onClick={() => setMode(mode === 'delete' ? null : 'delete')}
          />
        </div>
      </div>

      {/* Action-Panel — eines pro Modus */}
      {mode === 'category' && (
        <div
          className="px-3 py-2 grid grid-cols-1 sm:grid-cols-3 gap-2 items-end"
          style={{ borderTop: '1px solid rgba(201,169,98,0.20)' }}
        >
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-neutral-500 mb-0.5">
              {t('batch.dimension')}
            </label>
            <select
              value={dim}
              onChange={(e) => {
                setDim(e.target.value as DimKey);
                setDimValue('');
                setDimStakeholder([]);
              }}
              className={inputClass}
            >
              <option value="stakeholder">{t('entry.stakeholder')}</option>
              <option value="projekt">{t('entry.projekt')}</option>
              <option value="taetigkeit">{t('entry.taetigkeit')}</option>
              <option value="format">{t('entry.format')}</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[10px] uppercase tracking-widest text-neutral-500 mb-0.5">
              {t('batch.newValue')}
            </label>
            {dim === 'stakeholder' ? (
              <Picker
                mode="multi"
                options={stakeholders.map((s) => ({ id: s.id, name: s.name }))}
                value={dimStakeholder}
                onChange={setDimStakeholder}
              />
            ) : dim === 'projekt' ? (
              <Picker
                options={projects.map((p) => ({ id: p.id, name: p.name }))}
                value={dimValue}
                onChange={setDimValue}
              />
            ) : dim === 'taetigkeit' ? (
              <Picker
                options={activities.map((a) => ({ id: a.id, name: a.name }))}
                value={dimValue}
                onChange={setDimValue}
              />
            ) : (
              <Picker
                options={formats.map((f) => ({ id: f.id, name: f.name }))}
                value={dimValue}
                onChange={setDimValue}
              />
            )}
          </div>
          <PanelFooter
            error={error}
            busy={busy}
            onCancel={closePanel}
            onConfirm={runCategory}
            confirmLabel={t('batch.applyTo').replace('{n}', String(count))}
          />
        </div>
      )}

      {mode === 'notiz' && (
        <div
          className="px-3 py-2 grid grid-cols-1 gap-2"
          style={{ borderTop: '1px solid rgba(201,169,98,0.20)' }}
        >
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-neutral-500 mb-0.5">
              {t('entry.notiz')}
            </label>
            <input
              type="text"
              value={notiz}
              onChange={(e) => setNotiz(e.target.value)}
              placeholder={t('entry.notizPlaceholder')}
              className={inputClass}
            />
          </div>
          <PanelFooter
            error={error}
            busy={busy}
            onCancel={closePanel}
            onConfirm={runNotiz}
            confirmLabel={t('batch.applyTo').replace('{n}', String(count))}
          />
        </div>
      )}

      {mode === 'shift' && (
        <div
          className="px-3 py-2 grid grid-cols-1 sm:grid-cols-3 gap-2 items-end"
          style={{ borderTop: '1px solid rgba(201,169,98,0.20)' }}
        >
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-neutral-500 mb-0.5">
              {t('batch.shiftMinutes')}
            </label>
            <input
              type="number"
              step={5}
              value={shiftMin}
              onChange={(e) => setShiftMin(Number(e.target.value))}
              className={inputClass}
              placeholder="±N"
            />
          </div>
          <div className="sm:col-span-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {t('batch.shiftHint')}
          </div>
          <PanelFooter
            error={error}
            busy={busy}
            onCancel={closePanel}
            onConfirm={runShift}
            confirmLabel={t('batch.applyTo').replace('{n}', String(count))}
          />
        </div>
      )}

      {mode === 'delete' && (
        <div
          className="px-3 py-2 grid grid-cols-1 gap-2"
          style={{ borderTop: '1px solid rgba(212,112,110,0.30)' }}
        >
          <div
            className="text-xs px-2 py-1.5 rounded"
            style={{
              background: 'rgba(212,112,110,0.10)',
              border: '1px solid rgba(212,112,110,0.30)',
              color: '#D4706E',
            }}
          >
            {t('batch.deleteConfirm').replace('{n}', String(count))}
          </div>
          <PanelFooter
            error={error}
            busy={busy}
            onCancel={closePanel}
            onConfirm={runDelete}
            confirmLabel={t('batch.delete')}
            danger
          />
        </div>
      )}
    </div>
  );
}

const inputClass =
  'w-full px-2 py-1 rounded bg-neutral-800 border border-neutral-700 focus:border-amber-600 focus:outline-none text-xs';

function ActionBtn({
  icon,
  label,
  onClick,
  active,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  const accent = danger ? '#D4706E' : '#C9A962';
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 text-xs py-1 px-2 rounded"
      style={{
        background: active ? `${accent}33` : 'rgba(255,255,255,0.04)',
        border: `1px solid ${active ? accent : 'var(--border)'}`,
        color: active ? accent : 'var(--text)',
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function PanelFooter({
  error,
  busy,
  onCancel,
  onConfirm,
  confirmLabel,
  danger,
}: {
  error: string | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  danger?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="sm:col-span-3 flex items-center justify-between mt-1">
      <span className="text-xs">
        {error && <span className="text-red-400">{error}</span>}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="py-1 px-2 rounded text-xs border border-neutral-700 hover:border-neutral-600 disabled:opacity-50"
        >
          {t('entry.cancel')}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="py-1 px-2 rounded text-xs font-medium disabled:opacity-50"
          style={{
            background: danger ? '#D4706E' : '#C9A962',
            color: '#1c1a17',
          }}
        >
          {busy ? t('entry.saving') : confirmLabel}
        </button>
      </div>
    </div>
  );
}
