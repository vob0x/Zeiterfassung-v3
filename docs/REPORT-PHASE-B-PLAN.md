# Report Phase B — Welle 5 Plan

Stand: Mai 2026. Architektur-Vertrag für die nächste Tiefen-Erweiterung der Reports. Wird vor jeglichem Code committet, damit die Implementierung gegen ein klares Ziel arbeitet.

## Warum überhaupt eine Welle 5

Welle 4 hat vier eigenständige Brillen geliefert (Coach/Lead/Chef/Board) mit zugeschnittenen Strukturen und Findings-Filtern. Was sich beim Lesen der Reports zeigt:

1. **Findings sind atomar.** Jedes ist ein Einzelsignal mit fixer Schwelle. Aussagen wie „diese Woche ist gekippt" oder „mehrere Signale zeigen in dieselbe Richtung" entstehen nicht — der Leser muss sie selbst zusammensetzen.
2. **Schwellen sind universell, Personen nicht.** „Hochlast ab 10h" ist für jemand mit 12h-Median harmlos, für jemand mit 7h-Median ein echtes Signal. Heute behandelt der Detektor beide gleich.
3. **Zeit-Dimension fehlt fast vollständig.** `trend.growth/decline` ist eine grobe Halbzeit-Diff über Stakeholder. Wann genau etwas kippt, sieht der Bericht nicht — und damit auch keine Brille.

Welle 5 schließt diese drei Lücken in einer Implementierungs-Phase, damit die neuen Strukturen miteinander konsistent gedacht sind. Drei Bausteine:

- **A — Change-Points**: Woche-zu-Woche-Brüche pro Metrik
- **B — Z-Score-Outlier**: personalisierte Schwellen statt fixer Magic-Numbers
- **C — Composite-Findings**: Mehrere schwache Signale → ein starkes mit Diagnose

Reihenfolge der Implementierung ist A → B → C, weil C auf den neuen Findings aus A und den verfeinerten Findings aus B aufbaut.

---

## A — Change-Points

### Ziel
Pro relevanter Metrik erkennen, in welcher Woche ein deutlicher Bruch passiert ist. Nicht „Median bewegt sich langsam", sondern „KW18 ist anders als KW14–17".

### Welche Metriken sind Change-Point-fähig
Pro `weeks[]`-Eintrag haben wir bereits: `wallclockMs`, `presenceMs`, `coverage`, `activeDays`. Phase A hat zusätzlich Tagesteil, Rhythmus-Konstanz, Slot-Längen, Burst, Multitasking — die sind heute aber **nicht** wöchentlich aggregiert. Welle 5 erweitert die Wochen-Aggregation um vier weitere Metriken:

```ts
interface WeekStat {
  label: string;              // ISO-Woche
  activeDays: number;
  wallclockMs: number;
  presenceMs: number;
  coverage: number;
  // ─ NEU in Welle 5 ─
  meetingShare: number;       // 0..1: Anteil Wallclock in Meeting-Formaten
  deepFocusShare: number;     // 0..1: Anteil Wallclock in Slots >= 120min
  multiTaskingFactor: number; // naive / wallclock dieser Woche
  topStakeholderShare: number; // 0..1: größter Stakeholder dieser Woche
}
```

`weeks[]` in `ReportData` wird zu `WeekStat[]`. Renderer, die das bisher konsumieren (Coach-Wochenrhythmus-Strip, Lead-Cockpit), bekommen automatisch mehr Daten ohne API-Bruch (Felder werden additiv ergänzt).

### Detektor-Algorithmus
Hybrid-Strategie, damit der Detektor auch auf kurzen Ranges nutzbar ist:

