import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

/*
 * En-têtes de sécurité posés sur toutes les réponses.
 *
 * Ils ne remplacent rien de ce que fait la RLS : ils ferment les attaques
 * qui ne passent pas par notre API mais par le NAVIGATEUR du patient — une
 * page tierce qui met la console d'administration dans une iframe
 * invisible et fait cliquer l'administrateur à son insu, une image dont le
 * type déclaré ne correspond pas au contenu, l'adresse d'une fiche patient
 * partie dans le référent d'un site externe.
 *
 * Pas de Content-Security-Policy complète ici : Next injecte des scripts
 * en ligne dont le nonce se pose à la requête, et une CSP écrite à la main
 * casserait l'hydratation sans qu'on s'en aperçoive tout de suite. Seul
 * `frame-ancestors` est posé — c'est la seule directive qui ne peut PAS
 * l'être par une balise <meta>, et celle qui compte contre le clickjacking.
 */
const ENTETES_SECURITE = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // La plateforme ne demande ni caméra, ni micro, ni paiement natif. La
  // géolocalisation, si : la recherche « près de moi » s'appuie dessus.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), geolocation=(self)" },
  // Les espaces privés portent des dossiers médicaux : une mise en cache
  // par un proxy partagé les exposerait au poste suivant.
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
  // Montée de sécurité 16.4.2 → 16.4.6 (avis de sécurité publié). Ce drapeau
  // marque que la mise à jour a été conduite par l'outil `next upgrade`.
  experimental: {
    agentUpgrade: "security",
  },
  // Les couvertures d'articles du blog et les illustrations éditoriales sont
  // servies par Cloudinary : on autorise ce seul hôte pour next/image, borné
  // au compte (le dossier des envois commence par /<cloud_name>/).
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**",
      },
    ],
  },
  async headers() {
    return [
      {
        // Tout le site, sauf le X-Robots-Tag qui ne vaut que pour le privé.
        source: "/:chemin*",
        headers: ENTETES_SECURITE.filter((e) => e.key !== "X-Robots-Tag"),
      },
      ...["/espace-admin", "/espace-medecin", "/espace-assistant", "/espace-etablissement", "/patient", "/mes-rendez-vous"].map(
        (prefixe) => ({
          source: `${prefixe}/:chemin*`,
          headers: [
            ...ENTETES_SECURITE,
            { key: "Cache-Control", value: "no-store, must-revalidate" },
          ],
        })
      ),
    ];
  },
};

/*
 * Couche PWA (Serwist). Elle n'ajoute qu'un service worker et son précache
 * par-dessus la configuration existante : aucune route, aucun en-tête, aucun
 * comportement du site n'est modifié.
 *
 * `@serwist/next` s'injecte via webpack — c'est pourquoi le script `build`
 * passe `--webpack` (le bundler historique du site, voie conservatrice). En
 * développement, le SW est désactivé : pas de cache qui masque les
 * changements, et pas d'avertissement Turbopack.
 */
const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  // On enregistre le SW nous-mêmes (PWAProvider) pour piloter finement le
  // toast de mise à jour et le retour en ligne.
  register: false,
  reloadOnOnline: false,
  scope: "/",
  swUrl: "/sw.js",
  // Ne PAS précharger tout /public : les splash iOS et le logo haute
  // définition sont lourds et inutiles au démarrage sur réseau faible. On ne
  // retient que la petite icône, pour que la page hors-ligne affiche le logo
  // même sans réseau. Le reste de l'app shell (JS/CSS) vient du manifeste
  // Serwist injecté au build.
  globPublicPatterns: ["icons/icon-192.png"],
});

export default withSerwist(nextConfig);
