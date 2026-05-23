# Report Phase C — Welle 6 Plan (Team-COM-Realität)

Stand: Mai 2026. Architektur-Vertrag für die domain-spezifische Anpassung der Reports an das Team COM (Kommunikation NDB). Wird vor jeglichem Code committet, damit die Implementierung gegen ein klares Ziel arbeitet.

## Warum diese Welle nötig ist

Welle 5 hat die Reports inhaltlich-statistisch vertieft (Change-Points, personalisierte Schwellen, Composites) und in Welle 5-PostPass den Sprachstand-Pass gemacht. Beim Sparring zeigt sich: die Reports lesen Kommunikationsarbeit einer Bundes-Sicherheitsbehörde wie generische Wissensarbeit. Das ist mehrfach systematisch verzerrend.

Konkrete Mängel, gefunden im Sparring 2026-05:

1. **Tätigkeits-Achse ist zu grob**, um die Output-Frage zu beantworten. Team COM hat nur „Produktiv / Konzeption / Nicht produktiv / Abwesenheits-Codes". Damit ist `interpretProductivePct` mit seiner „30–45 % üblich für Steuerungsrollen"-Skala ein Werkzeug ohne passende Schraube. Die richtige Frage lautet bei diesem Team **„Wieviel Prozent meiner Zeit habe ich selbst als versickert markiert?"**. Hoher Wert ist die Warnung, nicht der Normalfall.

