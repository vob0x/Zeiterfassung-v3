# Report-Brillen — Analyse vor Refactor

Vorbereitung für Welle 4 des Reports. Ziel: weg von einem Universal-Report mit
swap-baren Closing-Paragrafen, hin zu vier eigenständigen Reports, die je
Zielgruppe wirklich tragen.

Datum: 2026-05-23 · Status: Reviewgrundlage, kein Code

---

## 1. Diagnose des aktuellen Zustands

Der heutige Report ist **strukturell uniform**:

- `renderReportHtml()` rendert immer dieselbe Sektion-Folge:
  Summary → KPIs → Coverage → Tätigkeit → Format → Wochen → Schwerpunkte →
  Verschiebungen → perMember → Abwesenheiten → Findings.
- Die Brille (`lens`) beeinflusst **nur den letzten Paragrafen** im Narrative
  (Closing). Die Paragrafen 1–7 sind lens-unabhängig.
- Die ~15 Findings werden **alle** in den Report gepackt — ein Board-Reader
  bekommt Tippfehler-Warnungen, ein Coach-Reader bekommt Konzentrations-
  Risiko-Hinweise im Linienchef-Ton.
- Die KPI-Kacheln sind für alle Brillen identisch (Wallclock, Präsenz,
  Coverage, Multi-Tasking, Produktiv-Quote, Tage).

Konsequenz: die Lens-Auswahl ist heute ein 5 %-Switch. Sie sollte ein
100 %-Switch sein.

---

## 2. Datensatz-Inventar

Was die Zeiterfassung an Rohdaten und Ableitungen tatsächlich hergibt — als
Maximalvorrat, aus dem pro Brille kuratiert wird.

### 2.1 Rohdaten pro Eintrag (`TimeEntry`)

| Feld          | Typ        | Was es trägt                              |
|---------------|------------|-------------------------------------------|
| date          | YYYY-MM-DD | Kalendertag                               |
| stakeholder   | string[]   | Mandanten — Multi-Listen möglich          |
| projekt       | string     | Projekt                                   |
| taetigkeit    | string     | Produktiv / Nicht produktiv / Konzeption  |
| format        | string     | Einzelarbeit / Meeting / Telefonat / …    |
| start_time    | HH:MM      | Beginn                                    |
| end_time      | HH:MM      | Ende                                      |
| duration_ms   | number     | Echte Dauer (auch bei Mitternacht-Split)  |
| notiz         | string     | Freitext-Kontext                          |
| created_at    | ISO        | Wann erfasst                              |
| updated_at    | ISO        | Wann zuletzt geändert (→ Edit-Tracking!)  |

### 2.2 Bereits aggregierte Strukturen (in `reportData.ts`)

- **KPIs**: totalNaiveMs, totalWallclockMs, totalPresenceMs, multiTaskingFactor
  (Naive/Wallclock), coverage (Wallclock/Präsenz), Ø Wallclock/Präsenz pro Tag,
  workingDays, productivePct, productiveMs.
- **Breakdowns**: Stakeholders, Projekte, Tätigkeiten, Formate (ms, pct,
  count).
- **StakeholderProfile** (≥ 10 % Anteil): pct, ms, entriesCount, daysActive,
  avgEntryMs, microTaskPct (Reaktiv-Marker), nonprodPct (Scope-Marker),
  notizPct (Doku-Marker), topProjekt, topTaetigkeit, topFormat,
  meetingHeavyPct, meetingNonprodPct, formatSpread.
- **WeekdayProfile**: byDay (Mo–So), heaviestDow, lightestDow, weekendMs,
  longestDay, shortestDay, highLoadDaysCount (≥ 10 h Präsenz).
- **ConcentrationDrift** (1. vs 2. Hälfte): top1ShareFirst/Second für
  Stakeholder + Projekt, distinctShFirst/Second, distinctProjFirst/Second,
  coverageFirst/Second.
- **TrendChanges**: Stakeholder mit ± 3 pp Bewegung zwischen Hälften.
- **LowCoverageDays**: Tage < 60 % mit ≥ 2 h Präsenz.
- **Findings**: 15 verschiedene Trigger (Tippfehler, lange Tage,
  Konzentrations-Risiko, Multi-Tasking, Nicht-Produktiv, Coverage schwach,
  Reaktiv-Verdacht, OOS-Verdacht, Meeting-lastig, Meetings-ohne-Output,
  Doku-Lücke, Hochlast, Wochenend-Anteil + OK-Fallback).
