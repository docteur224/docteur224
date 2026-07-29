"use client";

import { useEffect, useId, useState } from "react";

/*
 * Onglets de la fiche médecin (Présentation / Établissement / Avis).
 * Les volets arrivent déjà rendus par le serveur : ce composant ne gère que
 * la sélection, pour ne pas basculer toute la fiche côté client.
 */

export interface Onglet {
  cle: string;
  label: string;
  contenu: React.ReactNode;
}

/**
 * Événement écouté pour ouvrir un onglet depuis l'extérieur (le badge
 * « ★ 4,8 (12 avis) » de l'en-tête ouvre l'onglet Avis). Passer par un
 * événement évite de rendre toute l'en-tête cliente juste pour ça.
 */
export const EVENEMENT_ONGLET = "docteur224:ouvrir-onglet";

export default function OngletsFiche({ onglets }: { onglets: Onglet[] }) {
  const [actif, setActif] = useState(onglets[0]?.cle ?? "");
  const base = useId();

  useEffect(() => {
    const ouvrir = (e: Event) => {
      const cle = (e as CustomEvent<string>).detail;
      if (onglets.some((o) => o.cle === cle)) setActif(cle);
    };
    window.addEventListener(EVENEMENT_ONGLET, ouvrir);
    return () => window.removeEventListener(EVENEMENT_ONGLET, ouvrir);
  }, [onglets]);

  return (
    <>
      <div
        id="onglets-fiche"
        role="tablist"
        aria-label="Sections de la fiche"
        className="flex gap-1 border-b border-line px-[26px] scroll-mt-4"
      >
        {onglets.map((o) => {
          const selectionne = o.cle === actif;
          return (
            <button
              key={o.cle}
              type="button"
              role="tab"
              id={`${base}-${o.cle}-onglet`}
              aria-selected={selectionne}
              aria-controls={`${base}-${o.cle}-volet`}
              onClick={() => setActif(o.cle)}
              className={`mr-[18px] border-b-[2.5px] px-1.5 py-[15px] text-[13.5px] font-bold transition-colors ${
                selectionne
                  ? "border-teal text-blue"
                  : "border-transparent text-muted hover:text-blue"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>

      {onglets.map((o) => (
        <div
          key={o.cle}
          role="tabpanel"
          id={`${base}-${o.cle}-volet`}
          aria-labelledby={`${base}-${o.cle}-onglet`}
          hidden={o.cle !== actif}
        >
          {o.contenu}
        </div>
      ))}
    </>
  );
}
