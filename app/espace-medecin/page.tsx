"use client";

import Link from "next/link";
import { useState } from "react";
import MedecinShell from "@/components/medecin/MedecinShell";
import { capitaliser, formatDateLongue, versISO } from "@/lib/dates";
import { formatNote } from "@/lib/format";
import { medecinConnecte } from "@/lib/mock-data";
import { creneauxJourMedecin, useExceptionsLocales } from "@/lib/mock-disponibilites";
import { useRendezVousLocaux } from "@/lib/mock-rdv";

/*
 * Tableau de bord médecin — reproduit l'écran « medecin » de la maquette web :
 * salutation, 4 cartes de statistiques, demandes à confirmer, agenda du jour.
 * L'agenda du jour vient du modèle de disponibilités partagé (mocks).
 */

/** Demandes de confirmation de démonstration (mêmes lignes que la maquette). */
const DEMANDES_DEMO = [
  { id: "d1", heure: "14:30", patient: "Mariama Sow", detail: "Vaccination · enfant 2 ans" },
  { id: "d2", heure: "15:30", patient: "Sékou Konaté", detail: "Suivi · fièvre" },
  { id: "d3", heure: "16:00", patient: "Hadja Camara", detail: "Première visite" },
];

export default function TableauDeBordMedecin() {
  const rdvs = useRendezVousLocaux();
  const exceptions = useExceptionsLocales();
  const [demandes, setDemandes] = useState(DEMANDES_DEMO);

  const aujourdhui = versISO(new Date());
  const agendaJour = creneauxJourMedecin(medecinConnecte.id, aujourdhui, exceptions, rdvs).filter(
    (c) => c.statut === "reserve"
  );

  function traiterDemande(id: string) {
    setDemandes(demandes.filter((d) => d.id !== id));
  }

  return (
    <MedecinShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">
            Bonjour, {medecinConnecte.civilite} {medecinConnecte.nom} 👋
          </h2>
          <small className="text-[13px] text-muted">
            {capitaliser(formatDateLongue(aujourdhui))} · {agendaJour.length} rendez-vous
            aujourd’hui
          </small>
        </div>
        <div className="flex gap-2">
          <Link
            href="/espace-medecin/nouveau-rdv"
            className="rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
          >
            + Nouveau RDV
          </Link>
          <Link
            href="/espace-medecin/disponibilites"
            className="rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
          >
            + Ajouter un créneau
          </Link>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-line bg-white p-[18px]">
          <span className="text-lg" aria-hidden>
            📅
          </span>
          <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-blue">
            {agendaJour.length}
          </b>
          <small className="text-xs font-semibold text-muted">RDV aujourd’hui</small>
        </div>
        <div className="rounded-2xl border border-line bg-white p-[18px]">
          <span className="text-lg" aria-hidden>
            ⏳
          </span>
          <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-amber">
            {demandes.length}
          </b>
          <small className="text-xs font-semibold text-muted">À confirmer</small>
        </div>
        <div className="rounded-2xl border border-line bg-white p-[18px]">
          <span className="text-lg" aria-hidden>
            ✅
          </span>
          <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-green">96%</b>
          <small className="text-xs font-semibold text-muted">Taux de présence</small>
        </div>
        <div className="rounded-2xl border border-line bg-white p-[18px]">
          <span className="text-lg" aria-hidden>
            ⭐
          </span>
          <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-teal">
            {formatNote(medecinConnecte.note)}
          </b>
          <small className="text-xs font-semibold text-muted">Note moyenne</small>
        </div>
      </div>

      {/* Demandes à confirmer (données de démonstration) */}
      <div className="mb-[18px] overflow-hidden rounded-2xl border border-line bg-white">
        <div className="flex items-center justify-between border-b border-line px-5 py-4 text-sm font-extrabold">
          Demandes à confirmer
          <span className="rounded-[20px] bg-amber-soft px-[10px] py-1 text-[11.5px] font-bold text-amber">
            {demandes.length} en attente
          </span>
        </div>
        {demandes.map((demande) => (
          <div
            key={demande.id}
            className="grid grid-cols-[62px_1fr_auto] items-center gap-4 border-b border-line px-5 py-[14px] last:border-b-0"
          >
            <div className="text-sm font-extrabold text-blue">{demande.heure}</div>
            <div>
              <b className="block text-[13.5px] font-extrabold">{demande.patient}</b>
              <small className="text-xs text-muted">{demande.detail}</small>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => traiterDemande(demande.id)}
                aria-label={`Refuser la demande de ${demande.patient}`}
                className="grid h-9 w-9 place-items-center rounded-[10px] bg-red-soft text-[15px] text-red"
              >
                ✕
              </button>
              <button
                type="button"
                onClick={() => traiterDemande(demande.id)}
                aria-label={`Confirmer la demande de ${demande.patient}`}
                className="grid h-9 w-9 place-items-center rounded-[10px] bg-green-soft text-[15px] text-green"
              >
                ✓
              </button>
            </div>
          </div>
        ))}
        {demandes.length === 0 && (
          <p className="px-5 py-[14px] text-[13px] text-muted">
            Toutes les demandes ont été traitées. 👍
          </p>
        )}
      </div>

      {/* Agenda du jour */}
      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <div className="border-b border-line px-5 py-4 text-sm font-extrabold">Agenda du jour</div>
        {agendaJour.map((creneau) => (
          <div
            key={creneau.heure}
            className="grid grid-cols-[62px_1fr_auto] items-center gap-4 border-b border-line px-5 py-[14px] last:border-b-0"
          >
            <div className="text-sm font-extrabold text-blue">{creneau.heure}</div>
            <div>
              <b className="block text-[13.5px] font-extrabold">{creneau.patient}</b>
              <small className="text-xs text-muted">{creneau.motif}</small>
            </div>
            <span className="rounded-lg bg-green-soft px-[10px] py-[5px] text-[10.5px] font-extrabold uppercase tracking-[.03em] text-green">
              Confirmé
            </span>
          </div>
        ))}
        {agendaJour.length === 0 && (
          <p className="px-5 py-[14px] text-[13px] text-muted">
            Aucun rendez-vous aujourd’hui.
          </p>
        )}
      </div>
    </MedecinShell>
  );
}
