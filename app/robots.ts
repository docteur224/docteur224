import type { MetadataRoute } from "next";
import { urlSite } from "@/lib/blog";

/*
 * robots.txt — autorise l'indexation du site public, interdit les espaces
 * privés (qui portent déjà `X-Robots-Tag: noindex` côté en-têtes) et déclare
 * le plan du site.
 */
export default function robots(): MetadataRoute.Robots {
  const base = urlSite();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/espace-admin",
        "/espace-medecin",
        "/espace-assistant",
        "/espace-etablissement",
        "/patient",
        "/mes-rendez-vous",
        "/api/",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
