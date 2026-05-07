# v3 Setup — von lokal zum produktiven GitHub-Pages-Deploy

Einmaliger Schritt-für-Schritt für das Aufsetzen des separaten v3-Repos.

## 1. Lokale Initialisierung

```bash
cd ~/Documents/zeiterfassung/zeiterfassung-v3

# Dependencies installieren (~2 Min)
npm install

# Lokal starten — sollte den "v3 — alpha"-Screen zeigen
npm run dev
# → http://localhost:5173

# Stoppen mit Ctrl+C, dann:
npm run typecheck   # sollte ohne Fehler durchlaufen
npm run build       # erzeugt dist/, sollte ohne Fehler durchlaufen
```

Wenn alles drei grün ist: Skeleton steht.

## 2. Git-Repo initialisieren

```bash
cd ~/Documents/zeiterfassung/zeiterfassung-v3

git init
git add .
git commit -m "v3 init: Vite + React + TS + Tailwind skeleton, server-first architecture doc, GitHub Pages workflow"

# Branch auf 'main' setzen falls Default 'master' ist
git branch -M main
```

## 3. GitHub-Repo erstellen

Im Browser:

1. Auf [github.com/new](https://github.com/new) ein neues Repo anlegen.
   - **Name**: `zeiterfassung-v3`
   - **Visibility**: deine Wahl (private empfohlen, bis v3 produktiv)
   - **Initialize**: NICHT „Add a README", NICHT „.gitignore", NICHT „LICENSE" — wir haben das schon lokal
2. Klick „Create repository".
3. Auf der nächsten Seite die Push-URL kopieren (HTTPS oder SSH).

## 4. Lokal mit Remote verbinden + erster Push

```bash
cd ~/Documents/zeiterfassung/zeiterfassung-v3

# HTTPS-Variante (oder SSH, je nachdem was du kopiert hast)
git remote add origin https://github.com/<DEIN_USER>/zeiterfassung-v3.git

git push -u origin main
```

## 5. GitHub Pages aktivieren

Im Browser, in deinem neuen Repo:

1. **Settings** → **Pages** (linke Sidebar)
2. Bei **Source** wählen: **GitHub Actions** (NICHT „Deploy from a branch")
3. Speichern

Der erste Push hat den Workflow `.github/workflows/deploy.yml` schon getriggert. Geh zu **Actions**-Tab, beobachte den Build. Wenn er grün durchläuft (~3 Min beim ersten Mal), erscheint die produktive URL im Pages-Settings:

```
https://<DEIN_USER>.github.io/zeiterfassung-v3/
```

## 6. Verifikation

Öffne die Pages-URL. Solltest sehen:

```
ZEITERFASSUNG
v3 — alpha
Server-first Redesign. Skeleton steht. M1 (Auth + Encryption)
ist der nächste Schritt.
```

Wenn das da ist: produktiver Pfad funktioniert. Bereit für M1.

## Troubleshooting

### „404" auf der Pages-URL
Prüfe in **Settings → Pages**, ob die Source wirklich auf „GitHub Actions" steht (nicht „branch:main"). Beim Branch-Modus wird die Build-Action ignoriert und Pages versucht direkt aus `main/` zu serven, was nicht klappt weil keine `index.html` im Root liegt (alles ist unter `dist/`).

### Workflow scheitert beim Build
- Schau in **Actions** → fehlgeschlagener Run → expand den fehlgeschlagenen Step
- Fast immer: lokal lief es, aber Node-Version unterscheidet sich. Workflow nutzt Node 20; falls dein lokaler Node älter ist und du ein Feature nutzt das in 20 nicht ist, fliegt's CI an. → `nvm use 20` lokal, dann nochmal probieren.

### Falscher Subpath in Assets (404 für JS/CSS)
Wenn die Seite weiß bleibt und in der DevTools-Console 404s für `/assets/...` erscheinen: der `VITE_BASE_PATH` im Workflow muss zum Repo-Namen passen. Wenn dein Repo `zeiterfassung-v3` heißt, ist `/zeiterfassung-v3/` korrekt. Wenn du es umbenannt hast, in `.github/workflows/deploy.yml` die `VITE_BASE_PATH`-Zeile anpassen.

## Nächste Session

Wir starten mit M1 (Auth + Encryption). Vorbedingung: Punkte 1-6 oben durch, Pages-URL erreichbar.

---

## Nachtrag M1 — Supabase-Credentials einrichten

Ab M1 braucht v3 Zugang zur Supabase-Datenbank. Zwei Stellen, beide nötig:

### Lokal — `.env.local`

Die **gleichen** Credentials wie in v2 verwenden (v3 redet auf dieselbe Datenbank).

```bash
cd ~/Documents/zeiterfassung/zeiterfassung-v3

# Aus v2 die Werte rüberziehen
cp .env.example .env.local

# Dann .env.local öffnen und VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY ausfüllen.
# Die Werte stehen in v2 unter:
#   ~/Documents/zeiterfassung/zeiterfassung-app/.env  (oder .env.local, je nach Setup)
# Falls die Datei dort fehlt: Werte aus dem Supabase-Dashboard holen
# (Project Settings → API → Project URL + anon-Public-Key)

# Verifizieren — npm run dev sollte ohne Console-Error starten und das
# Login-Screen zeigen
npm run dev
```

`.env.local` ist in `.gitignore`, landet nicht im Repo.

### CI — GitHub-Actions-Secrets

Damit der Production-Build mit den Credentials läuft:

1. Auf [github.com/vob0x/Zeiterfassung-v3](https://github.com/vob0x/Zeiterfassung-v3)
2. **Settings** (oben) → **Secrets and variables** (links) → **Actions**
3. **New repository secret** klicken, zwei Secrets anlegen:
   - `VITE_SUPABASE_URL` — derselbe Wert wie in `.env.local`
   - `VITE_SUPABASE_ANON_KEY` — derselbe Wert wie in `.env.local`
4. Speichern

Beim nächsten Push zieht der Workflow die Secrets automatisch (siehe `.github/workflows/deploy.yml`).

### Verifikation

Nach dem Push und grünem Action-Run:

1. Auf `https://vob0x.github.io/Zeiterfassung-v3/` gehen
2. Login-Screen erscheint
3. Mit deinem v2-Account einloggen (gleicher Codename + Passwort)
4. Du siehst „Eingeloggt als <codename>" → M1 funktioniert
5. Tab schließen, neu öffnen → „Willkommen zurück, <codename>" mit Passwort-Prompt → Unlock-Flow funktioniert
