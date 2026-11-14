import Image from "next/image";
import type { ArticleBlog } from "@/lib/blog";

/*
 * Couverture d'un article — image optimisée (next/image) avec repli.
 *
 * L'image vient de Cloudinary, déjà bornée à 1600×900 à l'envoi. next/image la
 * sert en WebP/AVIF, en tailles responsives, et réserve la place (ratio fixe)
 * pour ne pas provoquer de décalage de mise en page (CLS). Sans couverture, on
 * retombe sur un dégradé maison et le gros emoji de la catégorie — jamais de
 * carte vide, jamais de trou gris.
 *
 * `priority` est réservé à la grande image en tête de page (le LCP) : partout
 * ailleurs, le chargement reste différé.
 */
export default function CouvertureArticle({
  article,
  hauteur = "aspect-[16/10]",
  sizes = "(min-width: 768px) 33vw, 100vw",
  priority = false,
}: {
  article: ArticleBlog;
  hauteur?: string;
  sizes?: string;
  priority?: boolean;
}) {
  const emoji = article.categorie?.emoji ?? "📰";

  if (article.couverture_url) {
    return (
      <div className={`relative ${hauteur} w-full overflow-hidden bg-teal-soft`}>
        <Image
          src={article.couverture_url}
          alt={article.titre}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {article.categorie?.emoji && (
          <span className="absolute left-3 top-3 grid h-9 w-9 place-items-center rounded-xl bg-white/90 text-[18px] shadow-sm backdrop-blur-sm">
            {article.categorie.emoji}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={`relative ${hauteur} w-full overflow-hidden`}
      style={{ background: "linear-gradient(145deg, var(--teal-soft), var(--blue-line))" }}
    >
      <span className="absolute inset-0 grid place-items-center text-[52px] opacity-90 transition-transform duration-500 group-hover:scale-110">
        {emoji}
      </span>
    </div>
  );
}
