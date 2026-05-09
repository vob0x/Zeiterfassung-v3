/**
 * BottomNav — Mobile-Navigation, fix am unteren Bildschirmrand.
 *
 * Nur auf Viewports < md sichtbar. Auf Desktop (>= md) versteckt;
 * dort übernimmt TabBar.
 *
 * Tabs werden aus TAB_DEFS gelesen — gemeinsam mit TabBar.
 *
 * Safe-Area-Handling: padding-bottom: env(safe-area-inset-bottom)
 * berücksichtigt iPhone-Home-Indicator-Spacing automatisch.
 */

import { useUiStore } from '@/stores/uiStore';
import { useI18n } from '@/i18n';
import { TAB_DEFS } from './tabConfig';

export default function BottomNav() {
  const { t } = useI18n();
  const activeTab = useUiStore((s) => s.activeTab);
  const setActiveTab = useUiStore((s) => s.setActiveTab);

  return (
    <nav
      role="tablist"
      aria-label="Mobile Navigation"
      className="md:hidden"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        justifyContent: 'space-around',
        background: '#1c1a17',
        borderTop: '1px solid var(--border)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        zIndex: 40,
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
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              padding: '8px 4px 6px',
              background: 'transparent',
              border: 'none',
              color: isActive ? '#C9A962' : 'var(--text-muted)',
              fontSize: 10,
              fontWeight: isActive ? 600 : 400,
              cursor: 'pointer',
              transition: 'color 0.15s',
              minWidth: 0,
            }}
          >
            <Icon size={20} strokeWidth={isActive ? 2.25 : 1.75} />
            <span
              style={{
                letterSpacing: '0.02em',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '100%',
              }}
            >
              {t(`tabs.${labelKey}`)}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
