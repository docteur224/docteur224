import Link from "next/link";
import type { ConseilSante } from "@/lib/conseils-sante";

/*
 * Carte d'un conseil santé — l'unité d'affichage de la liste et des « À lire
 * aussi » en pied de fiche. Composant de rendu pur (pas d'état) : il s'affiche
 * aussi bien côté serveur.
 *
 * L'illustration est servie par Cloudinary, déjà dimensionnée à l'envoi : on
 * la pose en <img> (next/image n'apporterait rien et imposerait de déclarer le
 * domaine). Sans image, on retombe sur un dégradé maison et le gros emoji —
 * jamais de carte vide, jamais de trou gris.
 */

export default function CarteConseil({ conseil }: { conseil: ConseilSante }) {
  return (
    <Link
      href={`/conseils-sante/${conseil.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-white transition-all hover:-translate-y-1 hover:border-teal-line hover:shadow-[0_18px_40px_-24px_rgba(21,80,107,0.45)]"
    >
      <Illustration conseil={conseil} />
      <div className="flex flex-1 flex-col p-[16px] md:p-[18px]">
        {conseil.categorie && (
          <span className="mb-2 inline-flex w-fit rounded-full bg-teal-soft px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.05em] text-blue">
            {conseil.categorie}
          </span>
        )}
        <h3 className="text-[15.5px] font-extrabold leading-snug text-ink md:text-[16.5px]">
          {conseil.titre}
        </h3>
        <p className="mt-2 line-clamp-3 flex-1 text-[12.5px] leading-relaxed text-muted md:text-[13.5px]">
          {conseil.resume}
        </p>
        <span className="mt-3.5 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-teal transition-colors group-hover:text-teal-hover md:text-[13px]">
          En savoir plus
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
            className="transition-transform group-hover:translate-x-0.5"
          >
            <path
              d="M5 12h14M13 6l6 6-6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
    </Link>
  );
}

/** La zone d'image, en 16/10, avec repli dégradé + emoji. */
export function Illustration({
  conseil,
  hauteur = "aspect-[16/10]",
}: {
  conseil: ConseilSante;
  hauteur?: string;
}) {
  if (conseil.image_url) {
    return (
      <div className={`relative ${hauteur} w-full overflow-hidden bg-teal-soft`}>
        {/* URL Cloudinary dimensionnée à l'envoi. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={conseil.image_url}
          alt={conseil.titre}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {conseil.emoji && (
          <span className="absolute left-3 top-3 grid h-9 w-9 place-items-center rounded-xl bg-white/90 text-[18px] shadow-sm backdrop-blur-sm">
            {conseil.emoji}
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
        {conseil.emoji ?? "🌿"}
      </span>
    </div>
  );
}
