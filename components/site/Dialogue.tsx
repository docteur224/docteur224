"use client";

import { useEffect, useRef } from "react";
import Icone from "@/components/site/Icone";

/**
 * Enveloppe de dialogue : feuille montante sur téléphone, carte centrée à
 * partir de `md`. Même forme que celle de DialoguePaiement, extraite le jour
 * où les écrans « Équipe admin » et « Mes assistant(e)s » ont eu besoin
 * exactement du même cadre.
 *
 * Le corps défile, l'en-tête et le pied restent visibles : sur un téléphone,
 * un bouton « Enregistrer » sous la ligne de flottaison ne se trouve pas.
 * D'où `pied`, plutôt qu'un simple `children` où les boutons partiraient
 * avec le défilement.
 *
 * Le clavier est pris en charge ici, une fois pour toutes les modales :
 * Échap referme, et la tabulation tourne en rond à l'intérieur. Sans ce
 * second point, `aria-modal` ment : la tabulation sortait du dialogue pour
 * parcourir la page cachée derrière, où un lecteur d'écran se perdait.
 */
export default function Dialogue({
  titre,
  icone,
  sousTitre,
  onFermer,
  pied,
  largeur,
  children,
}: {
  titre: string;
  icone: React.ReactNode;
  sousTitre?: string;
  onFermer: () => void;
  /** Boutons d'action, hors du défilement. */
  pied?: React.ReactNode;
  /** Largeur maximale sur web ; 480 px par défaut. */
  largeur?: string;
  children: React.ReactNode;
}) {
  const panneau = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = panneau.current;
    if (!element) return;

    const focalisables = () =>
      [
        ...element.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ),
      ].filter((e) => e.offsetParent !== null);

    // Le focus entre dans le dialogue : sans ça il resterait sur le bouton
    // qui vient de disparaître sous l'ouverture, donc nulle part.
    const precedent = document.activeElement as HTMLElement | null;
    focalisables()[0]?.focus();

    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onFermer();
        return;
      }
      if (e.key !== "Tab") return;
      const liste = focalisables();
      if (liste.length === 0) return;
      const premier = liste[0];
      const dernier = liste[liste.length - 1];
      const courant = document.activeElement;
      if (e.shiftKey && (courant === premier || !element.contains(courant))) {
        e.preventDefault();
        dernier.focus();
      } else if (!e.shiftKey && courant === dernier) {
        e.preventDefault();
        premier.focus();
      }
    };

    document.addEventListener("keydown", surTouche, true);
    return () => {
      document.removeEventListener("keydown", surTouche, true);
      precedent?.focus?.();
    };
  }, [onFermer]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titre}
      className="ui-overlay-in fixed inset-0 z-50 flex items-end justify-center bg-black/45 md:items-center md:overflow-y-auto md:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onFermer();
      }}
    >
      <div
        ref={panneau}
        style={largeur ? { maxWidth: largeur } : undefined}
        className="ui-modal-in flex max-h-[94vh] w-full flex-col rounded-t-2xl border border-line bg-white md:max-h-[90vh] md:max-w-[480px] md:rounded-2xl md:shadow-xl"
      >
        <div className="flex items-start gap-3 border-b border-line p-4">
          <span aria-hidden className="text-[17px]">
            {icone}
          </span>
          <h4 className="flex-1 text-[15.5px] font-extrabold">
            {titre}
            {sousTitre && (
              <span className="mt-0.5 block text-[12px] font-semibold text-muted">{sousTitre}</span>
            )}
          </h4>
          <button
            type="button"
            onClick={onFermer}
            aria-label="Fermer"
            className="grid h-11 w-11 flex-none place-items-center rounded-lg text-muted transition-colors hover:bg-bg"
          >
            <Icone nom="croix" taille={18} epaisseur={2.2} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {pied && <div className="flex flex-wrap gap-2.5 border-t border-line p-4">{pied}</div>}
      </div>
    </div>
  );
}
