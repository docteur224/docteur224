import { normaliser } from "@/lib/icones-specialites";

/*
 * Catalogue des spécialités médicales proposées à l'admin.
 *
 * Ce n'est PAS le référentiel : celui-ci vit dans la table `specialites` et
 * ne contient que ce que l'admin a réellement ouvert sur la plateforme. Cette
 * liste-ci est une aide à la saisie — l'écran /espace-admin/parametres la
 * propose en suggestions, en retirant au passage ce qui est déjà référencé,
 * et laisse toujours la possibilité de taper autre chose.
 *
 * Couvre les spécialités et professions de santé courantes en Guinée et dans
 * l'espace francophone, y compris les plateaux techniques (laboratoire,
 * imagerie) qui ne sont pas des spécialités médicales au sens strict mais
 * que les patients cherchent de la même manière.
 */

export const CATALOGUE_SPECIALITES: string[] = [
  "Acupuncture",
  "Addictologie",
  "Allergologie",
  "Anatomopathologie",
  "Andrologie",
  "Anesthésie-réanimation",
  "Angiologie",
  "Audioprothèse",
  "Biologie médicale",
  "Cardiologie",
  "Chirurgie cardiaque",
  "Chirurgie dentaire",
  "Chirurgie digestive",
  "Chirurgie esthétique",
  "Chirurgie générale",
  "Chirurgie infantile",
  "Chirurgie maxillo-faciale",
  "Chirurgie orthopédique",
  "Chirurgie plastique",
  "Chirurgie thoracique",
  "Chirurgie urologique",
  "Chirurgie vasculaire",
  "Dentaire",
  "Dépistage",
  "Dermatologie",
  "Diabétologie",
  "Dialyse",
  "Diététique",
  "Échographie",
  "Endocrinologie",
  "Endoscopie digestive",
  "Épidémiologie",
  "Ergothérapie",
  "Gastro-entérologie",
  "Génétique médicale",
  "Gériatrie",
  "Gynécologie",
  "Hématologie",
  "Hépatologie",
  "Hygiène hospitalière",
  "Imagerie médicale",
  "Immunologie",
  "Implantologie dentaire",
  "Infectiologie",
  "Kinésithérapie",
  "Laboratoire",
  "Mammographie",
  "Médecine du sport",
  "Médecine du travail",
  "Médecine esthétique",
  "Médecine générale",
  "Médecine interne",
  "Médecine légale",
  "Médecine nucléaire",
  "Médecine physique et réadaptation",
  "Médecine traditionnelle",
  "Médecine tropicale",
  "Microbiologie",
  "Néonatologie",
  "Néphrologie",
  "Neurochirurgie",
  "Neurologie",
  "Nutrition",
  "Oncologie",
  "Oncologie pédiatrique",
  "Ophtalmologie",
  "Optométrie",
  "ORL",
  "Orthodontie",
  "Orthopédie",
  "Orthophonie",
  "Orthoptie",
  "Ostéopathie",
  "Parasitologie",
  "Parodontologie",
  "Pédiatrie",
  "Pédopsychiatrie",
  "Pharmacie",
  "Phlébologie",
  "Planning familial",
  "Pneumologie",
  "Podologie",
  "Proctologie",
  "Prothèses et appareillage",
  "Psychiatrie",
  "Psychologie",
  "Radiologie",
  "Radiothérapie",
  "Réanimation",
  "Rééducation fonctionnelle",
  "Rhumatologie",
  "Sage-femme",
  "Santé publique",
  "Scanner et IRM",
  "Sexologie",
  "Soins infirmiers",
  "Soins palliatifs",
  "Stomatologie",
  "Toxicologie",
  "Transfusion sanguine",
  "Traumatologie",
  "Urgences",
  "Urologie",
  "Vaccination",
  "Virologie",
];

/*
 * Le référentiel livré par défaut : ce qui se pratique réellement en Guinée,
 * des CHU de Conakry aux cabinets privés et centres de santé.
 *
 * Volontairement plus court que le catalogue ci-dessus, qui reste la réserve
 * de suggestions. En sont absentes les disciplines qui n'y sont pas exercées
 * (radiothérapie, chirurgie cardiaque, médecine nucléaire, génétique
 * médicale) : les proposer enverrait le patient vers une page de résultats
 * qui ne se remplira jamais. L'admin peut toujours les ajouter à la main
 * le jour où un service ouvre.
 *
 * Les libellés reprennent ceux déjà en base quand ils existent (« Dentaire »,
 * « Laboratoire », « Gynécologie »), pour ne pas créer de quasi-doublon.
 */
