"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Icone, { type NomIcone } from "@/components/site/Icone";

/*
 * Navigation entre les modules de la fiche patient.
 *
 * Deux rendus du même modèle d'onglets ARIA (tablist / tab / tabpanel) :
 *
 *  - ORDINATEUR (≥ lg) : barre soulignée collée en haut de la zone de
 *    travail. Les onglets qui ne tiennent pas passent dans un menu « Plus » ;
 *    l'onglet actif y reste nommé, pour qu'on sache toujours où l'on est ;
 *
 *  - TÉLÉPHONE ET TABLETTE (< lg) : une rangée de puces défilable, collée
 *    sous la barre haute. Elle porte AUSSI « Patient » et « Rendez-vous »,
 *    qui sont des onglets de plein droit sur un écran à une colonne : un seul
 *    niveau de navigation, au lieu d'onglets de page au-dessus d'onglets de
 *    module.
 *
 * Clavier, selon le motif ARIA « tabs à activation automatique » : flèches
 * gauche/droite pour passer d'un onglet à l'autre, Début/Fin pour les
 * extrémités, Tab pour entrer dans le contenu. Un seul onglet est
 * tabulable à la fois (tabindex itinérant).
 */

export interface OngletFiche {
  id: string;
  libelle: string;
  icone: NomIcone;
  /** Contenu de la pastille ; une pastille vide est masquée (`empty:hidden`). */
  compteur?: ReactNode;
}

/** Identifiant du panneau d'un onglet : la page le pose sur son tabpanel. */
export const idPanneau = (id: string) => `panneau-fiche-${id}`;
/** Identifiant de l'onglet ordinateur, qui nomme le panneau (aria-labelledby). */
export const idOnglet = (id: string) => `onglet-fiche-${id}`;

/** Déplacement clavier commun aux deux rendus. Rend l'id à activer, ou null. */
function cibleClavier(e: KeyboardEvent, ids: string[], actif: string): string | null {
  const i = ids.indexOf(actif);
  const suivant =
    e.key === "ArrowRight"
      ? ids[(i + 1) % ids.length]
      : e.key === "ArrowLeft"
        ? ids[(i - 1 + ids.length) % ids.length]
        : e.key === "Home"
          ? ids[0]
          : e.key === "End"
            ? ids[ids.length - 1]
            : null;
  if (suivant) e.preventDefault();
  return suivant;
}

/* =====================================================================
   Ordinateur : barre soulignée + menu « Plus »
   ===================================================================== */

