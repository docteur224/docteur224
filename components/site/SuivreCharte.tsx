"use client";

import { useEffect } from "react";
import { reconcilier } from "@/lib/charte-compte";

/**
 * Remet l'avance locale d'accord avec la charte du compte, une fois par
 * ouverture d'espace.
 *
 * Ne rend rien et n'affiche rien : la charte est déjà posée par le script de
 * démarrage quand ce composant s'exécute. Il ne corrige que les cas où le
 * cache a tort — premier passage sur un appareil, choix fait ailleurs,
 * compte différent de celui qui a laissé le cache.
 *
 * Pourquoi pas côté serveur : les pages des espaces connectés sont servies
 * statiques (61 sur 62). Y lire la session les basculerait toutes en rendu
 * à la demande, pour une correction qui ne sert qu'une fois par appareil.
 */
export default function SuivreCharte() {
  useEffect(() => {
    // Rien à annuler au démontage : la réconciliation agit sur le document
    // et le stockage, jamais sur l'état de ce composant.
    void reconcilier().catch(() => {
      /* hors ligne ou session expirée : l'avance locale fait l'affaire */
    });
  }, []);
  return null;
}
