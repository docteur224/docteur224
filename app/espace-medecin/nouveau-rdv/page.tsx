"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import MedecinShell from "@/components/medecin/MedecinShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import NouveauRdvDelegue from "@/components/pro/NouveauRdvDelegue";

/*
 * « + Nouveau rendez-vous » côté médecin — réservation déléguée (spec C.2.3).
 * Le formulaire est partagé avec l'espace assistant(e).
 *
 * `?date=&heure=` : l'agenda envoie ici le créneau libre sur lequel le
 * praticien vient de cliquer. Le créneau vit dans l'URL et non dans un état
 * partagé — c'est ce qui permet de revenir en arrière sans perdre la case
 * choisie.
 */
export default function NouveauRendezVousMedecin() {
  return (
    <MedecinShell>
      <EnTeteMobile retour="/espace-medecin/agenda" titre="Nouveau rendez-vous" />
      {/* `useSearchParams` exige une frontière Suspense en rendu statique. */}
      <Suspense fallback={<NouveauRdvDelegue reservePar="medecin" lienRetour="/espace-medecin/agenda" />}>
        <FormulairePrerempli />
      </Suspense>
    </MedecinShell>
  );
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const HEURE = /^\d{2}:\d{2}$/;

function FormulairePrerempli() {
  const parametres = useSearchParams();
  const date = parametres.get("date") ?? "";
  const heure = parametres.get("heure") ?? "";

  return (
    <NouveauRdvDelegue
      reservePar="medecin"
      lienRetour="/espace-medecin/agenda"
      dateInitiale={ISO.test(date) ? date : undefined}
      heureInitiale={HEURE.test(heure) ? heure : undefined}
    />
  );
}
