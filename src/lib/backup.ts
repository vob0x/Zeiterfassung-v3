/**
 * backup — Export der eigenen TimeEntries als JSON oder CSV.
 *
 * Server-First-Maxime: die Daten leben in Supabase. Backup ist eine
 * SCHUTZSCHICHT — falls jemand das Konto verliert, das Passwort vergisst,
 * Supabase wegfällt etc. Mit dem JSON-Export hat der User einen Klartext-
 * Snapshot, den er offline aufbewahren kann.
 *
 * Bewusst kein Restore in M7 — Restore ist eine gefährliche Operation
 * (Duplikate, falsche IDs, Konflikte). Wenn nötig, später als eigene
 * Funktion mit Confirmation-Flow.
 *
 * Format-Entscheidung:
 *   - JSON: lossless, alle Felder, Stakeholder als Array → für Re-Import
 *   - CSV:  Excel-freundlich, eine Zeile pro Eintrag, Multi-Stakeholder
 *           als Komma-Liste in einer Zelle. Datums-/Zeit-Format DE.
 */

import type { TimeEntry } from '@/types';

/* ─────────────────────────────────────────────────────────────────────
   JSON
   ───────────────────────────────────────────────────────────────────── */

interface BackupEnvelope {
  /** Format-Marker. */
  schema: 'zeiterfassung-v3';
  schemaVersion: 1;
  /** ISO-Zeitstempel des Exports. */
  exportedAt: string;
  /** Codename des Users zum Export-Zeitpunkt (zum Wiedererkennen). */
  exportedBy: string;
  /** Anzahl Einträge im Export. */
  entryCount: number;
  /** Einträge in voller Klartext-Form. */
  entries: TimeEntry[];
}

export function buildBackupJson(
  entries: TimeEntry[],
  exportedBy: string
): string {
  const envelope: BackupEnvelope = {
    schema: 'zeiterfassung-v3',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    exportedBy,
    entryCount: entries.length,
    entries,
  };
  return JSON.stringify(envelope, null, 2);
}

/* ─────────────────────────────────────────────────────────────────────
   CSV
   ───────────────────────────────────────────────────────────────────── */

/** RFC-4180-konformes CSV-Quoting: alles was Komma/Anführungszeichen/
 *  Newline enthält, wird in Doppelapostrophen gesetzt; interne
 *  Doppelapostrophe werden verdoppelt. */