export const SPECIALITES_GUINEE: string[] = [
  "Médecine générale",
  "Médecine interne",
  "Pédiatrie",
  "Néonatologie",
  "Gynécologie",
  "Sage-femme",
  "Planning familial",
  "Cardiologie",
  "Dermatologie",
  "Ophtalmologie",
  "Optométrie",
  "ORL",
  "Audioprothèse",
  "Dentaire",
  "Orthodontie",
  "Chirurgie maxillo-faciale",
  "Neurologie",
  "Neurochirurgie",
  "Psychiatrie",
  "Psychologie",
  "Addictologie",
  "Pneumologie",
  "Gastro-entérologie",
  "Hépatologie",
  "Néphrologie",
  "Dialyse",
  "Urologie",
  "Andrologie",
  "Endocrinologie",
  "Diabétologie",
  "Nutrition",
  "Diététique",
  "Rhumatologie",
  "Orthopédie",
  "Traumatologie",
  "Chirurgie générale",
  "Chirurgie infantile",
  "Chirurgie plastique",
  "Chirurgie vasculaire",
  "Anesthésie-réanimation",
  "Réanimation",
  "Urgences",
  "Radiologie",
  "Échographie",
  "Laboratoire",
  "Biologie médicale",
  "Anatomopathologie",
  "Microbiologie",
  "Parasitologie",
  "Hématologie",
  "Transfusion sanguine",
  "Infectiologie",
  "Virologie",
  "Immunologie",
  "Allergologie",
  "Oncologie",
  "Gériatrie",
  "Médecine du travail",
  "Médecine légale",
  "Médecine tropicale",
  "Médecine du sport",
  "Santé publique",
  "Épidémiologie",
  "Vaccination",
  "Dépistage",
  "Pharmacie",
  "Kinésithérapie",
  "Rééducation fonctionnelle",
  "Ergothérapie",
  "Orthophonie",
  "Podologie",
  "Prothèses et appareillage",
  "Soins infirmiers",
  "Soins palliatifs",
  "Médecine traditionnelle",
  "Toxicologie",
];

/*
 * Ordre d'affichage sur l'accueil, du plus consulté au plus rare.
 *
 * Classement par motif de consultation en Guinée — le paludisme, la santé de
 * la mère et de l'enfant et les soins primaires d'abord — et non par ordre
 * alphabétique, qui mettait « Acupuncture » avant « Médecine générale ».
 * Ce qui n'y figure pas suit, classé alphabétiquement.
 */
export const PRIORITE_SPECIALITES: string[] = [
  "Médecine générale",
  "Pédiatrie",
  "Gynécologie",
  "Laboratoire",
  "Dentaire",
  "Cardiologie",
  "Ophtalmologie",
  "Dermatologie",
  "ORL",
  "Radiologie",
  "Médecine interne",
  "Chirurgie générale",
  "Pneumologie",
  "Gastro-entérologie",
  "Urologie",
  "Neurologie",
  "Orthopédie",
  "Endocrinologie",
  "Diabétologie",
  "Néphrologie",
  "Psychiatrie",
  "Urgences",
  "Pharmacie",
  "Sage-femme",
  "Kinésithérapie",
  "Rhumatologie",
  "Infectiologie",
  "Vaccination",
  "Échographie",
  "Anesthésie-réanimation",
];


/**
 * Nombre de spécialités montrées d'emblée sur l'accueil.
 *
 * Quatorze : deux rangées pleines de sept sur la grille web, et de quoi
 * défiler sans fin sur le carrousel mobile. Au-delà, « Voir plus » déplie.
 */
export const SPECIALITES_ACCUEIL = 14;

/**
 * Spécialités mises en avant sur l'accueil.
 *
 * Le référentiel complet n'a pas sa place sur la page d'accueil : la section
 * annonce « les spécialités les plus demandées », et une vignette qui mène à
 * une page de résultats vide dessert le patient. On ne garde donc que celles
 * où un professionnel est réellement inscrit, dans l'ordre de PRIORITE.
 *
 * Tant qu'aucun professionnel n'est validé — plateforme neuve, ou base de
 * démonstration — le filtre viderait la section : on retombe alors sur les
 * `minimum` premières, qui servent de vitrine.
 *
 * @param medecinsParSpecialite nombre de professionnels par nom de spécialité
 *   NORMALISÉ (voir `normaliser`), pour ne pas dépendre de la casse.
 */
export function specialitesEnAvant<T extends { nom: string }>(
  specialites: T[],
  medecinsParSpecialite: Map<string, number>,
  minimum = SPECIALITES_ACCUEIL
): T[] {
  const rangs = new Map(PRIORITE_SPECIALITES.map((nom, i) => [normaliser(nom), i]));
  const compter = (s: T) => medecinsParSpecialite.get(normaliser(s.nom)) ?? 0;

  function classer(a: T, b: T) {
    // Le rang éditorial prime sur le nombre de praticiens : c'est le motif de
    // consultation qui guide le patient, pas la taille de l'annuaire.
    const rangA = rangs.get(normaliser(a.nom)) ?? Number.MAX_SAFE_INTEGER;
    const rangB = rangs.get(normaliser(b.nom)) ?? Number.MAX_SAFE_INTEGER;
    if (rangA !== rangB) return rangA - rangB;
    if (compter(b) !== compter(a)) return compter(b) - compter(a);
    return a.nom.localeCompare(b.nom, "fr");
  }

  const pourvues = specialites.filter((s) => compter(s) > 0);
  return pourvues.length > 0
    ? [...pourvues].sort(classer)
    : [...specialites].sort(classer).slice(0, minimum);
}

/** Compte les professionnels par spécialité, clés normalisées. */
export function compterParSpecialite(medecins: { specialite: string }[]): Map<string, number> {
  const comptes = new Map<string, number>();
  for (const { specialite } of medecins) {
    if (!specialite) continue;
    const cle = normaliser(specialite);
    comptes.set(cle, (comptes.get(cle) ?? 0) + 1);
  }
  return comptes;
}