```
gegeben:  weeks: WeekStat[]
fehlend:  alle Wochen mit activeDays < 2  →  rausfiltern (zu wenig Beobachtung)
falls len(gefiltert) < 3  →  keine Change-Points (zu kurzes Fenster)

MODUS:
  >= 6 verwertbare Wochen  →  Z-Score-Modus (MAD-basiert)
  3 bis 5  Wochen           →  %-Schwellen-Modus (einfacher)
  <  3 Wochen               →  keine Detection

Z-Score-Modus (für jede Position i in [2, len-2]):
  baseline   = Median der Wochen [0..i-1]
  baselineMAD = Median Absolute Deviation von [0..i-1]
  current    = wert[i]
  zScore     = (current - baseline) / (1.4826 * baselineMAD)
  
  wenn |zScore| >= 2.5  UND  |current - baseline| >= relevanzSchwelle(metrik):
    → ChangePoint-Kandidat

%-Schwellen-Modus (für jede Position i in [1, len-1]):
  baseline = Median der Wochen [0..i-1]
  current  = wert[i]
  delta    = current - baseline
  pctDelta = baseline != 0 ? |delta / baseline| : 1
  
  wenn pctDelta >= 0.3  UND  |delta| >= relevanzSchwelle(metrik):
    → ChangePoint-Kandidat (zScore = NaN, deltaSign aus Vorzeichen)

unter den Kandidaten pro Metrik: nimm den mit dem höchsten |zScore| bzw. 
|pctDelta| — sonst künstlich viele Punkte bei einem echten Plateau-Shift.
```

`relevanzSchwelle(metrik)` ist eine Untergrenze, damit nicht jeder Mini-Bruch in einer ohnehin stabilen Reihe als Change-Point markiert wird. Werte (zur Festlegung im Code, hier nur Richtgrößen):

- `wallclockMs`: ≥ 4h Differenz zum Baseline-Median
- `meetingShare`: ≥ 10 Prozentpunkte Differenz
- `deepFocusShare`: ≥ 10 Prozentpunkte Differenz
- `multiTaskingFactor`: ≥ 0.3 Differenz
- `topStakeholderShare`: ≥ 15 Prozentpunkte Differenz
- `coverage`: ≥ 15 Prozentpunkte Differenz

Der MAD-Ansatz (statt Standardabweichung) macht den Detektor robust gegen einzelne Ausreißer in der Baseline — ein einzelner 20h-Tag verzerrt die Schwelle nicht.

### Daten-Struktur

```ts
interface ChangePoint {
  metric: 
    | 'wallclock' 
    | 'meeting' 
    | 'deepFocus' 
    | 'multiTasking' 
    | 'topStakeholder' 
    | 'coverage';
  weekLabel: string;          // ISO-Woche des Bruchs
  baselineValue: number;      // Median vor dem Bruch (im Einheits-System der Metrik)
  currentValue: number;       // Wert in der Bruch-Woche
  deltaAbsolute: number;      // currentValue - baselineValue
  deltaSign: 'up' | 'down';
  zScore: number;             // Stärke des Bruchs
  baselineWeekCount: number;  // wie viele Wochen lieferten die Baseline
}

// in ReportData:
changePoints: ChangePoint[];  // sortiert: schwerwiegendster zuerst
```

### Findings-Konsequenz
Pro relevantem Change-Point ein Finding. Audiences-Mapping:

- `wallclock`, `meeting` (negativ), `multiTasking` (up): `coach`, `lead`, `chef`
- `deepFocus` (down): `coach`, `chef`
- `topStakeholder`: `lead`, `chef`, `board`
- `coverage` (down): `coach`, `lead` — Datenqualitäts-Signal
- `coverage` (up): nur `coach` — positive Disziplin-Veränderung

Texte sind narrativer als die alten Findings, weil sie eine Zeit-Dimension haben:

> *„Wechsel in KW18: Meeting-Anteil von 22% auf 41% (+19pp). Drei Wochen vorher lag der Schnitt stabil unter einem Viertel. Was hat sich in KW18 verändert?"*

