/*
 * Règles du code PIN et du code de vérification.
 *
 * Module PUR : les écrans s'en servent pour guider la saisie, les routes
 * /api/telephone/* pour refuser — le contrôle du formulaire ne protège de
 * rien, un POST direct passerait à côté.
 */

export const LONGUEUR_PIN = 4;
export const LONGUEUR_CODE = 6;

/** Durée de validité d'un code envoyé par WhatsApp ou SMS. */
export const VALIDITE_CODE_MINUTES = 10;
/** Délai imposé avant de redemander un code pour le même numéro. */
export const DELAI_RENVOI_SECONDES = 30;

export type CanalCode = "whatsapp" | "sms";
export type ObjetCode = "inscription" | "pin_oublie";

/**
 * Le PIN que tout le monde essaie en premier : chiffre répété (0000, 7777)
 * ou suite (1234, 4321, 0123, 9876). Sur dix mille combinaisons, ce sont
 * celles qu'un voleur de téléphone tente avant les autres.
 */
export function pinTropSimple(pin: string): boolean {
  if (!/^\d+$/.test(pin)) return false;
  const c = [...pin].map(Number);
  const pas = c.slice(1).map((v, i) => v - c[i]);
  return pas.every((p) => p === 0) || pas.every((p) => p === 1) || pas.every((p) => p === -1);
}

export function pinValide(pin: string): boolean {
  return new RegExp(`^\\d{${LONGUEUR_PIN}}$`).test(pin) && !pinTropSimple(pin);
}

export const MESSAGE_PIN =
  "Choisissez 4 chiffres difficiles à deviner (pas de 0000 ni de 1234).";

/** « +224 622 •• •• 07 » — le numéro rappelé à l'écran sans être recopié en entier. */
export function masquerTelephone(international: string): string {
  const c = international.replace(/\D/g, "").replace(/^224/, "");
  if (c.length !== 9) return international;
  return `+224 ${c.slice(0, 3)} •• •• ${c.slice(7)}`;
}
