"use client";

import { useEffect } from "react";
import { reconcilier } from "@/lib/charte-compte";
import { analyser, appliquer, ID_STYLE, instantane } from "@/lib/charte-stockage";

/**
 * Attache la charte du compte à la durée de vie de l'espace connecté.
 *
 * Ne rend rien. Trois rôles, tous liés au fait que la balise de style de la
 * charte vit dans <head> et SURVIT aux navigations internes de Next.js :
 *
 *  • Au montage par navigation interne (depuis une page publique, un clic sur
 *    « Mon espace »), le script de démarrage `CharteLocale` ne rejoue pas —
 *    un script injecté via innerHTML ne s'exécute qu'au chargement initial du
 *    document. On repose donc la charte depuis l'avance locale tout de suite,
 *    sans attendre la base, pour éviter un éclair aux couleurs d'origine.
 *  • On réconcilie ensuite avec le compte : premier passage sur un appareil,
 *    choix fait ailleurs, compte différent de celui qui a laissé le cache.
 *  • Au DÉMONTAGE — on quitte l'espace pour une page publique —, la charte
 *    s'en va avec lui. Sans ce retrait, la balise resterait dans <head> et
 *    teinterait tout le site public (accueil, À propos, FAQ, résultats…)
 *    jusqu'au prochain rechargement complet.
 *
 * Au chargement initial d'une page d'espace, `CharteLocale` a déjà posé la
 * charte avant la première peinture ; `appliquer` ci-dessous ne fait alors
 * que réécrire la même balise, sans clignotement.
 *
 * Pourquoi pas côté serveur : les pages des espaces connectés sont servies
 * statiques (61 sur 62). Y lire la session les basculerait toutes en rendu
 * à la demande, pour une correction qui ne sert qu'une fois par appareil.
 */
export default function SuivreCharte() {
  useEffect(() => {
    appliquer(analyser(instantane()));
    void reconcilier().catch(() => {
      /* hors ligne ou session expirée : l'avance locale fait l'affaire */
    });
    return () => {
      // La charte appartient à l'espace : elle le quitte quand il se démonte.
      document.getElementById(ID_STYLE)?.remove();
    };
  }, []);
  return null;
}
