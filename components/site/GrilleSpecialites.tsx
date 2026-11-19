"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { SPECIALITES_ACCUEIL } from "@/lib/catalogue-specialites";

/*
 * Section « Spécialités courantes » / « Trouvez le bon spécialiste » de
 * l'accueil, web et mobile.
 *
 * Deux niveaux de lecture :
 *   1. La vitrine — un échantillon trié par demande (`specialites`, les
 *      spécialités où un professionnel est réellement inscrit). Carrousel
 *      horizontal sur mobile, grille centrée sur web.
 *   2. « Voir tout » déplie la vitrine sur place, puis « Voir toutes les
 *      spécialités » ouvre un écran plein : recherche + navigation A–Z sur le
 *      référentiel complet (`catalogue`, ce que l'admin a ouvert). On ne liste
 *      jamais le catalogue d'aide à la saisie (130 entrées) : chaque vignette
 *      doit mener à une vraie page de résultats, pas à du vide.
 *
 * Client, pour l'état « déplié » et l'écran plein ; les deux listes sont
 * calculées sur le serveur et rendues telles quelles au premier affichage.
 */

export interface SpecialiteVedette {
  nom: string;
  emoji: string;
}

const normaliser = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function GrilleSpecialites({
  specialites,
  catalogue = [],
  variante,
  maximum = SPECIALITES_ACCUEIL,
}: {
  specialites: SpecialiteVedette[];
  /** Référentiel complet, pour l'écran plein « Toutes les spécialités ». */
  catalogue?: SpecialiteVedette[];
  variante: "web" | "mobile";
  maximum?: number;
}) {
  const [tout, setTout] = useState(false);
  const [ouvert, setOuvert] = useState(false);
  const [requete, setRequete] = useState("");
  const [lettre, setLettre] = useState("TOUT");
  const champRef = useRef<HTMLInputElement>(null);
  const declencheurRef = useRef<HTMLButtonElement>(null);

  const visibles = tout ? specialites : specialites.slice(0, maximum);
  const aDesSpecialites = specialites.length > 0;
  // Sans référentiel distinct, pas d'écran « toutes les spécialités ».
  const ouvrable = catalogue.length > 0;

  // Lettres réellement présentes dans le référentiel, pour la bande A–Z.
  const lettres = useMemo(() => {
    const set = new Set(
      catalogue.map((s) => normaliser(s.nom).charAt(0).toUpperCase())
    );
    return [...set].filter((l) => /[A-Z]/.test(l)).sort();
  }, [catalogue]);

  // Filtrage (recherche OU lettre) puis regroupement par initiale.
  const groupes = useMemo(() => {
    const q = normaliser(requete.trim());
    const filtres = catalogue.filter((s) => {
      const okRecherche = !q || normaliser(s.nom).includes(q);
      const okLettre =
        q !== "" ||
        lettre === "TOUT" ||
        normaliser(s.nom).charAt(0).toUpperCase() === lettre;
      return okRecherche && okLettre;
    });
    filtres.sort((a, b) =>
      a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" })
    );
    const map = new Map<string, SpecialiteVedette[]>();
    for (const s of filtres) {
      const l = normaliser(s.nom).charAt(0).toUpperCase();
      const arr = map.get(l);
      if (arr) arr.push(s);
      else map.set(l, [s]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [catalogue, requete, lettre]);

  const total = useMemo(
    () => groupes.reduce((n, [, items]) => n + items.length, 0),
    [groupes]
  );

  function ouvrir() {
    setRequete("");
    setLettre("TOUT");
    setOuvert(true);
  }
  function fermer() {
    setOuvert(false);
    // Rend la main au bouton d'où l'on vient, pour le clavier.
    declencheurRef.current?.focus();
  }

  // Verrou de défilement du fond + focus + Échap, tant que l'écran est ouvert.
  useEffect(() => {
    if (!ouvert) return;
    document.body.classList.add("spec-overlay-ouvert");
    const t = window.setTimeout(() => champRef.current?.focus(), 60);
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") fermer();
    };
    document.addEventListener("keydown", surTouche);
    return () => {
      document.body.classList.remove("spec-overlay-ouvert");
      window.clearTimeout(t);
      document.removeEventListener("keydown", surTouche);
    };
  }, [ouvert]);

  // Écran plein partagé par les deux variantes (une seule est visible à la
  // fois : l'autre instance est en display:none, son overlay ne s'ouvre pas).
  const ecranPlein =
    ouvrable && ouvert ? (
      <div
        className="spec-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Toutes les spécialités"
      >
        <div className="spec-overlay-shell">
          <header className="spec-overlay-top">
            <button
              type="button"
              className="spec-overlay-back"
              aria-label="Retour"
              onClick={fermer}
            >
              ←
            </button>
            <div className="spec-overlay-head">
              <h2>Toutes les spécialités</h2>
              <p>Recherchez ou parcourez par ordre alphabétique</p>
            </div>
          </header>

          <main className="spec-overlay-content">
            <div className="spec-overlay-search">
              <label className="spec-overlay-searchbox">
                <span aria-hidden>🔎</span>
                <input
                  ref={champRef}
                  type="search"
                  placeholder="Rechercher une spécialité..."
                  autoComplete="off"
                  value={requete}
                  onChange={(e) => {
                    setRequete(e.target.value);
                    if (e.target.value) setLettre("TOUT");
                  }}
                />
              </label>
            </div>

            <div className="spec-overlay-meta">
              <span>
                {total} {total > 1 ? "spécialités" : "spécialité"}
              </span>
              <span>Classement A–Z</span>
            </div>

            <div className="spec-alpha" aria-label="Filtrer par lettre">
              {["TOUT", ...lettres].map((l) => (
                <button
                  key={l}
                  type="button"
                  className={`spec-alpha-btn${l === lettre ? " actif" : ""}`}
                  aria-pressed={l === lettre}
                  onClick={() => {
                    setLettre(l);
                    setRequete("");
                  }}
                >
                  {l === "TOUT" ? "Tout" : l}
                </button>
              ))}
            </div>

            {total === 0 ? (
              <div className="spec-vide">
                <div style={{ fontSize: 32, marginBottom: 8 }} aria-hidden>
                  🔎
                </div>
                <strong>Aucune spécialité trouvée</strong>
                <div style={{ fontSize: 12, marginTop: 5 }}>
                  Essayez un autre mot-clé.
                </div>
              </div>
            ) : (
              groupes.map(([l, items]) => (
                <section key={l} className="spec-groupe">
                  <h3 className="spec-groupe-titre">{l}</h3>
                  <div className="spec-grid">
                    {items.map((s) => (
                      <Link
                        key={s.nom}
                        href={`/resultats?specialite=${encodeURIComponent(s.nom)}`}
                        className="spec-grid-card"
                      >
                        <span className="em" aria-hidden>
                          {s.emoji}
                        </span>
                        <span>{s.nom}</span>
                      </Link>
                    ))}
                  </div>
                </section>
              ))
            )}
          </main>
        </div>
      </div>
    ) : null;

  if (variante === "mobile") {
    return (
      <>
        <div className="spec-entete">
          <div className="section-t">Spécialités courantes</div>
          {aDesSpecialites && (
            <button
              type="button"
              className="spec-voir-tout"
              aria-expanded={tout}
              onClick={() => setTout((v) => !v)}
            >
              <span>{tout ? "Réduire" : "Voir tout"}</span>
              <span className="fl" aria-hidden>
                ›
              </span>
            </button>
          )}
        </div>

        <div className={`chips scroll${tout ? " spec-grille" : ""}`}>
          {visibles.map((s) => (
            <Link
              key={s.nom}
              href={`/resultats?specialite=${encodeURIComponent(s.nom)}`}
              className="speccard"
            >
              <span className="em" aria-hidden>
                {s.emoji}
              </span>
              <b>{s.nom}</b>
            </Link>
          ))}
        </div>

        {/* L'accès à l'écran plein ne s'ouvre qu'une fois la vitrine dépliée,
            juste sous la grille (« Voir tout » puis « Voir toutes »). */}
        {tout && ouvrable && (
          <button
            type="button"
            ref={declencheurRef}
            className="spec-tout-lien"
            onClick={ouvrir}
          >
            Voir toutes les spécialités <span aria-hidden>→</span>
          </button>
        )}

        {ecranPlein}
      </>
    );
  }

  return (
    <>
      <div
        className="mt-[26px] flex flex-wrap justify-center gap-3"
        data-reveal-stagger
      >
        {visibles.map((s) => (
          <Link
            key={s.nom}
            href={`/resultats?specialite=${encodeURIComponent(s.nom)}`}
            data-reveal
            className="ui-card flex min-w-[104px] flex-col items-center gap-[7px] rounded-[14px] border border-line bg-white px-5 py-4"
          >
            <span className="text-[26px]" aria-hidden>
              {s.emoji}
            </span>
            <b className="text-[13px] font-bold">{s.nom}</b>
          </Link>
        ))}
      </div>

      {aDesSpecialites && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setTout(!tout)}
            aria-expanded={tout}
            className="ui-btn rounded-full border-[1.5px] border-line bg-white px-[18px] py-[9px] text-[13px] font-bold text-blue hover:border-teal hover:bg-teal-soft"
          >
            {tout ? "Réduire" : "Voir tout"}
          </button>
          {tout && ouvrable && (
            <button
              type="button"
              ref={declencheurRef}
              onClick={ouvrir}
              className="ui-btn inline-flex items-center gap-2 rounded-full border-[1.5px] border-teal-line bg-white px-[18px] py-[9px] text-[13px] font-bold text-teal hover:border-teal hover:bg-teal-soft"
            >
              Voir toutes les spécialités <span aria-hidden>→</span>
            </button>
          )}
        </div>
      )}

      {ecranPlein}
    </>
  );
}