- **Wochen-Aggregat**: KW + activeDays + wallclockMs + presenceMs + coverage.
- **PerMember** (Team-Scope): pro Mitarbeiter ms + entriesCount + pct.
- **Absences**.

### 2.3 Noch nicht extrahiert, aber im Datensatz vorhanden

Das ist die Reserve, falls ein Brille einen Datenpunkt braucht, den wir noch
nicht berechnen:

- **Tageszeit-Muster**: früheste / späteste Start-Zeit, Verteilung der Slot-
  Beginne über den Tag (Morgens-/Mittags-/Abends-Modus).
- **Slot-Längen-Histogramm**: wieviel < 15 min, 15–60 min, 1–4 h, > 4 h —
  globale Fokus-Qualität.
- **Burst-Pattern**: Slots ohne Pause hintereinander vs Slots mit Pausen.
- **Edit-Quote**: Anteil Einträge mit `updated_at > created_at + 30 s`
  (nachträglich angepasst — Indiz für Erfassungs-Disziplin).
- **Multi-Stakeholder-Quote**: % Slots mit mehreren Stakeholdern parallel.
- **Notiz-Längen-Verteilung**: median + p90 — ist die Notiz-Disziplin "1 Wort"
  oder "1 Satz"?
- **Häufigste Notiz-Tokens**: Top-Wörter nach Lemma (sehr leichtgewichtig,
  z. B. nur Tokenisierung + Stopwörter).
- **Wochen-Konsistenz**: Variationskoeffizient der Wochen-Wallclock — schwankt
  die Belastung stark Woche zu Woche?
- **Projekt-Lebenszyklus**: erste vs letzte Erwähnung eines Projekts im Range
  — neu gestartet vs ausgelaufen.
- **Stakeholder-Konstellationen**: welche Mandanten teilen sich Slots (Co-
  Auftritt-Matrix).
- **Tag-Anfang / Tag-Ende-Schwankung**: σ der ersten / letzten Erfassung pro
  Tag — fester oder gleitender Rhythmus.

Aus dieser Reserve nehmen die einzelnen Brillen-Reports nur das, was sie
brauchen — nicht alles wird gebaut, nur was im Strukturvorschlag landet.

---

## 3. Zielgruppen-Matrix

Pro Brille: Zweck, Lesedauer, Entscheidungen, relevante Daten, irrelevante
Daten, Tonalität.

### 3.1 Coach — Selbst-Spiegel

| Dimension          | Wert                                                       |
|--------------------|------------------------------------------------------------|
| Zweck              | Selbsterkenntnis, Muster spiegeln, gesunde Fragen aufwerfen |
| Wer liest          | Die Person selbst                                          |
| Lesedauer          | 2 Minuten                                                  |
| Entscheidet über   | Eigenes Verhalten: Schwerpunkt, Grenzen, Doku, Pausen      |
| **Relevant**       | Rhythmus, Belastung, Energie-Muster, Doku-Disziplin, Tag-Schwankung, längste/kürzeste Tage |
| **Irrelevant**     | Per-Member-Vergleich, Compliance-Findings (Tippfehler), Top-8-Tabellen, Drift-Berechnungen |
| Tonalität          | Warm, „du", offen, fragend statt urteilend                 |
| Aktivste KPIs      | Präsenz/Tag, Hochlast-Tage, Wochenend-Anteil, Doku-Quote   |
| Wichtigster Output | 3 datengetriebene Reflexionsfragen                         |

### 3.2 Lead — Steuerungs-Cockpit

| Dimension          | Wert                                                       |
|--------------------|------------------------------------------------------------|
| Zweck              | 1:1 mit Mitarbeitendem vorbereiten — Hebel identifizieren  |
| Wer liest          | Teamleitung, Vorgesetzte/r                                 |
| Lesedauer          | 5 Minuten                                                  |
| Entscheidet über   | Mandats-Zuschnitt, Belastung, Scope-Klärung, Coaching-Pfad |
| **Relevant**       | Stakeholder-Dossiers, Konzentrations-Risiko, OOS-Verdacht, Belastungs-Muster, Drift, Top-Projekt pro Stakeholder |
| **Irrelevant**     | Pop-Psychologie, Wochenend-Anteil als Vorwurf, Tippfehler-Mikro-Findings, 30-s-Headline-Block |
| Tonalität          | Betrieblich, klar, lösungsorientiert, Vorname              |
| Aktivste KPIs      | Auslastung, Konzentration Top-1, Multi-Tasking, Coverage   |
| Wichtigster Output | 3 konkrete Hebel + Mandanten-Dossiers                      |

