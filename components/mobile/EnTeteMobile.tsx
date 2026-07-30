"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import BandeauProchainRdv from "@/components/mobile/BandeauProchainRdv";
import RechercheRapide from "@/components/mobile/RechercheRapide";
import TiroirMobile from "@/components/mobile/TiroirMobile";
import Logo from "@/components/site/Logo";
import { useProfilConnecte } from "@/lib/patient";

/**
 * Barre haute mobile — remplace la .appbar de la maquette, qui n'existait que
 * sur quelques écrans et défilait avec le contenu. Rendue sous md uniquement
 * (le web ≥ 768px garde son TopNav / ses sidebars, strictement inchangés).
 *
 * Trois variantes :
 * - `marque` : logo + actions, pour les écrans racines des onglets ;
 * - `page`   : retour + titre + sous-titre, pour les écrans profonds ;
 * - `hero`   : transparente par-dessus le héros bleu de l'accueil, elle passe
 *              en blanc opaque dès le premier scroll.
 *
 * Le bouton retour revient dans l'historique quand l'écran précédent
 * appartient à l'application, et suit le lien `retour` sinon (arrivée directe
 * par lien, SMS, favori…) : c'est ce qui manquait aux anciens liens en dur.
 */
export default function EnTeteMobile({
  variante = "page",
  titre,
  sousTitre,
  retour,
  actions = true,
  recherche = false,
  bandeauRdv = false,
  droite,
}: {
  variante?: "marque" | "page" | "hero";
  titre?: string;
  sousTitre?: string;
  /** Repli du bouton retour quand l'historique ne contient pas l'app. */
  retour?: string;
  /** Actions standard à droite (cloche + avatar, ou « Se connecter »). */
  actions?: boolean;
  /** Loupe ouvrant la recherche rapide — écrans publics et patient. */
  recherche?: boolean;
  /** Rappel du prochain rendez-vous sous la barre (patient uniquement). */
  bandeauRdv?: boolean;
  /** Action supplémentaire, insérée avant les actions standard. */
  droite?: React.ReactNode;
}) {
  const { figee, sentinelle } = useBarreFigee();
  const [rechercheOuverte, setRechercheOuverte] = useState(false);
  useTraceNavigation();
  const classes = ["topbar", "md:hidden"];
  // « hero » côté API, `.transparente` côté CSS : la classe `.hero` appartient
  // déjà au bandeau bleu de la maquette (voir le renommage dans mobile.css).
  if (variante === "marque") classes.push("marque");
  if (variante === "hero") classes.push("transparente");
  if (figee) classes.push("figee");

  return (
    <>
      {/* Sentinelle de scroll (1px, compensé) : voir useBarreFigee. */}
      <div ref={sentinelle} aria-hidden className="md:hidden" style={{ height: 1, marginBottom: -1 }} />
      <header className={classes.join(" ")}>
        {retour && <BoutonRetour repli={retour} />}

        {(variante === "marque" || variante === "hero") && (
          <Logo
            hauteur={34}
            surFonce={variante === "hero" && !figee}
            priority
            className="flex items-center"
          />
        )}

        {titre && (
          <div className="tb-titre">
            <h3>{titre}</h3>
            {sousTitre && <div className="sub">{sousTitre}</div>}
          </div>
        )}

        <div className="tb-actions">
          {droite}
          {recherche && (
            <button
              type="button"
              className="tb-btn"
              aria-label="Rechercher un médecin"
              aria-haspopup="dialog"
              aria-expanded={rechercheOuverte}
              onClick={() => setRechercheOuverte(true)}
            >
              🔎
            </button>
          )}
          {actions && <ActionsCompte />}
        </div>
      </header>
      {recherche && (
        <RechercheRapide ouvert={rechercheOuverte} fermer={() => setRechercheOuverte(false)} />
      )}
      {/* Jamais sous la variante hero : le héros remonte sous la barre par
          `.topbar.transparente + .hero`, un élément intercalé casserait la
          règle (et le bandeau se retrouverait sous le dégradé). */}
      {bandeauRdv && variante !== "hero" && <BandeauProchainRdv />}
    </>
  );
}

