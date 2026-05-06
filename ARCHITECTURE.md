# Zeiterfassung v3 — Architecture

Greenfield-Neubau, gestartet Mai 2026. Server-first, neben der bestehenden v2 betrieben.

Dieses Dokument ist die einzige Wahrheitsquelle für v3-Architektur-Entscheidungen. Wer am Code arbeitet, liest hier zuerst. Wer die Begriffe oder Invarianten nicht respektiert, schreibt einen Bug.

Für Kontext zur v2 (was wir aus den ~100 Iterationen gelernt haben) siehe [`../zeiterfassung-app/ARCHITECTURE.md`](../zeiterfassung-app/ARCHITECTURE.md). v3 ist explizit eine **Lessons-Learned-Implementierung** — nicht Copy-Paste, aber alle erkannten Failure-Modes von v2 sollen vermieden werden.

---

## 0. Designsätze (die fünf Eckpfeiler)

1. **Single-User mit optionalem Team.** Personal Key + optionaler Team Key, ein Team pro User. Kein Multi-Tenant.
2. **Semantik ist gelockt.** Naive / Wallclock / Präsenz / Coverage haben jeweils EINE Definition (siehe Sektion 1). Verschiebungen brauchen explizite Doc-Änderung _bevor_ Code geschrieben wird.
3. **Server-First.** Jede Schreibaktion ist ein synchroner Server-Roundtrip. Kein optimistisches Lokal-Update. Bei Netzwerkfehler: Toast + retry, lokal wird nichts angefasst.
4. **Lokales Backup separat.** Kein laufender Mirror, keine Pending-Tracking, keine Soft-Merge. Backup ist eine manuelle Snapshot-Funktion (verschlüsseltes JSON-Export/-Import) für Daten-Sovereignty.
5. **Desktop-first PWA.** Web-App mit Manifest + Service-Worker für Asset-Cache. Kein Mobile-Native, kein Offline-Sync.

Diese Sätze sind nicht-verhandelbar in v3. Wenn sich einer ändert, ist das ein Architektur-Eingriff (= Doc-Update zuerst).

---

## 1. Glossar — die finale Semantik

Aus v2 übernommen, dort durchgekämpft, hier gesetzt.

### Naive Summe / „Erfasst"
Σ aller Eintragsdauern in einem Zeitraum. Parallele Erfassungen zählen mehrfach. Antwortet auf „wieviel Aufmerksamkeit wurde Stakeholder X zugeordnet". **Nicht** geeignet als „wieviel hat User Y gearbeitet".

### Wallclock-Union / „Getrackt"
Vereinigung der Tracker-aktiven Intervalle pro Tag. Antwortet auf „während wie vieler Stunden lief mindestens ein Timer". Gesetzlich relevant (Überzeit darf nicht doppelt zählen). Maximal = Präsenzzeit.

### Präsenzzeit / „Anwesenheit"
Brutto-Fenster: erster Eintrag-Start → letzter Eintrag-Ende eines Tages. Bei laufendem Timer: bis „jetzt". Antwortet auf „wie lange war ich heute am Arbeiten" als Brutto-Wert (Pausen inklusive).

### Coverage
Wallclock / Präsenz, in Prozent. Wieviel deines Anwesenheits-Fensters mit Trackern abgedeckt war.

### Ungleichung
```
Naive ≥ Wallclock ≤ Präsenz
```
Naive vs Präsenz: keine feste Relation.

### Wo welche Zahl
| KPI / Card | Metrik | Begründung |
|---|---|---|
| Dashboard „Heute" / „Im Zeitraum" | Präsenz | Per-Person/Tag-Aggregate sind „wie lang gearbeitet" |
| Dashboard Stakeholder × Person, Projekt × Person | Naive (Cells) + Präsenz (Bottom-Row) | Cells = Attribution, Bottom-Row = geleistete Arbeit |
| Tagesübersicht-Card (Team) | Präsenz | „Wer war wann aktiv" |
| Timer-Tab DayRing Außenring | Präsenz | Goal-relevanter Wert |
| Timer-Tab DayRing Innenring | Wallclock | Coverage-Visualisierung |
| Timer-Tab Coverage-Widget | Wallclock + Lücken | Tracking-Diagnostik |
| Überzeit-Berechnung | Wallclock | Rechtlich korrekt |

