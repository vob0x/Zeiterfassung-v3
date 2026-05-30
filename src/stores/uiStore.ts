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

export type TabId = 'timer' | 'dashboard' | 'entries' | 'team' | 'manage';

/**
 * Drill-Down-Filter für den Einträge-Tab. Multi-Dim: jede Dimension
 * kann unabhängig gesetzt werden, aktive Filter werden mit AND
 * verknüpft. Innerhalb einer Dimension werden mehrere Werte mit OR
 * verknüpft (Multi-Select-Semantik, Welle 12.0).
 *
 * Wird sowohl vom Dashboard (BreakdownList-Klick) als auch direkt im
 * Einträge-Tab (Click-to-Filter auf Eintragswerte, Multi-Select-
 * Dropdowns) gesetzt.
 *
 * Bewusst nicht persistiert — ein Reload zeigt wieder die volle Liste.
 */
export type EntriesFilterDim =
  | 'stakeholder'
  | 'projekt'
  | 'taetigkeit'
  | 'format';

export interface EntriesFilter {
  /**
   * Jede Dimension ist eine Liste ausgewählter Werte (Multi-Select).
   * Leer / undefined = keine Einschränkung. Mehrere Werte: OR. Über
   * Dimensionen: AND. Migration Welle 12.0: vorher single string.
   */
  stakeholder?: string[];
  projekt?: string[];
  taetigkeit?: string[];
  format?: string[];
  /** Free-Text-Suche, case-insensitive Substring über alle Felder. */
  search?: string;
  /** Notiz-spezifischer Substring-Filter (Welle 12.0). */
  notiz?: string;
}

function dimActive(v: string[] | undefined): boolean {
  return !!(v && v.length > 0);
}

/** True wenn mindestens eine Dimension gesetzt ist (Chips, ohne search/notiz). */
export function hasActiveFilter(f: EntriesFilter): boolean {
  return (
    dimActive(f.stakeholder) ||
    dimActive(f.projekt) ||
    dimActive(f.taetigkeit) ||
    dimActive(f.format)
  );
}

/** True wenn IRGENDETWAS aktiv ist — Chip, Search oder Notiz. */
export function hasAnyFilter(f: EntriesFilter): boolean {
  return (
    hasActiveFilter(f) ||
    !!(f.search && f.search.trim()) ||
    !!(f.notiz && f.notiz.trim())
  );
}

/**
 * Dashboard-Sichtbereich. Nur für Admins relevant — Mitarbeiter sehen
 * immer "self".
 *
 *   self → nur eigene Einträge
 *   team → eigene + Mitglieder zusammengefasst
 */
export type DashboardScope = 'self' | 'team';

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
  /**
   * Verschiebung in Period-Einheiten (-1 = ein Zeitraum zurück, 0 =
   * aktuell). Wird beim Period-Wechsel auf 0 zurückgesetzt — Switch von
   * „Woche" auf „Monat" soll nicht plötzlich „letzten Monat" anzeigen.
   * Nicht persistiert: ein Reload landet auf dem aktuellen Zeitraum.
   */
  periodOffset: number;
  /** Custom-Range, nur relevant wenn period === 'custom'. YYYY-MM-DD. */
  dateFrom: string;
  dateTo: string;
  setPeriod: (p: Period) => void;
  setPeriodOffset: (offset: number) => void;
  setCustomRange: (from: string, to: string) => void;

  /** Einträge-Tab Drill-Down-Filter (multi-dim, multi-value). */
  entriesFilter: EntriesFilter;
  /**
   * Eine einzelne Dimension auf genau diesen Wert SETZEN (ersetzt
   * bisherige Auswahl in dieser Dim). Mit `null` clearen die ganze Dim.
   * Wird vom Drill-Down und vom Chip-Klick (Toggle-ab) verwendet.
   */
  setEntriesFilterDim: (dim: EntriesFilterDim, value: string | null) => void;
  /**
   * Einen Wert innerhalb einer Dimension togglen (für Multi-Select-
   * Checkboxen). Andere Werte derselben Dim bleiben unangetastet.
   */
  toggleEntriesFilterValue: (dim: EntriesFilterDim, value: string) => void;
  /**
   * Komplette Werteliste einer Dimension setzen. Leeres Array =
   * Dimension löschen. Praktisch für native `<select multiple>` mit
   * direktem Mapping selectedOptions → string[].
   */
  setEntriesFilterValues: (dim: EntriesFilterDim, values: string[]) => void;
  /** Free-Text-Such-String (leer/null = aus). Kombiniert AND mit Chips. */
  setEntriesSearch: (value: string) => void;
  /** Notiz-Substring-Filter setzen (Welle 12.0). Leer = aus. */
  setEntriesNotizFilter: (value: string) => void;
  /**
   * Filter (eine Dimension) setzen UND in den Einträge-Tab springen.
   * Andere aktive Dimensionen bleiben unverändert — Drill-Down kombiniert.
   * Setzt die Dimension auf genau diesen einen Wert (ersetzt bisherige
   * Mehrfachauswahl in dieser Dim).
   */
  drillDownToEntries: (dim: EntriesFilterDim, value: string) => void;
  clearEntriesFilter: () => void;

  /** Dashboard-Scope (persistiert). */
  dashboardScope: DashboardScope;
  setDashboardScope: (s: DashboardScope) => void;

  /**
   * Member-Focus für die Member-Detail-View. Wenn gesetzt, zeigt das
   * Dashboard nur die Einträge dieses Users (mit Header zum Zurück-
   * Navigieren). Nicht persistiert — temporäre Drilldown-View.
   */
  memberFocus: string | null;
  setMemberFocus: (userId: string | null) => void;

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
const SCOPE_KEY = 'ze_v3_dashboard_scope';

