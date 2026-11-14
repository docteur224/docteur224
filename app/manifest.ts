import type { MetadataRoute } from "next";

/*
 * Manifeste de l'application installable. Les couleurs reprennent les tokens
 * réels du design system (voir app/globals.css) : bleu de marque #15506b pour
 * `theme_color`, fond blanc.
 *
 * Remarque i18n : le manifeste Web est mono-langue. Les libellés des
 * raccourcis sont en français (langue du manifeste). Les chaînes de l'IHM PWA
 * (bannière, toast, page hors-ligne), elles, sont traduites fr/en/ar.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Docteur 224",
    short_name: "Docteur224",
    description: "Trouvez un médecin et prenez rendez-vous en ligne, partout en Guinée.",
    lang: "fr",
    dir: "ltr",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#FFFFFF",
    theme_color: "#15506b",
    categories: ["medical", "health", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "Prendre rendez-vous",
        short_name: "Rendez-vous",
        url: "/resultats?source=pwa",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Mes rendez-vous",
        short_name: "Mes RDV",
        url: "/mes-rendez-vous?source=pwa",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Conseils santé",
        short_name: "Conseils",
        url: "/conseils-sante?source=pwa",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
    screenshots: [
      {
        src: "/screenshots/narrow.png",
        sizes: "1080x1640",
        type: "image/png",
        form_factor: "narrow",
        label: "Docteur 224 sur mobile",
      },
      {
        src: "/screenshots/wide.png",
        sizes: "1920x1080",
        type: "image/png",
        form_factor: "wide",
        label: "Docteur 224 sur ordinateur",
      },
    ],
  };
}
