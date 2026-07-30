"use client";

import MedecinShell from "@/components/medecin/MedecinShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import NouveauRdvDelegue from "@/components/pro/NouveauRdvDelegue";

/*
 * « + Nouveau rendez-vous » côté médecin — réservation déléguée (spec C.2.3).
 * Le formulaire est partagé avec l'espace assistant(e).
 */
export default function NouveauRendezVousMedecin() {
  return (
    <MedecinShell>
      <EnTeteMobile retour="/espace-medecin/agenda" titre="Nouveau rendez-vous" />
      <NouveauRdvDelegue reservePar="medecin" lienRetour="/espace-medecin/agenda" />
    </MedecinShell>
  );
}
