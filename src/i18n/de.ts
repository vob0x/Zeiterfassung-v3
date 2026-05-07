/**
 * Deutsche Übersetzungen — Default-Sprache.
 *
 * Strukturiert als nested object; Zugriff per dot-Pfad (z.B. `t('entry.add')`).
 * Wenn ein Key fehlt, gibt der Helper den Pfad als String zurück — so
 * sieht man fehlende Übersetzungen sofort in der UI.
 */
export const de = {
  app: {
    title: 'Zeiterfassung',
    versionLabel: 'v3 — alpha',
    signOut: 'Abmelden',
    loading: 'Lade…',
  },

  auth: {
    codename: 'Codename',
    password: 'Passwort',
    passwordRepeat: 'Passwort wiederholen',
    signIn: 'Anmelden',
    signUp: 'Registrieren',
    signingIn: 'wird angemeldet…',
    signingUp: 'wird registriert…',
    unlockTitle: 'Willkommen zurück',
    unlockHint:
      'Dein Verschlüsselungs-Schlüssel wurde beim Tab-Schließen entfernt. Bitte Passwort eingeben um deine Daten zu entsperren.',
    unlock: 'Entsperren',
    unlocking: 'wird entsperrt…',
    noAccount: 'Noch kein Konto?',
    hasAccount: 'Schon ein Konto?',
    codenameHint:
      'Pseudonym, frei wählbar. Wird intern in eine E-Mail umgewandelt.',
    passwordHint:
      'Mind. 8 Zeichen. Aus diesem Passwort wird der Verschlüsselungs-Schlüssel abgeleitet — ohne Passwort kein Zugriff auf deine Daten.',
    passwordTooShort: 'Passwort muss mind. 8 Zeichen haben.',
    passwordsMismatch: 'Passwörter stimmen nicht überein.',
    wrongCredentials: 'Falscher Codename oder Passwort',
    wrongPassword: 'Falsches Passwort',
    codenameTaken: 'Codename bereits vergeben',
  },

  entry: {
    add: 'Hinzufügen',
    save: 'Speichern',
    saving: 'wird gespeichert…',
    cancel: 'Abbrechen',
    delete: 'Löschen',
    deleteConfirm: 'Eintrag löschen?',
    date: 'Datum',
    from: 'Von',
    to: 'Bis',
    duration: 'Dauer',
    stakeholder: 'Stakeholder',
    projekt: 'Projekt',
    taetigkeit: 'Tätigkeit',
    format: 'Format',
    notiz: 'Notiz',
    notizPlaceholder: 'Optional — kurze Beschreibung',
    addManual: 'Manueller Eintrag',
    fillRequired: 'Bitte alle Pflichtfelder ausfüllen',
    invalidTimeRange: 'Bis-Zeit muss nach Von-Zeit liegen',
  },

  picker: {
    search: 'Suchen…',
    noMatch: 'Kein Treffer',
    addNew: 'Hinzufügen:',
    selected: 'ausgewählt',
    chooseOne: 'Auswählen…',
    chooseMulti: 'Stakeholder wählen…',
  },

  list: {
    entriesCount: 'Einträge',
    stakeholdersCount: 'Stakeholder',
    projectsCount: 'Projekte',
    activitiesCount: 'Tätigkeiten',
    formatsCount: 'Formate',
    nMore: 'weitere',
  },

  toast: {
    saved: 'Gespeichert',
    deleted: 'Gelöscht',
    error: 'Fehler:',
    saveFailed: 'Speichern fehlgeschlagen',
    deleteFailed: 'Löschen fehlgeschlagen',
  },

  defaults: {
    formatEinzelarbeit: 'Einzelarbeit',
    taetigkeitProduktiv: 'Produktiv',
  },
} as const;

export type Translations = typeof de;
