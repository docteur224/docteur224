"use client";

import Link from "next/link";

/**
 * Carte commune à toutes les étapes du parcours : retour, barre de
 * progression, titre, contenu, bouton principal et action secondaire
 * (« fournir plus tard »). Une seule mise en page, responsive.
 */
export default function CadreEtape({
  titre,
  sousTitre,
  retour,
  progression,
  children,
  boutonTexte = "Continuer",
  boutonEnCours = false,
  onContinuer,
  secondaire,
  erreur,
}: {
  titre: string;
  sousTitre?: string;
  /** Lien « Étape précédente » ; absent sur la première étape. */
  retour?: string;
  /** Avancement 0..1 de la barre fine sous le retour. */
  progression: number;
  children: React.ReactNode;
  boutonTexte?: string;
  boutonEnCours?: boolean;
  onContinuer?: () => void;
  /** Action secondaire sous le bouton (texte + rappel). */
  secondaire?: { texte: string; action: () => void };
  erreur?: string | null;
}) {
  return (
    <div className="mx-auto w-full max-w-[600px] px-4 py-6 md:py-10">
      <div className="rounded-2xl border border-line bg-white p-5 md:p-8">
        {retour && (
          <Link
            href={retour}
            className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-muted hover:text-blue"
          >
            ‹ Étape précédente
          </Link>
        )}
        <div className="mb-5 h-1 overflow-hidden rounded-full bg-line" aria-hidden>
          <div
            className="h-full rounded-full bg-teal transition-all"
            style={{ width: `${Math.round(progression * 100)}%` }}
          />
        </div>
        <h1 className="text-[20px] font-extrabold tracking-[-0.3px]">{titre}</h1>
        {sousTitre && <p className="mt-1.5 text-[13px] text-muted">{sousTitre}</p>}
        <div className="mt-5">{children}</div>
        {erreur && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-600">
            {erreur}
          </p>
        )}
        {onContinuer && (
          <button
            type="button"
            onClick={onContinuer}
            disabled={boutonEnCours}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-[11px] bg-teal px-6 py-[14px] text-[15px] font-bold text-white transition-colors hover:bg-[#2790bc] disabled:opacity-60"
          >
            {boutonEnCours ? "Enregistrement…" : boutonTexte}
          </button>
        )}
        {secondaire && (
          <button
            type="button"
            onClick={secondaire.action}
            className="mt-3 block w-full text-center text-[12.5px] font-bold text-muted underline underline-offset-2 hover:text-blue"
          >
            {secondaire.texte}
          </button>
        )}
      </div>
    </div>
  );
}
