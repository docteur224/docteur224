"use client";

import EtablissementShell from "@/components/etablissement/EtablissementShell";
import MonCompte from "@/components/compte/MonCompte";

/* Mon compte — écran commun aux cinq espaces (components/compte/MonCompte). */
export default function MonCompteEtablissement() {
  return (
    <EtablissementShell>
      <MonCompte retourMobile="/espace-etablissement/compte" />
    </EtablissementShell>
  );
}
