"use client";

import { useEffect, useState } from "react";

/**
 * Le délai avant de pouvoir redemander un code. Le serveur fait foi (il
 * refuse un renvoi trop rapproché) ; ce compteur évite seulement d'offrir un
 * bouton qui serait refusé.
 */
export function useRenvoi(): [number, (secondes: number) => void] {
  const [jusqua, setJusqua] = useState(0);
  const [restant, setRestant] = useState(0);

  useEffect(() => {
    if (!jusqua) return;
    const tic = () => setRestant(Math.max(0, Math.ceil((jusqua - Date.now()) / 1000)));
    const minuteur = setInterval(tic, 500);
    const premier = setTimeout(tic, 0);
    return () => {
      clearInterval(minuteur);
      clearTimeout(premier);
    };
  }, [jusqua]);

  return [
    restant,
    (secondes: number) => {
      setJusqua(Date.now() + secondes * 1000);
      setRestant(secondes);
    },
  ];
}
