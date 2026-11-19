"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

/*
 * Section « Établissements en vedette » de l'accueil, web et mobile.
 *
 * Même grammaire que « Médecins en vedette » :
 *   1. Une vitrine — quelques établissements (ceux qui comptent le plus de
 *      praticiens d'abord), carrousel au doigt sur mobile, grille sur web.
 *   2. « Voir tous » ouvre un écran plein recherchable ; toucher une carte
 *      ouvre l'écran profil de l'établissement.
 *
 * « Voir les médecins » ne réinvente rien : il mène à /resultats?q=<nom>, la
 * vraie page de résultats, qui filtre déjà les médecins par établissement.
 *
 * Deux absences assumées côté données : la note est factice (pas d'avis
 * d'établissement dans le modèle — on garde la pastille par cohérence avec le
 * reste du site) et il n'y a pas de coordonnées, donc pas de bouton adresse ;
 * le lieu reste en texte.
 *
 * Classes préfixées `etv-` : rien de commun avec le reste des styles.
 */

export interface EtablissementVedette {
  id: string;
  nom: string;
  type: string;
  lieu: string;
  note: string;
  nbMedecins: number;
  gradient: string;
}

const normaliser = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const lienMedecins = (nom: string) => `/resultats?q=${encodeURIComponent(nom)}`;

/* Hors du composant : un composant déclaré pendant le rendu est recréé à
   chaque fois, et React en réinitialise l'état. */
function Logo({
  etab,
  className,
}: {
  etab: EtablissementVedette;
  className: string;
}) {
  return (
    <span className={className} aria-hidden style={{ background: etab.gradient }}>
      🏥
    </span>
  );
}

