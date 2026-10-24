/*
 * Code de vérification d'un document : « D224-XXXX-XXXX-XXXX ».
 *
 * Douze caractères sur un alphabet de 32 sans lettres ambiguës (ni I, O, 0,
 * 1) : 60 bits — impossible à deviner — et recopiable à la main depuis le
 * papier sans confondre « O » et « 0 ». Même alphabet et même format que la
 * contrainte de la base (migration 0065).
 *
 * Module PUR : `crypto.getRandomValues` existe dans Node comme dans le
 * navigateur.
 */

export const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function genererCode(): string {
  const octets = new Uint8Array(12);
  crypto.getRandomValues(octets);
  // 256 est un multiple de 32 : le modulo ne biaise aucun caractère.
  const c = [...octets].map((o) => ALPHABET[o % 32]).join("");
  return `D224-${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}`;
}

/**
 * Remet en forme un code recopié à la main (« d224 abcd efgh jkmn »,
 * « ABCDEFGHJKMN ») ; null s'il ne peut pas être un code.
 */
export function normaliserCode(saisie: string): string | null {
  let brut = saisie.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (brut.startsWith("D224")) brut = brut.slice(4);
  if (brut.length !== 12 || [...brut].some((c) => !ALPHABET.includes(c))) return null;
  return `D224-${brut.slice(0, 4)}-${brut.slice(4, 8)}-${brut.slice(8, 12)}`;
}

/** Adresse publique de vérification, celle qu'encode le QR. */
export function urlVerification(base: string, code: string): string {
  return `${base.replace(/\/$/, "")}/verifier/${code}`;
}
