/*
 * Titre du praticien.
 *
 * La colonne `medecins.civilite` ne connaît que « Dr » et « Pr » (abréviation
 * normalisée de « Professeur »), et toute l'application affiche cette forme
 * courte devant le nom. Le libellé long n'existe que dans les menus de
 * saisie : « Pr » seul se lit mal quand on le choisit pour la première fois.
 *
 * Partagé par l'inscription et /espace-medecin/profil pour que les deux
 * listes ne divergent pas.
 */

export const CIVILITES: { valeur: string; label: string }[] = [
  { valeur: "Dr", label: "Dr — Docteur" },
  { valeur: "Pr", label: "Pr — Professeur" },
];
