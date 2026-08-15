"use client";

import AdminShell from "@/components/admin/AdminShell";
import MonCompte from "@/components/compte/MonCompte";

/*
 * Mon compte — écran commun aux cinq espaces (components/compte/MonCompte).
 * Aucune permission requise : tout administrateur gère SON compte, quelles
 * que soient les sections de la console qui lui sont ouvertes.
 */
export default function MonCompteAdmin() {
  return (
    <AdminShell>
      <MonCompte retourMobile="/espace-admin/plus" />
    </AdminShell>
  );
}
