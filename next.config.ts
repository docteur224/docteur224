import type { NextConfig } from "next";

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
  async redirects() {
    return [
      // La rubrique s'appelait « Blog » avant de devenir « Conseils santé » :
      // un lien déjà partagé ne doit pas tomber sur un 404.
      { source: "/blog", destination: "/conseils-sante", permanent: true },
    ];
  },
};

export default nextConfig;
