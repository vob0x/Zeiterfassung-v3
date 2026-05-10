/**
 * ManageView — Verwaltungs-Tab für Master-Daten.
 *
 * Vier Sections (Stakeholder / Projekte / Tätigkeiten / Formate), jede
 * mit:
 *   - sortierter Liste der Items
 *   - Use-Counter pro Item (wieviele eigene Einträge verwenden's)
 *   - Inline-Rename mit Cascade-Confirm (zeigt Anzahl betroffener Einträge)
 *   - Delete mit Warning falls in Verwendung
 *   - "+ Neu hinzufügen"-Form
 *
 * Sichtbar nur für Admins / Single-User. Mitarbeiter im Team haben
 * den Tab nicht.
 *
 * Master-Daten sind user-scoped: jeder User hat seine eigene Liste.
 * Cascade beim Rename trifft nur eigene Einträge — Team-Mitglieder
 * bleiben unberührt.
 */

import { useMemo, useState } from 'react';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import { useEntriesStore } from '@/stores/entriesStore';
import { useMasterStore } from '@/stores/masterStore';
import { useTeamStore } from '@/stores/teamStore';
import { useAuthStore } from '@/stores/authStore';
import { useI18n } from '@/i18n';
import type { MasterDataItem, TimeEntry } from '@/types';

type Dim = 'stakeholder' | 'projekt' | 'taetigkeit' | 'format';

interface SectionConfig {
  dim: Dim;
  titleKey: string;
}

const SECTIONS: SectionConfig[] = [
  { dim: 'stakeholder', titleKey: 'list.stakeholdersCount' },
  { dim: 'projekt', titleKey: 'list.projectsCount' },
  { dim: 'taetigkeit', titleKey: 'list.activitiesCount' },
  { dim: 'format', titleKey: 'list.formatsCount' },
];

/** Zählt für jeden Wert in jeder Dimension wieviele Einträge ihn verwenden. */
function buildUseCounters(
  entries: TimeEntry[]
): Record<Dim, Map<string, number>> {
  const counters: Record<Dim, Map<string, number>> = {
    stakeholder: new Map(),
    projekt: new Map(),
    taetigkeit: new Map(),
    format: new Map(),
  };
  for (const e of entries) {
    const list = Array.isArray(e.stakeholder) ? e.stakeholder : [];
    for (const s of list) {
      counters.stakeholder.set(s, (counters.stakeholder.get(s) || 0) + 1);
    }
    if (e.projekt) counters.projekt.set(e.projekt, (counters.projekt.get(e.projekt) || 0) + 1);
    if (e.taetigkeit) counters.taetigkeit.set(e.taetigkeit, (counters.taetigkeit.get(e.taetigkeit) || 0) + 1);
    if (e.format) counters.format.set(e.format, (counters.format.get(e.format) || 0) + 1);
  }
  return counters;
}

