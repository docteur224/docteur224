import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageContenu, { AppelAction } from "@/components/site/PageContenu";
import CarteConseil, { Illustration } from "@/components/site/CarteConseil";
import PartageSocial from "@/components/site/PartageSocial";
import { estHtml, paragraphes } from "@/lib/conseils-sante";
import { nettoyerHtmlConseil } from "@/lib/html-sante";
import { lireConseilParSlug, lireConseilsPublies } from "@/lib/conseils-sante-serveur";

/*
 * Le détail d'un conseil santé — la page « En savoir plus ».
 *
 * Même chrome éditorial que la liste (PageContenu) : le titre et le résumé
 * coiffent la page dans le bandeau dégradé, puis vient l'article — image,
 * corps, gestes clés, « quand consulter » — suivi du partage et de quelques
 * fiches à lire ensuite.
 *
 * Les métadonnées (Open Graph) portent le titre, le résumé et l'image : un
 * lien partagé sur WhatsApp ou Facebook s'affiche alors en bel aperçu, pas en
 * URL nue.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const conseil = await lireConseilParSlug(slug);
  if (!conseil) {
    return { title: "Conseil santé | Docteur 224" };
  }
  const titre = `${conseil.titre} | Conseils santé`;
  return {
    title: titre,
    description: conseil.resume,
    openGraph: {
      title: conseil.titre,
      description: conseil.resume,
      type: "article",
      ...(conseil.image_url ? { images: [{ url: conseil.image_url }] } : {}),
    },
  };
}

export default async function DetailConseil({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const conseil = await lireConseilParSlug(slug);
  if (!conseil) notFound();

  const riche = estHtml(conseil.contenu);
  const corps = riche ? [] : paragraphes(conseil.contenu);

  // À lire aussi : d'abord la même catégorie, puis le reste, jamais la fiche
  // en cours. Trois suffisent à ouvrir une porte sans noyer la lecture.
  const tous = await lireConseilsPublies();
  const autres = tous.filter((c) => c.slug !== conseil.slug);
  const aLireAussi = [
    ...autres.filter((c) => c.categorie && c.categorie === conseil.categorie),
    ...autres.filter((c) => !c.categorie || c.categorie !== conseil.categorie),
  ].slice(0, 3);

  return (
    <PageContenu titre={conseil.titre} emoji={conseil.emoji ?? "🌿"} chapeau={conseil.resume}>
      {/* Fil d'Ariane */}
      <Link
        href="/conseils-sante"
        className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-muted transition-colors hover:text-teal"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M19 12H5M11 18l-6-6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Tous les conseils santé
      </Link>

      {/* Illustration de tête */}
      <div className="group overflow-hidden rounded-[22px] border border-line">
        <Illustration conseil={conseil} hauteur="aspect-[16/9]" />
      </div>

      {conseil.categorie && (
        <span className="mt-5 inline-flex rounded-full bg-teal-soft px-3 py-1 text-[11px] font-bold uppercase tracking-[0.05em] text-blue">
          {conseil.categorie}
        </span>
      )}

      {/* Corps de l'article */}
      {riche ? (
        // HTML rédigé dans l'éditeur riche, repassé par la liste blanche au
        // rendu (le contenu est servi à des visiteurs anonymes).
        <article
          className="prose-sante mt-4"
          dangerouslySetInnerHTML={{ __html: nettoyerHtmlConseil(conseil.contenu) }}
        />
      ) : (
        <article className="mt-4">
          {corps.map((p, i) => (
            <p
              key={i}
              className={`text-[14px] leading-[1.75] text-ink md:text-[15.5px] ${i > 0 ? "mt-4" : ""} ${
                i === 0
                  ? "first-letter:float-left first-letter:mr-2 first-letter:text-[46px] first-letter:font-extrabold first-letter:leading-[0.85] first-letter:text-teal"
                  : ""
              }`}
            >
              {p}
            </p>
          ))}
        </article>
      )}

      {/* Les gestes clés */}
      {conseil.gestes.length > 0 && (
        <div className="mt-6 rounded-2xl border border-teal-line bg-teal-soft p-[18px] md:p-6">
          <b className="block text-[14px] font-extrabold text-blue md:text-[15px]">Les gestes clés</b>
          <ul className="mt-3 flex flex-col gap-2.5">
            {conseil.gestes.map((g) => (
              <li key={g} className="flex gap-2.5 text-[13px] leading-relaxed text-ink md:text-[14px]">
                <span
                  aria-hidden
                  className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full bg-teal text-[11px] font-bold text-white"
                >
                  ✓
                </span>
                {g}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Quand consulter */}
      {conseil.quand_consulter && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-blue-line bg-white p-[18px] md:p-5">
          <span
            aria-hidden
            className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-blue text-[16px] text-white"
          >
            🩺
          </span>
          <p className="text-[13px] leading-relaxed text-ink md:text-[14px]">
            <b className="text-blue">Quand consulter · </b>
            {conseil.quand_consulter}
          </p>
        </div>
      )}

      {/* Partage */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-[16px] md:p-5">
        <b className="text-[13px] font-extrabold text-blue md:text-[14px]">
          Ces conseils peuvent aider un proche
        </b>
        <PartageSocial titre={`${conseil.titre} — Docteur 224`} compact />
      </div>

      {/* À lire aussi */}
      {aLireAussi.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-[12px] font-extrabold uppercase tracking-[0.1em] text-muted md:text-[13px]">
            À lire aussi
          </h2>
          <div className="grid gap-3.5 sm:grid-cols-2 md:grid-cols-3">
            {aLireAussi.map((c) => (
              <CarteConseil key={c.id} conseil={c} />
            ))}
          </div>
        </>
      )}

      <AppelAction
        titre="Un doute sur un symptôme ?"
        texte="Un médecin généraliste est le bon premier interlocuteur : il oriente ensuite vers le spécialiste s’il y a lieu."
      >
        <Link
          href="/resultats?specialite=M%C3%A9decine%20g%C3%A9n%C3%A9rale"
          className="pointer-coarse:py-3 rounded-[11px] bg-teal px-[18px] py-[11px] text-[13.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
        >
          Trouver un généraliste
        </Link>
        <Link
          href="/faq"
          className="rounded-[11px] border-[1.5px] border-line bg-white px-[18px] py-[11px] text-[13.5px] font-bold text-blue transition-colors hover:bg-bg"
        >
          Questions fréquentes
        </Link>
      </AppelAction>
    </PageContenu>
  );
}
