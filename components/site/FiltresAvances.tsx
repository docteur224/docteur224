"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { GroupeFiltre } from "@/lib/filtres";

/**
 * Barre de filtres avancés de la page de résultats : deux boutons qui
 * ouvrent chacun un popup — « Filtres » (disponibilité, langues, sexe) et
 * « Disponibilités » (raccourci vers le seul horizon).
 *
 * Les sélections ne sont appliquées qu'au clic sur « Afficher les
 * résultats » : le patient peut cocher plusieurs cases sans recharger la
 * page à chaque fois. Fermer le popup sans valider annule les changements.
 *
 * L'état validé vit dans l'URL, comme la colonne latérale, pour que la page
 * reste un composant serveur et que le lien soit partageable.
 */

/** Sélection en cours d'édition : param -> valeurs. */
type Selection = Record<string, string[]>;

function selectionDepuisURL(params: URLSearchParams, groupes: GroupeFiltre[]): Selection {
  const s: Selection = {};
  for (const g of groupes) s[g.param] = params.getAll(g.param);
  return s;
}

function Popup({
  titre,
  groupes,
  surFermer,
}: {
  titre: string;
  groupes: GroupeFiltre[];
  surFermer: () => void;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [selection, setSelection] = useState<Selection>(() =>
    selectionDepuisURL(new URLSearchParams(params.toString()), groupes)
  );

  // Échap ferme le popup, comme n'importe quelle boîte de dialogue.
  useEffect(() => {
    function auClavier(e: KeyboardEvent) {
      if (e.key === "Escape") surFermer();
    }
    document.addEventListener("keydown", auClavier);
    return () => document.removeEventListener("keydown", auClavier);
  }, [surFermer]);

  function basculer(groupe: GroupeFiltre, valeur: string) {
    setSelection((s) => {
      const actuelles = s[groupe.param] ?? [];
      if (groupe.multiple) {
        return {
          ...s,
          [groupe.param]: actuelles.includes(valeur)
            ? actuelles.filter((v) => v !== valeur)
            : [...actuelles, valeur],
        };
      }
      // Choix unique : recliquer sur l'option active la désélectionne.
      return { ...s, [groupe.param]: actuelles.includes(valeur) ? [] : [valeur] };
    });
  }

  const appliquer = useCallback(() => {
    const suivant = new URLSearchParams(params.toString());
    for (const g of groupes) {
      suivant.delete(g.param);
      for (const v of selection[g.param] ?? []) suivant.append(g.param, v);
    }
    const qs = suivant.toString();
    router.replace(qs ? `/resultats?${qs}` : "/resultats", { scroll: false });
    surFermer();
  }, [params, groupes, selection, router, surFermer]);

  const effacer = useCallback(() => {
    setSelection(Object.fromEntries(groupes.map((g) => [g.param, []])));
  }, [groupes]);

  const nbSelection = groupes.reduce((n, g) => n + (selection[g.param]?.length ?? 0), 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      onClick={surFermer}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titre}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-[520px] flex-col rounded-t-2xl bg-white shadow-[0_20px_50px_rgba(0,0,0,.3)] sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <b className="text-[15px] font-extrabold">{titre}</b>
          <button
            type="button"
            onClick={surFermer}
            aria-label="Fermer"
            className="grid h-8 w-8 place-items-center rounded-full text-lg text-muted transition-colors hover:bg-bg hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4">
          {groupes.map((groupe) => (
            <div key={groupe.param} className="mb-5 last:mb-0">
              <div className="mb-2 text-[13px] font-extrabold text-ink">{groupe.titre}</div>
              <div className="overflow-hidden rounded-xl border border-line">
                {groupe.options.map((option, i) => {
                  const actif = (selection[groupe.param] ?? []).includes(option.valeur);
                  return (
                    <label
                      key={option.valeur}
                      className={`flex cursor-pointer items-center gap-3 px-4 py-3 text-[13.5px] transition-colors ${
                        i > 0 ? "border-t border-line" : ""
                      } ${actif ? "bg-teal-soft" : "hover:bg-bg"}`}
                    >
                      <input
                        type={groupe.multiple ? "checkbox" : "radio"}
                        name={groupe.param}
                        checked={actif}
                        onChange={() => basculer(groupe, option.valeur)}
                        className="sr-only"
                      />
                      <span
                        aria-hidden
                        className={`grid h-[18px] w-[18px] flex-none place-items-center border-[1.5px] text-[10px] font-bold text-white transition-colors ${
                          groupe.multiple ? "rounded-[5px]" : "rounded-full"
                        } ${actif ? "border-teal bg-teal" : "border-line bg-white"}`}
                      >
                        {actif ? (groupe.multiple ? "✓" : "●") : ""}
                      </span>
                      <span className={actif ? "font-bold text-blue" : "text-ink"}>
                        {option.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-4">
          <button
            type="button"
            onClick={effacer}
            disabled={nbSelection === 0}
            className={`text-[12.5px] font-bold uppercase tracking-[.03em] transition-colors ${
              nbSelection === 0
                ? "cursor-not-allowed text-muted opacity-50"
                : "text-blue hover:text-teal"
            }`}
          >
            Effacer {groupes.length > 1 ? "ces filtres" : "ce filtre"}
          </button>
          <button
            type="button"
            onClick={appliquer}
            className="rounded-[11px] bg-teal px-5 py-[11px] text-[12.5px] font-bold uppercase tracking-[.03em] text-white transition-colors hover:bg-[#2790bc]"
          >
            Afficher les résultats
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Un bouton de la barre, ouvrant un popup sur un ou plusieurs groupes liés.
 * Avec un seul groupe qui a beaucoup d'options (ex. 20 assureurs), le popup
 * les liste dans une zone qui défile verticalement plutôt que de toutes les
 * dérouler à plat dans la barre — c'est ce qui rendait la barre illisible.
 */
export interface BoutonFiltre {
  cle: string;
  icone: string;
  label: string;
  groupes: GroupeFiltre[];
}

export default function FiltresAvances({ boutons }: { boutons: BoutonFiltre[] }) {
  const params = useSearchParams();
  const [ouvert, setOuvert] = useState<string | null>(null);
  const fermer = useCallback(() => setOuvert(null), []);

  const style = (actif: boolean) =>
    `flex-none rounded-[10px] border px-[14px] py-[9px] text-[13px] font-bold transition-colors ${
      actif
        ? "border-teal bg-teal-soft text-blue"
        : "border-line bg-white text-ink hover:border-teal"
    }`;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {boutons.map((b) => {
          const nb = b.groupes.reduce((n, g) => n + params.getAll(g.param).length, 0);
          return (
            <button
              key={b.cle}
              type="button"
              onClick={() => setOuvert(b.cle)}
              className={style(nb > 0)}
            >
              {b.icone} {b.label}
              {nb > 0 ? ` (${nb})` : ""}
            </button>
          );
        })}
      </div>

      {boutons.map(
        (b) =>
          ouvert === b.cle && (
            <Popup key={b.cle} titre={b.label} groupes={b.groupes} surFermer={fermer} />
          )
      )}
    </>
  );
}
