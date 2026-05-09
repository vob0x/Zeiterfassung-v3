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
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { TabId } from '@/stores/uiStore';

export interface TabDef {
  id: TabId;
  icon: LucideIcon;
  /** i18n-Pfad relativ zu `tabs.*`. */
  labelKey: TabId;
}

export const TAB_DEFS: TabDef[] = [
  { id: 'timer', icon: Clock, labelKey: 'timer' },
  { id: 'dashboard', icon: LayoutDashboard, labelKey: 'dashboard' },
  { id: 'entries', icon: List, labelKey: 'entries' },
  { id: 'team', icon: Users, labelKey: 'team' },
];
