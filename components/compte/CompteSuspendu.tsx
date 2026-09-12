"use client";

import { useState } from "react";
import { basculerSuspension } from "@/lib/compte";

/*
 * Écran d'un compte suspendu.
 *
 * Il REMPLACE le contenu de l'espace, dans les cinq coquilles : laisser
 * l'interface ouverte donnerait des boutons que la base refuse — un compte
 * suspendu ne réserve plus, ne dépose plus d'avis, n'écrit plus au cabinet,
 * et un(e) assistant(e) suspendu(e) perd toutes ses permissions (migrations
 * 0045 et 0051).
 *
 * DEUX situations, qui ne se disent pas de la même façon :
 *
 *   - la PAUSE VOLONTAIRE : c'est le titulaire qui a mis son compte en
 *     sommeil, c'est lui qui le relance, sans passer par le support ;
 *   - la SANCTION prononcée par l'administration : la sortie n'est pas ici.
 *     L'écran l'écrivait quand même, et tendait son bouton de réactivation
 *     à la personne que l'administrateur venait de suspendre — la base le
 *     refuse désormais, et cet écran ne le promet plus.
 */
export default function CompteSuspendu({
  role,
  parAdmin = false,
}: {
  role?: string;
  /** Suspension prononcée par l'administration : pas de réactivation ici. */
  parAdmin?: boolean;
}) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function reactiver() {
    setEnCours(true);
    setErreur(null);
    const res = await basculerSuspension(false);
    if (res.erreur) {
      setErreur(res.erreur);
      setEnCours(false);
      return;
    }
    // Rechargement complet : le statut commande cette coquille, et le cache
    // du profil vit au niveau du module.
    window.location.reload();
  }

  const consequence =
    role === "medecin"
      ? "Votre fiche ne paraît plus dans la recherche et vous ne recevez plus de nouveaux rendez-vous."
      : role === "etablissement"
        ? "La fiche de votre établissement ne paraît plus dans la recherche."
        : role === "assistant"
          ? "Vous n’avez plus accès à l’agenda du cabinet."
          : role === "admin"
            ? "Vous n’avez plus accès à la console d’administration."
            : "Vous ne pouvez plus réserver de rendez-vous.";

  return (
    <div className="grid min-h-[70vh] place-items-center px-4 py-14 text-center">
      <div className="max-w-[440px]">
        <span aria-hidden className="text-[38px]">
          {parAdmin ? "🚫" : "⏸️"}
        </span>
        <h2 className="mt-3 text-[19px] font-extrabold">
          {parAdmin ? "Votre compte est suspendu" : "Votre compte est en pause"}
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          {parAdmin
            ? `${consequence} Cette suspension a été prononcée par l’administration de Docteur 224 : elle ne se lève pas depuis cet écran.`
            : `${consequence} Rien n’a été effacé : vos données et votre historique vous attendent.`}
        </p>

        {parAdmin ? (
          <p className="mt-5 rounded-[11px] bg-bg px-4 py-3 text-[12.5px] leading-relaxed text-muted">
            Pour comprendre la décision ou en demander la levée, écrivez à{" "}
            <a className="font-bold text-teal underline" href="mailto:support@docteur224.com">
              support@docteur224.com
            </a>{" "}
            en indiquant l’adresse e-mail de votre compte.
          </p>
        ) : (
          <>
            <button
              type="button"
              onClick={reactiver}
              disabled={enCours}
              className="mt-5 rounded-[11px] bg-teal px-[20px] py-3 text-[13.5px] font-bold text-white disabled:opacity-50"
            >
              {enCours ? "Réactivation…" : "Réactiver mon compte"}
            </button>
            {erreur && (
              <p role="alert" className="mt-3 text-[12.5px] font-bold text-red">
                ⚠️ {erreur}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
