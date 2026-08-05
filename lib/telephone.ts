/*
 * Numéros de téléphone guinéens.
 *
 * Un mobile guinéen s'écrit +224 suivi de 9 chiffres commençant par 6
 * (Orange, MTN, Cellcom…). Les formulaires laissaient jusqu'ici passer
 * n'importe quoi : un SMS de confirmation part alors dans le vide et le
 * secrétariat devient injoignable depuis la fiche publique.
 *
 * Module volontairement pur (aucun import React) : il est utilisé par les
 * écrans client comme par les routes serveur.
 */

/** Longueur d'un numéro national, indicatif pays exclu. */
export const LONGUEUR_TELEPHONE_GN = 9;

export const INDICATIF_GN = "+224";

export const MESSAGE_TELEPHONE_GN =
  "Le numéro doit comporter 9 chiffres et commencer par 6 (ex. 622 00 00 00).";

/**
 * Ne garde que les chiffres du numéro national : l'indicatif pays est
 * retiré qu'il ait été saisi en `+224`, `00224` ou `224`, et la longueur
 * est bornée à 9 pour que le champ ne puisse pas déborder.
 */
export function chiffresTelephone(saisie: string): string {
  let chiffres = (saisie ?? "").replace(/\D/g, "");
  if (chiffres.startsWith("00")) chiffres = chiffres.slice(2);
  // Un numéro national commence par 6 : tout « 224 » en tête est donc
  // l'indicatif, jamais le début du numéro lui-même.
  if (chiffres.startsWith("224")) chiffres = chiffres.slice(3);
  return chiffres.slice(0, LONGUEUR_TELEPHONE_GN);
}

/** 9 chiffres commençant par 6. */
export function telephoneGuineenValide(saisie: string): boolean {
  return /^6\d{8}$/.test(chiffresTelephone(saisie));
}

/** « 622 00 00 00 » — groupement lisible utilisé dans les champs de saisie. */
export function formaterTelephoneGN(saisie: string): string {
  const c = chiffresTelephone(saisie);
  const morceaux = [c.slice(0, 3), c.slice(3, 5), c.slice(5, 7), c.slice(7, 9)];
  return morceaux.filter(Boolean).join(" ");
}

/** Forme stockée en base : `+224XXXXXXXXX`. Chaîne vide si le numéro est incomplet. */
export function versTelephoneInternational(saisie: string): string {
  const c = chiffresTelephone(saisie);
  return c.length === LONGUEUR_TELEPHONE_GN ? `${INDICATIF_GN}${c}` : "";
}
