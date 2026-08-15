"use client";

import MedecinShell from "@/components/medecin/MedecinShell";
import MonCompte from "@/components/compte/MonCompte";

/* Mon compte — écran commun aux cinq espaces (components/compte/MonCompte). */
export default function MonCompteMedecin() {
  return (
    <MedecinShell>
      <MonCompte retourMobile="/espace-medecin/compte" />
    </MedecinShell>
  );
}
