import type { MetadataRoute } from "next";
import { urlSite } from "@/lib/blog";
import { lireArticlesPublies, lireCategories } from "@/lib/blog-serveur";

/*
 * Plan du site (sitemap.xml) — pages publiques indexables + contenu du blog.
 *
 * Les espaces privés (admin, médecin, patient…) sont volontairement absents :
 * ils portent déjà un en-tête `X-Robots-Tag: noindex` (next.config) et n'ont
 * rien à faire dans un plan de site public.
 *
 * Revalidé à l'heure, et à la demande après une publication (voir
 * /api/admin/blog/revalidate).
 */

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = urlSite();

  const pagesFixes: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/resultats`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/a-propos`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/conseils-sante`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/blog`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/faq`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/conditions-utilisation`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/protection-donnees`, changeFrequency: "yearly", priority: 0.3 },
  ];

  try {
    const [articles, categories] = await Promise.all([lireArticlesPublies(), lireCategories()]);

    const pagesCategories: MetadataRoute.Sitemap = categories.map((c) => ({
      url: `${base}/blog/categorie/${c.slug}`,
      changeFrequency: "weekly",
      priority: 0.5,
    }));

    const pagesArticles: MetadataRoute.Sitemap = articles.map((a) => ({
      url: `${base}/blog/${a.slug}`,
      lastModified: new Date(a.maj_le ?? a.publie_le),
      changeFrequency: "monthly",
      priority: 0.7,
    }));

    return [...pagesFixes, ...pagesCategories, ...pagesArticles];
  } catch {
    return pagesFixes;
  }
}
