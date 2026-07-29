"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import type { GroupeFiltre } from "@/lib/filtres";

/**
 * Colonne de filtres de la page de résultats (web) et barre de filtres
 * mobile. L'état vit dans l'URL : la page de résultats est un composant
 * serveur qui relit searchParams, et le lien reste partageable.
 *
 * Les groupes eux-mêmes sont construits côté serveur (lib/filtres.ts) à
 * partir du référentiel, puis passés en props.
 */

/** Lit/écrit les filtres dans l'URL sans perdre la recherche en cours. */
function useFiltres(groupes: GroupeFiltre[]) {
  const router = useRouter();
  const params = useSearchParams();

  const estActif = useCallback(
    (param: string, valeur: string) => params.getAll(param).includes(valeur),
    [params]
  );

  const basculer = useCallback(
    (param: string, valeur: string, multiple: boolean) => {
      const suivant = new URLSearchParams(params.toString());
      const actuelles = suivant.getAll(param);
      suivant.delete(param);
      if (multiple) {
        // Case à cocher : on ajoute ou on retire la valeur des autres.
        const restantes = actuelles.includes(valeur)
          ? actuelles.filter((v) => v !== valeur)
          : [...actuelles, valeur];
        for (const v of restantes) suivant.append(param, v);
      } else if (!actuelles.includes(valeur)) {
        // Choix unique : recliquer sur l'option active la désélectionne.
        suivant.set(param, valeur);
      }
      const qs = suivant.toString();
      router.replace(qs ? `/resultats?${qs}` : "/resultats", { scroll: false });
    },
    [params, router]
  );

  const nbActifs = groupes.reduce((n, g) => n + params.getAll(g.param).length, 0);

  const reinitialiser = useCallback(() => {
    const suivant = new URLSearchParams(params.toString());
    for (const g of groupes) suivant.delete(g.param);
    const qs = suivant.toString();
    router.replace(qs ? `/resultats?${qs}` : "/resultats", { scroll: false });
  }, [params, router, groupes]);

  return { estActif, basculer, nbActifs, reinitialiser };
}

/** Colonne de filtres — version web (≥ lg). */
export function FiltresWeb({ groupes }: { groupes: GroupeFiltre[] }) {
  const { estActif, basculer, nbActifs, reinitialiser } = useFiltres(groupes);

  return (
    <aside className="hidden h-fit rounded-2xl border border-line bg-white p-5 lg:sticky lg:top-[86px] lg:block">
      {nbActifs > 0 && (
        <button
          type="button"
          onClick={reinitialiser}
          className="mb-3 w-full rounded-lg border border-line py-2 text-[12px] font-bold text-blue transition-colors hover:border-teal"
        >
          Effacer les filtres ({nbActifs})
        </button>
      )}
      {groupes.map((groupe, i) => (
        <div
          key={groupe.titre}
          className={`py-[14px] ${i === 0 && nbActifs === 0 ? "pt-0" : ""} ${
            i === groupes.length - 1 ? "border-b-0 pb-0" : "border-b border-line"
          }`}
        >
          <div className="mb-[10px] text-xs font-extrabold uppercase tracking-[.05em] text-ink">
            {groupe.titre}
          </div>
          {groupe.options.map((option) => {
            const actif = estActif(groupe.param, option.valeur);
            return (
              <label
                key={option.valeur}
                className="flex cursor-pointer items-center gap-[9px] py-[5px] text-[13px] text-muted transition-colors hover:text-blue"
              >
                <input
                  type="checkbox"
                  checked={actif}
                  onChange={() => basculer(groupe.param, option.valeur, groupe.multiple)}
                  className="sr-only"
                />
                <span
                  aria-hidden
                  className={`grid h-[17px] w-[17px] flex-none place-items-center rounded-[5px] border-[1.5px] text-[11px] font-bold text-white transition-colors ${
                    actif ? "border-teal bg-teal" : "border-line bg-white"
                  }`}
                >
                  {actif ? "✓" : ""}
                </span>
                <span className={actif ? "font-bold text-blue" : ""}>{option.label}</span>
              </label>
            );
          })}
        </div>
      ))}
    </aside>
  );
}

/** Barre de filtres horizontale — version mobile. */
export function FiltresMobile({ groupes }: { groupes: GroupeFiltre[] }) {
  const { estActif, basculer, nbActifs, reinitialiser } = useFiltres(groupes);

  return (
    <div className="filterbar">
      <button
        type="button"
        className={`fb${nbActifs === 0 ? " on" : ""}`}
        onClick={reinitialiser}
      >
        Tous
      </button>
      {groupes.flatMap((groupe) =>
        groupe.options.map((option) => {
          const actif = estActif(groupe.param, option.valeur);
          return (
            <button
              key={`${groupe.param}-${option.valeur}`}
              type="button"
              className={`fb${actif ? " on" : ""}`}
              onClick={() => basculer(groupe.param, option.valeur, groupe.multiple)}
            >
              {option.label}
            </button>
          );
        })
      )}
    </div>
  );
}
