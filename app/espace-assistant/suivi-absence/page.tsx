"use client";

import { Suspense } from "react";
import AssistantShell from "@/components/assistant/AssistantShell";
import { SqueletteModule } from "@/components/medecin/fiche/ui";
import EcranSuiviAbsence from "@/components/medecin/suivi/EcranSuiviAbsence";

/*
 * Le même suivi d'absence, dans l'espace du secrétariat.
 *
 * C'est l'accueil qui décroche le téléphone, qui voit arriver le patient et
 * qui prépare la journée du praticien : un signal que seul le médecin peut
 * lire arrive toujours trop tard. L'écran est donc le même — même calcul,
 * mêmes seuils, mêmes gestes — à ceci près que les SEUILS restent en lecture
 * seule (la policy d'UPDATE de `suivi_absence_parametres` les réserve au
 * médecin, et le dialogue le dit plutôt que de promettre un enregistrement
 * que la base refuserait).
 *
 * Une page à part plutôt qu'un lien vers /espace-medecin : un(e) assistant(e)
 * renvoyé(e) dans la coquille du médecin y perdrait son menu.
 */
export default function PageSuiviAbsenceAssistant() {
  return (
    <AssistantShell>
      <Suspense fallback={<SqueletteModule />}>
        <EcranSuiviAbsence retourMobile="/espace-assistant/compte" />
      </Suspense>
    </AssistantShell>
  );
}
