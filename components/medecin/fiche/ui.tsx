import type { ReactNode } from "react";
import Icone, { type NomIcone } from "@/components/site/Icone";

/*
 * Vocabulaire visuel de la fiche patient, partagé par la page et par chacun
 * de ses modules. Un module ajouté plus tard pioche ici : ses cartes, ses
 * boutons et ses états vides ressembleront d'office aux autres.
 */

export const CARTE = "rounded-2xl border border-line bg-white p-4 md:p-5";
export const TITRE_SECTION = "text-[15px] font-extrabold";
export const COMPTE = "text-[12.5px] font-semibold text-muted";

const BTN_BASE =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] px-3.5 text-[12.5px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-45";
export const BTN_PRIMAIRE = `${BTN_BASE} bg-teal text-white hover:bg-blue`;
export const BTN_CONTOUR = `${BTN_BASE} border border-blue-line bg-white text-blue hover:bg-teal-soft`;
export const BTN_NEUTRE = `${BTN_BASE} border border-line bg-white text-ink hover:border-muted`;
export const BTN_DANGER = `${BTN_BASE} border border-red-line bg-white text-red hover:bg-red-soft`;

/** Lignes grises animées, à la hauteur d'une carte de document. */
export function Squelettes({ n, hauteur = 66 }: { n: number; hauteur?: number }) {
  return (
    <div className="grid gap-3" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-xl border border-line bg-bg"
          style={{ height: hauteur }}
        />
      ))}
    </div>
  );
}

/**
 * Squelette d'un module entier, le temps que son code arrive : un titre et
 * trois lignes, la silhouette de ce qui va s'afficher plutôt qu'une roue.
 */
export function SqueletteModule() {
  return (
    <div className={CARTE} aria-busy="true" aria-label="Chargement du module">
      <div className="mb-4 h-5 w-44 animate-pulse rounded-md bg-bg" />
      <Squelettes n={3} />
    </div>
  );
}

/**
 * État vide : une icône, ce qui manque, et le geste qui le comble. Un écran
 * vide sans action laisse le praticien chercher où cliquer.
 */
export function EtatVide({
  icone,
  titre,
  texte,
  action,
}: {
  icone: NomIcone;
  titre: string;
  texte?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-4 py-8 text-center">
      <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-teal-soft text-teal">
        <Icone nom={icone} taille={22} />
      </span>
      <b className="text-[14px] font-extrabold">{titre}</b>
      {texte && <p className="mt-1 max-w-[420px] text-[12.5px] leading-relaxed text-muted">{texte}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