---

## 2. Datenmodell

### Supabase-Schema
Übernommen aus v2 (Migrationen `supabase/migrations/` in v2-Repo bleiben gültig). v3 startet mit demselben Schema — kein Datenverlust beim Wechsel, beide Apps lesen dieselben Tabellen.

Wichtige Tabellen:
- `profiles` — User-Profile mit Codename
- `teams` + `team_members` + `ze_roles` — Team-Strukturen mit Rollen
- `time_entries` — verschlüsselte Time-Entries, mit `deleted_at` für Soft-Delete
- Master-Daten-Tabellen: `stakeholders`, `projects`, `activities`, `formats`
- `user_settings` — Theme, Sprache, Pinned-Shortcuts
- (Optional) `running_timers` — Cross-Device-Timer-Sync wird in v3 möglicherweise rausfallen, weil Server-First ohnehin synchron ist

### Encryption
Personal Key + Team Key wie in v2. Encryption-Lib wird beim ersten Bedarf aus v2 portiert (1:1, weil bewährt und kompatibel).

### Lokaler State (Zustand-Stores in v3)
| Store | Verantwortung | Persistenz |
|---|---|---|
| `authStore` | Session, Personal Key, Team Key | localStorage (Keys), Supabase Auth |
| `entriesStore` | TimeEntry-Cache + CRUD-Wrapper | localStorage als reiner Cache, Server ist Wahrheit |
| `masterStore` | Master-Daten-Cache | localStorage als Cache |
| `teamStore` | Team-Mitgliedschaft, Rollen | localStorage als Cache |
| `timerStore` | Aktive Slots (UI-State) | localStorage |
| `uiStore` | Toasts, Theme, Sprache | localStorage |

**Wichtiger Unterschied zu v2:** localStorage ist nur noch Cache, nicht Source of Truth. Bei Cache-Miss wird Server gefragt.

---

## 3. Server-First Sync-Modell

### Read-Pfad
1. App startet → leerer Cache (oder warmer Cache aus localStorage)
2. Pull from Supabase → entschlüsseln → in Store schreiben → Cache aktualisieren
3. UI rendert aus Store
4. Pulls passieren bei: Boot, Tab-Visibility-Change, expliziter Refresh-Button, optional Polling (lange Intervalle ~5min)

### Write-Pfad (das Herzstück)
1. User-Action (z.B. Stop-Timer)
2. Verschlüsseln
3. `await supabase.from(...).insert/update/delete(...)`
4. **Auf Confirm warten** (kein optimistisches Update)
5. Bei Erfolg: Store + Cache aktualisieren; UI rendert
6. Bei Fehler: Toast „Speichern fehlgeschlagen", lokal nichts geändert, User retryt

### Was es NICHT gibt (im Vergleich zu v2)
- ❌ Pending-IDs / `_pendingLocalIds`
- ❌ Soft-Merge bei Pulls (Pulls replacen den Cache)
- ❌ Force-Resync (nicht nötig, Server ist Wahrheit)
- ❌ `_localTombstones` (Cross-Device-Propagation passiert über Pulls automatisch)
- ❌ Stop-Journal mit 7-Tage-Recovery-Banner (max. eine kleine Retry-Queue für Netzwerk-Fehler beim Stop)

### Was es weiterhin gibt
- ✅ `deleted_at` Tombstones — als reine Soft-Delete-Funktion für „Wiederherstellung gelöschter Einträge". Nicht mehr als Sync-Mechanismus, sondern als UX-Feature.
- ✅ Click-Debounce auf Stop-Buttons (gegen Doppelklick-Duplikate)
- ✅ Near-Duplicate-Detector im Verwaltungs-Bereich (gegen historische / unbeabsichtigte Duplikate)

