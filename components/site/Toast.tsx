"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/*
 * Confirmation passagère après une action.
 *
 * L'application annonçait ses réussites par un paragraphe posé en bas de
 * page (« ✓ Document retiré du dossier. »). Sur un écran long, le message
 * paraissait hors du champ de vision : on cliquait, rien ne semblait se
 * passer, on recliquait. Ici l'avis vient se poser au-dessus du contenu,
 * près du pouce sur téléphone, et s'efface seul.
 *
 * `role="status"` et non `alert` : une confirmation n'interrompt pas la
 * lecture d'un lecteur d'écran, elle s'annonce poliment. Les échecs, eux,
 * passent en `alert` — on veut qu'ils coupent la parole.
 */

export interface Avis {
  texte: string;
  /** Un échec se dit en rouge et interrompt la lecture d'écran. */
  echec?: boolean;
}

const DUREE_MS = 3200;

/** Pose un avis, le retire tout seul. Un seul à la fois : le dernier gagne. */
export function useToast(): {
  avis: Avis | null;
  annoncer: (texte: string) => void;
  signalerEchec: (texte: string) => void;
  effacer: () => void;
} {
  const [avis, setAvis] = useState<Avis | null>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poser = useCallback((texte: string, echec: boolean) => {
    if (minuteur.current) clearTimeout(minuteur.current);
    setAvis({ texte, echec });
    // Un échec reste plus longtemps : il y a souvent une phrase à lire, et
    // parfois un geste à refaire.
    minuteur.current = setTimeout(() => setAvis(null), echec ? DUREE_MS * 2 : DUREE_MS);
  }, []);

  // Le minuteur survivrait au démontage de la page et appellerait setState
  // sur un composant disparu.
  useEffect(
    () => () => {
      if (minuteur.current) clearTimeout(minuteur.current);
    },
    []
  );

  return {
    avis,
    annoncer: useCallback((t: string) => poser(t, false), [poser]),
    signalerEchec: useCallback((t: string) => poser(t, true), [poser]),
    effacer: useCallback(() => setAvis(null), []),
  };
}

export default function Toast({ avis }: { avis: Avis | null }) {
  if (!avis) return null;
  return (
    <div
      role={avis.echec ? "alert" : "status"}
      aria-live={avis.echec ? "assertive" : "polite"}
      className="ui-modal-in fixed bottom-[calc(76px+env(safe-area-inset-bottom))] left-1/2 z-[60] w-max max-w-[calc(100%-32px)] -translate-x-1/2 rounded-xl px-4 py-3 text-[13px] font-bold text-white shadow-[0_10px_30px_rgba(16,59,80,0.3)] md:bottom-6"
      style={{ background: avis.echec ? "var(--red)" : "var(--blue)" }}
    >
      {avis.texte}
    </div>
  );
}
