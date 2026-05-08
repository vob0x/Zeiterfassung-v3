/**
 * Französische Übersetzungen.
 *
 * Vorsichtig partial — was nicht hier ist, fällt auf de-Pfad-String
 * zurück. Wird voll-übersetzt sobald die UI stabil ist (M5/M6), bis
 * dahin pflegen wir nur die häufigsten Strings.
 */
export const fr = {
  app: {
    title: 'Saisie du temps',
    versionLabel: 'v3 — alpha',
    signOut: 'Se déconnecter',
    loading: 'Chargement…',
  },

  auth: {
    codename: 'Pseudonyme',
    password: 'Mot de passe',
    passwordRepeat: 'Répéter le mot de passe',
    signIn: 'Se connecter',
    signUp: "S'inscrire",
    signingIn: 'Connexion…',
    signingUp: 'Inscription…',
    unlockTitle: 'Bon retour',
    unlockHint:
      "Votre clé de chiffrement a été supprimée à la fermeture de l'onglet. Veuillez saisir votre mot de passe pour déverrouiller vos données.",
    unlock: 'Déverrouiller',
    unlocking: 'Déverrouillage…',
    noAccount: 'Pas encore de compte ?',
    hasAccount: 'Déjà un compte ?',
    codenameHint:
      'Pseudonyme libre. Converti en interne en adresse e-mail.',
    passwordHint:
      'Min. 8 caractères. La clé de chiffrement est dérivée de ce mot de passe — sans mot de passe, pas d\'accès aux données.',
    passwordTooShort: 'Le mot de passe doit avoir au moins 8 caractères.',
    passwordsMismatch: 'Les mots de passe ne correspondent pas.',
    wrongCredentials: 'Pseudonyme ou mot de passe incorrect',
    wrongPassword: 'Mot de passe incorrect',
    codenameTaken: 'Pseudonyme déjà pris',
  },

  entry: {
    add: 'Ajouter',
    save: 'Enregistrer',
    saving: 'Enregistrement…',
    cancel: 'Annuler',
    delete: 'Supprimer',
    deleteConfirm: 'Supprimer l\'entrée ?',
    date: 'Date',
    from: 'De',
    to: 'À',
    duration: 'Durée',
    stakeholder: 'Mandant',
    projekt: 'Projet',
    taetigkeit: 'Activité',
    format: 'Format',
    notiz: 'Note',
    notizPlaceholder: 'Optionnel — courte description',
    addManual: 'Saisie manuelle',
    fillRequired: 'Veuillez remplir tous les champs obligatoires',
    invalidTimeRange: 'L\'heure de fin doit être postérieure à l\'heure de début',
  },

  picker: {
    search: 'Rechercher…',
    noMatch: 'Aucun résultat',
    addNew: 'Ajouter :',
    selected: 'sélectionné',
    chooseOne: 'Choisir…',
    chooseMulti: 'Choisir des mandants…',
  },

  list: {
    entriesCount: 'Entrées',
    stakeholdersCount: 'Mandants',
    projectsCount: 'Projets',
    activitiesCount: 'Activités',
    formatsCount: 'Formats',
    nMore: 'autres',
  },

  toast: {
    saved: 'Enregistré',
    deleted: 'Supprimé',
    error: 'Erreur :',
    saveFailed: 'Échec de l\'enregistrement',
    deleteFailed: 'Échec de la suppression',
  },

  defaults: {
    formatEinzelarbeit: 'Travail individuel',
    taetigkeitProduktiv: 'Productif',
  },

  fuzzy: {
    placeholder: 'Tapez pour une suggestion…',
    noMatch: "Aucun résultat dans l'historique",
    clear: 'Effacer la recherche',
  },

  shortcuts: {
    label: 'Plus fréquents',
  },

  timer: {
    title: 'Chrono',
    add: 'Nouveau chrono',
    empty: 'Aucun chrono actif. Appuyez sur « Nouveau chrono » pour démarrer.',
    slot: 'piste',
    slots: 'pistes',
    pause: 'Pause',
    resume: 'Reprendre',
    stop: 'Arrêter & enregistrer',
    remove: 'Annuler',
    removeConfirm: 'Annuler ce chrono sans enregistrer ?',
    endDay: 'Fin de journée',
    endingDay: 'Fin de journée…',
    tooShort: 'Chrono trop court — minimum 1 seconde.',
    goalReached: 'Objectif atteint',
  },

  tabs: {
    timer: 'Chrono',
    dashboard: 'Tableau de bord',
    entries: 'Entrées',
  },

  dashboard: {
    title: 'Tableau de bord',
    heatmap: 'Mandant × Projet',
    period: {
      today: "Aujourd'hui",
      week: 'Semaine',
      month: 'Mois',
      year: 'Année',
      all: 'Total',
      custom: 'Période',
      from: 'De',
      to: 'À',
    },
  },

  kpi: {
    today: "Saisi aujourd'hui",
    period: 'Saisi sur la période',
    entriesCount: 'Entrées',
    todaySubtitle: "Saisi aujourd'hui",
    periodSubtitle: 'Sur la période',
    entriesSubtitle: 'Entrées',
    tooltipToday:
      "Somme de toutes les durées d'entrées saisies aujourd'hui. Le multitâche est compté pleinement.",
    tooltipPeriod:
      "Somme de toutes les durées d'entrées dans la période. Même sémantique qu'« Saisi aujourd'hui ».",
    tooltipEntries:
      "Nombre d'entrées dans la période (sans les entrées d'absence).",
  },

  ring: {
    presenceLabel: 'Présence (première entrée → dernière entrée)',
    trackedLabel: 'Suivi (Wallclock-Union)',
    tooltipPresence:
      "De la première à la dernière entrée aujourd'hui — votre fenêtre brute de travail.",
    tooltipTracked:
      "Wallclock-Union des intervalles de chrono actif. Le multitâche compte 1, pas double.",
  },

  coverage: {
    label: 'Suivi :',
    of: 'sur',
    presence: 'Présence',
    oneGap: '1 trou · {dur}',
    nGaps: '{n} trous · {dur} au total',
    hint: 'Les trous ≥30min sont mis en évidence.',
    tooltip:
      "Combien d'heures de la journée un chrono tournait réellement.",
  },
};
