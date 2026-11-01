import type { CanalCode, ObjetCode } from "@/lib/pin";

/*
 * Connexion par téléphone — appels des routes /api/telephone/* depuis les
 * écrans. Toute la décision est côté serveur ; ces fonctions ne font que
 * transporter et rendre `{ erreur }` au lieu de lever, comme `lib/auth.ts`.
 */

export interface Reponse {
  erreur?: string;
  /** Le numéro a déjà un compte (inscription). */
  compteExistant?: boolean;
  /** Le jeton de vérification a expiré : il faut redemander un code. */
  jetonExpire?: boolean;
}

async function appeler<T>(url: string, corps: unknown, methode = "POST"): Promise<T & Reponse> {
  try {
    const reponse = await fetch(url, {
      method: methode,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corps),
    });
    const donnees = await reponse.json().catch(() => ({}));
    if (!reponse.ok && !donnees.erreur) donnees.erreur = "Service indisponible. Réessayez.";
    return donnees;
  } catch {
    return { erreur: "Connexion au serveur impossible. Vérifiez votre réseau." } as T & Reponse;
  }
}

export function envoyerCode(telephone: string, canal: CanalCode, objet: ObjetCode) {
  return appeler<{ renvoiDans?: number; codeDemonstration?: string }>("/api/telephone/code", {
    telephone,
    canal,
    objet,
  });
}

export function verifierCode(telephone: string, objet: ObjetCode, code: string) {
  return appeler<{ jeton?: string }>("/api/telephone/code/verifier", { telephone, objet, code });
}

export interface ProfilTelephone {
  nom: string;
  prenom: string;
  genre: "F" | "M";
  dateNaissance: string;
  email: string;
}

export function inscrireParTelephone(telephone: string, jeton: string, pin: string, profil: ProfilTelephone) {
  return appeler<{ cible?: string }>("/api/telephone/inscription", { telephone, jeton, pin, ...profil });
}

export function connecterParTelephone(telephone: string, pin: string) {
  return appeler<{ cible?: string }>("/api/telephone/connexion", { telephone, pin });
}

export function reinitialiserPin(telephone: string, jeton: string, pin: string) {
  return appeler<{ cible?: string }>("/api/telephone/pin", { telephone, jeton, pin });
}

export function modifierPin(actuel: string, nouveau: string) {
  return appeler<{ ok?: boolean }>("/api/telephone/pin", { actuel, nouveau }, "PUT");
}

export async function lireEtatPin(): Promise<{ telephone: string | null; pinModifieLe: string | null }> {
  try {
    const reponse = await fetch("/api/telephone/pin");
    if (!reponse.ok) return { telephone: null, pinModifieLe: null };
    return await reponse.json();
  } catch {
    return { telephone: null, pinModifieLe: null };
  }
}
