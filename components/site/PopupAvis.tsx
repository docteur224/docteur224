"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import PanneauAvis from "@/components/site/PanneauAvis";
import { chargerAvisMedecin, type AvisPublic } from "@/lib/donnees";

/*
 * Détail des avis en popup, depuis le badge « ★ x,x (n avis) » d'une carte de
 * résultats. Ouvrir la fiche complète du médecin ferait perdre la position de
 * défilement et les filtres actifs de la recherche ; un popup scrollable
 * garde ce contexte intact — même scaffolding que le popup de FiltresAvances
 * (feuille qui remonte du bas sur mobile, dialog centré au-delà).
 *
 * Les avis ne sont chargés qu'à la première ouverture : la plupart des
 * cartes d'une page de résultats ne sont jamais cliquées, inutile de les
 * précharger toutes.
 */

export default function PopupAvis({
  medecinId,
  medecinNom,
  className,
  children,
}: {
  medecinId: string;
  medecinNom: string;
  /** Classes du déclencheur — reprend exactement le style du badge existant. */
  className?: string;
  children: React.ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [avis, setAvis] = useState<AvisPublic[] | null>(null);

  useEffect(() => {
    if (!ouvert || avis !== null) return;
    let actif = true;
    chargerAvisMedecin(medecinId).then((donnees) => {
      if (actif) setAvis(donnees);
    });
    return () => {
      actif = false;
    };
  }, [ouvert, avis, medecinId]);

  // Échap ferme le popup, comme celui de FiltresAvances.
  useEffect(() => {
    if (!ouvert) return;
    const auClavier = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOuvert(false);
    };
    document.addEventListener("keydown", auClavier);
    return () => document.removeEventListener("keydown", auClavier);
  }, [ouvert]);

  return (
    <>
      {/* La carte entière est souvent elle-même cliquable (lien vers la
          fiche) : stopper la propagation évite qu'ouvrir le popup ne
          déclenche aussi cette navigation, au clic comme au clavier. */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOuvert(true);
        }}
        onKeyDown={(e) => e.stopPropagation()}
        aria-haspopup="dialog"
        className={className}
      >
        {children}
      </button>

      {ouvert &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
            onClick={() => setOuvert(false)}
            role="presentation"
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Avis de ${medecinNom}`}
              onClick={(e) => e.stopPropagation()}
              className="flex max-h-[85vh] w-full max-w-[520px] flex-col rounded-t-2xl bg-white shadow-[0_20px_50px_rgba(0,0,0,.3)] sm:rounded-2xl"
            >
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <b className="text-[15px] font-extrabold">Avis · {medecinNom}</b>
                <button
                  type="button"
                  onClick={() => setOuvert(false)}
                  aria-label="Fermer"
                  className="grid h-8 w-8 flex-none place-items-center rounded-full text-lg text-muted transition-colors hover:bg-bg hover:text-ink"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-auto">
                {avis === null ? (
                  <div className="p-8 text-center text-[13px] text-muted">
                    Chargement des avis…
                  </div>
                ) : (
                  <PanneauAvis avis={avis} nomMedecin={medecinNom} />
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