export default function EtablissementsEnVedette({
  vedettes,
  annuaire,
  variante,
}: {
  vedettes: EtablissementVedette[];
  annuaire: EtablissementVedette[];
  variante: "web" | "mobile";
}) {
  const [tousOuvert, setTousOuvert] = useState(false);
  const [profilOuvert, setProfilOuvert] = useState(false);
  const [etabActif, setEtabActif] = useState<EtablissementVedette | null>(null);
  const [retourTous, setRetourTous] = useState(false);
  const [requete, setRequete] = useState("");
  const [actif, setActif] = useState(0);
  const pisteRef = useRef<HTMLDivElement>(null);
  const champRef = useRef<HTMLInputElement>(null);
  const declencheurRef = useRef<HTMLButtonElement>(null);

  const ouvrable = annuaire.length > 0;

  const resultats = useMemo(() => {
    const q = normaliser(requete.trim());
    if (!q) return annuaire;
    return annuaire.filter((e) =>
      normaliser(`${e.nom} ${e.type} ${e.lieu}`).includes(q)
    );
  }, [annuaire, requete]);

  function ouvrirTous() {
    setRequete("");
    setTousOuvert(true);
  }
  function fermerTous() {
    setTousOuvert(false);
    declencheurRef.current?.focus();
  }

  function ouvrirProfil(e: EtablissementVedette, depuisTous: boolean) {
    setEtabActif(e);
    setRetourTous(depuisTous);
    if (depuisTous) setTousOuvert(false);
    setProfilOuvert(true);
  }
  function fermerProfil() {
    setProfilOuvert(false);
    // Revenir à la liste si c'est de là qu'on venait, sinon rendre la main
    // au bouton « Voir tous ».
    if (retourTous) setTousOuvert(true);
    else declencheurRef.current?.focus();
    setRetourTous(false);
  }

  const unOuvert = tousOuvert || profilOuvert;

  // Verrou de défilement du fond + Échap, tant qu'un écran plein est ouvert.
  useEffect(() => {
    if (!unOuvert) return;
    document.body.classList.add("etv-overlay-ouvert");
    const surTouche = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (profilOuvert) fermerProfil();
      else if (tousOuvert) fermerTous();
    };
    document.addEventListener("keydown", surTouche);
    return () => {
      document.body.classList.remove("etv-overlay-ouvert");
      document.removeEventListener("keydown", surTouche);
    };
    // L'effet se ré-exécute à chaque changement des drapeaux d'ouverture, ce
    // qui recapture les bons `fermer…` : pas besoin de les lister en plus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unOuvert, profilOuvert, tousOuvert]);

  // Focus la recherche à l'ouverture de « Tous ».
  useEffect(() => {
    if (!tousOuvert) return;
    const t = window.setTimeout(() => champRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, [tousOuvert]);

  // Pastilles du carrousel : indicatives, elles suivent le doigt.
  function surDefilement() {
    const piste = pisteRef.current;
    if (!piste || vedettes.length === 0) return;
    const largeur = piste.scrollWidth / vedettes.length;
    if (largeur <= 0) return;
    const index = Math.round(piste.scrollLeft / largeur);
    setActif(Math.max(0, Math.min(vedettes.length - 1, index)));
  }

  const ecranProfil =
    etabActif && profilOuvert ? (
      <div
        className="etv-overlay"
        role="dialog"
        aria-modal="true"
        aria-label={`Établissement ${etabActif.nom}`}
      >
        <div className="etv-view-shell">
          <header className="etv-view-top">
            <button
              type="button"
              className="etv-view-back"
              aria-label="Retour"
              onClick={fermerProfil}
            >
              ←
            </button>
            <div className="etv-view-titre">
              <h2>Établissement</h2>
              <p>Informations et médecins disponibles</p>
            </div>
          </header>

          <main className="etv-view-content">
            <div className="etv-hero">
              <div className="etv-hero-top">
                <Logo etab={etabActif} className="etv-hero-logo" />
                <div className="etv-hero-info">
                  <h3>{etabActif.nom}</h3>
                  <div className="etv-hero-type">{etabActif.type}</div>
                  <div className="etv-hero-lieu">📍 {etabActif.lieu}</div>
                </div>
              </div>
              <div className="etv-hero-stats">
                <div className="etv-stat">
                  <strong>{etabActif.nbMedecins}</strong>
                  <span>Médecins</span>
                </div>
                <div className="etv-stat">
                  <strong>★ {etabActif.note}</strong>
                  <span>Note patients</span>
                </div>
              </div>
            </div>

            <Link href={lienMedecins(etabActif.nom)} className="etv-primary-btn">
              Voir les médecins disponibles <span aria-hidden>→</span>
            </Link>
          </main>
        </div>
      </div>
    ) : null;

  const ecranTous =
    ouvrable && tousOuvert ? (
      <div
        className="etv-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Tous les établissements"
      >
        <div className="etv-view-shell">
          <header className="etv-view-top">
            <button
              type="button"
              className="etv-view-back"
              aria-label="Retour"
              onClick={fermerTous}
            >
              ←
            </button>
            <div className="etv-view-titre">
              <h2>Tous les établissements</h2>
              <p>Recherchez une clinique, un hôpital ou un centre de santé</p>
            </div>
          </header>

          <main className="etv-view-content">
            <div className="etv-recherche">
              <label className="etv-recherchebox">
                <span aria-hidden>🔎</span>
                <input
                  ref={champRef}
                  type="search"
                  placeholder="Nom, type ou ville..."
                  autoComplete="off"
                  value={requete}
                  onChange={(e) => setRequete(e.target.value)}
                />
              </label>
            </div>

            <div className="etv-meta">
              {resultats.length}{" "}
              {resultats.length > 1 ? "établissements" : "établissement"}
            </div>

            {resultats.length === 0 ? (
              <div className="etv-vide">
                <div className="etv-vide-icone" aria-hidden>
                  🔎
                </div>
                <strong>Aucun établissement trouvé</strong>
                <span>Essayez un autre nom, type ou ville.</span>
              </div>
            ) : (
              <div className="etv-liste">
                {resultats.map((e) => (
                  <article key={e.id} className="etv-liste-card">
                    <button
                      type="button"
                      className="etv-liste-main"
                      onClick={() => ouvrirProfil(e, true)}
                    >
                      <Logo etab={e} className="etv-liste-logo" />
                      <span className="etv-liste-info">
                        <span className="etv-liste-nom">{e.nom}</span>
                        <span className="etv-liste-type">{e.type}</span>
                        <span className="etv-liste-lieu">
                          📍 {e.lieu} · ★ {e.note}
                        </span>
                      </span>
                    </button>
                    <div className="etv-liste-pied">
                      <span className="etv-count">{e.nbMedecins} médecins</span>
                      <Link href={lienMedecins(e.nom)} className="etv-medecins-btn">
                        Voir les médecins <span aria-hidden>→</span>
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </main>
        </div>
      </div>
    ) : null;

  return (
    <section className={`etv-section etv-${variante}`}>
      <div className="etv-head">
        <div>
          <h2>Établissements en vedette</h2>
          <p>Cliniques, hôpitaux et centres de santé à découvrir.</p>
        </div>
        {ouvrable && (
          <button
            type="button"
            ref={declencheurRef}
            className="etv-see-all"
            onClick={ouvrirTous}
          >
            Voir tous{" "}
            <span className="fl" aria-hidden>
              ›
            </span>
          </button>
        )}
      </div>

      <div
        className="etv-track"
        ref={pisteRef}
        onScroll={surDefilement}
        aria-label="Établissements en vedette"
      >
        {vedettes.map((e) => (
          <article key={e.id} className="etv-card">
            <button
              type="button"
              className="etv-profil-zone"
              aria-label={`Voir ${e.nom}`}
              onClick={() => ouvrirProfil(e, false)}
            >
              <Logo etab={e} className="etv-logo" />
              <span className="etv-info">
                <span className="etv-nom-ligne">
                  <span className="etv-nom">{e.nom}</span>
                  <span className="etv-note">★ {e.note}</span>
                </span>
                <span className="etv-type">{e.type}</span>
                <span className="etv-lieu">📍 {e.lieu}</span>
              </span>
            </button>
            <div className="etv-footer">
              <span className="etv-count">{e.nbMedecins} médecins</span>
              <Link href={lienMedecins(e.nom)} className="etv-medecins-btn">
                Voir les médecins <span aria-hidden>→</span>
              </Link>
            </div>
          </article>
        ))}
      </div>

      {vedettes.length > 1 && (
        <div className="etv-points" aria-hidden>
          {vedettes.map((e, i) => (
            <span key={e.id} className={i === actif ? "actif" : undefined} />
          ))}
        </div>
      )}

      {ecranTous}
      {ecranProfil}
    </section>
  );
}
