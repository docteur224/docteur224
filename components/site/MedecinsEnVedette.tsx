"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

/*
 * Section « Médecins en vedette » de l'accueil, web et mobile.
 *
 * Deux niveaux, comme pour les spécialités :
 *   1. La vitrine — quelques praticiens, avec leurs VRAIS prochains créneaux
 *      réservables (calculés côté serveur par prochainsCreneaux, mêmes règles
 *      qu'à la réservation). Carrousel au doigt sur mobile, grille sur web.
 *   2. « Voir tous » ouvre un écran plein : recherche libre, filtres et
 *      pagination sur l'annuaire des praticiens validés.
 *
 * Le panneau de filtres n'existe qu'à partir de 1080px. Il ne porte QUE des
 * critères légers (spécialité, ville, disponibilité, note, genre) : cet écran
 * est un instantané sérialisé dans le HTML de l'accueil, payé par tous les
 * visiteurs. Assurances, langues et types d'établissement — des tableaux —
 * restent sur /resultats, vers qui le lien « Recherche avancée » transmet
 * l'état courant. L'écran est un entonnoir vers la vraie recherche, pas un
 * second moteur à maintenir en parallèle.
 *
 * Toutes les classes sont préfixées `mv-` : `.slot`, `.chip` et consorts
 * existent déjà dans mobile.css, et cette section ne doit rien leur prendre.
 */

/** Praticiens par page dans l'écran plein. */
const PAR_PAGE = 12;

export interface CreneauVedette {
  dateISO: string;
  heure: string;
  /** « Aujourd'hui », « Demain », « Sam. 21 nov. » — formaté côté serveur. */
  jour: string;
}

export interface MedecinVedette {
  id: string;
  nom: string;
  initiales: string;
  photoUrl: string | null;
  gradient: string;
  specialite: string;
  lieu: string;
  note: string;
  creneaux: CreneauVedette[];
}

export interface MedecinAnnuaire {
  id: string;
  nom: string;
  initiales: string;
  photoUrl: string | null;
  gradient: string;
  specialite: string;
  lieu: string;
  note: string;
  ville: string;
  genre: "femme" | "homme" | null;
  noteNum: number;
  /** Date ISO du prochain créneau, ou null si elle n'est pas connue. */
  prochainISO: string | null;
  /** « Aujourd'hui · 14:00 » si connu, sinon le libellé de disponibilité. */
  prochain: string;
}

const normaliser = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const NOTES = [
  { valeur: 0, label: "Peu importe" },
  { valeur: 3, label: "★ 3 et +" },
  { valeur: 4, label: "★ 4 et +" },
  { valeur: 4.5, label: "★ 4,5 et +" },
];

const GENRES = [
  { valeur: "", label: "Peu importe" },
  { valeur: "femme", label: "Femme" },
  { valeur: "homme", label: "Homme" },
];

/**
 * Numéros à afficher dans la pagination : début, fin et voisinage de la page
 * courante, le reste replié en « … ». Au-delà de sept pages, aligner tous les
 * numéros déborderait de l'écran bien avant d'être utile.
 */
function numerosPages(page: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const retenus = [...new Set([1, pages, page, page - 1, page + 1])]
    .filter((n) => n >= 1 && n <= pages)
    .sort((a, b) => a - b);
  const sortie: (number | "…")[] = [];
  let precedent = 0;
  for (const n of retenus) {
    if (precedent && n - precedent > 1) sortie.push("…");
    sortie.push(n);
    precedent = n;
  }
  return sortie;
}

/*
 * Groupe de boutons exclusifs du panneau latéral.
 *
 * Déclaré ici et non dans le composant : un composant créé pendant le rendu
 * est recréé à chaque fois, et React en réinitialise l'état.
 */
