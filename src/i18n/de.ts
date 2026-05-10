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
    close: 'Schließen',
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

  entries: {
    filterLabel: 'Filter',
    clearFilter: 'Filter entfernen',
    clearAllFilters: 'Alle entfernen',
    removeFilter: 'Filter entfernen',
    filterEmpty: 'Keine Einträge im aktiven Filter.',
  },

  backup: {
    title: 'Backup / Export',
    hint: 'Lade alle deine Einträge im Klartext herunter — als Sicherheitskopie oder zur Weiterverarbeitung. JSON ist verlustfrei (Re-Import möglich), CSV öffnet direkt in Excel.',
    exportJson: 'Als JSON',
    exportCsv: 'Als CSV',
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

  fuzzy: {
    placeholder: 'Lostippen für Vorschlag…',
    noMatch: 'Kein Treffer in der Eintrags-Historie',
    clear: 'Suche leeren',
  },

  shortcuts: {
    label: 'Häufigste',
  },

  timer: {
    title: 'Timer',
    add: 'Neuer Timer',
    empty: 'Keine laufenden Timer. Drücke „Neuer Timer" um zu starten.',
    slot: 'Slot',
    slots: 'Slots',
    pause: 'Pause',
    resume: 'Fortsetzen',
    stop: 'Stop & Speichern',
    remove: 'Verwerfen',
    removeConfirm: 'Diesen Timer ohne Speichern verwerfen?',
    endDay: 'Tag beenden',
    endingDay: 'Beende Tag…',
    tooShort: 'Timer zu kurz — mind. 1 Sekunde nötig.',
    goalReached: 'Ziel erreicht',
  },

  tabs: {
    timer: 'Timer',
    dashboard: 'Dashboard',
    entries: 'Einträge',
    team: 'Team',
  },

  team: {
    title: 'Team',
    setupHint:
      'Erstelle ein neues Team oder tritt einem bestehenden bei. Mitglieder eines Teams teilen einen verschlüsselten Team-Schlüssel.',
    create: 'Erstellen',
    join: 'Beitreten',
    nameLabel: 'Team-Name',
    namePlaceholder: 'z.B. Kanzlei Müller',
    creating: 'wird erstellt…',
    createButton: 'Team erstellen',
    inviteCodeLabel: 'Invite-Code',
    joining: 'Beitritt…',
    joinButton: 'Beitreten',
    leave: 'Team verlassen',
    leaveConfirm:
      'Wirklich Team verlassen? Du verlierst Zugriff auf den Team-Schlüssel und damit auf gemeinsame Daten.',
    copyInvite: 'Invite-Code kopieren',
    copied: 'kopiert',
    members: 'Mitglieder',
    you: 'Du',
    role: {
      admin: 'Admin',
      mitarbeiter: 'Mitarbeiter',
    },
    changeRole: 'Rolle ändern',
    removeMember: 'Mitglied entfernen',
    removeMemberConfirm:
      '{name} wirklich aus dem Team entfernen? Die Person verliert den Zugriff auf den Team-Schlüssel.',
  },

  dashboard: {
    title: 'Dashboard',
    heatmap: 'Stakeholder × Projekt',
    teamWorkload: 'Team-Auslastung',
    viewMemberDetail: 'Detail-Ansicht für {name} öffnen',
    memberFocus: 'Detail',
    backToOverview: 'Zurück zur Übersicht',
    period: {
      today: 'Heute',
      thisWeek: 'Diese Woche',
      week: 'Woche',
      month: 'Monat',
      year: 'Jahr',
      all: 'Gesamt',
      custom: 'Zeitraum',
      from: 'Von',
      to: 'Bis',
      prev: 'Zurück',
      next: 'Vor',
      resetToNow: 'Heute',
    },
  },

  scope: {
    self: 'Nur ich',
    team: 'Team',
  },

  report: {
    title: 'Report',
    create: 'Report erstellen',
    summary: 'Zusammenfassung',
    highlights: 'Highlights',
    perMember: 'Per Mitglied',
    kpiHours: 'Stunden',
    kpiDays: 'Aktive Tage',
    kpiAvg: 'Ø pro Tag',
    kpiEntries: 'Einträge',
    download: 'Download',
    print: 'Drucken',
  },

  kpi: {
    today: 'Erfasst Heute',
    period: 'Erfasst im Zeitraum',
    entriesCount: 'Einträge',
    todaySubtitle: 'Heute erfasst',
    periodSubtitle: 'Im Zeitraum',
    entriesSubtitle: 'Einträge',
    tooltipToday:
      'Summe aller heute getrackten Eintragsdauern. Bei parallelem Arbeiten zählt jede Aufgabe voll — z.B. zwei gleichzeitige Telefonate von je 30min ergeben 1h, obwohl nur 30min Wanduhr-Zeit vergangen ist.',
    tooltipPeriod:
      'Summe aller Eintragsdauern im gewählten Zeitraum. Gleiche Semantik wie „Erfasst Heute" — Multitasking-Anrechnung pro Aufgabe.',
    tooltipEntries:
      'Anzahl Einträge im Zeitraum (ohne Abwesenheits-Einträge wie Ferien/Krankheit).',
  },

  ring: {
    presenceLabel: 'Präsenz (erster Eintrag → letzter Eintrag)',
    trackedLabel: 'Getrackt (Wallclock-Union)',
    tooltipPresence:
      'Vom ersten bis zum letzten Eintrag heute, also dein Brutto-Arbeitsfenster. Lücken (Mittagspause, vergessen zu tracken) sind enthalten.',
    tooltipTracked:
      'Wallclock-Union der aktiven Tracker-Intervalle. So viele Stunden lief tatsächlich ein Timer (paralleles Arbeiten gilt als 1, nicht doppelt).',
  },

  coverage: {
    label: 'Getrackt:',
    of: 'von',
    presence: 'Präsenz',
    oneGap: '1 Lücke · {dur}',
    nGaps: '{n} Lücken · {dur} insgesamt',
    hint: 'Lücken ≥30min sind hervorgehoben — vermutlich vergessen zu tracken.',
    tooltip:
      'Während wie vieler Stunden des Arbeitstages lief tatsächlich ein Tracker. Differenz zur Präsenz = Lücken.',
  },
} as const;

export type Translations = typeof de;
