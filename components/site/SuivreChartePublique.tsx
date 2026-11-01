"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { appliquer, estRoutePublique, retirer } from "@/lib/charte-publique";
import {
  chartePubliqueEnCache, reconcilierChartePublique,
} from "@/lib/charte-publique-compte";

/**
 * Cantonne la charte de campagne aux pages PUBLIQUES, à chaque navigation.
 *
 * Monté à la racine (app/layout), il voit donc toutes les pages. `usePathname`
 * ne rend aucune page dynamique côté serveur — il ne lit le chemin qu'après
 * l'hydratation —, les pages publiques restent statiques.
 *
 *  • Sur une page d'espace connecté : on RETIRE toute charte publique. Sans
 *    cela, la balise — qui vit dans <head> et survit aux navigations internes
 *    de Next — teinterait le tableau de bord, qui a sa propre charte.
 *  • Sur une page publique : on repose la charte depuis le cache tout de suite
 *    (le script de démarrage ne rejoue pas en navigation interne), puis on
 *    réconcilie avec la base.
 *
 * La réconciliation ne lit la base qu'UNE FOIS par chargement de page : la
 * campagne est globale et ne change pas en cours de visite. Les navigations
 * internes suivantes repartent du cache.
 */
let reconciliee = false;

export default function SuivreChartePublique() {
  const pathname = usePathname();
  useEffect(() => {
    if (!estRoutePublique(pathname)) {
      retirer();
      return;
    }
    appliquer(chartePubliqueEnCache());
    if (!reconciliee) {
      reconciliee = true;
      void reconcilierChartePublique().catch(() => {
        // hors ligne : l'avance locale fait l'affaire, on retentera au
        // prochain chargement.
        reconciliee = false;
      });
    }
  }, [pathname]);
  return null;
}
