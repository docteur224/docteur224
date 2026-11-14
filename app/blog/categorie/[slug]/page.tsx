import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageContenu from "@/components/site/PageContenu";
import CarteArticle from "@/components/site/CarteArticle";
import { urlSite } from "@/lib/blog";
import {
  lireArticlesPublies,
  lireCategories,
  slugsCategories,
} from "@/lib/blog-serveur";

/*
 * Archive d'une catégorie du blog — tous les articles publiés d'une rubrique.
 *
 * Une page par catégorie, utile au référencement (une adresse stable par
 * thème) et à la navigation. Rendu ISR, comme le reste du blog.
 */

export const revalidate = 600;

export async function generateStaticParams() {
  const slugs = await slugsCategories();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const categories = await lireCategories();
  const categorie = categories.find((c) => c.slug === slug);
  if (!categorie) return { title: "Catégorie | Blog Docteur 224" };

  const base = urlSite();
  const titre = `${categorie.nom} | Blog Docteur 224`;
  const description =
    categorie.description ?? `Les articles de la catégorie « ${categorie.nom} » sur le blog de Docteur 224.`;

  return {
    metadataBase: new URL(base),
    title: titre,
    description,
    alternates: { canonical: `/blog/categorie/${categorie.slug}` },
    openGraph: { title: titre, description, type: "website", url: `${base}/blog/categorie/${categorie.slug}`, siteName: "Docteur 224" },
    twitter: { card: "summary", title: titre, description },
  };
}

export default async function CategorieBlogPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [categories, tous] = await Promise.all([lireCategories(), lireArticlesPublies()]);
  const categorie = categories.find((c) => c.slug === slug);
  if (!categorie) notFound();

  const articles = tous.filter((a) => a.categorie?.slug === slug);

  return (
    <PageContenu
      titre={categorie.nom}
      emoji={categorie.emoji ?? "📰"}
      large
      chapeau={categorie.description ?? undefined}
    >
      {/* Fil d'Ariane */}
      <nav aria-label="Fil d’Ariane" className="mb-5 flex flex-wrap items-center gap-1.5 text-[12.5px] font-bold text-muted">
        <Link href="/blog" className="inline-flex items-center gap-1.5 transition-colors hover:text-teal">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M19 12H5M11 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Tous les articles
        </Link>
        <span aria-hidden>/</span>
        <span className="text-ink">{categorie.nom}</span>
      </nav>

      {articles.length > 0 ? (
        <div data-reveal-stagger className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 md:gap-5">
          {articles.map((a, i) => (
            <CarteArticle
              key={a.id}
              article={a}
              sizes="(min-width: 768px) 33vw, 100vw"
              priority={i === 0}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-white p-8 text-center">
          <span className="text-[30px]" aria-hidden>
            📭
          </span>
          <p className="mx-auto mt-2 max-w-[360px] text-[13px] text-muted">
            Aucun article publié dans cette catégorie pour l’instant.
          </p>
          <Link
            href="/blog"
            className="mt-3 inline-block rounded-[10px] border border-line bg-white px-4 py-2 text-[12.5px] font-bold text-blue transition-colors hover:border-teal"
          >
            Voir tous les articles
          </Link>
        </div>
      )}
    </PageContenu>
  );
}
