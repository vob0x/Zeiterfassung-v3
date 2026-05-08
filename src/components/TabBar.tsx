/**
 * TabBar — Top-Navigation zwischen Timer / Dashboard / Einträge / Team.
 *
 * Aktiver Tab kommt aus uiStore (localStorage-persistiert), damit ein
 * Reload den User auf seinem letzten Tab landen lässt statt immer auf
 * "timer".
 */

import { useUiStore, type TabId } from '@/stores/uiStore';
import { useI18n } from '@/i18n';

const TABS: TabId[] = ['timer', 'dashboard', 'entries', 'team'];

export default function TabBar() {
  const { t } = useI18n();
  const activeTab = useUiStore((s) => s.activeTab);
  const setActiveTab = useUiStore((s) => s.setActiveTab);

  return (
    <nav
      role="tablist"
      style={{
        display: 'flex',
        gap: 2,
        borderBottom: '1px solid var(--border)',
        marginBottom: 16,
      }}
    >
      {TABS.map((id) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => setActiveTab(id)}
            style={{
              padding: '8px 14px',
              background: 'transparent',
              border: 'none',
              borderBottom: `2px solid ${isActive ? '#C9A962' : 'transparent'}`,
              color: isActive ? '#C9A962' : 'var(--text-muted)',
              fontSize: 13,
              fontWeight: isActive ? 600 : 500,
              cursor: 'pointer',
              transition: 'color 0.15s, border-color 0.15s',
            }}
          >
            {t(`tabs.${id}`)}
          </button>
        );
      })}
    </nav>
  );
}
