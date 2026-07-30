"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { LIBELLE_ROLE, RACCOURCIS_PATIENT, menuDuRole } from "@/components/mobile/menus-roles";
import { seDeconnecter } from "@/lib/auth";
import type { ProfilConnecte } from "@/lib/patient";

/**
 * Tiroir de navigation mobile — le menu complet du rôle connecté, ouvert par
 * l'avatar de la barre haute. Il existe parce que la tabbar ne porte que 4
 * destinations : sans lui, la moitié des écrans de chaque espace (visibles
 * dans la sidebar web) n'étaient atteignables que par des pages « hub ».
 *
 * Les entrées sont le miroir des sidebars (components/mobile/menus-roles.ts).
 */
export default function TiroirMobile({
  ouvert,
  fermer,
  profil,
}: {
  ouvert: boolean;
  fermer: () => void;
  profil: ProfilConnecte;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { panneau, glissement } = useGlissementFermeture(fermer, ouvert);
  const { role, entrees } = menuDuRole(profil.role);
  const initiales = `${profil.prenom.charAt(0)}${profil.nom.charAt(0)}`.toUpperCase() || "?";

  // Fermeture au changement d'écran : sans cela, le tiroir resterait ouvert
  // par-dessus la page d'arrivée après un clic sur un lien.
  useEffect(() => {
    if (ouvert) fermer();
    // `fermer` est stable côté appelant ; on ne réagit qu'au changement d'URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Échap, fond de page figé, et focus amené dans le tiroir.
  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") fermer();
      if (e.key === "Tab") piegerFocus(e, panneau.current);
    };
    document.addEventListener("keydown", surTouche);
    const debordement = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panneau.current?.querySelector<HTMLElement>("[data-focus-initial]")?.focus();
    return () => {
      document.removeEventListener("keydown", surTouche);
      document.body.style.overflow = debordement;
    };
  }, [ouvert, fermer, panneau]);

  return (
    <div className={`tiroir-hote md:hidden${ouvert ? " ouvert" : ""}`} aria-hidden={!ouvert}>
      <button
        type="button"
        className="tiroir-voile"
        aria-label="Fermer le menu"
        tabIndex={ouvert ? 0 : -1}
        onClick={fermer}
      />
      <div
        ref={panneau}
        className="tiroir"
        role="dialog"
        aria-modal={ouvert}
        aria-label="Menu"
        {...glissement}
      >
        <div className="tiroir-tete">
          <span className="tb-avatar" aria-hidden>
            {initiales}
          </span>
          <div className="tiroir-qui">
            <b>
              {profil.prenom} {profil.nom}
            </b>
            <small>
              {LIBELLE_ROLE[role]}
              {profil.telephone ? ` · ${profil.telephone}` : ""}
            </small>
          </div>
          <button
            type="button"
            className="tb-btn"
            aria-label="Fermer le menu"
            data-focus-initial
            tabIndex={ouvert ? 0 : -1}
            onClick={fermer}
          >
            ✕
          </button>
        </div>

        <nav className="tiroir-liens" aria-label={`Menu ${LIBELLE_ROLE[role]}`}>
          {entrees.map((e) => {
            const actif = pathname === e.href || pathname.startsWith(`${e.href}/`);
            return (
              <Link
                key={e.href}
                href={e.href}
                className={actif ? "on" : undefined}
                aria-current={actif ? "page" : undefined}
                tabIndex={ouvert ? 0 : -1}
              >
                <span className="i" aria-hidden>
                  {e.icone}
                </span>
                {e.label}
              </Link>
            );
          })}

          {role === "patient" && (
            <>
              <div className="tiroir-separateur" role="presentation" />
              {RACCOURCIS_PATIENT.map((e) => (
                <Link key={e.href} href={e.href} tabIndex={ouvert ? 0 : -1}>
                  <span className="i" aria-hidden>
                    {e.icone}
                  </span>
                  {e.label}
                </Link>
              ))}
            </>
          )}

          <div className="tiroir-separateur" role="presentation" />
          {/* Sélecteur de langue : décoratif, comme le « FR ⌄ » du TopNav web. */}
          <div className="tiroir-info">
            <span className="i" aria-hidden>
              🌐
            </span>
            Langue
            <b>Français</b>
          </div>
          <button
            type="button"
            className="tiroir-quitter"
            tabIndex={ouvert ? 0 : -1}
            onClick={async () => {
              fermer();
              await seDeconnecter();
              router.push("/");
            }}
          >
            <span className="i" aria-hidden>
              ↩️
            </span>
            Déconnexion
          </button>
        </nav>
      </div>
    </div>
  );
}

/** Garde la tabulation à l'intérieur du tiroir tant qu'il est ouvert. */
function piegerFocus(e: KeyboardEvent, panneau: HTMLElement | null) {
  if (!panneau) return;
  const focalisables = panneau.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  if (focalisables.length === 0) return;
  const premier = focalisables[0];
  const dernier = focalisables[focalisables.length - 1];
  if (e.shiftKey && document.activeElement === premier) {
    e.preventDefault();
    dernier.focus();
  } else if (!e.shiftKey && document.activeElement === dernier) {
    e.preventDefault();
    premier.focus();
  }
}

/**
 * Fermeture au glissement vers la droite. La translation est écrite
 * directement sur le nœud pendant le geste : suivre le doigt par un état
 * React re-rendrait le tiroir à chaque pixel.
 *
 * Le hook porte lui-même la référence du panneau et la rend à l'appelant :
 * écrire dans un ref reçu en argument est refusé par react-hooks/immutability.
 */
function useGlissementFermeture(fermer: () => void, ouvert: boolean) {
  const panneau = useRef<HTMLDivElement | null>(null);
  const depart = useRef<number | null>(null);

  const finir = (annuler: boolean) => {
    const noeud = panneau.current;
    if (!noeud) return;
    noeud.style.transition = "";
    noeud.style.transform = "";
    depart.current = null;
    if (!annuler) fermer();
  };

  const glissement = {
    onTouchStart: (e: React.TouchEvent) => {
      if (!ouvert) return;
      depart.current = e.touches[0].clientX;
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (depart.current === null || !panneau.current) return;
      const ecart = e.touches[0].clientX - depart.current;
      if (ecart <= 0) return; // vers la gauche : rien à fermer
      panneau.current.style.transition = "none";
      panneau.current.style.transform = `translateX(${ecart}px)`;
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (depart.current === null) return;
      const ecart = (e.changedTouches[0]?.clientX ?? depart.current) - depart.current;
      finir(ecart <= 70);
    },
    onTouchCancel: () => finir(true),
  };

  return { panneau, glissement };
}
