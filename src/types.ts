/**
 * v3 Type-Definitionen. M1-Scope: Auth + Profile. Erweitert pro
 * Milestone (M3 → TimeEntry, M5 → Team etc.).
 */

export interface Profile {
  id: string;
  codename: string;
  created_at: string;
  updated_at: string;
}

export interface Session {
  user: Profile;
  access_token: string;
  refresh_token: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Time Entries
// ─────────────────────────────────────────────────────────────────────────

/**
 * TimeEntry wie er nach Decrypt im Client aussieht.
 *
 * Schema-Kompatibilität mit v2: das DB-Schema hat die selben Felder. v3
 * Reads decrypten und liefern hier den Klartext-Snapshot.
 *
 * `stakeholder` ist in v2 als `string | string[]` modelliert (Backward-
 * Compat). v3-Reads normalisieren beim Decrypt-Pfad immer auf `string[]`
 * — neue Einträge sind ohnehin Array. Wenn ein alter v2-Eintrag mit
 * String-Stakeholder geholt wird, wandeln wir in [String].
 */
export interface TimeEntry {
  id: string;
  user_id: string;
  date: string;          // YYYY-MM-DD
  stakeholder: string[]; // immer Array nach Normalisierung
  projekt: string;
  taetigkeit: string;
  format: string;        // "Einzelarbeit" | "Meeting" | "Telefonat" | "Email"
  start_time: string;    // HH:MM
  end_time: string;      // HH:MM
  duration_ms: number;
  notiz: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null; // Tombstone
}

// ─────────────────────────────────────────────────────────────────────────
// Master-Daten
// ─────────────────────────────────────────────────────────────────────────

/** Gemeinsamer Shape für Stakeholder/Projekt/Tätigkeit/Format. */
export interface MasterDataItem {
  id: string;
  user_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/**
 * Projekt-Kategorie für das Reaktivitäts-Modell (Welle 6, REPORT-PHASE-C).
 *
 * - `reaktiv`: Flowstopper, alles fallen lassen (Medienanfragen, BGÖ, Krise)
 * - `planbar`: Eigen-Arbeit oder Auftrag mit planbarem Termin (Konzeption,
 *   Newsletter, Sprechnotizen, Medienkonferenzen)
 * - `routine`: operative Wiederkehr (Daily, Mailbox-Triage, Monitoring)
 * - `fuehrung-admin`: Führung, Admin, Teamarbeit
 * - `abwesenheit`: kommt aus der Tätigkeits-Achse, nicht Projekt — hier
 *   nur für Vollständigkeit
 * - `null` / undefined: nicht klassifiziert; im Bericht als „planbar"-
 *   Default behandelt
 */
export type ProjectCategory =
  | 'reaktiv'
  | 'planbar'
  | 'routine'
  | 'fuehrung-admin'
  | 'abwesenheit';

export type Stakeholder = MasterDataItem;
/**
 * Projekt hat optional eine Kategorie. Ist sie nicht gesetzt, fällt der
 * Code auf die Heuristik aus dem Namen zurück (siehe
 * `src/lib/projectClassifier.ts`).
 */
export interface Project extends MasterDataItem {
  category?: ProjectCategory | null;
}
export type Activity = MasterDataItem;
export type Format = MasterDataItem;

// ─────────────────────────────────────────────────────────────────────────
// Team
// ─────────────────────────────────────────────────────────────────────────

export interface Team {
  id: string;
  name: string;
  invite_code: string;
  creator_id: string;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  team_id: string;
  user_id: string;
  display_name: string | null;
  joined_at: string;
  /**
   * Welle 8 — Beschäftigungsgrad in Prozent (1–100). Standard 100
   * (Vollzeit). Wird in der Überstunden-Berechnung als Multiplikator
   * auf das tägliche Vertrags-Soll (8.24 h) angewendet.
   */
  workload_pct: number;
}

export type ZeRole = 'admin' | 'mitarbeiter';

export interface TeamMemberWithRole extends TeamMember {
  /** Eigener Codename als Display, falls display_name leer. */
  codename: string;
  role: ZeRole;
}
