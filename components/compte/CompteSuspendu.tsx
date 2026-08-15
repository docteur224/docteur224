"use client";

import { useState } from "react";
import { basculerSuspension } from "@/lib/compte";

/*
 * Écran d'un compte mis en pause par son titulaire.
 *
 * Il REMPLACE le contenu de l'espace, dans les cinq coquilles : laisser
 * l'interface ouverte donnerait des boutons que la base refuse — un compte
 * suspendu ne réserve plus, et un(e) assistant(e) suspendu(e) perd toutes
 * ses permissions (migration 0045).
 *
 * La sortie est ici, pas ailleurs : c'est le titulaire qui a mis son compte
 * en pause, c'est lui qui le relance, sans passer par le support.
 */
export default function CompteSuspendu({ role }: { role?: string }) {
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
          ⏸️
        </span>
        <h2 className="mt-3 text-[19px] font-extrabold">Votre compte est en pause</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          {consequence} Rien n’a été effacé : vos données et votre historique vous attendent.
        </p>
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
      </div>
    </div>
  );
}