### UI-Konsequenz pro Brille
- **Coach**: bis zu zwei Change-Points im persönlichen Paragrafen, formuliert als Reflexionsfrage. Nicht als Liste, sondern in Prosa.
- **Lead**: dedizierte Sektion „Wochen-Brüche" mit Mini-Sparkline pro Bruch (Baseline-Wochen grau, Bruchwoche markiert). Direkt vor den Mandanten-Dossiers.
- **Chef**: Change-Points als Pfeile in der bestehenden Drift-Tabelle integriert. Keine eigene Sektion.
- **Board**: nur Change-Points mit `topStakeholder`-Metrik (strategisch relevant) als einzelne Headline-Karte. Andere Metriken sind zu detailliert.

---

## B — Z-Score-Outlier (personalisierte Schwellen)

### Ziel
Ersetze fixe Schwellen in den bestehenden Findings durch Outlier-Erkennung relativ zur Person. „Hochlast" heißt dann: *für diese Person* ein Ausreißer-Tag, nicht „über einer absoluten Linie".

### UserBaseline-Struktur

```ts
interface UserBaseline {
  // Daten-Basis: alle gefilterten Tage des Range, ggf. mit Vorlauf wenn verfügbar
  observations: number;       // wie viele Tage flossen ein
  
  // Per-Tag-Statistik
  dayWallclockMs: {
    median: number;
    mad: number;              // Median Absolute Deviation
    p90: number;              // 90. Perzentil — Hochlast-Schwelle
  };
  
  dayPresenceMs: {
    median: number;
    mad: number;
  };
  
  // Per-Slot-Statistik
  slotLengthMs: {
    median: number;
    p90: number;              // Burst-Schwelle für DIESE Person
  };
  
  // Verteilungs-Statistiken
  multiTaskingFactor: {
    median: number;           // typischer MT-Faktor dieser Person
  };
  
  // Confidence-Flag: bei < 10 beobachteten Tagen ist die Baseline schwach
  isReliable: boolean;
}

// in ReportData:
baseline: UserBaseline;
```

### Refactor-Liste (bestehende Findings → personalisiert)

| Finding | bisher (fix) | nach Welle 5 (personalisiert) |
|---|---|---|
| Sehr lange Tage | `> 14h Wallclock` | `> max(12h, baseline.p90 * 1.3)` |
| Hochlast (≥3 Tage) | `≥ 10h Präsenz` | `≥ baseline.p90` (mind. 8h absolut) |
| Multi-Tasking sehr hoch | `> 1.5x` | `> max(1.4, baseline.median * 1.4)` |
| Burst längster | `≥ 240min` | `≥ max(180min, baseline.slot.p90 * 1.5)` |

Bei `isReliable === false` fällt der Detektor auf die alten fixen Schwellen zurück. Das ist wichtig für neue Nutzer oder sehr kurze Zeiträume — sonst werden 2-3 Datenpunkte als Baseline verwendet und der Detektor wird inkonsistent.

### Audiences bleiben unverändert
B verändert nur, *wann* Findings ausgelöst werden. Die Brillen-Filter aus Welle 4 sind nicht betroffen.

### Test-Erwartung
Eine Person mit konstant 11h-Tagen (auf eigener Baseline) bekommt **keinen** Hochlast-Finding. Eine Person mit Baseline 6h und einem 10h-Tag bekommt einen — und der Text macht das explizit:

> *„9.5h am 14. Mai — gegenüber deinem Schnitt von 6h ein ungewöhnlich langer Tag."*

Der `baseline.median` wird in den Finding-Texten zitiert, damit der Leser sieht, gegen *welchen* Maßstab das gemessen ist.

---

## C — Composite-Findings

### Ziel
Wenn drei schwache Findings dasselbe Bild zeichnen, erzeugen sie zusammen einen starken Befund mit Diagnose. Reduziert das „Findings-Listen-Problem" und ist die einzige Stelle, an der der Bericht aktiv interpretiert statt nur beobachtet.

### Composite-Definitionen (initial)

