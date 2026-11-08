"use client";

import { Suspense } from "react";
import MedecinShell from "@/components/medecin/MedecinShell";
import { SqueletteModule } from "@/components/medecin/fiche/ui";
import EcranSuiviAbsence from "@/components/medecin/suivi/EcranSuiviAbsence";

/*
 * Suivi d'absence, côté médecin. La page ne porte que la coquille : l'écran
 * lui-même vit dans `components/medecin/suivi/EcranSuiviAbsence`, parce que
 * l'espace assistant le monte aussi, avec son propre menu.
 */
export default function PageSuiviAbsenceMedecin() {
  return (
    <MedecinShell>
      {/* `useSearchParams` exige une frontière Suspense ; le squelette tient
          la place le temps du premier rendu. */}
      <Suspense fallback={<SqueletteModule />}>
        <EcranSuiviAbsence retourMobile="/espace-medecin/compte" />
      </Suspense>
    </MedecinShell>
  );
}
