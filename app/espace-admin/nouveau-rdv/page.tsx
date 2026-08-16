"use client";

import AdminShell from "@/components/admin/AdminShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import PriseRdvCentreAppel from "@/components/admin/PriseRdvCentreAppel";

/*
 * « + RDV pour un patient » du tableau de bord admin.
 *
 * Aucune permission n'est exigée : les dix permissions de la migration 0043
 * cloisonnent des sections de la console (finance, modération, équipe…),
 * alors que répondre au téléphone est le travail de toute l'équipe —
 * modérateurs et support compris. La base dit la même chose
 * (`creer_rdv_centre_appel` ne demande qu'`est_admin()`), donc l'écran ne
 * promet rien qu'elle refuserait.
 */
export default function NouveauRdvAdmin() {
  return (
    <AdminShell>
      <EnTeteMobile retour="/espace-admin" titre="Prise de rendez-vous" />
      <PriseRdvCentreAppel />
    </AdminShell>
  );
}
