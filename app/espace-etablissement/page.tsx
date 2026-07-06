"use client";

import Link from "next/link";
import EtablissementShell from "@/components/etablissement/EtablissementShell";
import { ETABLISSEMENT_CONNECTE, useMedecinsRattaches } from "@/lib/mock-etablissement";

/*
 * Tableau de bord établissement — reproduit l'écran « etab-dash » de la
 * maquette web : 4 statistiques, médecins de l'établissement, prochains
 * rendez-vous tous médecins. Le compteur de médecins est calculé en direct.
 */

const PROCHAINS_RDV = [
  {
    heure: "09:00",
    patient: "Aboubacar Sylla",
    detail: "Dr M. Diallo · Médecine générale",
    statut: "Confirmé",
  },
  {
    heure: "09:30",
    patient: "Mariama Sow",
    detail: "Dr A. Barry · Pédiatrie",
    statut: "Confirmé",
  },
  {
    heure: "10:00",
    patient: "Ibrahima Bah",
    detail: "Dr I. Camara · Cardiologie",
    statut: "En attente",
  },
];

export default function TableauDeBordEtablissement() {
  const rattaches = useMedecinsRattaches();

  return (
    <EtablissementShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">
            {ETABLISSEMENT_CONNECTE.nom}
          </h2>
          <small className="text-[13px] text-muted">Vue d’ensemble de l’établissement</small>
        </div>
        <Link
          href="/espace-etablissement/medecins"
          className="rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
        >
          + Inviter un médecin
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-line bg-white p-[18px]">
          <span className="text-lg" aria-hidden>
            👨‍⚕️
          </span>
          <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-blue">
            {rattaches.length}
          </b>
          <small className="text-xs font-semibold text-muted">Médecins actifs</small>
        </div>
        <div className="rounded-2xl border border-line bg-white p-[18px]">
          <span className="text-lg" aria-hidden>
            📅
          </span>
          <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-amber">32</b>
          <small className="text-xs font-semibold text-muted">RDV aujourd’hui</small>
        </div>
        <div className="rounded-2xl border border-line bg-white p-[18px]">
          <span className="text-lg" aria-hidden>
            🧑‍💼
          </span>
          <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-green">4</b>
          <small className="text-xs font-semibold text-muted">Assistant(e)s</small>
        </div>
        <div className="rounded-2xl border border-line bg-white p-[18px]">
          <span className="text-lg" aria-hidden>
            📈
          </span>
          <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-teal">78%</b>
          <small className="text-xs font-semibold text-muted">Taux d’occupation</small>
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">Médecins de l’établissement</h3>
        {rattaches.slice(0, 3).map((medecin) => (
          <div
            key={medecin.id}
            className="flex items-center gap-[13px] border-b border-line py-[14px] last:border-b-0"
          >
            <span
              aria-hidden
              className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl text-sm font-extrabold text-white"
              style={{ background: medecin.gradient }}
            >
              {medecin.initiales}
            </span>
            <div className="flex-1">
              <b className="block text-sm font-extrabold">{medecin.nom}</b>
              <small className="text-xs text-muted">{medecin.specialite}</small>
            </div>
            <span className="rounded-lg bg-green-soft px-[9px] py-1 text-[11px] font-bold text-green">
              Actif
            </span>
          </div>
        ))}
        <Link
          href="/espace-etablissement/medecins"
          className="mt-[14px] inline-block rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
        >
          Voir tous les médecins →
        </Link>
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-[14px] text-[15px] font-extrabold">
          Prochains rendez-vous · tous médecins
        </h3>
        {PROCHAINS_RDV.map((rdv) => (
          <div
            key={rdv.heure}
            className="mb-[10px] flex flex-wrap items-center gap-3 rounded-xl border border-line p-[13px] last:mb-0"
          >
            <span className="flex-none rounded-[9px] bg-teal-soft px-[11px] py-[9px] text-[13px] font-extrabold text-blue">
              {rdv.heure}
            </span>
            <span className="min-w-0 flex-1">
              <b className="block text-[13.5px]">{rdv.patient}</b>
              <small className="text-xs text-muted">{rdv.detail}</small>
            </span>
            <span
              className={`rounded-lg px-[9px] py-1 text-[11px] font-bold ${
                rdv.statut === "Confirmé"
                  ? "bg-green-soft text-green"
                  : "bg-amber-soft text-amber"
              }`}
            >
              {rdv.statut}
            </span>
          </div>
        ))}
        <p className="mt-3 text-[11.5px] text-muted">
          Rendez-vous de démonstration — la vue consolidée multi-médecins sera branchée avec la
          base de données.
        </p>
      </div>
    </EtablissementShell>
  );
}