```ts
interface CompositeFinding {
  id: 'operative-ueberlast' | 'reaktive-phase' | 'konzentrations-verlust' | 'fokus-erosion';
  level: 'warn' | 'info';
  diagnosis: string;          // 1-2 Sätze: was das Bild zeigt
  hebel: string;              // 1 Satz: konkreter Ansatzpunkt
  evidenceFindings: number[]; // Indices in findings[], die das Composite ausgelöst haben
  audiences: ReportLens[];
}

// in ReportData:
composites: CompositeFinding[];
```

#### `operative-ueberlast` (Lead, Chef)
Ausgelöst von: `Multi-Tasking sehr hoch` UND `Meeting-Lastig OR Meetings-ohne-Output` UND (`Coverage schwach` ODER irgendein Burst-Finding).
- Diagnosis: *„Das Bild ist operative Überlast: hohe Parallelität, viele synchrone Formate, Dokumentations-Disziplin leidet."*
- Hebel: *„Welche Termine dieser Woche hatten kein eindeutiges Output? Streichen ist freier als verschieben."*

#### `reaktive-phase` (Coach, Lead)
Ausgelöst von: `Reaktiv-Verdacht` für mind. 1 Stakeholder UND `Burst-Pattern` UND keine `Projekt-Newcomers` (also: viel Aktivität, aber keine neuen Initiativen).
- Diagnosis: *„Hohe Aktivität, aber Aktivität ohne neue Linien: das ist ein reaktives Muster, nicht ein gestaltendes."*
- Hebel: *„Welcher Stakeholder hat die meisten Ad-hoc-Slots? Triage-Layer (fixe Sprechzeit / Mailbox) gibt Stunden zurück."*

#### `konzentrations-verlust` (Lead, Chef, Board)
Ausgelöst von: `Konzentrations-Risiko` (Top > 35%) UND `topStakeholder`-ChangePoint (Down) UND `trend.decline` enthält einen Top-Stakeholder mit >10pp Verlust.
- Diagnosis: *„Konzentration auf einen Stakeholder, aber dieser verliert in der Periode Boden — das Profil ist im Umbau."*
- Hebel: *„Ist der Verlust strategisch gewollt (Skalierung andere Mandate) oder ungeplant?"*

#### `fokus-erosion` (Coach, Chef)
Ausgelöst von: `deepFocus`-ChangePoint (Down) UND `multiTasking`-ChangePoint (Up) UND `Tiefen-Fokus-Quote < 20%` (bestehendes Finding).
- Diagnosis: *„Tiefenarbeit-Anteil fällt synchron zu steigendem Multi-Tasking — das ist Fokus-Erosion, nicht nur ein punktuell schlechter Tag."*
- Hebel: *„Welchen Wochentag könntest du als nächstes für 4h ohne Kalendertermine blocken?"*

### Display-Logik — brillen-spezifisch

```
in shared.ts (filterFindingsForLens, neu mit Composite-Awareness):

1. Hole alle Composites, deren audiences die aktuelle Lens enthalten.
2. Lens-spezifische Composite-Strategie:
   - Chef + Board: REPLACE  → Composites unterdrücken ihre evidenceFindings 
                              (knappe Berichte, Composite ersetzt 3 Einzel-
                              Findings durch eine Diagnose)
   - Coach + Lead: APPEND   → Composite-Karte steht ZUSÄTZLICH oben, 
                              Einzel-Findings bleiben darunter (gibt dem 
                              Lesenden die Detail-Ebene, ohne ihn zur 
                              Composite-Interpretation zu zwingen)
3. Render-Reihenfolge: erst Composites (warn-Level zuerst, dann info), 
   dann (gefilterte oder unveränderte) Einzel-Findings.
```

Rationale für die Differenzierung:
- **Chef + Board** sehen den Bericht als Entscheidungsgrundlage. Weniger ist mehr — sie wollen die Diagnose, nicht den Beweis. Evidence-Findings sind im JSON noch da (Debug), aber nicht im PDF.
- **Coach + Lead** sehen den Bericht als Reflexions- bzw. 1:1-Vorbereitungsmaterial. Sie wollen den Befund *und* die Detail-Beobachtungen, damit sie konkret Bezug nehmen können.

