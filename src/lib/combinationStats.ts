/**
 * combinationStats — derived state über die Eintrags-Historie.
 *
 * Sammelt alle bisherigen `(stakeholder, projekt, taetigkeit, format)`-
 * Tupel und zählt deren Häufigkeit. Mehrere Stakeholder im selben
 * Eintrag werden als kanonisches sortiertes Array gespeichert (so dass
 * [A, B] und [B, A] denselben Bucket teilen).
 *
 * Der Output treibt FuzzySearch (Live-Suche) und QuickShortcuts (Top-N).
 *
 * KEINE Persistenz — wird bei jedem Render aus dem `entries`-Cache neu
 * berechnet. `useMemo` ist Pflicht in den Konsumenten, weil das O(n) ist
 * über alle Einträge des Users.
 */

import type { TimeEntry } from '@/types';
import { isAbsenceEntry } from './absences';

export interface Combination {
  /** Kanonisch sortiertes Stakeholder-Array (oder []). */
  stakeholder: string[];
  projekt: string;
  taetigkeit: string;
  format: string;
  /** Wie oft diese Kombi vorkommt. */
  count: number;
  /** ISO-Timestamp der jüngsten Verwendung. */
  lastUsed: string;
}

interface RawAccumulator {
  stakeholder: string[];
  projekt: string;
  taetigkeit: string;
  format: string;
  count: number;
  lastUsed: string;
}

function canonicalKey(c: {
  stakeholder: string[];
  projekt: string;
  taetigkeit: string;
  format: string;
}): string {
  // sortiert + lowercase, damit [A,B] = [B,A] und Case-Inkonsistenzen
  // nicht zu doppelten Buckets führen
  const sh = [...c.stakeholder]
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join('|');
  return [
    sh,
    c.projekt.trim().toLowerCase(),
    c.taetigkeit.trim().toLowerCase(),
    c.format.trim().toLowerCase(),
  ].join('::');
}

/**
 * Baut die Statistik aus dem Entries-Cache. Sortierung:
 *   1. count desc (häufigste zuerst)
 *   2. lastUsed desc (Tiebreaker: jüngere Verwendung gewinnt)
 *
 * Komplett-leere Combos (alle 4 Felder leer) werden übersprungen — sind
 * keine sinnvollen Vorschläge.
 */
export function buildCombinationStats(entries: TimeEntry[]): Combination[] {
  const buckets = new Map<string, RawAccumulator>();

  for (const e of entries) {
    if (isAbsenceEntry(e)) continue;
    const sh = Array.isArray(e.stakeholder)
      ? e.stakeholder.filter(Boolean)
      : e.stakeholder
        ? [e.stakeholder]
        : [];
    const projekt = (e.projekt || '').trim();
    const taetigkeit = (e.taetigkeit || '').trim();
    const format = (e.format || '').trim();

    if (!sh.length && !projekt && !taetigkeit && !format) continue;

    // kanonisch sortierte Stakeholder für den Key UND fürs gespeicherte Tupel
    const canonicalSh = [...sh].sort();
    const key = canonicalKey({
      stakeholder: canonicalSh,
      projekt,
      taetigkeit,
      format,
    });
    const existing = buckets.get(key);
    if (existing) {
      existing.count += 1;
      if ((e.updated_at || '') > existing.lastUsed) {
        existing.lastUsed = e.updated_at || existing.lastUsed;
      }
    } else {
      buckets.set(key, {
        stakeholder: canonicalSh,
        projekt,
        taetigkeit,
        format,
        count: 1,
        lastUsed: e.updated_at || e.created_at || '',
      });
    }
  }

  return Array.from(buckets.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return (b.lastUsed || '').localeCompare(a.lastUsed || '');
  });
}

/**
 * Filtert die Combinations auf User-Input. Substring-Match (case-
 * insensitive) gegen alle 4 Felder. Falls Input leer: alles
 * unverändert zurück (sortiert wie buildCombinationStats es geliefert
 * hat — by frequency).
 */
export function filterCombinations(
  combos: Combination[],
  query: string
): Combination[] {
  const q = query.trim().toLowerCase();
  if (!q) return combos;
  return combos.filter((c) => {
    const haystack = [
      ...c.stakeholder,
      c.projekt,
      c.taetigkeit,
      c.format,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

/**
 * Hübscher Combo-Display-String für UI: "Stakeholder · Projekt · Tätigkeit · Format"
 * mit Auslassen leerer Felder.
 */
export function describeCombination(c: Combination): string {
  const parts: string[] = [];
  if (c.stakeholder.length > 0) parts.push(c.stakeholder.join(', '));
  if (c.projekt) parts.push(c.projekt);
  if (c.taetigkeit) parts.push(c.taetigkeit);
  if (c.format) parts.push(c.format);
  return parts.join(' · ');
}
