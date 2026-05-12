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
    close: 'Fermer',
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
    invalidDateRange: 'La date de fin ne peut pas être antérieure à la date de début',
    dateTo: 'Date de fin',
    dateToOptional: 'Optionnel',
    excludeWeekends: 'Exclure les week-ends',
    rangeCount: 'Entrées',
    rangeCountValue: '→ {n} jours',
    absenceHint:
      "Absence détectée — mandant, projet, format et heures sont facultatifs. Les heures vides sont remplies avec le quota journalier (8h24).",
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

  entries: {
    filterLabel: 'Filtre',
    clearFilter: 'Effacer le filtre',
    clearAllFilters: 'Tout effacer',
    removeFilter: 'Retirer le filtre',
    filterEmpty: 'Aucune entrée pour ce filtre.',
    searchPlaceholder: 'Rechercher dans les entrées…',
    clearSearch: 'Effacer la recherche',
  },

  backup: {
    title: 'Sauvegarde / Export',
    hint: 'Télécharge toutes tes entrées en clair — pour archive ou traitement externe. JSON est sans perte (réimportable), CSV s’ouvre directement dans Excel.',
    exportJson: 'JSON',
    exportCsv: 'CSV',
  },

  toast: {
    saved: 'Enregistré',
    savedN: '{n} entrées enregistrées',
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
    newCombo: 'Nouveau',
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
    unconfigured: 'Non configuré',
    expand: 'Afficher les détails',
    collapse: 'Masquer les détails',
  },

  tabs: {
    timer: 'Chrono',
    dashboard: 'Tableau de bord',
    entries: 'Entrées',
    team: 'Équipe',
    manage: 'Gestion',
  },

  edit: {
    title: "Modifier l'entrée",
  },

  batch: {
    selected: 'Sélectionné',
    selectAll: 'Tout sélectionner',
    selectNone: 'Tout désélectionner',
    select: 'Sélectionner',
    deselect: 'Désélectionner',
    clearSelection: 'Vider la sélection',
    setCategory: 'Définir catégorie',
    setNotiz: 'Définir la note',
    shift: 'Décaler le temps',
    delete: 'Supprimer',
    dimension: 'Dimension',
    newValue: 'Nouvelle valeur',
    applyTo: 'Appliquer à {n}',
    shiftMinutes: 'Décalage (min.)',
    shiftZero: 'Veuillez entrer une valeur différente de 0.',
    shiftHint:
      "Les heures de début et de fin de toutes les entrées sélectionnées seront décalées. Négatif = vers l'arrière, positif = vers l'avant. La date et la durée restent.",
    deleteConfirm:
      "{n} entrées seront supprimées (récupérables depuis la gestion).",
  },

  manage: {
    title: 'Gestion',
    intro:
      "Renommer ou supprimer les données de référence. En mode équipe, la liste affiche toutes les données des membres dédupliquées. Les renommages d'admin se propagent à toute l'équipe (toutes les rows + entrées) ; les renommages de collaborateur ne touchent que les propres données.",
    empty: 'Aucune entrée pour le moment.',
    add: 'Ajouter',
    saving: 'sauvegarde…',
    addPlaceholder: 'Ajouter…',
    rename: 'Renommer',
    delete: 'Supprimer',
    readOnly: 'Lecture seule (membre)',
    useCountTooltip: 'Utilisé dans {count} entrées',
    renameConfirm:
      "« {old} » → « {new} » : {count} entrées seront aussi renommées. Continuer ?",
    deleteConfirm: 'Vraiment supprimer « {name} » ?',
    deleteConfirmInUse:
      "« {name} » est utilisé dans {count} entrées. Si tu le supprimes, ces entrées conservent la valeur en texte libre (mais ne seront plus dans la liste). Supprimer quand même ?",
  },

  team: {
    title: 'Équipe',
    setupHint:
      "Créez une nouvelle équipe ou rejoignez-en une existante. Les membres d'une équipe partagent une clé d'équipe chiffrée.",
    create: 'Créer',
    join: 'Rejoindre',
    nameLabel: "Nom de l'équipe",
    namePlaceholder: 'p.ex. Cabinet Müller',
    creating: 'Création…',
    createButton: "Créer l'équipe",
    inviteCodeLabel: "Code d'invitation",
    joining: 'Adhésion…',
    joinButton: 'Rejoindre',
    leave: "Quitter l'équipe",
    leaveConfirm:
      "Vraiment quitter l'équipe ? Vous perdez l'accès à la clé d'équipe et donc aux données partagées.",
    copyInvite: "Copier le code d'invitation",
    copied: 'copié',
    members: 'Membres',
    you: 'Vous',
    role: {
      admin: 'Admin',
      mitarbeiter: 'Collaborateur',
    },
    changeRole: 'Changer le rôle',
    removeMember: 'Retirer le membre',
    removeMemberConfirm:
      "Vraiment retirer {name} de l'équipe ? La personne perdra l'accès à la clé d'équipe.",
  },

  dashboard: {
    title: 'Tableau de bord',
    heatmap: 'Mandant × Projet',
    teamWorkload: "Charge de l'équipe",
    viewMemberDetail: 'Ouvrir la vue détaillée de {name}',
    memberFocus: 'Détail',
    backToOverview: "Retour à la vue d'ensemble",
    period: {
      today: "Aujourd'hui",
      thisWeek: 'Cette semaine',
      week: 'Semaine',
      month: 'Mois',
      year: 'Année',
      all: 'Total',
      custom: 'Période',
      from: 'De',
      to: 'À',
      prev: 'Précédent',
      next: 'Suivant',
      resetToNow: "Aujourd'hui",
    },
  },

  scope: {
    self: 'Moi seul',
    team: 'Équipe',
  },

  report: {
    title: 'Rapport',
    create: 'Créer le rapport',
    summary: 'Résumé management',
    summaryHint: 'HTML autorisé, éditable',
    findings: 'Constats des données',
    perMember: 'Par membre',
    kpiWallclock: 'Wallclock',
    kpiPresence: 'Présence',
    kpiCoverage: 'Couverture',
    kpiMultiTask: 'Multitâche',
    kpiProductive: 'Quota productif',
    kpiDays: 'Jours actifs',
    kpiDaysSub: 'avec entrées',
    download: 'Télécharger',
    print: 'Imprimer',
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
