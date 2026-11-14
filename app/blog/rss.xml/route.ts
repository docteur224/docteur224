import { lireArticlesPublies } from "@/lib/blog-serveur";
import { urlSite } from "@/lib/blog";

/*
 * Flux RSS du blog — /blog/rss.xml.
 *
 * Un flux standard pour que les lecteurs et agrégateurs suivent les nouveaux
 * articles. Revalidé à l'heure (et à la demande après une publication, via
 * /api/admin/blog/revalidate).
 */

export const revalidate = 3600;

/** Échappe le texte pour un corps XML sûr. */
function xml(texte: string): string {
  return texte
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const base = urlSite();
  const articles = await lireArticlesPublies();

  const items = articles
    .map((a) => {
      const lien = `${base}/blog/${a.slug}`;
      return `    <item>
      <title>${xml(a.titre)}</title>
      <link>${xml(lien)}</link>
      <guid isPermaLink="true">${xml(lien)}</guid>
      <description>${xml(a.extrait)}</description>
      ${a.categorie ? `<category>${xml(a.categorie.nom)}</category>` : ""}
      <pubDate>${new Date(a.publie_le).toUTCString()}</pubDate>
    </item>`;
    })
    .join("\n");

  const flux = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Blog Docteur 224</title>
    <link>${xml(`${base}/blog`)}</link>
    <description>Actualités, prévention et conseils de la plateforme Docteur 224.</description>
    <language>fr</language>
    <atom:link href="${xml(`${base}/blog/rss.xml`)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  return new Response(flux, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
