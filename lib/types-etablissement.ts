/*
 * Référentiel des types d'établissement de santé reconnus en Guinée.
 *
 * Source unique : le menu de l'inscription, la validation serveur et le palier
 * d'abonnement lisent cette liste. Avant, le palier était deviné en cherchant
 * « clinique » ou « hôpital » dans la chaîne saisie — « Polyclinique » tombait
 * dans le palier clinique par accident de sous-chaîne, et tout le reste dans
 * le palier cabinet faute de mieux. Le palier est désormais déclaré type par
 * type, et une nouvelle entrée ne peut plus être tarifée par hasard.
 *
 * `valeur` est ce qui part en base (`etablissements.type`). Les trois valeurs
 * historiques — « Clinique privée », « Hôpital public », « Cabinet médical » —
 * sont conservées à l'identique, avec le palier qu'elles avaient déjà : aucun
 * compte existant n'est requalifié.
 *
 * Le palier reste une question de TAILLE, ce que /espace-admin/abonnements
 * annonce depuis toujours (1–3, 4–15, 16+ médecins). Le type ne fait que fixer
 * le palier de départ à l'inscription, quand la structure n'a encore aucun
 * médecin rattaché ; l'admin la requalifie ensuite si elle grandit.
 */

export type PalierEtablissement = "structure" | "cabinet" | "clinique" | "hopital";

export interface TypeEtablissement {
  /** Écrit tel quel dans `etablissements.type`. */
  valeur: string;
  palier: PalierEtablissement;
  /** Nom réel plausible, affiché en exemple sous le champ « Nom ». */
  exemple: string;
}

/**
 * Groupés pour le menu déroulant : 20 entrées à plat sont illisibles. Les
 * titres décrivent la nature de la structure, pas le palier — le professionnel
 * choisit ce qu'il est, pas ce qu'il va payer.
 */
export const GROUPES_TYPES_ETABLISSEMENT: {
  titre: string;
  types: TypeEtablissement[];
}[] = [
  {
    titre: "Structures de proximité",
    types: [
      { valeur: "Poste de santé", palier: "structure", exemple: "Poste de Santé de Kipé" },
      { valeur: "Centre de santé", palier: "structure", exemple: "Centre de Santé de Matoto" },
      { valeur: "Cabinet de soins infirmiers", palier: "structure", exemple: "Cabinet Infirmier Espoir" },
      { valeur: "Cabinet de kinésithérapie", palier: "structure", exemple: "Cabinet Kiné Santé Plus" },
      { valeur: "Cabinet d'optique", palier: "structure", exemple: "Optique Vision Conakry" },
    ],
  },
  {
    titre: "Cabinets & plateaux techniques",
    types: [
      { valeur: "Cabinet médical", palier: "cabinet", exemple: "Cabinet Médical du Centre" },
      { valeur: "Cabinet dentaire", palier: "cabinet", exemple: "Cabinet Dentaire Le Sourire" },
      { valeur: "Laboratoire d'analyses médicales", palier: "cabinet", exemple: "Laboratoire Bio-Guinée" },
      { valeur: "Centre d'imagerie médicale", palier: "cabinet", exemple: "Centre d'Imagerie de Conakry" },
    ],
  },
  {
    titre: "Cliniques & centres médicaux",
    types: [
      { valeur: "Clinique privée", palier: "clinique", exemple: "Clinique Ambroise Paré" },
      { valeur: "Polyclinique", palier: "clinique", exemple: "Polyclinique de Kaloum" },
      { valeur: "Centre médical communal (CMC)", palier: "clinique", exemple: "CMC de Ratoma" },
      { valeur: "Centre de santé amélioré", palier: "clinique", exemple: "Centre de Santé Amélioré de Coyah" },
      { valeur: "Maternité", palier: "clinique", exemple: "Maternité Sainte-Marie" },
      { valeur: "Centre de dialyse", palier: "clinique", exemple: "Centre de Dialyse de Conakry" },
    ],
  },
  {
    titre: "Hôpitaux & centres hospitaliers",
    types: [
      { valeur: "Hôpital public", palier: "hopital", exemple: "Hôpital Donka" },
      { valeur: "Hôpital préfectoral", palier: "hopital", exemple: "Hôpital Préfectoral de Kindia" },
      { valeur: "Hôpital régional", palier: "hopital", exemple: "Hôpital Régional de Labé" },
      { valeur: "Hôpital national / CHU", palier: "hopital", exemple: "CHU Ignace Deen" },
      { valeur: "Centre hospitalier", palier: "hopital", exemple: "Centre Hospitalier de Nzérékoré" },
    ],
  },
];

export const TYPES_ETABLISSEMENT: TypeEtablissement[] = GROUPES_TYPES_ETABLISSEMENT.flatMap(
  (g) => g.types
);

/** Retenu quand le client n'envoie rien ou envoie un type inconnu. */
export const TYPE_ETABLISSEMENT_DEFAUT = "Cabinet médical";

export function trouverTypeEtablissement(valeur: string | null | undefined): TypeEtablissement | undefined {
  return TYPES_ETABLISSEMENT.find((t) => t.valeur === valeur);
}

/**
 * Ramène un type reçu du client à une valeur du référentiel.
 *
 * Le type pilote la facturation : accepter une chaîne libre laisserait un
 * hôpital se déclarer « Micro-cabinet » et payer le palier le plus bas. Un
 * type inconnu retombe donc sur le défaut plutôt que d'être écrit tel quel.
 */
export function normaliserTypeEtablissement(valeur: string | null | undefined): string {
  return trouverTypeEtablissement(valeur)?.valeur ?? TYPE_ETABLISSEMENT_DEFAUT;
}

/**
 * Palier de départ d'un type donné.
 *
 * Les établissements créés avant ce référentiel peuvent porter un type hors
 * liste : ils gardent le palier le plus bas plutôt que d'être surfacturés, et
 * l'admin les requalifie.
 */
export function palierPourType(valeur: string | null | undefined): PalierEtablissement {
  return trouverTypeEtablissement(valeur)?.palier ?? "structure";
}
