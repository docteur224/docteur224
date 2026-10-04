"use client";

import { useEffect, useState } from "react";

/**
 * Compte à rebours de la page de maintenance.
 *
 * L'échéance est calculée côté client : affichée côté serveur, elle figerait
 * à la seconde du rendu (et le cache de la page la gèlerait plus longtemps
 * encore). On part donc d'un rendu neutre jusqu'au montage, pour éviter tout
 * écart d'hydratation entre serveur et navigateur.
 */
function reste(cible: number): { j: number; h: number; m: number; s: number } | null {
  const ecart = cible - Date.now();
  if (ecart <= 0) return null;
  const s = Math.floor(ecart / 1000);
  return {
    j: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  };
}

export default function CompteARebours({ jusqua }: { jusqua: string }) {
  const cible = new Date(jusqua).getTime();
  const [restant, setRestant] = useState<ReturnType<typeof reste> | undefined>(undefined);

  useEffect(() => {
    if (Number.isNaN(cible)) return;
    // La première mise à jour passe par un timer (et non le corps de l'effet) :
    // elle reste donc asynchrone, ce qui évite à la fois un écart d'hydratation
    // et une cascade de rendus synchrones.
    const maj = () => setRestant(reste(cible));
    const immediat = setTimeout(maj, 0);
    const t = setInterval(maj, 1000);
    return () => {
      clearTimeout(immediat);
      clearInterval(t);
    };
  }, [cible]);

  if (Number.isNaN(cible)) return null;

  // Avant le montage (restant === undefined) on ne rend rien pour ne pas
  // afficher un compteur qui sauterait à l'hydratation.
  if (restant === undefined) return null;

  if (restant === null) {
    return (
      <p className="mt-6 text-[14px] font-semibold text-teal">
        Nous terminons les derniers réglages — merci de rafraîchir la page dans un instant.
      </p>
    );
  }

  const cases: { valeur: number; libelle: string }[] = [
    { valeur: restant.j, libelle: "jours" },
    { valeur: restant.h, libelle: "heures" },
    { valeur: restant.m, libelle: "min" },
    { valeur: restant.s, libelle: "sec" },
  ];
  // Les jours ne s'affichent que s'il y en a : « 0 j » parasiterait le cas
  // courant d'une maintenance de quelques heures.
  const visibles = restant.j > 0 ? cases : cases.slice(1);

  return (
    <div className="mt-4 sm:mt-7">
      <p className="mb-2 text-[11.5px] font-bold uppercase tracking-[0.06em] text-muted sm:mb-3 sm:text-[12.5px]">
        Retour estimé dans
      </p>
      <div className="flex justify-center gap-2 sm:gap-3" role="timer" aria-live="off">
        {visibles.map((c) => (
          <div
            key={c.libelle}
            className="min-w-[52px] rounded-xl border border-line bg-bg px-2.5 py-2 sm:min-w-[68px] sm:rounded-2xl sm:py-2.5"
          >
            <b className="block text-[22px] font-extrabold leading-none tabular-nums text-blue sm:text-[30px]">
              {String(c.valeur).padStart(2, "0")}
            </b>
            <small className="mt-0.5 block text-[10px] font-bold uppercase tracking-[0.04em] text-muted sm:mt-1 sm:text-[10.5px]">
              {c.libelle}
            </small>
          </div>
        ))}
      </div>
    </div>
  );
}
