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
};
