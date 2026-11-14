"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import CarteArticle from "@/components/site/CarteArticle";
import CouvertureArticle from "@/components/site/CouvertureArticle";
import SuivezNous from "@/components/site/SuivezNous";
import {
  dateLisible,
  tempsLecture,
  type ArticleBlog,
  type CategorieBlog,
  type ReseauBlog,
} from "@/lib/blog";

/*
 * Page d'accueil du blog — barre latérale de filtres à gauche, articles à
 * droite.
 *
 * Le serveur passe tous les articles publiés (triés du plus récent au plus
 * ancien), les catégories, les plus lus et les liens réseaux. La recherche, le
 * filtre par catégorie et par sujet vivent ici, côté client, pour répondre à
 * la frappe sans aller-retour serveur.
 *
 * Hors filtre, on garde la mise en scène éditoriale : un article « à la une »
 * en grand, puis la grille des derniers articles avec un bouton « Charger
 * plus ». Dès qu'une recherche, une catégorie ou un sujet est actif, on bascule
 * sur une grille unique de résultats.
 */

const PAR_PAGE = 6;

function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function sansBalises(html: string): string {
  return html.replace(/<[^>]*>/g, " ");
}

export default function BlogAccueil({
  articles,
  categories,
  populaires,
  reseaux,
}: {
  articles: ArticleBlog[];
  categories: CategorieBlog[];
  populaires: ArticleBlog[];
  reseaux: ReseauBlog[];
}) {
  const [recherche, setRecherche] = useState("");
  const [categorieSlug, setCategorieSlug] = useState<string | null>(null);
  const [sujet, setSujet] = useState<string | null>(null);
  const [visibles, setVisibles] = useState(PAR_PAGE);

  // Filtres profonds lus dans l'URL APRÈS le montage (jamais au rendu serveur,
  // pour que la page reste pré-rendue avec son contenu complet — bon pour le
  // référencement et le premier affichage). Liens : /blog?sujet=prévention ou
  // /blog?categorie=actualites, posés depuis un article.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const cat = p.get("categorie");
    const suj = p.get("sujet");
    if (cat) setCategorieSlug(cat);
    if (suj) setSujet(suj);
  }, []);

  // Compte d'articles par catégorie (pour la pastille du menu latéral).
  const comptes = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of articles) {
      if (a.categorie_id) m.set(a.categorie_id, (m.get(a.categorie_id) ?? 0) + 1);
    }
    return m;
  }, [articles]);

  // Sujets (tags) les plus présents, pour le filtre.
  const sujets = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of articles) for (const t of a.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t]) => t);
  }, [articles]);

  const q = normaliser(recherche.trim());
  const filtreActif = q !== "" || categorieSlug !== null || sujet !== null;

  const resultats = useMemo(() => {
    return articles.filter((a) => {
      if (categorieSlug && a.categorie?.slug !== categorieSlug) return false;
      if (sujet && !a.tags.some((t) => normaliser(t) === normaliser(sujet))) return false;
      if (q) {
        const foin = normaliser(
          `${a.titre} ${a.extrait} ${a.auteur ?? ""} ${a.categorie?.nom ?? ""} ${a.tags.join(" ")} ${sansBalises(a.contenu)}`
        );
        if (!foin.includes(q)) return false;
      }
      return true;
    });
  }, [articles, categorieSlug, sujet, q]);

  const vedette = !filtreActif ? articles.find((a) => a.vedette) ?? articles[0] ?? null : null;
  const reste = filtreActif ? resultats : articles.filter((a) => a.id !== vedette?.id);
  const affiches = reste.slice(0, visibles);

  function reinitialiser() {
    setRecherche("");
    setCategorieSlug(null);
    setSujet(null);
    setVisibles(PAR_PAGE);
  }

  function choisirCategorie(slug: string | null) {
    setCategorieSlug(slug);
    setVisibles(PAR_PAGE);
  }

  function choisirSujet(t: string | null) {
    setSujet(t);
    setVisibles(PAR_PAGE);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[clamp(240px,26%,300px)_1fr] lg:gap-8">
      {/* ===================== Barre latérale ===================== */}
      <aside className="flex flex-col gap-5 lg:sticky lg:top-[84px] lg:self-start">
        {/* Recherche */}
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
            onChange={(e) => {
              setRecherche(e.target.value);
              setVisibles(PAR_PAGE);
            }}
            placeholder="Rechercher un article…"
            aria-label="Rechercher un article du blog"
            className="w-full rounded-full border border-line bg-white py-3 pl-11 pr-4 text-[13.5px] text-ink outline-none transition-colors focus:border-teal"
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

        {/* Catégories */}
        {categories.length > 0 && (
          <nav aria-label="Catégories du blog" className="rounded-2xl border border-line bg-white p-[14px]">
            <h2 className="mb-2 px-1.5 text-[12px] font-extrabold uppercase tracking-[0.1em] text-muted">
              Catégories
            </h2>
            <ul className="flex flex-col gap-0.5">
              <li>
                <button
                  type="button"
                  onClick={() => choisirCategorie(null)}
                  aria-pressed={categorieSlug === null}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[13px] font-semibold transition-colors ${
                    categorieSlug === null ? "bg-teal-soft text-blue" : "text-ink hover:bg-bg"
                  }`}
                >
                  <span>Toutes</span>
                  <span className="text-[11.5px] text-muted">{articles.length}</span>
                </button>
              </li>
              {categories.map((c) => {
                const n = comptes.get(c.id) ?? 0;
                const actif = categorieSlug === c.slug;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => choisirCategorie(actif ? null : c.slug)}
                      aria-pressed={actif}
                      className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-[13px] font-semibold transition-colors ${
                        actif ? "bg-teal-soft text-blue" : "text-ink hover:bg-bg"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {c.emoji && <span aria-hidden>{c.emoji}</span>}
                        {c.nom}
                      </span>
                      <span className="text-[11.5px] text-muted">{n}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}

        {/* Sujets (tags) */}
        {sujets.length > 0 && (
          <div className="rounded-2xl border border-line bg-white p-[14px]">
            <h2 className="mb-2.5 px-1.5 text-[12px] font-extrabold uppercase tracking-[0.1em] text-muted">
              Sujets
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {sujets.map((t) => {
                const actif = sujet !== null && normaliser(sujet) === normaliser(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => choisirSujet(actif ? null : t)}
                    aria-pressed={actif}
                    className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                      actif
                        ? "border-teal bg-teal text-white"
                        : "border-line bg-white text-blue hover:border-teal-line"
                    }`}
                  >
                    #{t}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Articles populaires */}
        {populaires.length > 0 && (
          <section aria-labelledby="populaires-titre" className="rounded-2xl border border-line bg-white p-[14px]">
            <h2
              id="populaires-titre"
              className="mb-2.5 px-1.5 text-[12px] font-extrabold uppercase tracking-[0.1em] text-muted"
            >
              Articles populaires
            </h2>
            <ol className="flex flex-col">
              {populaires.map((a, i) => (
                <li key={a.id}>
                  <Link
                    href={`/blog/${a.slug}`}
                    className="group flex items-start gap-3 rounded-xl px-1.5 py-2 transition-colors hover:bg-bg"
                  >
                    <span
                      aria-hidden
                      className="grid h-6 w-6 flex-none place-items-center rounded-full bg-teal-soft text-[12px] font-extrabold text-blue"
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-ink transition-colors group-hover:text-teal">
                        {a.titre}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-muted">
                        {tempsLecture(a.contenu, a.extrait)} min · {dateLisible(a.publie_le)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Réseaux sociaux */}
        <SuivezNous reseaux={reseaux} />
      </aside>

      {/* ===================== Contenu ===================== */}
      <div className="min-w-0">
        {/* À la une (hors filtre) */}
        {vedette && (
          <Link
            href={`/blog/${vedette.slug}`}
            className="group mb-7 grid overflow-hidden rounded-[22px] border border-line bg-white transition-all hover:border-teal-line hover:shadow-[0_26px_60px_-30px_rgba(21,80,107,0.5)] md:grid-cols-2"
          >
            <div className="md:order-2">
              <CouvertureArticle
                article={vedette}
                hauteur="aspect-[16/10] md:aspect-auto md:h-full md:min-h-[320px]"
                sizes="(min-width: 768px) 50vw, 100vw"
                priority
              />
            </div>
            <div className="flex flex-col justify-center p-[20px] md:order-1 md:p-9">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-teal px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.06em] text-white">
                ★ À la une{vedette.categorie ? ` · ${vedette.categorie.nom}` : ""}
              </span>
              <h2 className="mt-3 text-[22px] font-extrabold leading-tight tracking-[-0.3px] text-ink md:text-[28px]">
                {vedette.titre}
              </h2>
              <p className="mt-3 text-[13.5px] leading-relaxed text-muted md:text-[15px]">
                {vedette.extrait}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
                <time dateTime={vedette.publie_le}>{dateLisible(vedette.publie_le)}</time>
                <span aria-hidden>·</span>
                <span>{tempsLecture(vedette.contenu, vedette.extrait)} min de lecture</span>
              </div>
              <span className="mt-5 inline-flex w-fit items-center gap-2 rounded-[11px] bg-teal px-[18px] py-[11px] text-[13.5px] font-bold text-white transition-colors group-hover:bg-teal-hover">
                Lire l’article
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </div>
          </Link>
        )}

        {/* En-tête de section / résultats */}
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-[12px] font-extrabold uppercase tracking-[0.1em] text-muted md:text-[13px]">
            {filtreActif ? "Résultats" : "Derniers articles"}
          </h2>
          {filtreActif && (
            <button
              type="button"
              onClick={reinitialiser}
              className="text-[12px] font-bold text-teal transition-colors hover:text-teal-hover"
            >
              {reste.length} résultat{reste.length > 1 ? "s" : ""} · Réinitialiser
            </button>
          )}
        </div>

        {/* Grille ou état vide */}
        {affiches.length > 0 ? (
          <>
            <div data-reveal-stagger className="grid gap-4 sm:grid-cols-2 md:gap-5">
              {affiches.map((a, i) => (
                <CarteArticle
                  key={a.id}
                  article={a}
                  sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
                  priority={!vedette && i === 0}
                />
              ))}
            </div>
            {visibles < reste.length && (
              <div className="mt-7 flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisibles((v) => v + PAR_PAGE)}
                  className="rounded-full border-[1.5px] border-line bg-white px-6 py-3 text-[13.5px] font-bold text-blue transition-colors hover:border-teal"
                >
                  Charger plus d’articles
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-2xl border border-line bg-white p-8 text-center">
            <span className="text-[30px]" aria-hidden>
              🔍
            </span>
            <p className="mx-auto mt-2 max-w-[360px] text-[13px] text-muted">
              Aucun article ne correspond à votre recherche.
            </p>
            <button
              type="button"
              onClick={reinitialiser}
              className="mt-3 rounded-[10px] border border-line bg-white px-4 py-2 text-[12.5px] font-bold text-blue transition-colors hover:border-teal"
            >
              Voir tous les articles
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
