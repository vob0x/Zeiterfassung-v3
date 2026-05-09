/**
 * TabBar — Desktop-Top-Navigation. Auf Mobile (< md) ausgeblendet,
 * dort zeigt App.tsx stattdessen die BottomNav.
 *
 * Aktiver Tab kommt aus uiStore (localStorage-persistiert), damit ein
 * Reload den User auf seinem letzten Tab landen lässt statt immer auf
 * "timer".
 *
 * Tabs werden aus TAB_DEFS gelesen — gemeinsam mit BottomNav.
 */

import { useUiStore } from '@/stores/uiStore';
import { useI18n } from '@/i18n';
import { TAB_DEFS } from './tabConfig';

export default function TabBar() {
  const { t } = useI18n();
  const activeTab = useUiStore((s) => s.activeTab);
  const setActiveTab = useUiStore((s) => s.setActiveTab);

  return (
    <nav
      role="tablist"
      className="hidden md:flex"
      style={{
        gap: 2,
        borderBottom: '1px solid var(--border)',
        marginBottom: 16,
      }}
    >
      {TAB_DEFS.map(({ id, icon: Icon, labelKey }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => setActiveTab(id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
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
            <Icon size={14} />
            {t(`tabs.${labelKey}`)}
          </button>
        );
      })}
    </nav>
  );
}
