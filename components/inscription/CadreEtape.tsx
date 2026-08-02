"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Stepper from "@/components/inscription/Stepper";
import { useInscription } from "@/components/inscription/ContexteInscription";
import { etapesPour } from "@/lib/inscription-pro";

/**
 * Carte commune à toutes les étapes du parcours : retour, fil d'Ariane,
 * titre, contenu, bouton principal et action secondaire (« fournir plus
 * tard »). Une seule mise en page, responsive.
 *
 * L'étape courante est déduite de l'URL et la liste des étapes du rôle :
 * aucune fraction de progression à tenir à jour dans chaque page (elles
 * divergeaient du parcours réel au moindre ajout d'étape).
 */
export default function CadreEtape({
  titre,
  sousTitre,
  retour,
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
  children: React.ReactNode;
  boutonTexte?: string;
  boutonEnCours?: boolean;
  onContinuer?: () => void;
  /** Action secondaire sous le bouton (texte + rappel). */
  secondaire?: { texte: string; action: () => void };
  erreur?: string | null;
}) {
  const { role } = useInscription();
  const segment = usePathname().split("/").filter(Boolean).pop() ?? "";
  return (
    <div className="mx-auto w-full max-w-[600px] px-4 py-6 md:py-10">
      <div className="rounded-2xl border border-line bg-white p-5 md:p-8">
        <Stepper etapes={etapesPour(role)} courante={segment} className="mb-5" />
        <h1 className="text-[20px] font-extrabold tracking-[-0.3px]">{titre}</h1>
        {sousTitre && <p className="mt-1.5 text-[13px] text-muted">{sousTitre}</p>}
        <div className="mt-5">{children}</div>
        {erreur && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-600">
            {erreur}
          </p>
        )}
        {/* Retour et Continuer côte à côte : le lien discret placé au-dessus
            du fil d'Ariane passait inaperçu. Sous sm, la pile est inversée
            pour que l'action principale reste sous le pouce. */}
        {(retour || onContinuer) && (
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
            {retour && (
              <Link
                href={retour}
                aria-disabled={boutonEnCours}
                tabIndex={boutonEnCours ? -1 : undefined}
                className={`flex items-center justify-center gap-1.5 rounded-[11px] border-[1.5px] border-line bg-white px-6 py-[14px] text-[15px] font-bold text-blue transition-colors hover:bg-bg sm:w-auto sm:flex-none ${
                  boutonEnCours ? "pointer-events-none opacity-60" : ""
                }`}
              >
                ‹ Retour
              </Link>
            )}
            {onContinuer && (
              <button
                type="button"
                onClick={onContinuer}
                disabled={boutonEnCours}
                className="flex w-full items-center justify-center gap-2 rounded-[11px] bg-teal px-6 py-[14px] text-[15px] font-bold text-white transition-colors hover:bg-[#2790bc] disabled:opacity-60 sm:flex-1"
              >
                {boutonEnCours ? "Enregistrement…" : boutonTexte}
              </button>
            )}
          </div>
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
