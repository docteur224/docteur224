"use client";

import Link from "next/link";
import { useState } from "react";
import MedecinShell from "@/components/medecin/MedecinShell";
import { capitaliser, depuisISO, formatDateLongue, versISO } from "@/lib/dates";
import { medecinConnecte } from "@/lib/mock-data";
import { creneauxJourMedecin, useExceptionsLocales } from "@/lib/mock-disponibilites";
import { useRendezVousLocaux } from "@/lib/mock-rdv";

/*
 * Mon agenda — reproduit l'écran « med-agenda » de la maquette web :
 * vue de la journée (créneaux réservés et « Disponible »), navigation
 * Hier / Aujourd'hui / Demain, bouton « + Nouveau RDV ».
 */
export default function AgendaMedecin() {
  const rdvs = useRendezVousLocaux();
  const exceptions = useExceptionsLocales();
  const [dateISO, setDateISO] = useState(() => versISO(new Date()));

  const creneaux = creneauxJourMedecin(medecinConnecte.id, dateISO, exceptions, rdvs).filter(
    (c) => c.statut !== "ferme"
  );

  function decaler(jours: number) {
    const d = depuisISO(dateISO);
    d.setDate(d.getDate() + jours);
    setDateISO(versISO(d));
  }

  return (
    <MedecinShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Mon agenda</h2>
          <small className="text-[13px] text-muted">{capitaliser(formatDateLongue(dateISO))}</small>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/espace-medecin/nouveau-rdv"
            className="rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
          >
            + Nouveau RDV
          </Link>
          <button
            type="button"
            onClick={() => decaler(-1)}
            className="rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
          >
            ‹ Hier
          </button>
          <button
            type="button"
            onClick={() => setDateISO(versISO(new Date()))}
            className="rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
          >
            Aujourd’hui
          </button>
          <button
            type="button"
            onClick={() => decaler(1)}
            className="rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
          >
            Demain ›
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        {creneaux.map((creneau) => (
          <div
            key={creneau.heure}
            className="grid grid-cols-[66px_1fr] border-t border-line first:border-t-0"
          >
            <div className="border-r border-line px-3 py-[14px] text-center text-xs font-bold text-muted">
              {creneau.heure}
            </div>
            <div className="px-[14px] py-[10px]">
              {creneau.statut === "reserve" ? (
                <div className="rounded-lg border-l-[3px] border-teal bg-teal-soft px-3 py-[9px] text-[12.5px]">
                  <b className="font-extrabold">{creneau.patient}</b>{" "}
                  <small className="text-muted">· {creneau.motif}</small>
                  {creneau.demo === false && (
                    <small className="text-muted"> · réservé en ligne</small>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border-l-[3px] border-[#CBD8E0] bg-[#F4F8FA] px-3 py-[9px] text-[12.5px] italic text-muted">
                  Disponible
                </div>
              )}
            </div>
          </div>
        ))}
        {creneaux.length === 0 && (
          <p className="px-5 py-[14px] text-[13px] text-muted">
            Aucun créneau ouvert ce jour (journée fermée).
          </p>
        )}
      </div>
    </MedecinShell>
  );
}