### UI-Konsequenz
- **Composites kommen als hervorgehobene Karte** (eigene Box, andere Akzentfarbe als normale Findings) ganz oben in der Findings-Sektion.
- Pro Composite: Diagnosis als Fließtext, Hebel als zitierte Frage darunter, evidence-Findings als kleine Sub-Liste mit „basiert auf:"-Präfix (zum Aufklappen via `<details>`).
- Wenn keine Composites: keine Karte, normale Findings sehen aus wie bisher.

---

## Implementierungs-Reihenfolge

### Session 5a — Change-Points
1. `WeekStat`-Erweiterung um 4 Felder berechnen
2. `ChangePoint`-Struktur + Detektor (eine Funktion, sechsmal mit unterschiedlichen Selektoren aufgerufen)
3. Neue Findings emittieren (audiences-Mapping siehe oben)
4. Lead-Renderer: dedizierte Sektion „Wochen-Brüche"
5. Coach-Renderer: Change-Points in den persönlichen Paragrafen einfließen lassen
6. Chef-Renderer: Change-Points als Pfeile in Drift-Tabelle
7. Board-Renderer: nur `topStakeholder`-Change-Points als Karte

### Session 5b — Z-Score-Outlier
1. `UserBaseline`-Struktur berechnen (eine Funktion in `reportData.ts`)
2. Die vier Findings aus der Refactor-Tabelle umstellen (jeweils mit `isReliable`-Fallback)
3. Texte anpassen, sodass der Baseline-Vergleich sichtbar ist
4. Keine UI-Änderung nötig — Findings ziehen durch die existierenden Schleifen

### Session 5c — Composites
1. `CompositeFinding`-Struktur
2. Vier Detektoren (eine pro Composite), die auf `findings[]` schauen und Indices sammeln
3. `filterFindingsForLens` in `shared.ts` um die Consumed-Set-Logik erweitern
4. Renderer-Anpassung in `shared.ts`: `renderComposites()` als neue Helper-Funktion, in jeder der vier Brillen vor der Findings-Sektion einfügen

### Tests
Idealerweise schon mit Phase 2 (siehe ARCHITECTURE.md → Test-Harness). Falls noch nicht da: zumindest die drei Detektoren manuell mit synthetischen Datensätzen verifizieren — drei Test-Fixtures pro Detektor (klarer Treffer / klarer Nicht-Treffer / Grenzfall).

---

## Was bewusst NICHT in Welle 5 ist

- **Längere Zeitreihen über Range-Grenzen hinaus.** Baseline kommt aus dem aktuellen Range. Eine Cross-Range-Baseline („Vorjahres-Vergleich") wäre eine eigene Welle und braucht ein Persistenz-Konzept.
- **Saisonale Korrekturen.** Wenn jemand jedes Q4 mehr arbeitet, sieht der Detektor das als Change-Point. Welle 5 markiert das ehrlich; saisonale Adjustierung wäre Welle 6+.
- **Forecasting.** Wir sagen nicht voraus, was passiert. Wir markieren, was schon passiert ist.
- **LLM-Synthese.** Die Composite-Diagnose-Texte sind hartkodiert. LLM-Generierung wäre eine separate Phase (siehe ARCHITECTURE.md, offene Architektur-Frage).

---

## Datenkompatibilität

Alle neuen Felder in `ReportData` sind **additiv**: `changePoints`, `composites`, `baseline`, und vier neue Felder in `WeekStat`. Renderer, die diese Felder nicht konsumieren, brechen nicht. Tests aus Phase 2 (Wallclock / Presence / Coverage) sind nicht betroffen.

Wenn ein Renderer eines der neuen Felder auf einem alten Datensatz nicht findet (z.B. weil ein Cache-Reset noch nicht passiert ist), defensiv leeres Array / `null` als Default behandeln.
