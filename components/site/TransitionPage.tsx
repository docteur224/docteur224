"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Transition de page : fondu + légère remontée (10 px, 240 ms) à chaque
 * changement de route.
 *
 * Volontairement sans `template.tsx` : un template reçoit une nouvelle clé
 * à chaque navigation et remonte donc tout ce qu'il enveloppe, ce qui
 * remettrait à zéro l'état des composants clients (session, tiroirs,
 * filtres). Ici l'enveloppe reste la même ; seule l'animation CSS est
 * relancée en retirant puis reposant la classe `ui-page`.
 *
 * Un changement des seuls paramètres d'URL (filtres de résultats, page)
 * ne relance rien : la colonne de filtres doit rester stable sous la
 * souris. L'animation n'anime que transform et opacity, et ne laisse
 * aucune transformation résiduelle une fois terminée.
 */
export default function TransitionPage({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const enveloppe = useRef<HTMLDivElement>(null);
  const cheminPrecedent = useRef(pathname);

  useEffect(() => {
    if (cheminPrecedent.current === pathname) return;
    cheminPrecedent.current = pathname;
    const el = enveloppe.current;
    if (!el) return;
    el.classList.remove("ui-page");
    // Forcer un calcul de style entre le retrait et la repose, sinon le
    // navigateur fusionne les deux et l'animation ne repart pas.
    void el.offsetWidth;
    el.classList.add("ui-page");
  }, [pathname]);

  return (
    <div ref={enveloppe} className="ui-page flex min-h-full flex-1 flex-col">
      {children}
    </div>
  );
}
