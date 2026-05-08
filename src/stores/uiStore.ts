/**
 * uiStore — UI-State der nicht in andere Stores passt.
 *
 * Aktuell minimal: Active-Tab + Toast-Queue. Wächst pro Milestone:
 *   M5: Sprache (DE/FR-Toggle), Theme (dark/light)
 *   M6: Filter-State für Reports
 *
 * Persistenz via localStorage (user-scoped wenn Profile da, sonst
 * global) — Active-Tab überlebt Reload.
 */

import { create } from 'zustand';
import { generateUUID, getTodayISO } from '@/lib/utils';
import type { Period } from '@/lib/dateRange';

export type TabId = 'timer' | 'dashboard' | 'entries' | 'team';

export interface ToastMsg {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  durationMs: number;
}

interface UiState {
  activeTab: TabId;
  setActiveTab: (id: TabId) => void;

  /** Period-Auswahl im Dashboard. */
  period: Period;
  /** Custom-Range, nur relevant wenn period === 'custom'. YYYY-MM-DD. */
  dateFrom: string;
  dateTo: string;
  setPeriod: (p: Period) => void;
  setCustomRange: (from: string, to: string) => void;

  toasts: ToastMsg[];
  showToast: (
    message: string,
    type?: ToastMsg['type'],
    durationMs?: number
  ) => void;
  dismissToast: (id: string) => void;
}

const ACTIVE_TAB_KEY = 'ze_v3_active_tab';
const PERIOD_KEY = 'ze_v3_dashboard_period';
const RANGE_KEY = 'ze_v3_dashboard_range';

function loadActiveTab(): TabId {
  if (typeof window === 'undefined') return 'timer';
  try {
    const v = localStorage.getItem(ACTIVE_TAB_KEY);
    if (
      v === 'timer' ||
      v === 'dashboard' ||
      v === 'entries' ||
      v === 'team'
    )
      return v;
  } catch {
    // ignore
  }
  return 'timer';
}

function saveActiveTab(id: TabId): void {
  try {
    localStorage.setItem(ACTIVE_TAB_KEY, id);
  } catch {
    // ignore
  }
}

function loadPeriod(): Period {
  if (typeof window === 'undefined') return 'day';
  try {
    const v = localStorage.getItem(PERIOD_KEY);
    if (
      v === 'day' ||
      v === 'week' ||
      v === 'month' ||
      v === 'year' ||
      v === 'all' ||
      v === 'custom'
    )
      return v;
  } catch {
    // ignore
  }
  return 'day';
}

function loadRange(): { from: string; to: string } {
  if (typeof window === 'undefined') {
    const today = getTodayISO();
    return { from: today, to: today };
  }
  try {
    const v = localStorage.getItem(RANGE_KEY);
    if (v) {
      const parsed = JSON.parse(v);
      if (parsed?.from && parsed?.to) return parsed;
    }
  } catch {
    // ignore
  }
  const today = getTodayISO();
  return { from: today, to: today };
}

export const useUiStore = create<UiState>((set, get) => {
  const initialRange = loadRange();
  return {
    activeTab: loadActiveTab(),
    setActiveTab: (id) => {
      saveActiveTab(id);
      set({ activeTab: id });
    },

    period: loadPeriod(),
    dateFrom: initialRange.from,
    dateTo: initialRange.to,
    setPeriod: (p) => {
      try {
        localStorage.setItem(PERIOD_KEY, p);
      } catch {}
      set({ period: p });
    },
    setCustomRange: (from, to) => {
      try {
        localStorage.setItem(RANGE_KEY, JSON.stringify({ from, to }));
      } catch {}
      set({ period: 'custom', dateFrom: from, dateTo: to });
      try {
        localStorage.setItem(PERIOD_KEY, 'custom');
      } catch {}
    },

    toasts: [],
    showToast: (message, type = 'info', durationMs = 4000) => {
      const id = generateUUID();
      set({ toasts: [...get().toasts, { id, type, message, durationMs }] });
      if (durationMs > 0) {
        setTimeout(() => get().dismissToast(id), durationMs);
      }
    },
    dismissToast: (id) => {
      set({ toasts: get().toasts.filter((t) => t.id !== id) });
    },
  };
});
