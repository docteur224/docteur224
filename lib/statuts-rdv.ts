/**
 * L'état d'un rendez-vous, écrit une seule fois.
 *
 * Jusqu'ici chaque écran redéfinissait sa propre table de libellés et de
 * teintes : l'agenda, le détail, la fiche patient, le centre d'appel. Quatre
 * tables pour quatre endroits, qui divergeaient — « En attente » ici,
 * « En attente de confirmation » là — et dont aucune ne connaissait la
 * valeur `absent` ajoutée par la migration 0063.
 *
 * Sept états affichables, dont un seul n'existe pas en base :
 *
 *   à qualifier — un rendez-vous dont l'heure est passée et que personne n'a
 *   tranché. Ce n'est pas un statut stocké, et il ne doit pas l'être : il se
 *   DÉDUIT de la date et de l'état. L'écrire en base supposerait un travail
 *   de fond qui repasserait sur chaque ligne à minuit, et qui se tromperait
 *   dès qu'il ne tournerait pas.
 *
 * Pur TypeScript : ni React, ni Supabase. Utilisable des deux côtés.
 */

/** Les six valeurs de l'enum `statut_rdv` en base. */
export type StatutRdv = "en_attente" | "confirme" | "present" | "annule" | "honore" | "absent";

/** Ce que l'écran montre — les cinq précédents, plus l'état déduit. */
export type StatutAffiche = StatutRdv | "a_qualifier";

interface Apparence {
  libelle: string;
  /** Classes Tailwind du badge (fond + texte), tokens de la charte. */
  classe: string;
}

/*
 * Le libellé porte l'information à lui seul : la couleur n'est qu'un renfort.
 * Un daltonien, une impression en noir et blanc ou un écran au soleil ne
 * doivent rien enlever à la lecture.
 */
export const APPARENCE_STATUT: Record<StatutAffiche, Apparence> = {
  honore: { libelle: "Honoré", classe: "bg-green-soft text-green" },
  absent: { libelle: "Non honoré", classe: "bg-red-soft text-red" },
  annule: { libelle: "Annulé", classe: "bg-bg text-muted" },
  present: { libelle: "Présent", classe: "bg-teal-soft text-teal" },
  confirme: { libelle: "Confirmé", classe: "bg-teal-soft text-blue" },
  en_attente: { libelle: "En attente", classe: "bg-amber-soft text-amber" },
  a_qualifier: { libelle: "À qualifier", classe: "bg-orange-soft text-orange" },
};

export const libelleStatut = (s: StatutAffiche): string =>
  APPARENCE_STATUT[s]?.libelle ?? "Statut inconnu";
export const classeStatut = (s: StatutAffiche): string =>
  APPARENCE_STATUT[s]?.classe ?? "bg-bg text-muted";

/**
 * Le rendez-vous a-t-il eu lieu ? Comparaison sur la date ET l'heure : à
 * 09 h 00, le rendez-vous de 14 h du même jour n'est pas passé.
 *
 * `maintenant` est injectable pour que les tests n'attendent pas demain.
 */
export function rdvPasse(date: string, heure: string, maintenant = new Date()): boolean {
  const p = (n: number) => `${n}`.padStart(2, "0");
  const horodatage =
    `${maintenant.getFullYear()}-${p(maintenant.getMonth() + 1)}-${p(maintenant.getDate())}` +
    ` ${p(maintenant.getHours())}:${p(maintenant.getMinutes())}`;
  return `${date} ${heure.slice(0, 5)}` <= horodatage;
}

/**
 * L'état à afficher, règle métier comprise.
 *
 * Un rendez-vous passé qui est resté « en attente » ou « confirmé » n'est ni
 * l'un ni l'autre : il attend d'être qualifié. Annulé, honoré et absent sont
 * des faits acquis — la date n'y change rien.
 */
export function statutAffiche(
  rdv: { date: string; heure: string; statut: string },
  maintenant = new Date()
): StatutAffiche {
  const s = rdv.statut as StatutRdv;
  // « Présent » est un fait d'accueil, au même titre qu'annulé, honoré ou
  // absent : la date ne le transforme pas en « à qualifier ».
  if (s === "annule" || s === "honore" || s === "absent" || s === "present") return s;
  return rdvPasse(rdv.date, rdv.heure, maintenant) ? "a_qualifier" : s;
}

/** Un rendez-vous à venir, encore en attente, peut être confirmé. */
export const estConfirmable = (
  rdv: { date: string; heure: string; statut: string },
  maintenant = new Date()
): boolean => statutAffiche(rdv, maintenant) === "en_attente";

/** Un rendez-vous passé non tranché attend « honoré » ou « absent ». */
export const estAQualifier = (
  rdv: { date: string; heure: string; statut: string },
  maintenant = new Date()
): boolean => statutAffiche(rdv, maintenant) === "a_qualifier";

/*
 * Les transitions de présence, écrites une seule fois et partagées avec la
 * base (fonction `qualifier_rdv`, migration 0075). L'interface s'en sert pour
 * décider quelles actions montrer ; la base, elle, reste seule juge — ces
 * aides ne font que choisir ce qu'on propose, jamais ce qu'on autorise.
 *
 *   en attente / confirmé → présent → honoré / absent
 *                         → honoré / absent
 *   (annulé est un fait à part, hors de ce cycle)
 */

/** Peut-on marquer ce patient « présent » ? Tant que rien n'est tranché. */
export const estMarquablePresent = (
  rdv: { date: string; heure: string; statut: string },
  maintenant = new Date()
): boolean => {
  const e = statutAffiche(rdv, maintenant);
  return e === "en_attente" || e === "confirme" || e === "a_qualifier";
};

/** Depuis « présent », le seul pas qui reste normal est « honoré ». */
export const estHonorableDepuisPresent = (rdv: { statut: string }): boolean =>
  rdv.statut === "present";

/** Un statut de présence déjà posé peut être repris pour corriger une erreur. */
export const estCorrigeable = (rdv: { statut: string }): boolean =>
  rdv.statut === "present" || rdv.statut === "honore" || rdv.statut === "absent";
