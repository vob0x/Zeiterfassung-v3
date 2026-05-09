/**
 * ScopeToggle — Pill-Toggle „Nur ich" / „Team" für Admins.
 *
 * Wird im Dashboard angezeigt, wenn der User Admin in einem Team ist.
 * Mitarbeiter sehen das nicht. Der Toggle persistiert den Scope in
 * localStorage (siehe uiStore).
 */

import { User, Users } from 'lucide-react';
import { useUiStore, type DashboardScope } from '@/stores/uiStore';
import { useI18n } from '@/i18n';

export default function ScopeToggle() {
  const { t } = useI18n();
  const scope = useUiStore((s) => s.dashboardScope);
  const setScope = useUiStore((s) => s.setDashboardScope);

  const options: Array<{ id: DashboardScope; icon: typeof User; label: string }> = [
    { id: 'self', icon: User, label: t('scope.self') },
    { id: 'team', icon: Users, label: t('scope.team') },
  ];

  return (
    <div
      role="tablist"
      className="inline-flex rounded-full p-0.5"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid var(--border)',
      }}
    >
      {options.map(({ id, icon: Icon, label }) => {
        const active = scope === id;
        return (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => setScope(id)}
            className="text-xs px-3 py-1 rounded-full flex items-center gap-1.5 transition-colors"
            style={{
              background: active ? '#C9A962' : 'transparent',
              color: active ? '#1c1a17' : 'var(--text-muted)',
              fontWeight: active ? 600 : 400,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <Icon size={12} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
