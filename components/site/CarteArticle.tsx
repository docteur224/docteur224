import Link from "next/link";
import CouvertureArticle from "@/components/site/CouvertureArticle";
import { AUTEUR_DEFAUT, dateLisible, tempsLecture, type ArticleBlog } from "@/lib/blog";

/*
 * Carte d'un article — l'unité d'affichage de la liste, des archives de
 * catégorie et des « À lire aussi ». Composant de rendu pur (pas d'état) : il
 * s'affiche aussi bien côté serveur.
 *
 * Image, catégorie, titre, extrait, puis une ligne de méta : date, temps de
 * lecture, auteur. Élévation douce au survol, reprise de la carte conseil pour
 * que le blog reste de la même famille visuelle.
 */
export default function CarteArticle({
  article,
  sizes,
  priority = false,
}: {
  article: ArticleBlog;
  sizes?: string;
  priority?: boolean;
}) {
  return (
    <Link
      href={`/blog/${article.slug}`}
      data-reveal
      className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-white transition-all hover:-translate-y-1 hover:border-teal-line hover:shadow-[0_18px_40px_-24px_rgba(21,80,107,0.45)]"
    >
      <CouvertureArticle article={article} sizes={sizes} priority={priority} />
      <div className="flex flex-1 flex-col p-[16px] md:p-[18px]">
        {article.categorie && (
          <span className="mb-2 inline-flex w-fit rounded-full bg-teal-soft px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.05em] text-blue">
            {article.categorie.nom}
          </span>
        )}
        <h3 className="text-[15.5px] font-extrabold leading-snug text-ink md:text-[16.5px]">
          {article.titre}
        </h3>
        <p className="mt-2 line-clamp-3 flex-1 text-[12.5px] leading-relaxed text-muted md:text-[13.5px]">
          {article.extrait}
        </p>
        <div className="mt-3.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted">
          <time dateTime={article.publie_le}>{dateLisible(article.publie_le)}</time>
          <span aria-hidden>·</span>
          <span>{tempsLecture(article.contenu, article.extrait)} min de lecture</span>
        </div>
        <span className="mt-1 text-[11.5px] font-semibold text-blue">
          {article.auteur || AUTEUR_DEFAUT}
        </span>
      </div>
    </Link>
  );
}
