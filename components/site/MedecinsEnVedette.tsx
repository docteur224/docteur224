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
 *   2. « Voir tous » ouvre un écran plein : recherche libre + filtres par
 *      spécialité sur l'annuaire des praticiens validés.
 *
 * Toutes les classes sont préfixées `mv-` : `.slot`, `.chip` et consorts
 * existent déjà dans mobile.css, et cette section ne doit rien leur prendre.
 *
 * Client pour l'écran plein et le suivi du carrousel ; les listes et tous les
 * libellés de date sont calculés sur le serveur (pas de date côté navigateur,
 * donc pas d'écart d'hydratation).
 */

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
  /** « Aujourd'hui · 14:00 » si connu, sinon le libellé de disponibilité. */
  prochain: string;
}

const normaliser = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

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
  variante,
}: {
  vedettes: MedecinVedette[];
  annuaire: MedecinAnnuaire[];
  /** Spécialités présentes dans l'annuaire, déjà triées par demande. */
  specialites: string[];
  variante: "web" | "mobile";
}) {
  const [ouvert, setOuvert] = useState(false);
  const [requete, setRequete] = useState("");
  const [filtre, setFiltre] = useState("Tous");
  const [actif, setActif] = useState(0);
  const pisteRef = useRef<HTMLDivElement>(null);
  const champRef = useRef<HTMLInputElement>(null);
  const declencheurRef = useRef<HTMLButtonElement>(null);

  const ouvrable = annuaire.length > 0;

  const resultats = useMemo(() => {
    const q = normaliser(requete.trim());
    return annuaire.filter((m) => {
      const okFiltre = filtre === "Tous" || m.specialite === filtre;
      const botte = normaliser(`${m.nom} ${m.specialite} ${m.lieu}`);
      return okFiltre && (!q || botte.includes(q));
    });
  }, [annuaire, requete, filtre]);

  function ouvrir() {
    setRequete("");
    setFiltre("Tous");
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
              <p>Recherchez un médecin ou filtrez par spécialité</p>
            </div>
          </header>

          <main className="mv-overlay-content">
            <div className="mv-recherche">
              <label className="mv-recherchebox">
                <span aria-hidden>🔎</span>
                <input
                  ref={champRef}
                  type="search"
                  placeholder="Nom, spécialité ou établissement..."
                  autoComplete="off"
                  value={requete}
                  onChange={(e) => setRequete(e.target.value)}
                />
              </label>
            </div>

            {specialites.length > 0 && (
              <div className="mv-filtres-wrap">
                <div className="mv-filtres" aria-label="Filtrer par spécialité">
                  {["Tous", ...specialites].map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`mv-filtre${s === filtre ? " actif" : ""}`}
                      aria-pressed={s === filtre}
                      onClick={() => setFiltre(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mv-meta">
              <span>
                {resultats.length} {resultats.length > 1 ? "médecins" : "médecin"}
              </span>
              <span className="mv-meta-aide">
                Touchez une carte pour voir le profil
              </span>
            </div>

            {resultats.length === 0 ? (
              <div className="mv-liste-vide">
                <div style={{ fontSize: 34, marginBottom: 9 }} aria-hidden>
                  🔎
                </div>
                <strong>Aucun médecin trouvé</strong>
                <span>
                  Essayez un autre nom, une spécialité ou un établissement.
                </span>
              </div>
            ) : (
              <div className="mv-liste">
                {resultats.map((m) => (
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
                      <Link href={`/medecin/${m.id}`} className="mv-dispo-btn">
                        Disponibilités <span aria-hidden>→</span>
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {/* Échappatoire vers la vraie recherche : ville, note, genre,
                assurances… que cet écran volontairement simple n'a pas. */}
            <Link href="/resultats" className="mv-recherche-avancee">
              Recherche avancée (ville, note, assurance…) <span aria-hidden>→</span>
            </Link>
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
                  <Link href={`/medecin/${m.id}`} className="mv-plus">
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
