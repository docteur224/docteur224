"use client";

import MedecinShell from "@/components/medecin/MedecinShell";
import MonCompte from "@/components/compte/MonCompte";
import InvitationsEtablissement from "@/components/medecin/InvitationsEtablissement";

/*
 * Mon compte — écran commun aux cinq espaces (components/compte/MonCompte),
 * avec en tête les invitations de rattachement reçues.
 *
 * C'est ici que mène désormais la notification « Invitation reçue »
 * (migration 0055) : « Mon compte » est le seul écran de ce nom que la
 * barre latérale du web propose, et il est aussi dans le menu mobile. Le
 * praticien peut donc y revenir après avoir marqué la notification lue —
 * ce qu'une notification seule ne permet pas.
 */
export default function MonCompteMedecin() {
  return (
    <MedecinShell>
      <MonCompte
        retourMobile="/espace-medecin/compte"
        avant={
          <>
            {/* La carte web et la carte mobile n'ont pas le même habillage ;
                la grille de MonCompte gère déjà l'espacement, d'où le
                `className` vidé. */}
            <div className="md:hidden">
              <InvitationsEtablissement mobile />
            </div>
            <div className="hidden md:block">
              <InvitationsEtablissement className="" />
            </div>
          </>
        }
      />
    </MedecinShell>
  );
}
