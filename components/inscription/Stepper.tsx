"use client";

import type { DefinitionEtape } from "@/lib/inscription-pro";

/**
 * Fil d'Ariane numéroté du parcours d'inscription professionnel.
 * Fait = vert (✓), courant = teal plein, à venir = gris. Défile
 * horizontalement sur petit écran.
 */
export default function Stepper({
  etapes,
  courante,
}: {
  etapes: DefinitionEtape[];
  courante: string;
}) {
  const indexCourant = Math.max(0, etapes.findIndex((e) => e.id === courante));
  return (
    <nav aria-label="Étapes de l'inscription" className="overflow-x-auto border-b border-line bg-white">
      <ol className="mx-auto flex w-max items-center gap-1 px-4 py-3 md:gap-2">
        {etapes.map((etape, i) => {
          const fait = i < indexCourant;
          const actif = i === indexCourant;
          return (
            <li key={etape.id} className="flex items-center gap-1 md:gap-2">
              {i > 0 && (
                <span
                  aria-hidden
                  className={`h-[2px] w-4 rounded md:w-7 ${fait || actif ? "bg-teal" : "bg-line"}`}
                />
              )}
              <span
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-full py-1 pl-1 pr-2 text-[11.5px] font-bold md:text-[12.5px] ${
                  actif ? "text-blue" : fait ? "text-green" : "text-muted"
                }`}
                aria-current={actif ? "step" : undefined}
              >
                <span
                  aria-hidden
                  className={`grid h-[22px] w-[22px] flex-none place-items-center rounded-full text-[11px] font-extrabold ${
                    fait
                      ? "bg-green-soft text-green"
                      : actif
                        ? "bg-teal text-white"
                        : "border border-line bg-white text-muted"
                  }`}
                >
                  {fait ? "✓" : i + 1}
                </span>
                {etape.label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
