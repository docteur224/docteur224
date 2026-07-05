"use client";

import Link from "next/link";
import AssistantShell from "@/components/assistant/AssistantShell";
import NouveauRdvDelegue from "@/components/pro/NouveauRdvDelegue";
import { usePermissionsAssistante } from "@/lib/mock-medecin";

/*
 * « + Nouveau rendez-vous » côté assistant(e) — réservation déléguée
 * (spec C.2.3), soumise à la permission « Créer un rendez-vous pour un
 * patient ». Sans la permission, l'écran est bloqué ET l'action est refusée
 * dans la couche de données (lib/actions-assistante.ts).
 */
export default function NouveauRendezVousAssistant() {
  const permissions = usePermissionsAssistante();

  if (!permissions.creerRdv) {
    return (
      <AssistantShell>
        <div className="mx-auto max-w-[560px] py-[40px] text-center">
          <div className="text-4xl" aria-hidden>
            ⛔
          </div>
          <h2 className="mt-4 text-[22px] font-extrabold tracking-[-0.3px]">
            Permission non accordée
          </h2>
          <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
            La permission <b>« Créer un rendez-vous pour un patient »</b> ne vous a pas été
            accordée par le médecin. Même en forçant l’accès à cet écran, l’enregistrement serait
            refusé par la plateforme.
          </p>
          <Link
            href="/espace-assistant"
            className="mt-6 inline-block rounded-[11px] bg-teal px-[18px] py-[11px] text-[13.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
          >
            ← Retour au tableau de bord
          </Link>
        </div>
      </AssistantShell>
    );
  }

  return (
    <AssistantShell>
      <NouveauRdvDelegue reservePar="assistant" lienRetour="/espace-assistant/rendez-vous" />
    </AssistantShell>
  );
}