export function OngletsBureau({
  onglets,
  actif,
  onChoisir,
}: {
  onglets: OngletFiche[];
  actif: string;
  onChoisir: (id: string) => void;
}) {
  const conteneur = useRef<HTMLDivElement>(null);
  const mesure = useRef<HTMLDivElement>(null);
  const [nbVisibles, setNbVisibles] = useState(onglets.length);
  const [menuOuvert, setMenuOuvert] = useState(false);

  /*
   * Combien d'onglets tiennent ? On mesure une copie invisible de la rangée
   * (chaque onglet à sa largeur naturelle), jamais la rangée affichée — qui,
   * une fois amputée, ne dirait plus ce qu'il faudrait pour la rétablir.
   * Le relevé se fait dans le rappel du ResizeObserver, pas dans le corps de
   * l'effet : c'est aussi ce qui le rejoue quand la colonne change de taille.
   */
  useEffect(() => {
    const boite = conteneur.current;
    const copie = mesure.current;
    if (!boite || !copie) return;
    const LARGEUR_PLUS = 96;
    const releve = () => {
      const largeurs = Array.from(copie.children).map((el) => (el as HTMLElement).offsetWidth);
      const dispo = boite.clientWidth;
      const total = largeurs.reduce((a, b) => a + b, 0);
      if (total <= dispo) {
        setNbVisibles(largeurs.length);
        return;
      }
      let cumul = 0;
      let n = 0;
      for (const l of largeurs) {
        if (cumul + l > dispo - LARGEUR_PLUS) break;
        cumul += l;
        n += 1;
      }
      setNbVisibles(Math.max(1, n));
    };
    const observateur = new ResizeObserver(releve);
    observateur.observe(boite);
    return () => observateur.disconnect();
  }, [onglets.length]);

  // Échap ou un clic ailleurs referme le menu.
  useEffect(() => {
    if (!menuOuvert) return;
    const fermer = (e: Event) => {
      if (e instanceof globalThis.KeyboardEvent && e.key !== "Escape") return;
      if (e instanceof MouseEvent && conteneur.current?.contains(e.target as Node)) return;
      setMenuOuvert(false);
    };
    window.addEventListener("keydown", fermer);
    window.addEventListener("mousedown", fermer);
    return () => {
      window.removeEventListener("keydown", fermer);
      window.removeEventListener("mousedown", fermer);
    };
  }, [menuOuvert]);

  const visibles = onglets.slice(0, nbVisibles);
  const caches = onglets.slice(nbVisibles);
  const actifCache = caches.find((o) => o.id === actif);
  const ids = onglets.map((o) => o.id);

  const choisirAuClavier = (e: KeyboardEvent) => {
    const cible = cibleClavier(e, ids, actif);
    if (!cible) return;
    onChoisir(cible);
    // Le focus suit l'onglet ; s'il est dans le menu, c'est le bouton « Plus »
    // qui le prend, puisqu'il porte désormais son nom.
    requestAnimationFrame(() => {
      const el =
        document.getElementById(idOnglet(cible)) ??
        conteneur.current?.querySelector<HTMLElement>("[data-plus]");
      el?.focus();
    });
  };

  const contenuOnglet = (o: OngletFiche) => (
    <>
      <Icone nom={o.icone} taille={16} />
      <span>{o.libelle}</span>
      <span className="rounded-full bg-bg px-1.5 py-px text-[11px] font-bold text-muted empty:hidden">
        {o.compteur}
      </span>
    </>
  );

  const classeOnglet = (estActif: boolean) =>
    `relative inline-flex h-[52px] flex-none items-center gap-2 px-3.5 text-[13.5px] transition-colors outline-none focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-teal/50 ` +
    // Le trait sous l'onglet actif s'étire depuis le centre : l'indicateur
    // est animé sans rien mesurer, chaque onglet porte le sien.
    `after:absolute after:inset-x-3 after:-bottom-px after:h-[2.5px] after:origin-center after:rounded-full after:bg-teal after:transition-transform after:duration-200 motion-reduce:after:transition-none ` +
    (estActif
      ? "font-extrabold text-ink after:scale-x-100"
      : "font-semibold text-muted after:scale-x-0 hover:text-ink");

  return (
    // Collée en haut au défilement. Le fond opaque masque ce qui passe
    // dessous ; pas de flou d'arrière-plan, qui fait sauter le rendu de
    // Chrome Android (voir mobile.css).
    // `hidden lg:block` est posé ICI et non sur un parent : un élément
    // collant ne se déplace qu’à l’intérieur de son parent, et un parent
    // taillé à sa mesure l’empêchait de bouger.
    <div className="sticky top-0 z-20 hidden bg-bg pb-4 lg:block">
      <div ref={conteneur} className="relative rounded-2xl border border-line bg-white px-1.5">
        {/* Copie de mesure : hors flux, invisible, ignorée des lecteurs d'écran. */}
        <div
          ref={mesure}
          aria-hidden
          className="pointer-events-none invisible absolute left-0 top-0 flex whitespace-nowrap"
        >
          {onglets.map((o) => (
            <span key={o.id} className={classeOnglet(true)}>
              {contenuOnglet(o)}
            </span>
          ))}
        </div>

        <div role="tablist" aria-label="Modules du dossier" className="flex items-center">
          {visibles.map((o) => (
            <button
              key={o.id}
              id={idOnglet(o.id)}
              type="button"
              role="tab"
              aria-selected={o.id === actif}
              aria-controls={idPanneau(o.id)}
              tabIndex={o.id === actif ? 0 : -1}
              onClick={() => onChoisir(o.id)}
              onKeyDown={choisirAuClavier}
              className={classeOnglet(o.id === actif)}
            >
              {contenuOnglet(o)}
            </button>
          ))}

          {caches.length > 0 && (
            <div className="relative ml-auto">
              <button
                type="button"
                data-plus
                aria-haspopup="menu"
                aria-expanded={menuOuvert}
                tabIndex={actifCache ? 0 : -1}
                onClick={() => setMenuOuvert((o) => !o)}
                onKeyDown={choisirAuClavier}
                className={classeOnglet(!!actifCache)}
              >
                {actifCache ? (
                  contenuOnglet(actifCache)
                ) : (
                  <>
                    <Icone nom="points" taille={18} epaisseur={3} />
                    <span>Plus</span>
                  </>
                )}
                <Icone nom="chevron-droite" taille={13} className="rotate-90" />
              </button>
              {menuOuvert && (
                <div
                  role="menu"
                  className="ui-modal-in absolute right-0 top-full z-30 mt-1.5 min-w-[220px] rounded-xl border border-line bg-white p-1.5 shadow-card"
                >
                  {caches.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onChoisir(o.id);
                        setMenuOuvert(false);
                      }}
                      className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-[13px] transition-colors hover:bg-bg ${
                        o.id === actif ? "font-extrabold text-blue" : "font-semibold text-ink"
                      }`}
                    >
                      {contenuOnglet(o)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   Téléphone et tablette : rangée de puces
   ===================================================================== */

export function PucesMobile({
  onglets,
  actif,
  onChoisir,
}: {
  onglets: OngletFiche[];
  actif: string;
  onChoisir: (id: string) => void;
}) {
  const rangee = useRef<HTMLDivElement>(null);
  const ids = onglets.map((o) => o.id);

  // La puce active est toujours ramenée dans le champ : choisie depuis un
  // lien (`?tab=relation`), elle pourrait sinon être hors de l'écran, à droite.
  // Les compteurs arrivent après coup et élargissent les puces qui précèdent :
  // on recentre aussi à chaque changement de taille de la rangée.
  useEffect(() => {
    const ligne = rangee.current;
    if (!ligne) return;
    const ramener = () => {
      const el = ligne.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!el) return;
      const gauche = el.offsetLeft - ligne.offsetLeft;
      if (gauche < ligne.scrollLeft) ligne.scrollLeft = gauche;
      else if (gauche + el.offsetWidth > ligne.scrollLeft + ligne.clientWidth) {
        ligne.scrollLeft = gauche + el.offsetWidth - ligne.clientWidth;
      }
    };
    ramener();
    const observateur = new ResizeObserver(ramener);
    for (const puce of ligne.children) observateur.observe(puce);
    return () => observateur.disconnect();
  }, [actif]);

  return (
    <div
      // Collée sous la barre haute mobile (56 px + encoche) ; sous md il n'y
      // a plus de barre haute, la rangée colle au bord de la fenêtre.
      className="sticky top-[calc(56px+env(safe-area-inset-top))] z-20 -mx-4 mb-4 bg-bg px-4 py-2 md:top-0 md:mx-0 md:px-0 lg:hidden"
    >
      <div
        ref={rangee}
        role="tablist"
        aria-label="Sections du dossier"
        className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {onglets.map((o) => {
          const estActif = o.id === actif;
          return (
            <button
              key={o.id}
              id={`puce-fiche-${o.id}`}
              type="button"
              role="tab"
              aria-selected={estActif}
              aria-controls={idPanneau(o.id)}
              tabIndex={estActif ? 0 : -1}
              onClick={() => onChoisir(o.id)}
              onKeyDown={(e) => {
                const cible = cibleClavier(e, ids, actif);
                if (!cible) return;
                onChoisir(cible);
                requestAnimationFrame(() => document.getElementById(`puce-fiche-${cible}`)?.focus());
              }}
              className={`inline-flex min-h-11 flex-none items-center gap-1.5 rounded-full border px-4 text-[13px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-teal/50 ${
                estActif
                  ? "border-blue bg-blue font-extrabold text-white"
                  : "border-line bg-white font-semibold text-muted"
              }`}
            >
              <Icone nom={o.icone} taille={15} />
              {o.libelle}
              <span
                className={`rounded-full px-1.5 text-[11px] font-bold empty:hidden ${
                  estActif ? "bg-white/20 text-white" : "bg-bg text-muted"
                }`}
              >
                {o.compteur}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
