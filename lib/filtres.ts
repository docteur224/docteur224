/**
 * Définition des filtres de la page de résultats. Module neutre (ni serveur
 * ni client) : la page serveur construit les groupes à partir du référentiel,
 * les composants clients les reçoivent en props et les affichent.
 *
 * Deux familles :
 *  - `construireGroupes` : la colonne latérale (établissement, assurance…) ;
 *  - `groupeDisponibilite` / `construireGroupesAvances` : les popups
 *    « Disponibilités » et « Filtres » de la barre de filtres avancés.
 */

export interface GroupeFiltre {
  titre: string;
  /** Nom du paramètre d'URL portant ce filtre. */
  param: string;
  /** true : plusieurs valeurs cumulables (cases à cocher indépendantes). */
  multiple: boolean;
  options: { valeur: string; label: string }[];
}

/** Horizons proposés par le popup « Disponibilités ». */
export function groupeDisponibilite(): GroupeFiltre {
  return {
    titre: "Disponibilités",
    param: "dispo",
    multiple: false,
    options: [
      { valeur: "aujourdhui", label: "Aujourd'hui" },
      { valeur: "3jours", label: "Dans les 3 prochains jours" },
      { valeur: "7jours", label: "Dans les 7 prochains jours" },
      { valeur: "14jours", label: "Dans les 14 prochains jours" },
    ],
  };
}

/**
 * Groupes du popup « Filtres » : disponibilité, langues parlées et sexe.
 *
 * Les langues viennent de la base — coder les libellés en dur ferait
 * silencieusement échouer le filtre au moindre écart. Le groupe « Sexe »
 * n'apparaît que si au moins un médecin a son genre renseigné, sinon il
 * viderait systématiquement la liste.
 */
export function construireGroupesAvances(
  langues: string[],
  avecGenre: boolean
): GroupeFiltre[] {
  const groupes: GroupeFiltre[] = [groupeDisponibilite()];
  if (langues.length) {
    groupes.push({
      titre: "Langues parlées",
      param: "langue",
      multiple: true,
      options: langues.map((l) => ({ valeur: l, label: l })),
    });
  }
  if (avecGenre) {
    groupes.push({
      titre: "Sexe",
      param: "genre",
      multiple: false,
      options: [
        { valeur: "femme", label: "Femme" },
        { valeur: "homme", label: "Homme" },
      ],
    });
  }
  return groupes;
}

/**
 * Groupes de la colonne latérale : établissement, assurance et note. La
 * disponibilité a migré vers le popup dédié pour éviter de la proposer deux
 * fois au même endroit.
 *
 * Les types d'établissement et les assurances viennent de la base : coder les
 * libellés en dur ferait silencieusement échouer le filtre au moindre écart
 * (« NSIA » vs « NSIA Assurances »). Un groupe sans option est omis — inutile
 * d'afficher un filtre qui ne peut rien retourner.
 */
export function construireGroupes(
  typesEtab: string[],
  assurances: string[],
  avecNotes: boolean
): GroupeFiltre[] {
  const groupes: GroupeFiltre[] = [];
  if (typesEtab.length) {
    groupes.push({
      titre: "Établissement",
      param: "type",
      multiple: true,
      options: typesEtab.map((t) => ({ valeur: t, label: t })),
    });
  }
  if (assurances.length) {
    groupes.push({
      titre: "Assurance acceptée",
      param: "assurance",
      multiple: true,
      options: assurances.map((a) => ({ valeur: a, label: a })),
    });
  }
  // Tant qu'aucun médecin n'est noté, un filtre par note viderait toujours la
  // liste : on ne l'affiche qu'une fois de vraies notes présentes.
  if (avecNotes) {
    groupes.push({
      titre: "Note",
      param: "note",
      multiple: false,
      options: [
        { valeur: "4", label: "4★ et plus" },
        { valeur: "4.5", label: "4,5★ et plus" },
      ],
    });
  }
  return groupes;
}

/** Libellé court d'une valeur de filtre, pour les pastilles de rappel. */
export function libelleValeur(groupes: GroupeFiltre[], param: string, valeur: string): string {
  for (const g of groupes) {
    if (g.param !== param) continue;
    const o = g.options.find((x) => x.valeur === valeur);
    if (o) return o.label;
  }
  return valeur;
}
