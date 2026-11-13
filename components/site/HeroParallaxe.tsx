"use client";

import { useEffect, useRef } from "react";

/**
 * Image de fond du héros « À propos » avec effet de parallaxe.
 *
 * L'image est posée plus haute que son conteneur (136 %) et centrée au repos :
 * pendant le défilement, on la translate vers le bas d'une fraction du défilement
 * (0,16×), ce qui la fait bouger plus lentement que le texte — l'effet de
 * profondeur. La translation reste bornée à la marge disponible pour ne jamais
 * laisser apparaître un bord. Contrairement à `background-attachment: fixed`,
 * cette approche garde le cadrage et fonctionne sur mobile (iOS compris).
 *
 * Respecte `prefers-reduced-motion` : si l'utilisateur le demande, aucune
 * translation n'est appliquée et l'image reste centrée, fixe.
 */
export default function HeroParallaxe() {
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const img = ref.current;
    const section = img?.parentElement;
    if (!img || !section) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    const appliquer = () => {
      raf = 0;
      const rect = section.getBoundingClientRect();
      // Marge disponible de chaque côté (18 % de la hauteur), bornée pour ne
      // jamais découvrir un bord de l'image.
      const marge = rect.height * 0.18;
      const decalage = Math.min(Math.max(-rect.top * 0.16, 0), marge);
      img.style.transform = `translate3d(0, ${decalage}px, 0)`;
    };
    const auDefilement = () => {
      if (!raf) raf = requestAnimationFrame(appliquer);
    };

    appliquer();
    window.addEventListener("scroll", auDefilement, { passive: true });
    window.addEventListener("resize", auDefilement);
    return () => {
      window.removeEventListener("scroll", auDefilement);
      window.removeEventListener("resize", auDefilement);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src="/apropos/hero-soignants.jpg"
      alt="Une médecin souriante, stéthoscope autour du cou"
      className="absolute inset-x-0 top-[-18%] h-[136%] w-full object-cover object-[center_26%] will-change-transform"
      width={1680}
      height={1080}
      fetchPriority="high"
    />
  );
}
