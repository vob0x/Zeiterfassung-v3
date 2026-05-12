/**
 * TimerLane — eine einzelne Timer-Zeile.
 *
 * Layout (Refinement nach Test-Feedback):
 *   - Reihe 1 = Header. Klick-Bereich für Pause/Resume. Zeigt:
 *     - Color-Dot + Elapsed-Zeit
 *     - Eindeutige Slot-Bezeichnung (Stakeholder · Projekt · Tätigkeit · Format)
 *     - Buttons (Pause/Resume / Stop / Remove / Expand-Chevron)
 *   - Reihe 2 = Pickers + Notiz. Standardmäßig kollabiert, per Chevron
 *     ausklappbar. Wenn ein Slot frisch ohne Werte angelegt wurde, ist er
 *     auto-expanded damit der User direkt die Picker bedienen kann.
 *
 * Klick auf den Header (außerhalb der Buttons) togglet Pause/Resume.
 * Buttons stoppen die Propagation. Pickers und Notiz-Input absorbieren
 * ihre Klicks ohnehin selbst.
 *
 * Stop-Pfad ist Server-First synchron: setIsStopping → addEntry await →
 * bei Erfolg removeSlot, bei Fehler Toast und Slot bleibt. Click-
 * Debounce über `slot.isStopping` plus zusätzlicher Re-Entrancy-Guard.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  Square,
  X,
} from 'lucide-react';
import { useTimerStore, type TimerSlot } from '@/stores/timerStore';
import { useEntriesStore } from '@/stores/entriesStore';
import { useMasterStore } from '@/stores/masterStore';
import { useIsAdmin } from '@/hooks/useRole';
import { useI18n } from '@/i18n';
import { formatDateISO } from '@/lib/utils';
import Picker from './Picker';

interface TimerLaneProps {
  slot: TimerSlot;
  onError?: (msg: string) => void;
}

export default function TimerLane({ slot, onError }: TimerLaneProps) {
  const { t } = useI18n();
  const updateSlot = useTimerStore((s) => s.updateSlot);
  const pauseSlot = useTimerStore((s) => s.pauseSlot);
  const resumeSlot = useTimerStore((s) => s.resumeSlot);
  const removeSlot = useTimerStore((s) => s.removeSlot);
  const setIsStopping = useTimerStore((s) => s.setIsStopping);
  useTimerStore((s) => s.tick);

  const addEntry = useEntriesStore((s) => s.addEntry);

  const stakeholders = useMasterStore((s) => s.stakeholders);
  const projects = useMasterStore((s) => s.projects);
  const activities = useMasterStore((s) => s.activities);
  const formats = useMasterStore((s) => s.formats);
  const addStakeholder = useMasterStore((s) => s.addStakeholder);
  const addProject = useMasterStore((s) => s.addProject);
  const addActivity = useMasterStore((s) => s.addActivity);
  const addFormat = useMasterStore((s) => s.addFormat);

  const isAdmin = useIsAdmin();

  const [notizDraft, setNotizDraft] = useState(slot.notiz);
  useEffect(() => setNotizDraft(slot.notiz), [slot.notiz]);

  // Default expanded wenn Slot noch keine Stakeholder UND kein Projekt hat
  // — frisch über „Neuer Timer" angelegt, User soll direkt sehen wo
  // konfiguriert wird. Sonst collapsed.
  const isUnconfigured =
    (slot.stakeholder?.length || 0) === 0 && !slot.projekt;
  const [expanded, setExpanded] = useState(isUnconfigured);

  const elapsedMs = useTimerStore.getState().getElapsedMs(slot.id);
  const elapsed = formatElapsed(elapsedMs);

  // Slot-Bezeichnung als „Stakeholder · Projekt · Tätigkeit · Format".
  // Leere Felder werden weggelassen. Wenn nichts konfiguriert ist:
  // Placeholder „Nicht konfiguriert".
  const label = useMemo(() => {
    const parts: string[] = [];
    if (slot.stakeholder && slot.stakeholder.length > 0) {
      parts.push(slot.stakeholder.join(', '));
    }
    if (slot.projekt) parts.push(slot.projekt);
    if (slot.taetigkeit) parts.push(slot.taetigkeit);
    if (slot.format) parts.push(slot.format);
    return parts.join(' · ');
  }, [slot.stakeholder, slot.projekt, slot.taetigkeit, slot.format]);

  const handleStop = async () => {
    if (slot.isStopping) return;
    if (elapsedMs < 1000) {
      onError?.(t('timer.tooShort'));
      return;
    }

    setIsStopping(slot.id, true);
    try {
      const now = new Date();
      const endTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      const startDate = new Date(now.getTime() - elapsedMs);
      const startTime = `${pad(startDate.getHours())}:${pad(
        startDate.getMinutes()
      )}`;

      await addEntry({
        date: formatDateISO(now),
        stakeholder: slot.stakeholder,
        projekt: slot.projekt,
        taetigkeit: slot.taetigkeit,
        format: slot.format,
        start_time: startTime,
        end_time: endTime,
        duration_ms: elapsedMs,
        notiz: notizDraft || slot.notiz,
      });

      removeSlot(slot.id);
    } catch (e: any) {
      onError?.(e?.message || t('toast.saveFailed'));
      setIsStopping(slot.id, false);
    }
  };

  /** Pause/Resume-Toggle — auf Header-Klick. */
  const togglePause = () => {
    if (slot.isStopping) return;
    if (slot.isPaused) resumeSlot(slot.id);
    else pauseSlot(slot.id);
  };

  return (
    <div
      className="rounded p-2.5"
      style={{
        background: slot.isPaused
          ? 'rgba(255,255,255,0.02)'
          : `${slot.color}10`,
        border: `1px solid ${slot.color}40`,
      }}
    >
      {/* Header: klickbar für Pause/Resume. Buttons stoppen Propagation. */}
      <div
        className="flex items-center gap-2 cursor-pointer select-none"
        onClick={togglePause}
        title={slot.isPaused ? t('timer.resume') : t('timer.pause')}
      >
        <span
          className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{
            background: slot.color,
            opacity: slot.isPaused ? 0.4 : 1,
            animation: slot.isPaused
              ? 'none'
              : 'timer-pulse 2s ease-in-out infinite',
          }}
        />
        <span
          className="font-mono text-base tabular-nums flex-shrink-0"
          style={{
            color: slot.isPaused ? 'var(--text-muted)' : slot.color,
            fontWeight: 700,
            letterSpacing: '-0.01em',
          }}
        >
          {elapsed}
        </span>

        {/* Slot-Bezeichnung — die Identität. Ellipsis bei Überlauf. */}
        <span
          className="text-xs truncate flex-1 min-w-0"
          style={{
            color: label ? 'var(--text)' : 'var(--text-muted)',
            fontStyle: label ? 'normal' : 'italic',
          }}
          title={label || t('timer.unconfigured')}
        >
          {label || t('timer.unconfigured')}
        </span>

        {/* Aktions-Buttons — alle stoppen Propagation, damit Header-Klick
            sie nicht als Pause/Resume interpretiert. */}
        <div
          className="flex items-center gap-1 flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {slot.isPaused ? (
            <button
              type="button"
              onClick={() => resumeSlot(slot.id)}
              disabled={slot.isStopping}
              className="p-1.5 rounded hover:bg-neutral-800 disabled:opacity-40"
              title={t('timer.resume')}
              style={{ color: '#6EC49E' }}
            >
              <Play size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => pauseSlot(slot.id)}
              disabled={slot.isStopping}
              className="p-1.5 rounded hover:bg-neutral-800 disabled:opacity-40"
              title={t('timer.pause')}
              style={{ color: 'var(--text-muted)' }}
            >
              <Pause size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={handleStop}
            disabled={slot.isStopping || elapsedMs < 1000}
            className="p-1.5 rounded hover:bg-neutral-800 disabled:opacity-40"
            style={{
              color: '#D4706E',
              cursor: slot.isStopping ? 'wait' : undefined,
            }}
            title={t('timer.stop')}
          >
            <Square size={14} />
          </button>
          <button
            type="button"
            onClick={() => {
              if (
                elapsedMs < 5000 ||
                window.confirm(t('timer.removeConfirm'))
              ) {
                removeSlot(slot.id);
              }
            }}
            disabled={slot.isStopping}
            className="p-1.5 rounded hover:bg-neutral-800 disabled:opacity-40"
            title={t('timer.remove')}
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={14} />
          </button>
          {/* Expand/Collapse-Chevron — toggelt Pickers. */}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="p-1.5 rounded hover:bg-neutral-800"
            title={
              expanded ? t('timer.collapse') : t('timer.expand')
            }
            style={{ color: 'var(--text-muted)' }}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Picker-Grid — kollabierbar. onClick stopPropagation damit
          versehentliche Klicks zwischen Pickern nicht Pause triggern. */}
      {expanded && (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-1.5 mt-2"
          onClick={(e) => e.stopPropagation()}
        >
          <Picker
            mode="multi"
            options={stakeholders.map((s) => ({ id: s.id, name: s.name }))}
            value={slot.stakeholder}
            onChange={(v) => updateSlot(slot.id, { stakeholder: v })}
            placeholder={t('entry.stakeholder')}
            onAdd={async (name) => {
              const item = await addStakeholder(name);
              return { id: item.id, name: item.name };
            }}
          />
          <Picker
            options={projects.map((p) => ({ id: p.id, name: p.name }))}
            value={slot.projekt}
            onChange={(v) => updateSlot(slot.id, { projekt: v })}
            placeholder={t('entry.projekt')}
            onAdd={async (name) => {
              const item = await addProject(name);
              return { id: item.id, name: item.name };
            }}
          />
          <Picker
            options={activities.map((a) => ({ id: a.id, name: a.name }))}
            value={slot.taetigkeit}
            onChange={(v) => updateSlot(slot.id, { taetigkeit: v })}
            placeholder={t('entry.taetigkeit')}
            onAdd={
              isAdmin
                ? async (name) => {
                    const item = await addActivity(name);
                    return { id: item.id, name: item.name };
                  }
                : undefined
            }
          />
          <Picker
            options={formats.map((f) => ({ id: f.id, name: f.name }))}
            value={slot.format}
            onChange={(v) => updateSlot(slot.id, { format: v })}
            placeholder={t('entry.format')}
            onAdd={
              isAdmin
                ? async (name) => {
                    const item = await addFormat(name);
                    return { id: item.id, name: item.name };
                  }
                : undefined
            }
          />
          <input
            type="text"
            value={notizDraft}
            onChange={(e) => setNotizDraft(e.target.value)}
            onBlur={() => {
              if (notizDraft !== slot.notiz) {
                updateSlot(slot.id, { notiz: notizDraft });
              }
            }}
            placeholder={t('entry.notiz')}
            className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 focus:border-amber-600 focus:outline-none text-xs"
          />
        </div>
      )}
    </div>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

if (typeof document !== 'undefined') {
  const STYLE_ID = 'v3-timer-lane-pulse';
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @keyframes timer-pulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50%      { transform: scale(1.4); opacity: 0.5; }
      }
    `;
    document.head.appendChild(style);
  }
}