/** Clé de session mémorisant la profondeur de navigation (voir BoutonRetour). */
const CLE_PILE = "d224:pile-navigation";

type Pile = { chemin: string; profondeur: number };

function lirePile(): Pile | null {
  try {
    const brut = sessionStorage.getItem(CLE_PILE);
    return brut ? (JSON.parse(brut) as Pile) : null;
  } catch {
    return null;
  }
}

/**
 * Compte les écrans traversés dans cet onglet. Un rechargement ne compte pas
 * (même chemin), pour qu'un rechargement de la page d'entrée ne fasse jamais
 * croire à un historique interne — et donc ne fasse jamais sortir du site.
 */
function useTraceNavigation() {
  const pathname = usePathname();
  useEffect(() => {
    const pile = lirePile();
    if (pile?.chemin === pathname) return;
    try {
      sessionStorage.setItem(
        CLE_PILE,
        JSON.stringify({ chemin: pathname, profondeur: (pile?.profondeur ?? 0) + 1 })
      );
    } catch {
      /* navigation privée : on retombera simplement sur le lien de repli */
    }
  }, [pathname]);
}

/**
 * Retour : reste un vrai lien (ouverture dans un onglet, clic droit…), mais
 * si l'application a déjà affiché un écran précédent dans cet onglet, le clic
 * fait un vrai `router.back()` au lieu de suivre le lien de repli en dur.
 */
function BoutonRetour({ repli }: { repli: string }) {
  const router = useRouter();
  return (
    <Link
      href={repli}
      className="tb-btn"
      aria-label="Retour"
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if ((lirePile()?.profondeur ?? 0) <= 1) return;
        e.preventDefault();
        router.back();
      }}
    >
      ←
    </Link>
  );
}

/** Cloche (inerte jusqu'à l'étape D) + avatar ouvrant le tiroir, ou « Se connecter ». */
function ActionsCompte() {
  const { profil, chargement } = useProfilConnecte();
  const [tiroirOuvert, setTiroirOuvert] = useState(false);
  const fermer = useCallback(() => setTiroirOuvert(false), []);

  // Réserve la place pendant la lecture de la session : pas de sursaut.
  if (chargement) return <span className="tb-btn" style={{ opacity: 0 }} aria-hidden />;

  if (!profil) {
    return (
      <Link href="/connexion" className="tb-connexion">
        Se connecter
      </Link>
    );
  }

  const initiales = `${profil.prenom.charAt(0)}${profil.nom.charAt(0)}`.toUpperCase() || "?";

  return (
    <>
      {/* La cloche sera branchée sur la table `notifications` à l'étape D ;
          elle mène pour l'instant à la liste des rendez-vous. */}
      <Link href="/mes-rendez-vous" className="tb-btn" aria-label="Notifications">
        🔔
      </Link>
      <button
        type="button"
        className="tb-avatar"
        aria-label={`Menu — ${profil.prenom} ${profil.nom}`}
        aria-haspopup="dialog"
        aria-expanded={tiroirOuvert}
        onClick={() => setTiroirOuvert(true)}
      >
        {initiales}
      </button>
      <TiroirMobile ouvert={tiroirOuvert} fermer={fermer} profil={profil} />
    </>
  );
}

/**
 * Passe la barre en « figée » (fond opaque + ombre) dès que la page défile.
 * Une sentinelle placée juste au-dessus de la barre est observée, plutôt
 * qu'un écouteur de scroll : aucun travail sur le fil principal à chaque
 * pixel, et la bascule suit exactement le décollement de la barre collante.
 */
function useBarreFigee(): { figee: boolean; sentinelle: React.RefObject<HTMLDivElement | null> } {
  const [figee, setFigee] = useState(false);
  const sentinelle = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const cible = sentinelle.current;
    if (!cible) return;
    const observateur = new IntersectionObserver(([e]) => setFigee(!e.isIntersecting), {
      threshold: 0,
    });
    observateur.observe(cible);
    return () => observateur.disconnect();
  }, []);

  return { figee, sentinelle };
}