function loadActiveTab(): TabId {
  if (typeof window === 'undefined') return 'timer';
  try {
    const v = localStorage.getItem(ACTIVE_TAB_KEY);
    if (
      v === 'timer' ||
      v === 'dashboard' ||
      v === 'entries' ||
      v === 'team' ||
      v === 'manage'
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

function loadScope(): DashboardScope {
  if (typeof window === 'undefined') return 'self';
  try {
    const v = localStorage.getItem(SCOPE_KEY);
    if (v === 'self' || v === 'team') return v;
  } catch {
    // ignore
  }
  return 'self';
}

function saveScope(s: DashboardScope): void {
  try {
    localStorage.setItem(SCOPE_KEY, s);
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
    periodOffset: 0,
    dateFrom: initialRange.from,
    dateTo: initialRange.to,
    setPeriod: (p) => {
      try {
        localStorage.setItem(PERIOD_KEY, p);
      } catch {}
      // Bei Period-Wechsel offset zurücksetzen — sonst zeigt Switch
      // von „Woche -3" auf „Monat" überraschend „letzten Monat".
      set({ period: p, periodOffset: 0 });
    },
    setPeriodOffset: (offset) => {
      // Maximum offset = 0 (keine Zukunft), Minimum theoretisch unendlich
      // — clampen wir oben.
      set({ periodOffset: Math.min(0, offset) });
    },
    setCustomRange: (from, to) => {
      try {
        localStorage.setItem(RANGE_KEY, JSON.stringify({ from, to }));
      } catch {}
      set({ period: 'custom', dateFrom: from, dateTo: to, periodOffset: 0 });
      try {
        localStorage.setItem(PERIOD_KEY, 'custom');
      } catch {}
    },

    entriesFilter: {},
    setEntriesFilterDim: (dim, value) => {
      const cur = get().entriesFilter;
      const next: EntriesFilter = { ...cur };
      if (value === null || value === '') {
        delete next[dim];
      } else {
        next[dim] = [value];
      }
      set({ entriesFilter: next });
    },
    toggleEntriesFilterValue: (dim, value) => {
      if (!value) return;
      const cur = get().entriesFilter;
      const next: EntriesFilter = { ...cur };
      const list = cur[dim] ?? [];
      if (list.includes(value)) {
        const rest = list.filter((v) => v !== value);
        if (rest.length === 0) delete next[dim];
        else next[dim] = rest;
      } else {
        next[dim] = [...list, value];
      }
      set({ entriesFilter: next });
    },
    setEntriesFilterValues: (dim, values) => {
      const cur = get().entriesFilter;
      const next: EntriesFilter = { ...cur };
      const cleaned = values.filter((v) => !!v);
      if (cleaned.length === 0) delete next[dim];
      else next[dim] = cleaned;
      set({ entriesFilter: next });
    },
    setEntriesSearch: (value) => {
      const cur = get().entriesFilter;
      const next: EntriesFilter = { ...cur };
      if (!value || !value.trim()) delete next.search;
      else next.search = value;
      set({ entriesFilter: next });
    },
    setEntriesNotizFilter: (value) => {
      const cur = get().entriesFilter;
      const next: EntriesFilter = { ...cur };
      if (!value || !value.trim()) delete next.notiz;
      else next.notiz = value;
      set({ entriesFilter: next });
    },
    drillDownToEntries: (dim, value) => {
      saveActiveTab('entries');
      const cur = get().entriesFilter;
      set({
        entriesFilter: { ...cur, [dim]: [value] },
        activeTab: 'entries',
      });
    },
    clearEntriesFilter: () => set({ entriesFilter: {} }),

    dashboardScope: loadScope(),
    setDashboardScope: (s) => {
      saveScope(s);
      // Beim Scope-Wechsel den Member-Focus zurücksetzen — sonst
      // sehen Admins beim Toggle möglicherweise eine fokussierte Sicht.
      set({ dashboardScope: s, memberFocus: null });
    },

    memberFocus: null,
    setMemberFocus: (userId) => set({ memberFocus: userId }),

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
