import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageContenu, { AppelAction } from "@/components/site/PageContenu";
import CarteArticle from "@/components/site/CarteArticle";
import CouvertureArticle from "@/components/site/CouvertureArticle";
import PartageSocial from "@/components/site/PartageSocial";
import VueArticle from "@/components/site/VueArticle";
import { nettoyerHtmlConseil } from "@/lib/html-sante";
import { AUTEUR_DEFAUT, dateLisible, tempsLecture, urlSite } from "@/lib/blog";
import {
  lireArticlePublie,
  lireArticlesPublies,
  slugsArticlesPublies,
} from "@/lib/blog-serveur";

/*
 * La page d'un article de blog.
 *
 * Lecture confortable : colonne étroite (PageContenu sans `large`), image de
 * couverture, fil d'Ariane, corps aéré, mots-clés, partage, puis des articles
 * à lire ensuite. Les métadonnées (Open Graph + Twitter) portent le titre,
 * l'extrait et la couverture, pour un bel aperçu quand le lien est partagé.
 *
 * Rendu ISR : les slugs connus sont pré-rendus (generateStaticParams), les
 * nouveaux à la première visite, puis mis en cache. Un article dépublié ou
 * supprimé renvoie un 404 propre.
 */

export const revalidate = 600;

export async function generateStaticParams() {
  const slugs = await slugsArticlesPublies();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await lireArticlePublie(slug);
  if (!article) return { title: "Article | Blog Docteur 224" };

  const base = urlSite();
  const titre = `${article.titre} | Blog Docteur 224`;
  const images = article.couverture_url ? [{ url: article.couverture_url }] : undefined;

  return {
    metadataBase: new URL(base),
    title: titre,
    description: article.extrait,
    alternates: { canonical: `/blog/${article.slug}` },
    openGraph: {
      title: article.titre,
      description: article.extrait,
      type: "article",
      url: `${base}/blog/${article.slug}`,
      siteName: "Docteur 224",
      publishedTime: article.publie_le,
      authors: [article.auteur || AUTEUR_DEFAUT],
      ...(article.categorie ? { section: article.categorie.nom } : {}),
      tags: article.tags,
      ...(images ? { images } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: article.titre,
      description: article.extrait,
      ...(images ? { images: images.map((i) => i.url) } : {}),
    },
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await lireArticlePublie(slug);
  if (!article) notFound();

  // À lire aussi : d'abord la même catégorie, puis le reste, jamais l'article
  // en cours. Trois suffisent à ouvrir une porte sans noyer la lecture.
  const tous = await lireArticlesPublies();
  const autres = tous.filter((a) => a.slug !== article.slug);
  const aLireAussi = [
    ...autres.filter((a) => a.categorie_id && a.categorie_id === article.categorie_id),
    ...autres.filter((a) => !a.categorie_id || a.categorie_id !== article.categorie_id),
  ].slice(0, 3);

  const base = urlSite();
  const auteur = article.auteur || AUTEUR_DEFAUT;

  // Donnée structurée (JSON-LD) : aide les moteurs à comprendre l'article.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.titre,
    description: article.extrait,
    datePublished: article.publie_le,
    dateModified: article.maj_le ?? article.publie_le,
    author: { "@type": "Organization", name: auteur },
    publisher: { "@type": "Organization", name: "Docteur 224" },
    mainEntityOfPage: `${base}/blog/${article.slug}`,
    ...(article.couverture_url ? { image: article.couverture_url } : {}),
    ...(article.categorie ? { articleSection: article.categorie.nom } : {}),
  };

  return (
    <PageContenu titre={article.titre} emoji={article.categorie?.emoji ?? "📰"} chapeau={article.extrait}>
      <VueArticle slug={article.slug} />
      {/* Donnée structurée pour le référencement. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Fil d'Ariane */}
      <nav aria-label="Fil d’Ariane" className="mb-4 flex flex-wrap items-center gap-1.5 text-[12.5px] font-bold text-muted">
        <Link href="/blog" className="inline-flex items-center gap-1.5 transition-colors hover:text-teal">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M19 12H5M11 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Blog
        </Link>
        {article.categorie && (
          <>
            <span aria-hidden>/</span>
            <Link
              href={`/blog/categorie/${article.categorie.slug}`}
              className="transition-colors hover:text-teal"
            >
              {article.categorie.nom}
            </Link>
          </>
        )}
      </nav>

      {/* Couverture */}
      <div className="group overflow-hidden rounded-[22px] border border-line">
        <CouvertureArticle
          article={article}
          hauteur="aspect-[16/9]"
          sizes="(min-width: 768px) 760px, 100vw"
          priority
        />
      </div>

      {/* Méta : catégorie, date, lecture, auteur */}
      <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
        {article.categorie && (
          <Link
            href={`/blog/categorie/${article.categorie.slug}`}
            className="inline-flex rounded-full bg-teal-soft px-3 py-1 text-[11px] font-bold uppercase tracking-[0.05em] text-blue transition-colors hover:bg-teal-line"
          >
            {article.categorie.nom}
          </Link>
        )}
        <span className="text-[12.5px] text-muted">
          <time dateTime={article.publie_le}>{dateLisible(article.publie_le)}</time>
          {" · "}
          {tempsLecture(article.contenu, article.extrait)} min de lecture
          {" · "}
          Par {auteur}
        </span>
      </div>

      {/* Corps de l'article (HTML repassé par la liste blanche, servi à des anonymes) */}
      <article
        className="prose-sante mt-5"
        dangerouslySetInnerHTML={{ __html: nettoyerHtmlConseil(article.contenu) }}
      />

      {/* Mots-clés */}
      {article.tags.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {article.tags.map((t) => (
            <Link
              key={t}
              href={`/blog?sujet=${encodeURIComponent(t)}`}
              className="rounded-full border border-line bg-white px-3 py-1.5 text-[12px] font-semibold text-blue transition-colors hover:border-teal-line"
            >
              #{t}
            </Link>
          ))}
        </div>
      )}

      {/* Partage */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-[16px] md:p-5">
        <b className="text-[13px] font-extrabold text-blue md:text-[14px]">
          Cet article peut intéresser un proche
        </b>
        <PartageSocial titre={`${article.titre} — Docteur 224`} compact />
      </div>

      {/* À lire aussi */}
      {aLireAussi.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-[12px] font-extrabold uppercase tracking-[0.1em] text-muted md:text-[13px]">
            À lire aussi
          </h2>
          <div data-reveal-stagger className="grid gap-3.5 sm:grid-cols-2 md:grid-cols-3">
            {aLireAussi.map((a) => (
              <CarteArticle key={a.id} article={a} sizes="(min-width: 768px) 33vw, 100vw" />
            ))}
          </div>
        </>
      )}

      <AppelAction
        titre="Besoin d’un médecin ?"
        texte="Trouvez un praticien près de chez vous et prenez rendez-vous en quelques minutes, gratuitement."
      >
        <Link
          href="/resultats"
          className="pointer-coarse:py-3 rounded-[11px] bg-teal px-[18px] py-[11px] text-[13.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
        >
          Prendre rendez-vous
        </Link>
        <Link
          href="/conseils-sante"
          className="rounded-[11px] border-[1.5px] border-line bg-white px-[18px] py-[11px] text-[13.5px] font-bold text-blue transition-colors hover:bg-bg"
        >
          Voir les conseils santé
        </Link>
      </AppelAction>
    </PageContenu>
  );
}
