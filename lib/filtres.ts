/**
 * Définition des filtres de la page de résultats. Module neutre (ni serveur
 * ni client) : la page serveur construit les groupes à partir du référentiel,
 * le composant client les reçoit en props et les affiche.
 */

export interface GroupeFiltre {
  titre: string;
  /** Nom du paramètre d'URL portant ce filtre. */
  param: string;
  /** true : plusieurs valeurs cumulables (cases à cocher indépendantes). */
  multiple: boolean;
  options: { valeur: string; label: string }[];
}

/**
 * Construit les groupes de filtres à partir du référentiel réel. Les types
 * d'établissement et les assurances viennent de la base : coder les libellés
 * en dur ferait silencieusement échouer le filtre au moindre écart
 * (« NSIA » vs « NSIA Assurances »).
 *
 * Un groupe sans option est omis — inutile d'afficher un filtre qui ne peut
 * rien retourner.
 */
export function construireGroupes(
  typesEtab: string[],
  assurances: string[],
  avecNotes: boolean
): GroupeFiltre[] {
  const groupes: GroupeFiltre[] = [
    {
      titre: "Disponibilité",
      param: "dispo",
      multiple: false,
      options: [
        { valeur: "aujourdhui", label: "Aujourd'hui" },
        { valeur: "semaine", label: "Cette semaine" },
        { valeur: "weekend", label: "Week-end" },
      ],
    },
  ];
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