2. **Reaktivitäts-Dimension fehlt komplett**. Team COM ist fremdgetrieben — Medienanfragen, Bürgeranfragen, BGÖ-Anfragen, politische Vorstöße sind Flowstopper, die alles Laufende unterbrechen. Heute liest der Bericht zerschnittene Tage als Schwäche („Fragmentierung, Anfragen sammeln statt einzeln beantworten") — bei diesem Team ist es das Stellenprofil.

3. **Mikro-Slots werden falsch gewertet**. In reaktiven Projekten sind 5–15-Minuten-Slots normal und wertvoll (schnelle Antwort an Journalisten). Heute löst das die generische „microTaskPct ≥ 40 %"-Warnung aus.

4. **Krisenphasen werden nicht erkannt**. Eine Woche mit aktiver Krisen-Kommunikation hat erwartungsgemäß niedrige Deep-Focus-Anteile, schlechtere Coverage, viele kurze Slots. Die Bewertungen dieser Woche sollten gedämpft sein, nicht als „besonders schlechte Woche der Person" gelesen werden.

## Lösung: zwei neue Achsen, die nebeneinander stehen

### Achse 1 — Versickerungs-Modell (ersetzt Produktiv-Skala)

Statt „Anteil Wertschöpfung" wird die Aussage „Anteil von der Person selbst als nicht produktiv markiert". Skala kehrt sich um: hoher Wert = Warnung.

```ts
export function interpretLeakPct(pct: number): ScaleAssessment {
  // pct = Anteil nicht produktiv getrackt, NICHT 100 - produktiv
  if (pct < 15) return { level: 'high', label: 'fokussiert', ... };
  if (pct < 30) return { level: 'normal', label: 'üblich', ... };
  if (pct < 50) return { level: 'elevated', label: 'hoher Anteil', ... };
  return { level: 'low', label: 'Versickerung dominiert', ... };
}
```

`level: 'high'` ist hier semantisch positiv (wenig Versickerung), `level: 'low'` ist die Warnung — das CSS bleibt gleich, weil die Skala-Levels für die Farbe ohnehin invertieren.

### Achse 2 — Reaktivitäts-Index (NEU)

Anteil der Stunden in Projekten der Kategorie `reaktiv` an der Gesamt-Wallclock. Nicht negativ oder positiv per se — es ist eine *Beschreibung der Phase*.

```ts
export function interpretReactiveShare(pct: number): ScaleAssessment {
  if (pct < 20) return { level: 'normal', label: 'Strategiephase', ... };
  if (pct < 40) return { level: 'normal', label: 'normaler Betrieb', ... };
  if (pct < 60) return { level: 'elevated', label: 'belebte Phase', ... };
  return { level: 'high', label: 'Reaktiv-Last', ... };
}
```

Sichtbar in Lead-Cockpit (neue Karte zwischen Schwerpunkt und Tracking-Qualität), Chef-Headlines (eigene), Board-Hero (entweder neue Cell oder Anreicherung der Profil-Cell).

## Die Projekt-Klassifikation als Grundlage beider Achsen

Beide neuen Achsen brauchen eine Klassifikation jedes Projekts in eine von fünf Kategorien:

| Kategorie | Bedeutung | Beispiele aus Team COM |
|-----------|-----------|------------------------|
| `reaktiv` | Flowstopper, alles fallen lassen | Medienanfragen, Bürgeranfragen, BGÖ, Auskunftsersuchen, Krisenmanagement, Wordings, Politische Geschäfte |
| `planbar` | Eigen-Arbeit oder Auftrag mit Frist | Konzeption, Newsletter, Factsheets, Sprechnotizen, Medienkonferenzen, Hintergrundgespräche, Präsentationen, Übersetzungen, Anlässe |
| `routine` | operative Wiederkehr | Daily, Weekly, Meetings, Koordination, Mailbox-Triage, Medienmonitoring, Medienschau |
| `fuehrung-admin` | Führung, Admin, Teamarbeit | Führung und Administration, Teamentwicklung, Aktennotiz |
| `abwesenheit` | wird aus Tätigkeit abgeleitet, nicht aus Projekt | Ferien, Krankheit, Militär/Zivildienst |
| `null` (keine) | unklassifiziert, fällt in „planbar" als Default | Vendor-Namen, Codenamen |

Klassifikation läuft zweistufig:

1. **Heuristik** aus dem Projektnamen (`src/lib/projectClassifier.ts`). Reine Funktion, deterministisch. Erst-Vorschlag für jedes Projekt.
2. **Admin-Override** in der Verwaltung. Admin kann pro Projekt das Etikett überschreiben. Persistiert in `projects.category`.

Im Code immer in dieser Reihenfolge: gespeicherte Kategorie (falls vorhanden) > Heuristik (fallback) > `null`-Fallback (im Bericht „planbar"-Default).

## Datenmodell-Änderung

```sql
-- Migration 2026-05-23: ADD category TO projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS category text
  CHECK (category IN ('reaktiv','planbar','routine','fuehrung-admin','abwesenheit'));

-- Index nicht nötig — Filter passiert client-seitig auf wenigen 100 Rows.
```

TypeScript-Typ:

```ts
export type ProjectCategory =
  | 'reaktiv'
  | 'planbar'
  | 'routine'
  | 'fuehrung-admin'
  | 'abwesenheit';

export interface Project extends MasterDataItem {
  category?: ProjectCategory | null;
}
```

## Krisen-Modus

Wenn in der Berichtsperiode mindestens ein Slot in einem Projekt namens *Krisenmanagement* (oder einem explizit so klassifizierten Projekt) getrackt wurde, aktiviert sich der Krisen-Modus:

1. Eine eigene Hinweis-Karte am Anfang jeder Brille: „Diese Periode enthielt Krisen-Slots — Bewertungsrahmen reduziert."
2. Folgende Warnungen werden gedämpft oder unterdrückt:
   - Mikro-Slot-Warnung („Anfragen sammeln statt einzeln beantworten")
   - Coverage-Drop-Warnung (in einer Krise ist Tracking schwer)
   - Hochlast-Tage-Warnung (lange Tage sind in Krisen erwartungsgemäß)
   - Deep-Focus-Einbruch-Warnung

## Flowstopper-ChangePoint

Neue ChangePoint-Metrik `reactiveShare` in der wöchentlichen Aggregation. Detektor läuft analog zu den bestehenden — substanzieller Sprung im Reaktiv-Anteil wird als Wochen-Bruch erkannt.

Die zugehörige Erklärung in `CP_METRIC_INFO`:
- `upMeaning`: „Eine Woche mit hohem Anfragen-Aufkommen — Vorfall, Anhörung, mediale Welle?"
- `downMeaning`: „Reaktiv-Last sinkt deutlich — entweder Eigen-Arbeits-Phase oder Eskalations-Ende."

## Mikro-Slot-Re-Interpretation

In den Stakeholder-Profilen und Findings: wenn ein Profil hohen `microTaskPct` hat *und* das Top-Projekt der Kategorie `reaktiv` ist, wird die generische „Sammel-Termin etablieren?"-Warnung unterdrückt. Stattdessen erscheint im Stärken-Block (Coach) bzw. als positive Beobachtung (Lead/Chef): „X Anfragen schnell beantwortet — Triage-Leistung."

## Implementierungs-Reihenfolge (Welle 6)

Acht Commits, geschlossene Auslieferung. Jeder Schritt baut auf den vorigen, ist aber für sich abgeschlossen.

1. **Diese Spec** als Architektur-Vertrag.
2. **Datenmodell**: Migration + Types.
3. **Heuristik-Klassifikator**: reine Funktion, gegen die 251 echten Projektnamen verifiziert.
4. **Admin-Override-UI** in ManageView.
5. **Versickerungs-Modell**: `interpretLeakPct` ersetzt `interpretProductivePct` in den vier Brillen.
6. **Reaktivitäts-Index**: `reactiveShare` in `reportData`, neue Skala, Einbau in Lead/Chef/Board.
7. **Krisen-Modus** + **Flowstopper-ChangePoint**.
8. **Mikro-Slot-Re-Interpretation** in Findings und Profilen.

Nicht in dieser Welle:
- Eil-Flag auf Slot-Ebene (falls Sprechnotizen oder Wordings sowohl planbar als auch reaktiv vorkommen — dann müssten zwei Projekt-Namen angelegt werden, oder ein zweites Slot-Feld). Wenn das in der Praxis brennt, kommt das in Welle 7.
- Anonymisierungs-Modus für Vorgesetzten-Reports (Stakeholder-Namen ausblendbar). Sinnvoll bei Sicherheitskontext, aber separates Feature.
- Mehrsprachigkeit als eigene Würdigung der Übersetzungs-Arbeit (Stärken-Block-Erweiterung). Erst wenn andere Stärken-Muster genug Erfahrung gesammelt haben.