function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function formatHHMM(ms: number): string {
  if (!ms || ms < 0) return '00:00';
  const totalMinutes = Math.round(ms / 60_000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function buildBackupCsv(entries: TimeEntry[]): string {
  // Header in DE — der CSV-Export ist Excel-User-fokussiert.
  const header = [
    'Datum',
    'Von',
    'Bis',
    'Dauer (HH:MM)',
    'Stakeholder',
    'Projekt',
    'Tätigkeit',
    'Format',
    'Notiz',
    'Erstellt',
    'Aktualisiert',
  ];

  const rows = entries.map((e) => {
    const stakeholder = Array.isArray(e.stakeholder)
      ? e.stakeholder.join(', ')
      : (e.stakeholder as unknown as string) || '';
    return [
      e.date,
      e.start_time,
      e.end_time,
      formatHHMM(e.duration_ms),
      stakeholder,
      e.projekt,
      e.taetigkeit,
      e.format,
      e.notiz || '',
      e.created_at,
      e.updated_at,
    ].map(csvCell);
  });

  // BOM voranstellen, damit Excel auf Windows UTF-8 erkennt und Umlaute
  // korrekt darstellt.
  const BOM = '﻿';
  return BOM + [header.map(csvCell), ...rows].map((r) => r.join(',')).join('\r\n');
}

/* ─────────────────────────────────────────────────────────────────────
   Download-Trigger
   ───────────────────────────────────────────────────────────────────── */

function triggerDownload(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function backupFilename(extension: 'json' | 'csv', codename: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const safe = codename
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `zeiterfassung-${safe || 'export'}-${date}.${extension}`;
}

export function downloadBackupJson(
  entries: TimeEntry[],
  codename: string
): void {
  const content = buildBackupJson(entries, codename);
  triggerDownload(content, backupFilename('json', codename), 'application/json');
}

export function downloadBackupCsv(
  entries: TimeEntry[],
  codename: string
): void {
  const content = buildBackupCsv(entries);
  triggerDownload(content, backupFilename('csv', codename), 'text/csv');
}

/* ─────────────────────────────────────────────────────────────────────
   Team-Export (Welle 12.2)
   ─────────────────────────────────────────────────────────────────────
   Admin lädt JSON oder CSV mit allen sichtbaren Team-Einträgen herunter.
   RLS (te_select_self_or_admin ab 20260601000000_…) regelt die Visibility
   server-seitig: der Caller muss Admin in einem Team sein, sonst sind
   nur eigene Rows drin (kein Datenleck, aber dann auch kein Mehrwert
   gegenüber Self-Backup).

   Entschlüsselung läuft im Aufrufer (entriesStore.fetchEntries) — alle
   Team-Member haben den gleichen Team-Key, der Admin kann damit fremde
   Felder lesen.

   JSON: wiederverwendet buildBackupJson — die Envelope-Form ist
   identisch, nur `exportedBy` markiert den Modus ('team-<codename>' statt
   nur '<codename>').

   CSV: separates Schema (englische Header, user_id-Spalte, ISO-Timestamps
   statt HH:MM-Dauer, Stakeholder per ';' gejoined). Die Self-Export-CSV
   ist Excel-User-fokussiert (DE-Header, HH:MM); die Team-CSV ist für
   Weiterverarbeitung in Auswertungs-Tools — daher rohe Maschinen-
   freundliche Form.
   ─────────────────────────────────────────────────────────────────────*/

/** Quoted alle Werte unconditional — die Team-CSV ist nicht für Excel
 *  optimiert, sondern für Re-Imports und Skripte, da ist konsistentes
 *  Quoting wichtiger als minimale Bytes. */
function csvCellQuoted(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '""';
  const s = String(v).replace(/"/g, '""');
  return '"' + s + '"';
}

const TEAM_EXPORT_COLUMNS = [
  'date',
  'start_time',
  'end_time',
  'duration_ms',
  'user_id',
  'stakeholder',
  'projekt',
  'taetigkeit',
  'format',
  'notiz',
  'created_at',
  'updated_at',
] as const;

export function buildTeamExportJson(
  entries: TimeEntry[],
  codename: string
): string {
  // Markiert den Export als Team-Snapshot, damit ein späterer Re-Import
  // weiß: das sind nicht meine Einträge, sondern die ganzer Team-Sicht.
  return buildBackupJson(entries, `team-${codename}`);
}

export function entriesToCsv(entries: TimeEntry[]): string {
  const header = TEAM_EXPORT_COLUMNS.map(csvCellQuoted).join(',');
  const rows = entries.map((e) => {
    const stakeholder = Array.isArray(e.stakeholder)
      ? e.stakeholder.join(';')
      : (e.stakeholder as unknown as string) || '';
    return [
      e.date,
      e.start_time,
      e.end_time,
      e.duration_ms,
      e.user_id,
      stakeholder,
      e.projekt,
      e.taetigkeit,
      e.format,
      e.notiz || '',
      e.created_at,
      e.updated_at,
    ]
      .map(csvCellQuoted)
      .join(',');
  });
  return [header, ...rows].join('\r\n');
}

function teamExportFilename(extension: 'json' | 'csv'): string {
  const date = new Date().toISOString().slice(0, 10);
  return `team-export-${date}.${extension}`;
}

export function downloadTeamExportJson(
  entries: TimeEntry[],
  codename: string
): void {
  const content = buildTeamExportJson(entries, codename);
  triggerDownload(content, teamExportFilename('json'), 'application/json');
}

export function downloadTeamExportCsv(entries: TimeEntry[]): void {
  const content = entriesToCsv(entries);
  triggerDownload(content, teamExportFilename('csv'), 'text/csv');
}
