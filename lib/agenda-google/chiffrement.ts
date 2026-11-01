import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/*
 * Chiffrement du jeton de rafraîchissement Google — SERVEUR UNIQUEMENT.
 *
 * Le jeton est un accès durable à l'agenda du patient : il ne doit pas être
 * lisible en clair dans la base. AES-256-GCM (confidentialité + intégrité),
 * avec une clé de 32 octets rangée dans GOOGLE_AGENDA_CLE_CHIFFREMENT (base64),
 * hors base — une copie de la base seule ne suffit donc pas à ouvrir un agenda.
 *
 * Format stocké : « gcm$iv$tag$chiffre » (chaque partie en base64url), sur le
 * même principe lisible que les hachés de PIN (lib/auth-telephone-serveur).
 *
 * Générer la clé :
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */

const ALGO = "aes-256-gcm";

function cle(): Buffer | null {
  const brute = process.env.GOOGLE_AGENDA_CLE_CHIFFREMENT?.trim();
  if (!brute) return null;
  const k = Buffer.from(brute, "base64");
  return k.length === 32 ? k : null;
}

/** Vrai si une clé de chiffrement valide est configurée. */
export function chiffrementConfigure(): boolean {
  return cle() !== null;
}

export function chiffrer(clair: string): string {
  const k = cle();
  if (!k) throw new Error("GOOGLE_AGENDA_CLE_CHIFFREMENT absente ou invalide (32 octets base64 attendus).");
  const iv = randomBytes(12);
  const chiffreur = createCipheriv(ALGO, k, iv);
  const chiffre = Buffer.concat([chiffreur.update(clair, "utf8"), chiffreur.final()]);
  const tag = chiffreur.getAuthTag();
  return `gcm$${iv.toString("base64url")}$${tag.toString("base64url")}$${chiffre.toString("base64url")}`;
}

export function dechiffrer(stocke: string): string {
  const k = cle();
  if (!k) throw new Error("GOOGLE_AGENDA_CLE_CHIFFREMENT absente ou invalide.");
  const [algo, iv, tag, chiffre] = stocke.split("$");
  if (algo !== "gcm" || !iv || !tag || !chiffre) throw new Error("Jeton chiffré illisible.");
  const dechiffreur = createDecipheriv(ALGO, k, Buffer.from(iv, "base64url"));
  dechiffreur.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    dechiffreur.update(Buffer.from(chiffre, "base64url")),
    dechiffreur.final(),
  ]).toString("utf8");
}
