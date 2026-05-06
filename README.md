# Zeiterfassung v3

Server-first Redesign der Zeiterfassungs-App. Greenfield-Bau, läuft parallel zur produktiven [v2](https://github.com/<TODO>/zeiterfassung-app).

**Status:** alpha — M0 (Repo-Skeleton) abgeschlossen.

## Schneller Start

```bash
npm install
npm run dev
```

Browser → `http://localhost:5173`

## Scripts

- `npm run dev` — Vite Dev-Server
- `npm run build` — Production-Build (typecheck + Vite)
- `npm run preview` — Build lokal anschauen
- `npm run typecheck` — TypeScript-Check ohne Emit
- `npm run test` — Vitest

## Struktur

```
src/
  components/      — UI-Komponenten
  lib/             — Helper, Wallclock-Math, Encryption (M1)
  stores/          — Zustand-Stores (server-first cache)
  i18n/            — DE/FR-Übersetzungen
  styles/          — globals.css mit CSS-Variablen-Theme
  App.tsx          — Bootstrap-Shell
  main.tsx         — Entry-Point
.github/workflows/
  deploy.yml       — Auto-Deploy auf GitHub-Pages bei Push auf main
ARCHITECTURE.md    — Single source of truth für Architektur-Entscheidungen
```

## Design-Anker

Die fünf Eckpfeiler von v3 (Details in `ARCHITECTURE.md`):

1. Single-User mit optionalem Team
2. Semantik gelockt (Naive / Wallclock / Präsenz / Coverage)
3. Server-First (kein optimistisches Lokal-Update)
4. Lokales Backup als separater Snapshot, kein laufender Mirror
5. Desktop-first PWA

## Roadmap

Siehe `ARCHITECTURE.md` Sektion 4. Aktuell offen: M1 (Auth + Encryption).

## Verhältnis zu v2

v2 (`zeiterfassung-app`) bleibt **frozen** bis v3 produktiv läuft.
- Nur kritische Sicherheits-/Datenverlust-Bugfixes in v2.
- Beide Apps lesen aus derselben Supabase-Datenbank — kein Migrations-Cliff beim Wechsel.
- Wenn v3 stabil ist, wird v2 archiviert (nicht gelöscht).
