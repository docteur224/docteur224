"use client";

import { EVENEMENT_ONGLET } from "@/components/site/OngletsFiche";
import { formatNote } from "@/lib/format";

/*
 * Badge « ★ 4,8 (12 avis) » de l'en-tête de fiche. Cliquer dessus ouvre
 * l'onglet Avis et y fait défiler la page — c'est le geste attendu par les
 * patients, qui cherchent le détail des avis derrière la moyenne.
 */

export default function BadgeNote({ note, nbAvis }: { note: number; nbAvis: number }) {
  function ouvrirAvis() {
    window.dispatchEvent(new CustomEvent(EVENEMENT_ONGLET, { detail: "avis" }));
    document.getElementById("onglets-fiche")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <button
      type="button"
      onClick={ouvrirAvis}
      aria-label={
        nbAvis === 0
          ? "Aucun avis — voir la section Avis"
          : `Note ${formatNote(note)} sur 5, ${nbAvis} avis — voir le détail`
      }
      className="rounded-lg bg-green-soft px-[9px] py-1 text-[11px] font-bold text-green transition-colors hover:bg-[#CDEBD8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green"
    >
      ★ {formatNote(note)} ({nbAvis} avis)
    </button>
  );
}
