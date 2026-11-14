import type { Metadata } from "next";
import PageContenu from "@/components/site/PageContenu";
import BlogAccueil from "@/components/site/BlogAccueil";
import { urlSite } from "@/lib/blog";
import {
  lireArticlesPublies,
  lireArticlesPopulaires,
  lireCategories,
  lireReseauxActifs,
} from "@/lib/blog-serveur";

/*
 * Le blog — articles datés, signés, rangés par catégorie et par sujet.
 *
 * À ne pas confondre avec « Conseils santé » : là-bas, des fiches de prévention
 * stables ; ici, l'actualité de la plateforme et des dossiers qui vivent au fil
 * du temps.
 *
 * Rendu ISR : la page est pré-rendue puis revalidée à intervalle, et
 * revalidée à la demande dès qu'un administrateur publie (voir
 * /api/admin/blog/revalidate). On sert donc une page rapide et déjà prête,
 * sans sacrifier la fraîcheur.
 */

export const revalidate = 600;

const base = urlSite();
const titre = "Blog | Docteur 224";
const description =
  "Actualités de la plateforme, prévention, témoignages et conseils pratiques : le blog de Docteur 224, la plateforme guinéenne de prise de rendez-vous médicaux.";

export const metadata: Metadata = {
  metadataBase: new URL(base),
  title: titre,
  description,
  alternates: { canonical: "/blog", types: { "application/rss+xml": "/blog/rss.xml" } },
  openGraph: {
    title: titre,
    description,
    type: "website",
    url: `${base}/blog`,
    siteName: "Docteur 224",
  },
  twitter: { card: "summary_large_image", title: titre, description },
};

export default async function Blog() {
  const [articles, categories, populaires, reseaux] = await Promise.all([
    lireArticlesPublies(),
    lireCategories(),
    lireArticlesPopulaires(4),
    lireReseauxActifs(),
  ]);

  return (
    <PageContenu
      titre="Le blog"
      emoji="📰"
      large
      chapeau="Actualités de la plateforme, prévention, témoignages et conseils pratiques pour mieux prendre soin de vous."
    >
      <BlogAccueil
        articles={articles}
        categories={categories}
        populaires={populaires}
        reseaux={reseaux}
      />
    </PageContenu>
  );
}
