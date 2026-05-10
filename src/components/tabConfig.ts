/**
 * Tab-Konfiguration — Single Source of Truth für TabBar + BottomNav.
 *
 * Wenn ein neuer Tab dazukommt, hier eintragen — beide Navs adoptieren
 * automatisch. Icons aus lucide-react.
 */

import {
  Clock,
  LayoutDashboard,
  List,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { TabId } from '@/stores/uiStore';

export interface TabDef {
  id: TabId;
  icon: LucideIcon;
  /** i18n-Pfad relativ zu `tabs.*`. */
  labelKey: TabId;
  /**
   * Wenn true, ist der Tab nur für Admins (oder Single-User ohne Team)
   * sichtbar. Wird zur Render-Zeit gegen useIsAdmin() gefiltert.
   */
  adminOnly?: boolean;
}

export const TAB_DEFS: TabDef[] = [
  { id: 'timer', icon: Clock, labelKey: 'timer' },
  { id: 'dashboard', icon: LayoutDashboard, labelKey: 'dashboard' },
  { id: 'entries', icon: List, labelKey: 'entries' },
  { id: 'team', icon: Users, labelKey: 'team' },
  { id: 'manage', icon: Settings, labelKey: 'manage', adminOnly: true },
];
