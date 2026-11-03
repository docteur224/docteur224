/*
 * Identifiants du compte administrateur PRINCIPAL, pour les scripts.
 *
 * Ils étaient écrits en clair dans une douzaine de scripts suivis par Git :
 * un mot de passe dans un fichier versionné est un mot de passe publié, et
 * le changer n'efface pas l'historique. Ils vivent désormais dans
 * `.env.local` (jamais commité) ou dans l'environnement du shell.
 *
 * Dans `.env.local`, sans espaces autour du « = » — les scripts du projet
 * lisent « ^CLÉ=… », là où Next.js tolérerait « CLÉ = … » :
 *
 *     EMAIL_PRINCIPAL=admin@docteur224.com
 *     MDP_PRINCIPAL=…
 *
 * Les comptes de démonstration (patient1@test.docteur224.com et consorts)
 * restent écrits dans les scripts : ce sont des jeux d'essai créés par
 * `seed.mjs`, pas des accès à la plateforme réelle.
 */
import { readFileSync } from "node:fs";

function depuisEnvLocal(cle) {
  try {
    const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    return env.match(new RegExp(`^${cle}=(.*)$`, "m"))?.[1].trim() || null;
  } catch {
    return null;
  }
}

export const EMAIL_PRINCIPAL =
  process.env.EMAIL_PRINCIPAL ?? depuisEnvLocal("EMAIL_PRINCIPAL") ?? "admin@docteur224.com";

export const MDP_PRINCIPAL = process.env.MDP_PRINCIPAL ?? depuisEnvLocal("MDP_PRINCIPAL");

/**
 * À appeler avant de s'en servir : un script qui démarre sans le mot de passe
 * part pour une cascade d'échecs de connexion incompréhensibles. Mieux vaut
 * une phrase et rien de fait.
 */
export function exigerMotDePassePrincipal() {
  if (MDP_PRINCIPAL) return MDP_PRINCIPAL;
  console.error(
    "Mot de passe du compte principal absent.\n" +
      "Ajoutez « MDP_PRINCIPAL=… » dans .env.local (sans espaces autour du =),\n" +
      "ou passez MDP_PRINCIPAL=… devant la commande. Rien n'a été fait."
  );
  process.exit(1);
}
