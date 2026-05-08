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
import { generateUUID } from '@/lib/utils';

export type TabId = 'timer' | 'dashboard' | 'entries';

export interface ToastMsg {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  durationMs: number;
}

interface UiState {
  activeTab: TabId;
  setActiveTab: (id: TabId) => void;

  toasts: ToastMsg[];
  showToast: (
    message: string,
    type?: ToastMsg['type'],
    durationMs?: number
  ) => void;
  dismissToast: (id: string) => void;
}

const ACTIVE_TAB_KEY = 'ze_v3_active_tab';

function loadActiveTab(): TabId {
  if (typeof window === 'undefined') return 'timer';
  try {
    const v = localStorage.getItem(ACTIVE_TAB_KEY);
    if (v === 'timer' || v === 'dashboard' || v === 'entries') return v;
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

export const useUiStore = create<UiState>((set, get) => ({
  activeTab: loadActiveTab(),
  setActiveTab: (id) => {
    saveActiveTab(id);
    set({ activeTab: id });
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
}));
