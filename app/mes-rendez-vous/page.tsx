"use client";

import Link from "next/link";
import { useState } from "react";
import PatientShell from "@/components/patient/PatientShell";
import CarteRdv from "@/components/patient/CarteRdv";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import { versISO } from "@/lib/dates";
import {
  annulerRendezVous,
  useMesRendezVous,
  type RendezVousPatient,
} from "@/lib/patient";

/*
 * Mes rendez-vous — reproduit l'écran « mesrdv » de la maquette web :
 * onglets « À venir / Passés », cartes de rendez-vous avec Modifier / Annuler.
 * Lecture et annulation réelles dans la table `rendez_vous` (RLS : le patient
 * ne voit que ses rendez-vous et ceux de ses proches).
 */
export default function MesRendezVous() {
  const { rdvs, recharger } = useMesRendezVous();
  const [onglet, setOnglet] = useState<"avenir" | "passes">("avenir");

  const aujourdhui = versISO(new Date());
  const cle = (r: RendezVousPatient) => `${r.date} ${r.heure}`;
  const aVenir = rdvs
    .filter((r) => r.statut !== "annule" && r.date >= aujourdhui)
    .sort((a, b) => cle(a).localeCompare(cle(b)));
  const passes = rdvs
    .filter((r) => r.statut === "annule" || r.date < aujourdhui)
    .sort((a, b) => cle(b).localeCompare(cle(a)));
  const liste = onglet === "avenir" ? aVenir : passes;

  async function annuler(id: string) {
    if (window.confirm("Voulez-vous vraiment annuler ce rendez-vous ?")) {
      await annulerRendezVous(id);
      recharger();
    }
  }

  return (
    <PatientShell>
      {/* ===== En-tête mobile (écran « mesrdv » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <EnTeteMobile retour="/" titre="Mes rendez-vous" recherche />
        <div className="tabsm">
          <button
            type="button"
            className={`tabm${onglet === "avenir" ? " on" : ""}`}
            onClick={() => setOnglet("avenir")}
          >
            À venir ({aVenir.length})
          </button>
          <button
            type="button"
            className={`tabm${onglet === "passes" ? " on" : ""}`}
            onClick={() => setOnglet("passes")}
          >
            Passés ({passes.length})
          </button>
        </div>
      </div>

      {/* ===== En-tête web (inchangé) ===== */}
      <div className="hidden md:block">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Mes rendez-vous</h2>
          <small className="text-[13px] text-muted">
            Gérez vos rendez-vous à venir et passés
          </small>
        </div>
        <Link
          href="/resultats"
          className="rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
        >
          + Nouveau rendez-vous
        </Link>
      </div>

      <div className="mb-[18px] inline-flex gap-[5px] rounded-xl border border-line bg-white p-[5px]">
        <button
          type="button"
          onClick={() => setOnglet("avenir")}
          className={`rounded-lg px-[18px] py-[9px] text-[13px] font-bold ${
            onglet === "avenir" ? "bg-blue text-white" : "text-muted"
          }`}
        >
          À venir ({aVenir.length})
        </button>
        <button
          type="button"
          onClick={() => setOnglet("passes")}
          className={`rounded-lg px-[18px] py-[9px] text-[13px] font-bold ${
            onglet === "passes" ? "bg-blue text-white" : "text-muted"
          }`}
        >
          Passés ({passes.length})
        </button>
      </div>
      </div>

      <div className="pad pt-4 md:pt-0">
        {liste.map((rdv) => (
          <CarteRdv key={rdv.id} rdv={rdv} onAnnuler={onglet === "avenir" ? annuler : undefined} />
        ))}

        {liste.length === 0 && (
          <div className="rounded-2xl border border-line bg-white p-8 text-center">
            <div className="text-3xl" aria-hidden>
              📅
            </div>
            <b className="mt-3 block text-base font-extrabold">
              {onglet === "avenir" ? "Aucun rendez-vous à venir" : "Aucun rendez-vous passé"}
            </b>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              Réservez un rendez-vous depuis la recherche : il apparaîtra ici. La réservation est
              gratuite, la consultation se règle sur place.
            </p>
            <Link
              href="/resultats"
              className="mt-4 inline-block rounded-[11px] bg-teal px-[18px] py-[11px] text-[13.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
            >
              🔍 Trouver un médecin
            </Link>
          </div>
        )}
      </div>
    </PatientShell>
  );
}
