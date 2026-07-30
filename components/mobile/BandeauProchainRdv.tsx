"use client";

import Link from "next/link";
import { formatDateRelative } from "@/lib/dates";
import { useProfilConnecte, useProchainRendezVous } from "@/lib/patient";

/**
 * Rappel du prochain rendez-vous, juste sous la barre haute. Il n'apparaît
 * que pour un patient qui en a un à venir, et disparaît sinon : c'est un
 * rappel, pas une ligne de gabarit.
 *
 * Volontairement absent des écrans « Mes rendez-vous » et du tableau de
 * bord, qui affichent déjà la même information en grand.
 */
export default function BandeauProchainRdv() {
  const { profil } = useProfilConnecte();
  const prochain = useProchainRendezVous();

  if (!profil || profil.role !== "patient" || !prochain) return null;

  return (
    <Link href={`/mes-rendez-vous/${prochain.id}`} className="bandeau-rdv md:hidden">
      <span className="i" aria-hidden>
        📅
      </span>
      <span className="tx">
        <b>
          {formatDateRelative(prochain.date)} · {prochain.heure}
        </b>
        <small>
          {prochain.medecinNom} · {prochain.etablissementNom}
        </small>
      </span>
      <span className="ch" aria-hidden>
        ›
      </span>
    </Link>
  );
}
