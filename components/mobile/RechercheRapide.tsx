"use client";

import { useEffect, useState } from "react";
import { RechercheResultatsMobile } from "@/components/site/RechercheResultats";
import { chargerNomsRecherche, chargerSpecialites, chargerVilles } from "@/lib/donnees";

/**
 * Recherche rapide — le formulaire de recherche à un tap depuis n'importe
 * quel écran public ou patient. Chercher un médecin est le geste central de
 * l'application : il ne devait pas obliger à revenir à l'accueil.
 *
 * Le formulaire est celui de la page de résultats (mêmes champs, même
 * autocomplétion), et les référentiels ne sont chargés qu'à la première
 * ouverture, puis gardés pour la session.
 */

let cacheReferentiels: { specialites: string[]; villes: string[]; noms: string[] } | undefined;

export default function RechercheRapide({
  ouvert,
  fermer,
}: {
  ouvert: boolean;
  fermer: () => void;
}) {
  const referentiels = useReferentiels(ouvert);

  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") fermer();
    };
    document.addEventListener("keydown", surTouche);
    const debordement = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", surTouche);
      document.body.style.overflow = debordement;
    };
  }, [ouvert, fermer]);

  return (
    <div className={`recherche-hote md:hidden${ouvert ? " ouvert" : ""}`} aria-hidden={!ouvert}>
      <button
        type="button"
        className="recherche-voile"
        aria-label="Fermer la recherche"
        tabIndex={ouvert ? 0 : -1}
        onClick={fermer}
      />
      <div className="recherche-feuille" role="dialog" aria-modal={ouvert} aria-label="Rechercher">
        <div className="recherche-tete">
          <b>Rechercher</b>
          <button
            type="button"
            className="tb-btn"
            aria-label="Fermer la recherche"
            tabIndex={ouvert ? 0 : -1}
            onClick={fermer}
          >
            ✕
          </button>
        </div>
        {referentiels ? (
          <RechercheResultatsMobile
            specialite=""
            ville=""
            q=""
            specialites={referentiels.specialites}
            villes={referentiels.villes}
            nomsMedecins={referentiels.noms}
          />
        ) : (
          <p className="recherche-attente">Chargement des spécialités…</p>
        )}
      </div>
    </div>
  );
}

/** Référentiels chargés à la première ouverture seulement. */
function useReferentiels(ouvert: boolean) {
  const [referentiels, setReferentiels] = useState(cacheReferentiels);

  useEffect(() => {
    if (!ouvert || cacheReferentiels) return;
    let actif = true;
    Promise.all([chargerSpecialites(), chargerVilles(), chargerNomsRecherche()]).then(
      ([specialites, villes, noms]) => {
        cacheReferentiels = { specialites: specialites.map((s) => s.nom), villes, noms };
        if (actif) setReferentiels(cacheReferentiels);
      }
    );
    return () => {
      actif = false;
    };
  }, [ouvert]);

  return referentiels;
}
