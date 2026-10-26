"use client";

import { useSyncExternalStore } from "react";
import {
  basculerMode,
  instantaneMode,
  instantaneModeServeur,
  sAbonnerMode,
} from "@/lib/mode-affichage";

/**
 * Bouton de bascule clair / sombre. Le libellé reflète l'état courant :
 * en clair il propose le sombre, en sombre il propose le clair.
 *
 * Deux présentations, pour les emplacements demandés :
 *   • « barre » — interrupteur discret, dans l'en-tête web ;
 *   • « menu »  — ligne de menu, dans les tiroirs mobiles.
 *
 * L'état se lit par useSyncExternalStore sur l'attribut data-theme : au rendu
 * serveur il vaut « clair » (repli), puis React le réaligne sur l'état réel à
 * l'hydratation, sans avertissement de non-concordance.
 */
export default function BasculeMode({
  variante = "barre",
}: {
  variante?: "barre" | "menu";
}) {
  const mode = useSyncExternalStore(
    sAbonnerMode,
    instantaneMode,
    instantaneModeServeur,
  );
  const sombre = mode === "dark";
  const libelle = sombre ? "Passer en mode clair" : "Passer en mode sombre";
  const icone = sombre ? "☀️" : "🌙";

  if (variante === "menu") {
    return (
      <button
        type="button"
        className="tiroir-mode"
        onClick={basculerMode}
        aria-label={libelle}
      >
        <span className="i" aria-hidden>
          {icone}
        </span>
        {libelle}
      </button>
    );
  }

  // « barre » : interrupteur compact, cohérent avec la pastille « FR » du
  // header. Piste cliquable, pastille qui glisse, icône à l'intérieur.
  return (
    <button
      type="button"
      role="switch"
      aria-checked={sombre}
      aria-label={libelle}
      title={libelle}
      onClick={basculerMode}
      className="ui-btn relative inline-flex h-[26px] w-[46px] flex-none items-center rounded-full border border-line bg-bg px-[3px] transition-colors"
    >
      <span
        aria-hidden
        className={`grid h-[18px] w-[18px] place-items-center rounded-full bg-card text-[11px] shadow-sm transition-transform ${
          sombre ? "translate-x-[20px]" : "translate-x-0"
        }`}
      >
        {icone}
      </span>
    </button>
  );
}
