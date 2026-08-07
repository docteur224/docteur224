"use client";

import Link from "next/link";
import { useState } from "react";
import { SPECIALITES_ACCUEIL } from "@/lib/catalogue-specialites";

/*
 * Section « Trouvez le bon spécialiste » de l'accueil, web et mobile.
 *
 * Les deux variantes partagent la même liste et la même règle de dépliage,
 * mais pas leur mise en forme : la version web est une grille centrée qui
 * retombe à la ligne, la version mobile un carrousel horizontal (.chips
 * .scroll) où l'on fait défiler du pouce. D'où un seul composant à deux
 * rendus plutôt que deux composants à tenir en phase.
 *
 * Client, uniquement pour l'état « déplié » : la liste elle-même est
 * calculée sur le serveur (voir specialitesEnAvant), et rendue telle quelle
 * au premier affichage.
 */

export interface SpecialiteVedette {
  nom: string;
  emoji: string;
}

export default function GrilleSpecialites({
  specialites,
  variante,
  maximum = SPECIALITES_ACCUEIL,
}: {
  specialites: SpecialiteVedette[];
  variante: "web" | "mobile";
  maximum?: number;
}) {
  const [tout, setTout] = useState(false);

  const reste = specialites.length - maximum;
  const visibles = tout ? specialites : specialites.slice(0, maximum);
  // Sans reste a montrer, le bouton ne ferait que promettre du vide.
  const deployable = reste > 0;

  if (variante === "mobile") {
    return (
      <div className="chips scroll">
        {visibles.map((s) => (
          <Link
            key={s.nom}
            href={`/resultats?specialite=${encodeURIComponent(s.nom)}`}
            className="speccard"
          >
            <span className="em" aria-hidden>
              {s.emoji}
            </span>
            <b>{s.nom}</b>
          </Link>
        ))}
        {deployable && (
          // Dernière carte du carrousel plutôt qu'un bouton sous la bande :
          // le pouce arrive dessus en poursuivant son geste de défilement.
          <button
            type="button"
            onClick={() => setTout(!tout)}
            aria-expanded={tout}
            className="speccard"
          >
            <span className="em" aria-hidden>
              {tout ? "➖" : "➕"}
            </span>
            <b>{tout ? "Voir moins" : `Voir plus (${reste})`}</b>
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="mt-[26px] flex flex-wrap justify-center gap-3">
        {visibles.map((s) => (
          <Link
            key={s.nom}
            href={`/resultats?specialite=${encodeURIComponent(s.nom)}`}
            className="flex min-w-[104px] flex-col items-center gap-[7px] rounded-[14px] border border-line bg-white px-5 py-4 transition hover:-translate-y-0.5 hover:shadow-[0_8px_18px_rgba(16,59,80,.1)]"
          >
            <span className="text-[26px]" aria-hidden>
              {s.emoji}
            </span>
            <b className="text-[13px] font-bold">{s.nom}</b>
          </Link>
        ))}
      </div>
      {deployable && (
        <div className="mt-5 text-center">
          <button
            type="button"
            onClick={() => setTout(!tout)}
            aria-expanded={tout}
            className="rounded-full border-[1.5px] border-line bg-white px-[18px] py-[9px] text-[13px] font-bold text-blue transition-colors hover:border-teal hover:bg-teal-soft"
          >
            {tout ? "Voir moins" : `Voir plus (${reste})`}
          </button>
        </div>
      )}
    </>
  );
}
