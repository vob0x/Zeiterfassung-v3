/**
 * TimerView — Container für alle Timer-Slots.
 *
 * Layout: Header mit Titel + Summe-laufender-Zeit + Aktions-Buttons
 * (Stop-All, +Neu), darunter Liste der TimerLanes.
 *
 * Stop-All: durchläuft alle laufenden Slots sequenziell (await pro Slot)
 * mit Click-Debounce auf dem Button selbst. Sequenziell weil parallele
 * Server-Writes auf entriesStore.add die lokale Cache-Aktualisierung
 * theoretisch durcheinander bringen könnten — sicherer ist's so.
 */

import { useMemo, useState } from 'react';
import { Plus, Square } from 'lucide-react';
import { useTimerStore } from '@/stores/timerStore';
import { useEntriesStore } from '@/stores/entriesStore';
import { useI18n } from '@/i18n';
import { splitTimerSpanAtMidnight } from '@/lib/timerSegments';
import TimerLane from './TimerLane';
import FuzzySearch from './FuzzySearch';
import QuickShortcuts from './QuickShortcuts';

export default function TimerView() {
  const { t } = useI18n();
  const slots = useTimerStore((s) => s.slots);
  const addSlot = useTimerStore((s) => s.addSlot);
  const removeSlot = useTimerStore((s) => s.removeSlot);
  const setIsStopping = useTimerStore((s) => s.setIsStopping);
  const getElapsedMs = useTimerStore((s) => s.getElapsedMs);
  // tick-Counter binden für Live-Total-Update
  useTimerStore((s) => s.tick);

  const addEntry = useEntriesStore((s) => s.addEntry);
  const addEntries = useEntriesStore((s) => s.addEntries);

  const [error, setError] = useState<string | null>(null);
  const [endingDay, setEndingDay] = useState(false);

  // Live-Summe aller laufenden + pausierten Slots, für die Header-Anzeige.
  const totalElapsedMs = useMemo(
    () => slots.reduce((sum, s) => sum + getElapsedMs(s.id), 0),
    [slots, getElapsedMs]
  );

  // Auto-Clear der Error-Message nach 4s
  const clearErrorAfter = (msg: string) => {
    setError(msg);
    setTimeout(() => setError((cur) => (cur === msg ? null : cur)), 4000);
  };

  /**
   * Stop-All: alle Slots der Reihe nach stoppen. Kompletter Re-Use des
   * Stop-Pfads aus TimerLane wäre möglich, würde aber heißen die UI-
   * Lane-Komponenten programmatisch zu triggern. Sauberer: hier inline,
   * weil der Mechanismus überschaubar ist.
   */
  const handleEndDay = async () => {
    if (endingDay) return;
    if (slots.length === 0) return;
    setEndingDay(true);

    let firstError: string | null = null;
    // Snapshot der IDs nehmen — slots-Array verändert sich während wir
    // durchgehen (jeder Stop entfernt einen Slot).
    const snapshotIds = slots.map((s) => s.id);

    for (const id of snapshotIds) {
      const slot = useTimerStore.getState().slots.find((s) => s.id === id);
      if (!slot) continue; // schon weg
      const elapsed = useTimerStore.getState().getElapsedMs(id);
      if (elapsed < 1000) {
        // zu kurz für einen sinnvollen Eintrag — einfach entfernen
        removeSlot(id);
        continue;
      }
      setIsStopping(id, true);
      try {
        const now = new Date();
        const startDate = new Date(now.getTime() - elapsed);
        // Über Mitternacht → ein Eintrag pro Kalendertag.
        const segments = splitTimerSpanAtMidnight(startDate, now);
        const inputs = segments.map((seg) => ({
          date: seg.date,
          stakeholder: slot.stakeholder,
          projekt: slot.projekt,
          taetigkeit: slot.taetigkeit,
          format: slot.format,
          start_time: seg.start_time,
          end_time: seg.end_time,
          duration_ms: seg.duration_ms,
          notiz: slot.notiz,
        }));
        if (inputs.length === 1) {
          await addEntry(inputs[0]);
        } else {
          await addEntries(inputs);
        }
        removeSlot(id);
      } catch (e: any) {
        if (!firstError) firstError = e?.message || t('toast.saveFailed');
        setIsStopping(id, false);
        // Loop bricht NICHT ab — auch andere Slots versuchen wir noch.
      }
    }

    setEndingDay(false);
    if (firstError) clearErrorAfter(firstError);
  };

  const hasRunning = slots.some((s) => !s.isPaused);

  return (
    <section
      className="rounded-lg p-4"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(201,169,98,0.18)',
      }}
    >
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span
            className="text-xs uppercase tracking-widest"
            style={{
              color: hasRunning ? '#6EC49E' : 'var(--text-muted)',
            }}
          >
            {t('timer.title')}
          </span>
          {slots.length > 0 && (
            <span
              className="text-xs font-mono"
              style={{ color: 'var(--text-muted)' }}
            >
              · {slots.length} {slots.length === 1 ? t('timer.slot') : t('timer.slots')}
              {totalElapsedMs > 0 && (
                <> · {formatHM(totalElapsedMs)}</>
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {slots.length > 0 && (
            <button
              type="button"
              onClick={handleEndDay}
              disabled={endingDay}
              className="text-xs py-1.5 px-3 rounded font-medium transition-opacity disabled:opacity-50 flex items-center gap-1"
              style={{
                background: 'rgba(212,112,110,0.15)',
                color: '#D4706E',
                cursor: endingDay ? 'wait' : undefined,
              }}
            >
              <Square size={12} />
              {endingDay ? t('timer.endingDay') : t('timer.endDay')}
            </button>
          )}
          <button
            type="button"
            onClick={() => addSlot()}
            className="text-xs py-1.5 px-3 rounded font-medium transition-opacity flex items-center gap-1"
            style={{ background: '#C9A962', color: '#1c1a17' }}
          >
            <Plus size={12} />
            {t('timer.add')}
          </button>
        </div>
      </header>

      {/* FuzzySearch + QuickShortcuts: hauptsächlicher Einstieg fürs
          Erstellen wiederkehrender Timer. Beide derived state aus
          entriesStore — kein separater Sync-State, kein User-Pinning. */}
      <div className="space-y-2 mb-3">
        <FuzzySearch />
        <QuickShortcuts />
      </div>

      {error && (
        <div
          className="rounded p-2 mb-2 text-xs"
          style={{
            background: 'rgba(212,112,110,0.10)',
            border: '1px solid rgba(212,112,110,0.45)',
            color: '#D4706E',
          }}
        >
          {error}
        </div>
      )}

      {slots.length === 0 ? (
        <div className="text-xs text-neutral-500 py-2">
          {t('timer.empty')}
        </div>
      ) : (
        <div className="space-y-1.5">
          {slots.map((s) => (
            <TimerLane key={s.id} slot={s} onError={clearErrorAfter} />
          ))}
        </div>
      )}
    </section>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Kompakte Stunden-Minuten-Darstellung für Header-Summe. */
function formatHM(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${pad(m)}`;
}