### 3.3 Chef — Linien-Brief

| Dimension          | Wert                                                       |
|--------------------|------------------------------------------------------------|
| Zweck              | Operative Steuerung, Auslastung beobachten, Output-Mix     |
| Wer liest          | Linienchef, Bereichsleitung                                |
| Lesedauer          | 3 Minuten                                                  |
| Entscheidet über   | Ressourcen-Verteilung, Format-Disziplin, Projekt-Priorisierung |
| **Relevant**       | Schwerpunkt-Verteilung, Drift, Multi-Tasking, Format-Mix (Async/Sync), Output-Quote, Konzentrations-Lage |
| **Irrelevant**     | Persönliche Fragen, Doku-Lücken (zu detailliert), Reflexion, Stakeholder-Dossiers mit Coaching-Tonfall |
| Tonalität          | Knapp, sachlich, Headline-Stil, kein Du                    |
| Aktivste KPIs      | Output-Quote, Konzentration, Multi-Tasking, Coverage, Active Days |
| Wichtigster Output | 4–5 operative Headlines + Trend-Tabelle                    |

### 3.4 Board — One-Pager

| Dimension          | Wert                                                       |
|--------------------|------------------------------------------------------------|
| Zweck              | Strategie-Eindruck, Diskussions-Grundlage                  |
| Wer liest          | Geschäftsleitung, Verwaltungsrat                           |
| Lesedauer          | 30 Sekunden                                                |
| Entscheidet über   | Indirekt — Report ist Input für strategische Diskussion    |
| **Relevant**       | 3–5 Headlines, eine Zahl pro Headline, Schwerpunkts-Verteilung visuell |
| **Irrelevant**     | Alles Operative, Coaching-Fragen, Findings-Listen, Tabellen mit Details, persönliche Anrede |
| Tonalität          | Deskriptiv, ohne Adressat, „die Auslastung beträgt …"      |
| Aktivste KPIs      | Auslastung, Schwerpunkt, Output, Coverage — als Hero       |
| Wichtigster Output | Visueller Block mit max. 3 Aussagen                        |

---

## 4. Strukturvorschlag pro Brille

Was im Report stehen soll — Sektion für Sektion. Was **nicht** drinsteht, ist
genauso wichtig.

### 4.1 Coach-Report — „Selbst-Spiegel"

```
HEADER          Subject, Range — minimalistisch, ohne Hero-Block
EINSTIEG        1 Satz: „Diese Periode in einer Beobachtung."
                Datengetrieben aus dem auffälligsten Muster (Hochlast,
                Doku-Lücke, gleichmäßiger Rhythmus, etc.)
MEIN RHYTHMUS   Mini-KPIs (3): Ø Präsenz/Tag · Hochlast-Tage · Wochenend-Anteil
                Plus: Wochenprofil als zarter Bar-Strip (Mo–So)
NARRATIVE       2–3 kurze Paragrafen, persönlich, „du":
                · Wo dein Kopf war — Schwerpunkt + Energie-Aussage
                · Wie deine Woche lief — Rhythmus + Tagesextremwerte
                · Optional: Wo's stockte — Doku-Quote + Reaktiv-Indikator
3 REFLEXIONS-   Das bestehende Coach-Closing — aber prominent platziert,
FRAGEN          nicht am Schluss versteckt
SCHLUSS         Klein gehaltener Disclaimer: „Datenbasis Coverage X %"
                KEIN Findings-Anhang. KEINE Tabellen.
```

**Was bewusst fehlt**: Top-N-Stakeholder-Tabelle, Top-N-Projekte-Tabelle,
Drift, Format-Mix, perMember, Absences, alle „Compliance"-Findings.

### 4.2 Lead-Report — „Steuerungs-Cockpit"

