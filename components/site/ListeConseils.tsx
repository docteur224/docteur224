"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import CarteConseil, { Illustration } from "@/components/site/CarteConseil";
import type { ConseilSante } from "@/lib/conseils-sante";

/*
 * Liste filtrable des conseils santé (recherche + catégories).
 *
 * Le serveur passe toutes les fiches publiées ; le tri, la recherche et le
 * filtre vivent ici, côté client, pour répondre à la frappe sans aller-retour.
 *
 * Hors filtre, on garde la mise en scène éditoriale : une fiche à la une en
 * grand, puis la grille. Dès qu'une recherche ou une catégorie est active, on
 * bascule sur une grille unique de résultats (la « une » n'aurait plus de
 * sens au milieu d'une recherche), avec le nombre de résultats et un retour.
 */

/** Minuscules sans accents : « Prévention » et « prevention » se rejoignent. */
function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Retire les balises HTML du corps pour que la recherche porte sur le texte. */
function sansBalises(html: string): string {
  return html.replace(/<[^>]*>/g, " ");
}

export default function ListeConseils({ conseils }: { conseils: ConseilSante[] }) {
  const [recherche, setRecherche] = useState("");
  const [categorie, setCategorie] = useState<string | null>(null);

  const categories = useMemo(() => {
    const vues = new Set<string>();
    for (const c of conseils) if (c.categorie) vues.add(c.categorie);
    return [...vues].sort((a, b) => a.localeCompare(b, "fr"));
  }, [conseils]);

  const q = normaliser(recherche.trim());
  const filtreActif = q !== "" || categorie !== null;

  const resultats = useMemo(() => {
    return conseils.filter((c) => {
      if (categorie && c.categorie !== categorie) return false;
      if (q) {
        const foin = normaliser(
          `${c.titre} ${c.resume} ${c.categorie ?? ""} ${sansBalises(c.contenu)}`
        );
        if (!foin.includes(q)) return false;
      }
      return true;
    });
  }, [conseils, categorie, q]);

  const vedette = !filtreActif ? conseils.find((c) => c.vedette) ?? conseils[0] ?? null : null;
  const grille = filtreActif ? resultats : conseils.filter((c) => c.id !== vedette?.id);

  function reinitialiser() {
    setRecherche("");
    setCategorie(null);
  }

  return (
    <>
      {/* ===================== Barre recherche + filtres ===================== */}
      <div className="mb-5">
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="m20 20-3.2-3.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un conseil (paludisme, grossesse, tension…)"
            aria-label="Rechercher un conseil santé"
            className="w-full rounded-full border border-line bg-white py-3 pl-11 pr-4 text-[13.5px] text-ink outline-none transition-colors focus:border-teal md:text-[14px]"
          />
          {recherche && (
            <button
              type="button"
              onClick={() => setRecherche("")}
              aria-label="Effacer la recherche"
              className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-bg"
            >
              ×
            </button>
          )}
        </div>

        {categories.length > 0 && (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Puce actif={categorie === null} onClick={() => setCategorie(null)}>
              Toutes
            </Puce>
            {categories.map((c) => (
              <Puce key={c} actif={categorie === c} onClick={() => setCategorie(categorie === c ? null : c)}>
                {c}
              </Puce>
            ))}
          </div>
        )}
      </div>

      {/* ===================== Mise en avant (hors filtre) ===================== */}
      {vedette && (
        <Link
          href={`/conseils-sante/${vedette.slug}`}
          className="group mb-6 grid overflow-hidden rounded-[22px] border border-line bg-white transition-all hover:border-teal-line hover:shadow-[0_26px_60px_-30px_rgba(21,80,107,0.5)] md:mb-8 md:grid-cols-2"
        >
          <div className="md:order-2">
            <Illustration conseil={vedette} hauteur="aspect-[16/10] md:aspect-auto md:h-full md:min-h-[300px]" />
          </div>
          <div className="flex flex-col justify-center p-[20px] md:order-1 md:p-9">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-teal px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.06em] text-white">
              ★ À la une{vedette.categorie ? ` · ${vedette.categorie}` : ""}
            </span>
            <h2 className="mt-3 text-[22px] font-extrabold leading-tight tracking-[-0.3px] text-ink md:text-[28px]">
              {vedette.titre}
            </h2>
            <p className="mt-3 text-[13.5px] leading-relaxed text-muted md:text-[15px]">{vedette.resume}</p>
            <span className="mt-5 inline-flex w-fit items-center gap-2 rounded-[11px] bg-teal px-[18px] py-[11px] text-[13.5px] font-bold text-white transition-colors group-hover:bg-teal-hover">
              En savoir plus
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>
        </Link>
      )}

      {/* ===================== En-tête de section / résultats ===================== */}
      <div className="mb-2.5 mt-6 flex items-baseline justify-between gap-3 first:mt-0 md:mb-3 md:mt-9">
        <h2 className="text-[12px] font-extrabold uppercase tracking-[0.1em] text-muted md:text-[13px]">
          {filtreActif ? "Résultats" : "Tous les conseils"}
        </h2>
        {filtreActif && (
          <button
            type="button"
            onClick={reinitialiser}
            className="text-[12px] font-bold text-teal transition-colors hover:text-teal-hover"
          >
            {grille.length} résultat{grille.length > 1 ? "s" : ""} · Réinitialiser
          </button>
        )}
      </div>

      {/* ===================== Grille ou état vide ===================== */}
      {grille.length > 0 ? (
        <div className="grid gap-3.5 sm:grid-cols-2 md:grid-cols-3 md:gap-5">
          {grille.map((c) => (
            <CarteConseil key={c.id} conseil={c} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-white p-8 text-center">
          <span className="text-[30px]" aria-hidden>
            🔍
          </span>
          <p className="mx-auto mt-2 max-w-[360px] text-[13px] text-muted">
            Aucun conseil ne correspond à votre recherche.
          </p>
          <button
            type="button"
            onClick={reinitialiser}
            className="mt-3 rounded-[10px] border border-line bg-white px-4 py-2 text-[12.5px] font-bold text-blue transition-colors hover:border-teal"
          >
            Voir tous les conseils
          </button>
        </div>
      )}
    </>
  );
}

function Puce({
  actif,
  onClick,
  children,
}: {
  actif: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-none rounded-full border px-3.5 py-2 text-[12.5px] font-bold transition-colors ${
        actif
          ? "border-teal bg-teal text-white"
          : "border-line bg-white text-blue hover:border-teal-line"
      }`}
    >
      {children}
    </button>
  );
}