function OptionsFiltre<T extends string | number>({
  titre,
  valeurs,
  courant,
  surChoix,
}: {
  titre: string;
  valeurs: { valeur: T; label: string }[];
  courant: T;
  surChoix: (v: T) => void;
}) {
  return (
    <fieldset className="mv-groupe">
      <legend className="mv-groupe-titre">{titre}</legend>
      <div className="mv-options">
        {valeurs.map((o) => (
          <button
            key={String(o.valeur)}
            type="button"
            className={`mv-option${o.valeur === courant ? " actif" : ""}`}
            aria-pressed={o.valeur === courant}
            onClick={() => surChoix(o.valeur)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Avatar({
  medecin,
  className,
}: {
  medecin: { initiales: string; photoUrl: string | null; gradient: string };
  className: string;
}) {
  if (medecin.photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={medecin.photoUrl} alt="" className={className} />;
  }
  return (
    <span className={className} aria-hidden style={{ background: medecin.gradient }}>
      {medecin.initiales}
    </span>
  );
}

export default function MedecinsEnVedette({
  vedettes,
  annuaire,
  specialites,
  bornesDispo,
  variante,
}: {
  vedettes: MedecinVedette[];
  annuaire: MedecinAnnuaire[];
  /** Spécialités présentes dans l'annuaire, déjà triées par demande. */
  specialites: string[];
  /** Dates ISO calculées sur le serveur, pour le filtre « Disponibilité ». */
  bornesDispo: { aujourdhui: string; semaine: string };
  variante: "web" | "mobile";
}) {
  const [ouvert, setOuvert] = useState(false);
  const [requete, setRequete] = useState("");
  const [filtre, setFiltre] = useState("Tous");
  const [ville, setVille] = useState("Toutes");
  const [dispo, setDispo] = useState("toutes");
  const [noteMin, setNoteMin] = useState(0);
  const [genre, setGenre] = useState("");
  const [page, setPage] = useState(1);
  const [actif, setActif] = useState(0);
  const pisteRef = useRef<HTMLDivElement>(null);
  const champRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const declencheurRef = useRef<HTMLButtonElement>(null);

  const ouvrable = annuaire.length > 0;

  // Où mènent « Voir plus de créneaux » et « Disponibilités » : sur web, la
  // fiche profil porte déjà le panneau de réservation, inutile d'ouvrir
  // l'écran « Choisir un créneau » ; sur mobile, la fiche ne l'a pas, on garde
  // l'écran dédié.
  const lienCreneaux = (id: string) =>
    variante === "web" ? `/medecin/${id}` : `/medecin/${id}/creneaux`;

  const villes = useMemo(
    () =>
      [...new Set(annuaire.map((m) => m.ville).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "fr")
      ),
    [annuaire]
  );

  // Sans la migration 0093, aucune date de créneau ne remonte : le filtre
  // « Disponibilité » ne renverrait alors que du vide. Mieux vaut le masquer
  // que proposer un critère qui ne peut rien trouver.
  const dispoConnue = useMemo(
    () => annuaire.some((m) => m.prochainISO),
    [annuaire]
  );

  const resultats = useMemo(() => {
    const q = normaliser(requete.trim());
    return annuaire.filter((m) => {
      if (filtre !== "Tous" && m.specialite !== filtre) return false;
      if (ville !== "Toutes" && m.ville !== ville) return false;
      if (noteMin && m.noteNum < noteMin) return false;
      if (genre && m.genre !== genre) return false;
      if (dispo === "aujourdhui" && m.prochainISO !== bornesDispo.aujourdhui) {
        return false;
      }
      // Les dates ISO se comparent comme des chaînes : même ordre.
      if (dispo === "semaine" && (!m.prochainISO || m.prochainISO > bornesDispo.semaine)) {
        return false;
      }
      if (!q) return true;
      return normaliser(`${m.nom} ${m.specialite} ${m.lieu}`).includes(q);
    });
  }, [annuaire, requete, filtre, ville, noteMin, genre, dispo, bornesDispo]);

  const nbFiltres =
    (filtre !== "Tous" ? 1 : 0) +
    (ville !== "Toutes" ? 1 : 0) +
    (noteMin ? 1 : 0) +
    (genre ? 1 : 0) +
    (dispo !== "toutes" ? 1 : 0);

  // Le lien emporte l'état courant : on ne repart pas de zéro sur /resultats.
  const lienAvance = useMemo(() => {
    const p = new URLSearchParams();
    if (requete.trim()) p.set("q", requete.trim());
    if (filtre !== "Tous") p.set("specialite", filtre);
    if (ville !== "Toutes") p.set("ville", ville);
    if (noteMin) p.set("note", String(noteMin));
    if (genre) p.set("genre", genre);
    if (dispo === "aujourdhui") p.set("dispo", "aujourdhui");
    if (dispo === "semaine") p.set("dispo", "7jours");
    const qs = p.toString();
    return qs ? `/resultats?${qs}` : "/resultats";
  }, [requete, filtre, ville, noteMin, genre, dispo]);

  const pages = Math.max(1, Math.ceil(resultats.length / PAR_PAGE));
  // Page bornée plutôt que corrigée après coup : affiner la recherche réduit
  // le nombre de pages, et l'on se retrouverait sinon devant une page vide.
  const pageSure = Math.min(page, pages);
  const visibles = resultats.slice((pageSure - 1) * PAR_PAGE, pageSure * PAR_PAGE);

  function allerPage(n: number) {
    setPage(Math.max(1, Math.min(pages, n)));
    // Sans cela, on change de page en restant au bas de la liste : on croit
    // que rien ne s'est passé.
    overlayRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function reinitialiser() {
    setFiltre("Tous");
    setVille("Toutes");
    setDispo("toutes");
    setNoteMin(0);
    setGenre("");
    setPage(1);
  }

  function ouvrir() {
    setRequete("");
    reinitialiser();
    setOuvert(true);
  }
  function fermer() {
    setOuvert(false);
    declencheurRef.current?.focus();
  }

  // Verrou de défilement du fond + focus + Échap, tant que l'écran est ouvert.
  useEffect(() => {
    if (!ouvert) return;
    document.body.classList.add("mv-overlay-ouvert");
    const t = window.setTimeout(() => champRef.current?.focus(), 60);
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") fermer();
    };
    document.addEventListener("keydown", surTouche);
    return () => {
      document.body.classList.remove("mv-overlay-ouvert");
      window.clearTimeout(t);
      document.removeEventListener("keydown", surTouche);
    };
  }, [ouvert]);

  // Pastilles du carrousel : purement indicatives, elles suivent le doigt.
  function surDefilement() {
    const piste = pisteRef.current;
    if (!piste || vedettes.length === 0) return;
    const largeur = piste.scrollWidth / vedettes.length;
    if (largeur <= 0) return;
    const index = Math.round(piste.scrollLeft / largeur);
    setActif(Math.max(0, Math.min(vedettes.length - 1, index)));
  }

  const ecranPlein =
    ouvrable && ouvert ? (
      <div
        className="mv-overlay"
        ref={overlayRef}
        role="dialog"
        aria-modal="true"
        aria-label="Tous les médecins"
      >
        <div className="mv-overlay-shell">
          <header className="mv-overlay-top">
            <button
              type="button"
              className="mv-overlay-back"
              aria-label="Retour"
              onClick={fermer}
            >
              ←
            </button>
            <div className="mv-overlay-head">
              <h2>Tous les médecins</h2>
              <p>{annuaire.length} praticiens vérifiés sur Docteur 224</p>
            </div>
          </header>

          <main className="mv-overlay-content">
            <div className="mv-barre">
              <label className="mv-recherchebox">
                <span aria-hidden>🔎</span>
                <input
                  ref={champRef}
                  type="search"
                  placeholder="Nom, spécialité ou établissement..."
                  autoComplete="off"
                  value={requete}
                  onChange={(e) => {
                    setRequete(e.target.value);
                    // Remis à 1 ici plutôt que dans un effet : affiner la
                    // recherche en étant page 3 ne doit pas laisser sur une
                    // page qui n'existe plus.
                    setPage(1);
                  }}
                />
              </label>

              {/* Juste sous le champ, et il emporte les filtres en cours. */}
              <Link href={lienAvance} className="mv-avancee">
                <span aria-hidden>⚙</span>
                <span className="mv-avancee-long">
                  Recherche avancée (ville, note, assurance…)
                </span>
                <span className="mv-avancee-court">Recherche avancée</span>
                <span aria-hidden>→</span>
              </Link>

              {/* Puces de spécialité : seulement sous 1080px. Au-dessus, la
                  spécialité vit dans le panneau — un seul contrôle par métier. */}
              {specialites.length > 0 && (
                <div className="mv-filtres-wrap">
                  <div className="mv-filtres" aria-label="Filtrer par spécialité">
                    {["Tous", ...specialites].map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`mv-filtre${s === filtre ? " actif" : ""}`}
                        aria-pressed={s === filtre}
                        onClick={() => {
                          setFiltre(s);
                          setPage(1);
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mv-corps">
              <aside className="mv-sidebar" aria-label="Filtres">
                <div className="mv-sidebar-tete">
                  <h3>Filtres</h3>
                  {nbFiltres > 0 && (
                    <button type="button" className="mv-reset" onClick={reinitialiser}>
                      Réinitialiser ({nbFiltres})
                    </button>
                  )}
                </div>

                {specialites.length > 0 && (
                  <div className="mv-groupe">
                    <label className="mv-groupe-titre" htmlFor="mv-f-spec">
                      Spécialité
                    </label>
                    <select
                      id="mv-f-spec"
                      className="mv-select"
                      value={filtre}
                      onChange={(e) => {
                        setFiltre(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="Tous">Toutes les spécialités</option>
                      {specialites.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {villes.length > 1 && (
                  <div className="mv-groupe">
                    <label className="mv-groupe-titre" htmlFor="mv-f-ville">
                      Ville
                    </label>
                    <select
                      id="mv-f-ville"
                      className="mv-select"
                      value={ville}
                      onChange={(e) => {
                        setVille(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="Toutes">Toutes les villes</option>
                      {villes.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {dispoConnue && (
                  <OptionsFiltre
                    titre="Disponibilité"
                    courant={dispo}
                    surChoix={(v) => {
                      setDispo(v);
                      setPage(1);
                    }}
                    valeurs={[
                      { valeur: "toutes", label: "Peu importe" },
                      { valeur: "aujourdhui", label: "Aujourd’hui" },
                      { valeur: "semaine", label: "Cette semaine" },
                    ]}
                  />
                )}

                <OptionsFiltre
                  titre="Note minimale"
                  courant={noteMin}
                  surChoix={(v) => {
                    setNoteMin(v);
                    setPage(1);
                  }}
                  valeurs={NOTES}
                />

                <OptionsFiltre
                  titre="Genre du praticien"
                  courant={genre}
                  surChoix={(v) => {
                    setGenre(v);
                    setPage(1);
                  }}
                  valeurs={GENRES}
                />
              </aside>

              <div className="mv-resultats">
                <div className="mv-meta">
                  <span className="mv-meta-compte">
                    {resultats.length} {resultats.length > 1 ? "médecins" : "médecin"}
                    {filtre !== "Tous" && (
                      <span className="mv-meta-filtre"> · {filtre}</span>
                    )}
                    {ville !== "Toutes" && (
                      <span className="mv-meta-filtre"> · {ville}</span>
                    )}
                  </span>
                  {pages > 1 && (
                    <span className="mv-meta-page">
                      Page {pageSure} sur {pages}
                    </span>
                  )}
                </div>

                {resultats.length === 0 ? (
                  <div className="mv-liste-vide">
                    <div className="mv-vide-icone" aria-hidden>
                      🔎
                    </div>
                    <strong>Aucun médecin trouvé</strong>
                    <span>
                      Essayez un autre nom, ou élargissez vos filtres.
                    </span>
                    {nbFiltres > 0 && (
                      <button
                        type="button"
                        className="mv-reset mv-reset-vide"
                        onClick={reinitialiser}
                      >
                        Réinitialiser les filtres
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="mv-liste">
                      {visibles.map((m) => (
                        <article key={m.id} className="mv-liste-card">
                          <Link href={`/medecin/${m.id}`} className="mv-liste-profil">
                            <Avatar medecin={m} className="mv-liste-avatar" />
                            <span className="mv-liste-infos">
                              <span className="mv-liste-nom-ligne">
                                <span className="mv-liste-nom">{m.nom}</span>
                                <span className="mv-liste-note">★ {m.note}</span>
                              </span>
                              <span className="mv-liste-specialite">{m.specialite}</span>
                              <span className="mv-liste-lieu">📍 {m.lieu}</span>
                            </span>
                          </Link>
                          <div className="mv-liste-pied">
                            <span className="mv-prochain">{m.prochain}</span>
                            <Link href={lienCreneaux(m.id)} className="mv-dispo-btn">
                              Disponibilités <span aria-hidden>→</span>
                            </Link>
                          </div>
                        </article>
                      ))}
                    </div>

                    {pages > 1 && (
                      <nav className="mv-pagination" aria-label="Pages de résultats">
                        <button
                          type="button"
                          className="mv-page-fleche"
                          disabled={pageSure === 1}
                          onClick={() => allerPage(pageSure - 1)}
                        >
                          <span aria-hidden>‹</span>
                          <span className="mv-fleche-mot">Précédent</span>
                        </button>

                        <div className="mv-page-nums">
                          {numerosPages(pageSure, pages).map((n, i) =>
                            n === "…" ? (
                              <span key={`e${i}`} className="mv-page-ellipse" aria-hidden>
                                …
                              </span>
                            ) : (
                              <button
                                key={n}
                                type="button"
                                className={`mv-page-num${n === pageSure ? " actif" : ""}`}
                                aria-label={`Page ${n}`}
                                aria-current={n === pageSure ? "page" : undefined}
                                onClick={() => allerPage(n)}
                              >
                                {n}
                              </button>
                            )
                          )}
                        </div>

                        <button
                          type="button"
                          className="mv-page-fleche"
                          disabled={pageSure === pages}
                          onClick={() => allerPage(pageSure + 1)}
                        >
                          <span className="mv-fleche-mot">Suivant</span>
                          <span aria-hidden>›</span>
                        </button>
                      </nav>
                    )}
                  </>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    ) : null;

  return (
    <section className={`mv-section mv-${variante}`}>
      <div className="mv-head">
        <div>
          <h2>Médecins en vedette</h2>
          <p>Les prochains créneaux disponibles à partir de maintenant.</p>
        </div>
        {ouvrable && (
          <button
            type="button"
            ref={declencheurRef}
            className="mv-see-all"
            onClick={ouvrir}
          >
            Voir tous{" "}
            <span className="fl" aria-hidden>
              ›
            </span>
          </button>
        )}
      </div>

      <div
        className="mv-track"
        ref={pisteRef}
        onScroll={surDefilement}
        aria-label="Médecins en vedette"
      >
        {vedettes.map((m) => (
          <article key={m.id} className="mv-card">
            <Link href={`/medecin/${m.id}`} className="mv-profil">
              <Avatar medecin={m} className="mv-avatar" />
              <span className="mv-infos">
                <span className="mv-nom-ligne">
                  <span className="mv-nom">{m.nom}</span>
                  <span className="mv-note">★ {m.note}</span>
                </span>
                <span className="mv-specialite">{m.specialite}</span>
                <span className="mv-lieu">📍 {m.lieu}</span>
              </span>
            </Link>

            <div className="mv-separateur" />

            {m.creneaux.length > 0 ? (
              <>
                <div className="mv-creneaux-label">
                  Prochains créneaux à partir de maintenant
                </div>
                <div className="mv-creneaux">
                  {m.creneaux.map((c) => (
                    <Link
                      key={`${c.dateISO}-${c.heure}`}
                      href={`/reservation?medecin=${m.id}&date=${c.dateISO}&heure=${encodeURIComponent(c.heure)}`}
                      className="mv-creneau"
                    >
                      <span className="mv-creneau-jour">{c.jour}</span>
                      <strong>{c.heure}</strong>
                    </Link>
                  ))}
                </div>
                <div className="mv-plus-wrap">
                  <Link href={lienCreneaux(m.id)} className="mv-plus">
                    Voir plus de créneaux <span aria-hidden>→</span>
                  </Link>
                </div>
              </>
            ) : (
              // Mieux vaut le dire que d'afficher une rangée vide : le patient
              // comprend qu'il faut passer par la fiche.
              <div className="mv-plus-wrap">
                <div className="mv-creneaux-label mv-aucun">
                  Aucun créneau en ligne pour le moment
                </div>
                <Link href={`/medecin/${m.id}`} className="mv-plus">
                  Voir la fiche <span aria-hidden>→</span>
                </Link>
              </div>
            )}
          </article>
        ))}
      </div>

      {vedettes.length > 1 && (
        <div className="mv-points" aria-hidden>
          {vedettes.map((m, i) => (
            <span key={m.id} className={i === actif ? "actif" : undefined} />
          ))}
        </div>
      )}

      {ecranPlein}
    </section>
  );
}