### Backup/Restore
Eigenständige Funktion in der Verwaltung. Exportiert verschlüsselten JSON-Snapshot aller eigenen Daten (lokale Datei). Import lädt Snapshot zurück per Bulk-Insert (mit Konflikt-Auflösung: User entscheidet pro Konflikt). Der Backup-Mechanismus ist **kein** Sync-Layer — er ist Daten-Sovereignty (User behält die Hoheit über seine Daten).

---

## 4. Roadmap M1–M7

| MS | Inhalt | Aufwand |
|---|---|---|
| **M1** | **Auth + Encryption.** Login, Personal-Key-Derivation, Session-Handling. Encryption-Lib aus v2 portiert. Test: User kann sich einloggen, kein Klartext geht raus. | 1 Session |
| **M2** | **Server-First Sync-Layer.** entriesStore + masterStore mit synchronem Server-Roundtrip. Read-Pull, Write-Confirm. Test: CRUD-Cycle gegen echtes Supabase. | 2 Sessions |
| **M3** | **Timer + Manual-Entry.** TimerLane, Stop-Flow mit Click-Debounce, Manual-Entry-Form, eigene/eigene-Master-Daten-Pflege. | 2 Sessions |
| **M4** | **Dashboard mit KPIs + Coverage.** KPI-Cards (Naive/Präsenz, beide), DayRing (Doppelring, gelockte Semantik), Coverage-Widget mit Lücken-Liste, Stakeholder/Projekt/Tätigkeit/Format-Breakdowns, Heatmap. | 2 Sessions |
| **M5** | **Team + Rollen.** Team-Setup (Create/Join), Mitgliederliste mit Rollen, Team-View (Tagesübersicht mit Präsenz, Stakeholder×Person mit Naive-Cells + Präsenz-Bottom). | 2 Sessions |
| **M6** | **Reports admin-only.** Role-Gate, Einzelreport-pro-Mitglied + Teamreport-Variante, HTML-Renderer. | 1 Session |
| **M7** | **PWA + Backup/Restore.** Manifest, Service-Worker für Asset-Cache, Install-Prompt. Backup als JSON-Export/Import. | 1 Session |

**Gesamt: ~11 Sessions** für die produktive v3.

### Milestones zwischen MS
- **Nach M2**: erstes Deployment auf v3-GitHub-Pages, von wenigen Test-Usern probiert
- **Nach M5**: Feature-parität mit v2 für die Kern-Use-Cases erreicht
- **Nach M7**: v3 ist als „produktive Variante" verfügbar; v2 bleibt parallel weiter erreichbar bis User-Konsens „v3 läuft fehlerfrei"

---

## 5. Was wir NICHT mit übernehmen

Liste der v2-Features / Code, die in v3 _nicht_ neu gebaut werden — bewusste Subtraktion.

- **Capacitor / Mobile-Native** — ist in v2 als Dependency drin, wurde aber nie ernsthaft genutzt. v3 ist Web/PWA-only.
- **react-router-dom** — v3 startet ohne Routing-Library. Falls später nötig: nachziehen.
- **Recovery-Banner für Stop-Journal** — UX-Feature für ein Failure-Mode der unter Server-First nicht mehr existiert.
- **Force-Resync-Button in der Verwaltung** — ohne lokal-pending nicht nötig.
- **Datenbank-Bereinigung-Button** (Master-Daten-Duplikate) — historischer Workaround für ein Sync-Bug der in v3 strukturell ausgeschlossen ist.

---

## 6. Stand des Dokuments

**Erstellt:** Mai 2026, v3 Repo-Init.

**Update-Trigger:**
- Nach jedem MS-Abschluss → Sektion 4 streicht den fertigen MS, ergänzt Erkenntnisse in Sektion 3
- Bei Schema-Änderungen → Sektion 2 anpassen, Migration-Verweis aktualisieren
- Bei neuer Defense-Schicht (sollten in v3 _selten_ nötig sein) → eigene Sektion „Defenses"
- Bei Begriffsverschiebungen → ALARM. Erst Sektion 1 updaten, dann Code.

**Pflege-Regel** (übernommen aus v2): Doc führt, Code folgt. Wenn der Code anders als das Doc ist, ist EINS davon ein Bug.
