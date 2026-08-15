"use client";

import PatientShell from "@/components/patient/PatientShell";
import MonCompte from "@/components/compte/MonCompte";

/* Mon compte — écran commun aux cinq espaces (components/compte/MonCompte). */
export default function MonComptePatient() {
  return (
    <PatientShell>
      <MonCompte retourMobile="/patient/compte" />
    </PatientShell>
  );
}