```
HEADER          Subject, Range, Gesamt-Auslastung als Mini-Indikator
DREI KARTEN     · Belastung: Hochlast-Tage · Wochenende · Multi-Tasking — Ampel
                · Schwerpunkt: Top-1 % + Drift-Pfeil + Top-Projekt
                · Datenqualität: Coverage % + Trend
MANDANTEN-      Pro Top-Stakeholder (max. 3) ein Dossier-Block:
DOSSIERS        · Name · % · Stunden · aktive Tage
                · Top-Projekt · Top-Tätigkeit · Top-Format
                · Verhaltens-Marker (Mini-Slots, OOS-Anteil, Doku-Quote)
                · Eine konkrete Lead-Frage pro Block
VERLAUF         Drift-Tabelle: 1. vs 2. Hälfte
                · Top-Stakeholder + Anteil-Δ
                · Top-Projekt + Anteil-Δ
                · Coverage-Δ
RELEVANTE       Nur Lead-relevante Findings:
FINDINGS        · OOS-Verdacht · Reaktiv-Verdacht · Meeting-ohne-Output
                · Hochlast · Konzentrations-Risiko · Doku-Lücke
                NICHT: Tippfehler · Wochenend-Anteil-Vorwurf · Multi-Tasking-Hinweis
DREI HEBEL      Das bestehende Lead-Closing — konkrete 1:1-Punkte
ANHANG          KPI-Block ganz am Ende (klein, für Referenz)
```

**Was bewusst fehlt**: Coach-Reflexionsfragen, Board-Hero-Block.

### 4.3 Chef-Report — „Linien-Brief"

```
HEADLINE-BLOCK  4 fette Aussagen direkt oben, jeweils 1 Zeile:
                · Output-Modus dominant — 62 % Produktiv-Quote
                · Konzentration verstärkt sich auf {Top-1}
                · Multi-Tasking moderat (1.32x)
                · Datenbasis tragend (Coverage 81 %)
SCHWERPUNKT-    Zwei-Spalten-Block:
MATRIX          · Top-3 Stakeholder mit % + Trend-Pfeil
                · Top-3 Projekte mit % + Trend-Pfeil
OPERATIVER      · Format-Mix als horizontale Bar (Async vs Sync vs sonst)
MIX             · Tätigkeits-Mix als horizontale Bar (Prod / Nicht-prod / Konzept)
DRIFT-TABELLE   1. vs 2. Hälfte — eine kompakte Zeile:
                · Top-1-Anteil Δ · distinct Stakeholder Δ · Coverage Δ
RELEVANTE       Nur Chef-relevante Findings:
FINDINGS        · Konzentrations-Risiko · Datenbasis-Vorbehalt
                · Multi-Tasking sehr hoch · Lange Tage
                NICHT: Doku-Lücke · Wochenende · OOS-Verdacht im persönlichen Ton
OPERATIVE       Das bestehende Chef-Closing — Headlines, keine Fragen
HEADLINES
```

**Was bewusst fehlt**: Coach-Fragen, Lead-Hebel-Liste, persönliche Anrede,
Mandanten-Dossiers im Coaching-Ton.

### 4.4 Board-Report — „One-Pager"

```
HERO-BLOCK      Visuell hervorgehoben, drei Aussagen:
                · Auslastung: Ø X h Präsenz / Y aktive Tage
                · Schwerpunkte: {Top-Stakeholder} X %, {Top-Projekt} Y %
                · Profil: X % Produktiv, Coverage Y %
VERTEILUNGSBILD Eine einzige Visualisierung (kein Tabellen-Wirrwarr):
                · Top-3 Stakeholder als horizontale Bar
                · Top-3 Projekte als horizontale Bar
TREND-SATZ      1 Satz, datengetrieben:
                „Konzentration hat sich verstärkt — {Top-1} heute bei X %,
                vorher Y %." (oder „weitgehend stabil" als Fallback)
DISCLAIMER      1 Zeile: „Datenbasis ggf. mit Vorbehalt — Coverage Z %"
```

**Was bewusst fehlt**: Alles Operative, alle Findings, persönliche Anrede,
Mandanten-Dossiers, Drift-Details. Board ist Eindruck, nicht Analyse.

---

## 5. Implementierungs-Architektur

Damit das sauber bleibt und nicht zur Wartungs-Hölle wird.

### 5.1 Trennung Daten / Rendering

- `buildReportData()` bleibt der **Single Source of Truth** — ALLE
  Datenpunkte und Strukturen werden weiterhin berechnet, lens-unabhängig.
