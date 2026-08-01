"use client";

import type { DefinitionEtape } from "@/lib/inscription-pro";

/**
 * Fil d'Ariane du parcours d'inscription professionnel, posé DANS la carte
 * du formulaire (et non en pleine largeur : sur l'écran « Compte » la barre
 * traversait le panneau promotionnel de droite, qui n'a rien à voir).
 *
 * Forme compacte imposée par la largeur disponible : 7 étapes libellées
 * font ~860 px pour une colonne de ~520 px. Seule l'étape courante porte
 * son libellé ; les autres restent des pastilles numérotées (✓ si faite),
 * leur libellé n'étant conservé que pour les lecteurs d'écran.
 */
export default function Stepper({
  etapes,
  courante,
  className = "",
}: {
  etapes: DefinitionEtape[];
  courante: string;
  className?: string;
}) {
  const indexCourant = Math.max(0, etapes.findIndex((e) => e.id === courante));
  return (
    <nav
      aria-label="Étapes de l'inscription"
      className={`-mx-1 overflow-x-auto px-1 ${className}`}
    >
      <ol className="flex w-max items-center gap-1">
        {etapes.map((etape, i) => {
          const fait = i < indexCourant;
          const actif = i === indexCourant;
          return (
            <li key={etape.id} className="flex items-center gap-1" title={etape.label}>
              {i > 0 && (
                <span
                  aria-hidden
                  className={`h-[2px] w-2 rounded md:w-3 ${fait || actif ? "bg-teal" : "bg-line"}`}
                />
              )}
              <span
                className="flex items-center gap-1.5"
                aria-current={actif ? "step" : undefined}
              >
                <span
                  aria-hidden
                  className={`grid h-5 w-5 flex-none place-items-center rounded-full text-[11px] font-extrabold md:h-[22px] md:w-[22px] ${
                    fait
                      ? "bg-green-soft text-green"
                      : actif
                        ? "bg-teal text-white"
                        : "border border-line bg-white text-muted"
                  }`}
                >
                  {fait ? "✓" : i + 1}
                </span>
                {actif ? (
                  <span className="whitespace-nowrap text-[12.5px] font-extrabold text-blue">
                    {etape.label}
                  </span>
                ) : (
                  <span className="sr-only">{etape.label}</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
