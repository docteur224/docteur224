"use client";

import { useEffect } from "react";
import { creerClientPublic } from "@/lib/supabase/public";

// Le gabarit PageContenu rend ses enfants deux fois (version mobile et version
// web, l'une masquée par CSS) : sans ce garde, une seule visite compterait
// double. On ne compte donc qu'une fois par slug et par chargement de page.
const dejaComptes = new Set<string>();

/*
 * Compteur de vues d'un article — une impulsion discrète, posée au montage.
 *
 * Appelle la fonction `incrementer_vue_article` (SECURITY DEFINER, bornée aux
 * articles publiés) une seule fois par chargement. C'est volontairement
 * approximatif : on ne cherche pas une mesure d'audience exacte, seulement de
 * quoi classer les « Articles populaires ». Tout échec est silencieux — lire
 * un article ne doit jamais dépendre de ce compteur.
 *
 * Aucun rendu : le composant ne produit rien à l'écran.
 */
export default function VueArticle({ slug }: { slug: string }) {
  useEffect(() => {
    let actif = true;
    // Différé après la première peinture : ne pèse pas sur le chargement.
    if (dejaComptes.has(slug)) return;
    const minuteur = setTimeout(async () => {
      if (!actif || dejaComptes.has(slug)) return;
      dejaComptes.add(slug);
      try {
        await creerClientPublic().rpc("incrementer_vue_article", { p_slug: slug });
      } catch {
        /* compteur indisponible : sans conséquence pour la lecture */
      }
    }, 1200);
    return () => {
      actif = false;
      clearTimeout(minuteur);
    };
  }, [slug]);

  return null;
}
