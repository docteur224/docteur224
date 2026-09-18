"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Apparition au défilement : tout élément portant `data-reveal` reçoit la
 * classe `ui-in` la première fois qu'il entre dans la fenêtre (fondu +
 * remontée de 16 px, voir globals.css). Un parent `data-reveal-stagger`
 * décale ses enfants de 60 ms chacun.
 *
 * Un seul IntersectionObserver pour toute la page, aucun écouteur de
 * défilement. Les éléments ajoutés après coup (pagination côté client,
 * « Voir plus ») sont rattrapés par un MutationObserver limité aux ajouts
 * de nœuds, regroupés sur une frame.
 *
 * Sans JavaScript, rien n'est caché : la classe `ui-reveal-pret` sur
 * <html> n'est posée qu'ici, une fois l'observateur prêt.
 */
export default function RevelationAuScroll() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const racine = document.documentElement;

    const observateur = new IntersectionObserver(
      (entrees) => {
        for (const e of entrees) {
          // Déjà passé au-dessus de la fenêtre (page ouverte sur une ancre,
          // saut de défilement) : montré tel quel plutôt que laissé caché.
          if (!e.isIntersecting && e.boundingClientRect.bottom >= 0) continue;
          e.target.classList.add("ui-in");
          observateur.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
    );

    const observerTout = () => {
      document.querySelectorAll<HTMLElement>("[data-reveal]:not(.ui-in)").forEach((el) => {
        observateur.observe(el);
      });
    };

    observerTout();
    racine.classList.add("ui-reveal-pret");

    let frame = 0;
    const mutations = new MutationObserver((liste) => {
      if (!liste.some((m) => m.addedNodes.length > 0)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(observerTout);
    });
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(frame);
      mutations.disconnect();
      observateur.disconnect();
    };
    // Relancé à chaque route : la nouvelle page a ses propres éléments.
  }, [pathname]);

  return null;
}