export default function ManageView() {
  const { t } = useI18n();
  const stakeholders = useMasterStore((s) => s.stakeholders);
  const projects = useMasterStore((s) => s.projects);
  const activities = useMasterStore((s) => s.activities);
  const formats = useMasterStore((s) => s.formats);
  const ownEntries = useEntriesStore((s) => s.entries);
  const teamEntries = useEntriesStore((s) => s.teamEntries);

  // Im Team-Modus zählt der Use-Counter teamweit, damit der Admin sieht
  // wie viele Team-Einträge ein Master-Item benutzen. Solo: nur eigene.
  const allEntries = useMemo(
    () => [...ownEntries, ...teamEntries],
    [ownEntries, teamEntries]
  );
  const counters = useMemo(() => buildUseCounters(allEntries), [allEntries]);

  const itemsByDim: Record<Dim, MasterDataItem[]> = {
    stakeholder: stakeholders,
    projekt: projects,
    taetigkeit: activities,
    format: formats,
  };

  return (
    <section className="space-y-4">
      <h2
        className="text-xs uppercase tracking-widest"
        style={{ color: 'var(--text-muted)' }}
      >
        {t('manage.title')}
      </h2>
      <p
        className="text-xs"
        style={{ color: 'var(--text-muted)' }}
      >
        {t('manage.intro')}
      </p>

      {SECTIONS.map((sec) => (
        <Section
          key={sec.dim}
          dim={sec.dim}
          title={t(sec.titleKey)}
          items={itemsByDim[sec.dim]}
          counter={counters[sec.dim]}
        />
      ))}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Section pro Dimension
   ───────────────────────────────────────────────────────────────────── */

function Section({
  dim,
  title,
  items,
  counter,
}: {
  dim: Dim;
  title: string;
  items: MasterDataItem[];
  counter: Map<string, number>;
}) {
  const { t } = useI18n();
  const addStakeholder = useMasterStore((s) => s.addStakeholder);
  const addProject = useMasterStore((s) => s.addProject);
  const addActivity = useMasterStore((s) => s.addActivity);
  const addFormat = useMasterStore((s) => s.addFormat);
  const profile = useAuthStore((s) => s.profile);
  const team = useTeamStore((s) => s.team);
  const myRole = useTeamStore(
    (s) => s.members.find((m) => m.user_id === profile?.id)?.role
  );
  const isAdmin = !team || myRole === 'admin';

  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addFn = (name: string) => {
    switch (dim) {
      case 'stakeholder':
        return addStakeholder(name);
      case 'projekt':
        return addProject(name);
      case 'taetigkeit':
        return addActivity(name);
      case 'format':
        return addFormat(name);
    }
  };

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await addFn(newName);
      setNewName('');
    } catch (err: any) {
      setError(err?.message || t('toast.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  // Dedup nach Name (case-insensitive). Bei Team-Sharing können
  // mehrere Master-Rows mit gleichem Namen von verschiedenen Ownern
  // existieren — ManageView zeigt jeden Namen einmal. Wir picken die
  // eigene Row als „Display"-Row falls vorhanden (User edit/delete
  // wirkt dann sicher auf seine eigene Master-Row), sonst irgendeine.
  // Cascade-Rename teamweit deckt den Rest ab.
  const dedupedItems = useMemo(() => {
    const groups = new Map<string, MasterDataItem[]>();
    for (const it of items) {
      const key = it.name.trim().toLowerCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(it);
    }
    const display: MasterDataItem[] = [];
    for (const group of groups.values()) {
      const own = group.find((g) => g.user_id === profile?.id);
      display.push(own || group[0]);
    }
    return display;
  }, [items, profile?.id]);

  const sorted = useMemo(
    () =>
      [...dedupedItems].sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [dedupedItems]
  );

  return (
    <div
      className="rounded-lg p-4"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(201,169,98,0.18)',
      }}
    >
      <div className="flex items-baseline justify-between mb-3">
        <span
          className="text-xs uppercase tracking-widest"
          style={{ color: 'var(--text-muted)' }}
        >
          {title}
        </span>
        <span
          className="text-xs font-mono"
          style={{ color: 'var(--text-muted)' }}
        >
          {items.length}
        </span>
      </div>

      {sorted.length === 0 ? (
        <div
          className="text-xs italic mb-3"
          style={{ color: 'var(--text-muted)' }}
        >
          {t('manage.empty')}
        </div>
      ) : (
        <ul className="space-y-1 mb-3">
          {sorted.map((item) => {
            const isOwn = item.user_id === profile?.id;
            // Edit/Delete nur wenn eigene Row ODER Admin (Admin kann
            // Team-Master-Rows umbenennen via Cascade).
            const canEdit = isOwn || isAdmin;
            return (
              <ItemRow
                key={item.id}
                dim={dim}
                item={item}
                useCount={counter.get(item.name) || 0}
                canEdit={canEdit}
              />
            );
          })}
        </ul>
      )}

      {/* Add-Form */}
      <form
        onSubmit={onAdd}
        className="flex items-center gap-2 pt-2"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t('manage.addPlaceholder')}
          className="flex-1 text-xs px-2 py-1 rounded bg-neutral-800 border border-neutral-700 focus:border-amber-600 focus:outline-none"
          style={{ color: 'var(--text)' }}
        />
        <button
          type="submit"
          disabled={busy || !newName.trim()}
          className="text-xs py-1 px-3 rounded font-medium disabled:opacity-50"
          style={{ background: '#C9A962', color: '#1c1a17' }}
        >
          {busy ? t('manage.saving') : t('manage.add')}
        </button>
      </form>
      {error && (
        <div className="mt-2 text-xs text-red-400">{error}</div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Eine Reihe: Name + Edit + Use-Counter + Delete
   ───────────────────────────────────────────────────────────────────── */

function ItemRow({
  dim,
  item,
  useCount,
  canEdit,
}: {
  dim: Dim;
  item: MasterDataItem;
  useCount: number;
  /** Wenn false: keine Edit/Delete-Buttons (User darf das Item nicht
   *  ändern — z.B. Mitarbeiter sieht das Item eines Kollegen). */
  canEdit: boolean;
}) {
  const { t } = useI18n();
  const renameStakeholder = useMasterStore((s) => s.renameStakeholder);
  const renameProject = useMasterStore((s) => s.renameProject);
  const renameActivity = useMasterStore((s) => s.renameActivity);
  const renameFormat = useMasterStore((s) => s.renameFormat);
  const removeStakeholder = useMasterStore((s) => s.removeStakeholder);
  const removeProject = useMasterStore((s) => s.removeProject);
  const removeActivity = useMasterStore((s) => s.removeActivity);
  const removeFormat = useMasterStore((s) => s.removeFormat);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.name);
  const [busy, setBusy] = useState(false);

  const renameFn = (id: string, name: string) => {
    switch (dim) {
      case 'stakeholder':
        return renameStakeholder(id, name);
      case 'projekt':
        return renameProject(id, name);
      case 'taetigkeit':
        return renameActivity(id, name);
      case 'format':
        return renameFormat(id, name);
    }
  };

  const removeFn = (id: string) => {
    switch (dim) {
      case 'stakeholder':
        return removeStakeholder(id);
      case 'projekt':
        return removeProject(id);
      case 'taetigkeit':
        return removeActivity(id);
      case 'format':
        return removeFormat(id);
    }
  };

  const onStartEdit = () => {
    setDraft(item.name);
    setEditing(true);
  };

  const onCancelEdit = () => {
    setDraft(item.name);
    setEditing(false);
  };

  const onSaveEdit = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === item.name) {
      setEditing(false);
      return;
    }
    // Confirm wenn die Cascade Auswirkungen hat
    if (useCount > 0) {
      const msg = t('manage.renameConfirm')
        .replace('{old}', item.name)
        .replace('{new}', trimmed)
        .replace('{count}', String(useCount));
      if (!confirm(msg)) return;
    }
    setBusy(true);
    try {
      await renameFn(item.id, trimmed);
      setEditing(false);
    } catch (err: any) {
      alert(err?.message || t('toast.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    const msg =
      useCount > 0
        ? t('manage.deleteConfirmInUse')
            .replace('{name}', item.name)
            .replace('{count}', String(useCount))
        : t('manage.deleteConfirm').replace('{name}', item.name);
    if (!confirm(msg)) return;
    setBusy(true);
    try {
      await removeFn(item.id);
    } catch (err: any) {
      alert(err?.message || t('toast.deleteFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex items-center gap-2 py-1">
      {editing ? (
        <>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveEdit();
              if (e.key === 'Escape') onCancelEdit();
            }}
            autoFocus
            className="flex-1 text-xs px-2 py-1 rounded bg-neutral-800 border border-amber-600 focus:outline-none"
            style={{ color: 'var(--text)' }}
          />
          <button
            type="button"
            onClick={onSaveEdit}
            disabled={busy || !draft.trim() || draft.trim() === item.name}
            className="p-1 rounded hover:bg-neutral-800 disabled:opacity-30"
            style={{ color: '#6EC49E' }}
            aria-label={t('entry.save')}
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            onClick={onCancelEdit}
            disabled={busy}
            className="p-1 rounded hover:bg-neutral-800"
            style={{ color: 'var(--text-muted)' }}
            aria-label={t('entry.cancel')}
          >
            <X size={14} />
          </button>
        </>
      ) : (
        <>
          <span
            className="flex-1 truncate text-sm"
            style={{ color: 'var(--text)' }}
            title={item.name}
          >
            {item.name}
          </span>
          {useCount > 0 && (
            <span
              className="text-[10px] font-mono"
              style={{ color: 'var(--text-muted)' }}
              title={t('manage.useCountTooltip').replace('{count}', String(useCount))}
            >
              ×{useCount}
            </span>
          )}
          {canEdit ? (
            <>
              <button
                type="button"
                onClick={onStartEdit}
                disabled={busy}
                className="p-1 rounded hover:bg-neutral-800"
                style={{ color: 'var(--text-muted)' }}
                aria-label={t('manage.rename')}
                title={t('manage.rename')}
              >
                <Pencil size={12} />
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={busy}
                className="p-1 rounded hover:bg-neutral-800"
                style={{ color: '#D4706E' }}
                aria-label={t('manage.delete')}
                title={t('manage.delete')}
              >
                <Trash2 size={12} />
              </button>
            </>
          ) : (
            // Read-only Anzeige für nicht-editierbare Items (Team-Member-
            // Items aus Sicht des Mitarbeiters). Spacer für Layout-
            // Konsistenz mit den Edit-Buttons rechts.
            <span
              className="text-[10px] uppercase tracking-widest pr-1"
              style={{ color: 'var(--text-muted)', opacity: 0.5 }}
              title={t('manage.readOnly')}
            >
              ·
            </span>
          )}
        </>
      )}
    </li>
  );
}