- Pro Brille ein **eigener Renderer** in einer eigenen Datei:
  `lib/reports/renderCoachReport.ts`, `renderLeadReport.ts`,
  `renderChefReport.ts`, `renderBoardReport.ts`.
- Dispatcher `LENS_RENDERERS: Record<ReportLens, (d: ReportData) => string>`
  in `reportRenderer.ts` (das aktuelle Modul) — exhaustiv, type-checked.
- `renderReportHtml(data)` ruft nur noch `LENS_RENDERERS[data.meta.lens](data)`.
- ReportModal-Vorschau zeigt **denselben Renderer-Output** wie Print/Download
  → was du im Modal siehst, ist was du druckst.

### 5.2 Gemeinsame Bausteine

Damit kein Copy-Paste-Wildwuchs entsteht, werden gemeinsame Renderer-Helfer
ausgelagert:

- `renderBars`, `renderTopTable`, `renderKpiTile` — bleiben in
  `reportRenderer.ts` als shared building blocks
- `renderFindings(findings, allowedLevels)` — neu, mit Filter
- `renderStakeholderDossier(profile)` — neu, von Lead-Renderer benutzt
- Gemeinsame Styles bleiben in einem `STYLES`-Block

### 5.3 Findings-Filter

`Finding` bekommt ein optionales `audiences?: ReportLens[]`-Property:

```ts
findings.push({
  level: 'warn',
  audiences: ['lead', 'chef'],   // default = alle, wenn weggelassen
  htmlMessage: '...',
});
```

Renderer filtert: `data.findings.filter(f => !f.audiences || f.audiences.includes(lens))`.

Klassifikation der bestehenden Findings (Vorschlag):

| Finding                  | Coach | Lead | Chef | Board |
|--------------------------|:-----:|:----:|:----:|:-----:|
| Tippfehler in Tätigkeit  |       |      |      |       |
| Sehr lange Tage (>14h)   |   ✓   |  ✓   |  ✓   |       |
| Konzentrations-Risiko    |       |  ✓   |  ✓   |       |
| Multi-Tasking hoch       |       |  ✓   |  ✓   |       |
| Nicht-Produktiv hoch     |       |  ✓   |  ✓   |       |
| Coverage schwach         |   ✓   |  ✓   |  ✓   |  (.)  |
| Reaktiv-Verdacht         |   ✓   |  ✓   |      |       |
| Out-of-Scope-Verdacht    |       |  ✓   |      |       |
| Meeting-lastig           |       |  ✓   |  ✓   |       |
| Meetings ohne Output     |       |  ✓   |  ✓   |       |
| Doku-Lücke               |   ✓   |  ✓   |      |       |
| Hochlast                 |   ✓   |  ✓   |  ✓   |       |
| Wochenend-Anteil         |   ✓   |  ✓   |      |       |
| OK-Fallback              |   ✓   |  ✓   |  ✓   |       |

Tippfehler-Findings landen im Manage-Tab als Datenqualitäts-Hinweis, nicht im
Report (sind ein User-eigenes Disziplin-Problem, nicht report-würdig).

### 5.4 Narrative-Bausteine pro Brille

Die bestehenden Paragraf-Builder bleiben — sie werden pro Renderer kombiniert:

- **Coach-Renderer ruft**: 1-Satz-Einstieg (neu) + `buildRhythmusPara` +
  ggf. `buildOOSPara` (umformuliert auf „du") + `buildCoachClosing`.
- **Lead-Renderer ruft**: Drei-Karten-Block (neu) + `buildSteckbriefePara`
  (umgestaltet als Karten) + `buildDriftPara` + `buildLeadClosing`.
- **Chef-Renderer ruft**: 4-Headline-Block (neu) + `buildProjektPara` +
  `buildDriftPara` + `buildChefClosing`.
- **Board-Renderer ruft**: 3-Headline-Block + 1-Satz-Trend (aus `drift`) —
  kein Paragraf-Builder, nur Direkt-Zugriff.

### 5.5 KPI-Auswahl pro Brille

Statt 6 KPIs für alle:

| Brille | KPIs                                                             |
|--------|------------------------------------------------------------------|
| Coach  | Präsenz/Tag · Hochlast-Tage · Wochenend-Anteil                   |
| Lead   | Auslastung · Konzentration Top-1 · Multi-Tasking · Coverage      |
| Chef   | Output-Quote · Konzentration · Multi-Tasking · Coverage · Tage    |
| Board  | Auslastung · Schwerpunkt · Output · Coverage (alle 4 als Hero)   |

### 5.6 Tonalitäts-Lookups

Jeder Renderer hat seine Tonalitäts-Konvention:

| Brille | Anrede        | Stil          | Beispiel                          |
|--------|---------------|---------------|-----------------------------------|
| Coach  | „du"          | warm, fragend | „Deine Woche trug …"              |
| Lead   | Subject-Name  | sachlich      | „{Name} bindet 52 % auf …"        |
| Chef   | keine Anrede  | knapp         | „Konzentration verstärkt sich …"  |
| Board  | keine Anrede  | deskriptiv    | „Die Auslastung beträgt …"        |

### 5.7 Erwartete Datei-Änderungen

Neu / umstrukturiert:
- `src/lib/reports/` — neuer Ordner
  - `renderCoachReport.ts`
  - `renderLeadReport.ts`
  - `renderChefReport.ts`
  - `renderBoardReport.ts`
  - `shared.ts` — gemeinsame Helfer (renderBars, renderKpiTile, STYLES,
    renderStakeholderDossier, renderFindings)
- `src/lib/reportRenderer.ts` — wird zum Dispatcher, ruft nur `LENS_RENDERERS`
- `src/lib/reportData.ts` — kleine Erweiterungen:
  - `Finding.audiences?: ReportLens[]` Property
  - Pro Finding die `audiences`-Klassifikation
- `src/components/ReportModal.tsx` — Vorschau zeigt jetzt den
  brillenspezifischen Renderer, nicht eigene KPI-Tiles

---

## 6. Offene Punkte / zu entscheiden

Bevor ich code, hätte ich gerne deine Entscheidung zu diesen Punkten:

1. **Tippfehler-Findings im Report**: raus aus dem Report und stattdessen
   im Manage-Tab als „Datenqualität"-Hinweis? Oder bleiben sie als Coach-
   spezifischer Disziplin-Hinweis drin?

2. **Findings-Klassifikation** (Tabelle in Abschnitt 5.3): passt die
   Zuordnung? Insbesondere — gehören OOS-Verdachts-Findings auch in den
   Chef-Report, oder bleiben die exklusiv Lead?

3. **ReportModal-Vorschau-Konsistenz**: soll die Vorschau im Modal exakt
   das zeigen, was der Druck/Download zeigt (gleicher Renderer)? Oder bleibt
   die Modal-Vorschau ein „Editor mit eigenen KPI-Tiles", und nur der
   Print/Download nutzt den brillenspezifischen Renderer?

4. **Narrative-Editierbarkeit**: heute kannst du das gesamte Narrative im
   Modal überschreiben. Soll das pro Brille gleich bleiben, oder pro Brille
   eine andere Default-Komposition mit dem Editor-Feld nur für das Free-Form-
   Schluss-Wort?

5. **Soll-Reichweite**: nur die 4 Reports umbauen, oder bei der Gelegenheit
   auch ein paar der noch nicht extrahierten Datenpunkte aus Abschnitt 2.3
   einbauen (Slot-Längen-Histogramm wäre für Coach relevant, Edit-Quote für
   Lead)? Pragmatisch: 4 Reports erst auf bestehender Datenbasis bauen,
   später erweitern.

---

## 7. Empfohlene Reihenfolge der Umsetzung

Falls grünes Licht:

1. `Finding.audiences` einführen + alle bestehenden Findings klassifizieren
   (klein, isoliert testbar)
2. Shared-Helfer in `lib/reports/shared.ts` extrahieren — der heutige
   `renderReportHtml` als Basis
3. `renderBoardReport` zuerst — kleinster Scope, klärt das Architektur-
   Muster
4. `renderCoachReport` — narrative-lastig, testet die Bausteine
5. `renderLeadReport` — anspruchsvollster, da Dossiers + Karten neu
6. `renderChefReport` — ähnlich Board, aber mit mehr Sektionen
7. Dispatcher in `reportRenderer.ts` aufschalten, alten Code entfernen
8. ReportModal-Vorschau auf neuen Renderer umstellen
9. i18n-Strings nachpflegen (DE + FR)
10. Build verifizieren, Push-Skript schreiben

Sieben kleine, einzeln testbare Schritte — kein Big-Bang-Refactor.
