"use client";

import Link from "next/link";
import PatientShell from "@/components/patient/PatientShell";
import CarteRdv from "@/components/patient/CarteRdv";
import { versISO } from "@/lib/dates";
import { usePatientLocal } from "@/lib/mock-patient";
import { useRendezVousLocaux } from "@/lib/mock-rdv";

/*
 * Tableau de bord patient — reproduit l'écran « pat-dash » de la maquette web :
 * salutation, 3 cartes de statistiques, prochain rendez-vous, raccourcis.
 * Les chiffres sont calculés à partir des rendez-vous stockés en local (mocks).
 */
export default function TableauDeBordPatient() {
  const patient = usePatientLocal();
  const rdvs = useRendezVousLocaux();

  const aujourdhui = versISO(new Date());
  const aVenir = rdvs
    .filter((r) => r.statut === "confirme" && r.date >= aujourdhui)
    .sort((a, b) => `${a.date} ${a.heure}`.localeCompare(`${b.date} ${b.heure}`));
  const passes = rdvs.filter((r) => r.statut === "confirme" && r.date < aujourdhui);
  const medecinsConsultes = new Set(rdvs.filter((r) => r.statut === "confirme").map((r) => r.medecinId)).size;
  const prochain = aVenir[0];

  return (
    <PatientShell>
      {/* ===== Version mobile (présentation maquette mobile) ===== */}
      <div className="md:hidden">
        <div className="greet">
          <b>Bonjour, {patient.prenom} 👋</b>
          <br />
          <small>Voici un aperçu de vos rendez-vous</small>
        </div>
        <div className="statcards">
          <div className="sc b1">
            <b>{aVenir.length}</b>
            <small>RDV à venir</small>
          </div>
          <div className="sc b3">
            <b>{passes.length}</b>
            <small>RDV passés</small>
          </div>
          <div className="sc b2">
            <b>{medecinsConsultes}</b>
            <small>Médecins consultés</small>
          </div>
        </div>
        <div className="pad" style={{ paddingTop: 18 }}>
          <div className="section-t" style={{ marginTop: 0 }}>
            Votre prochain rendez-vous
          </div>
          {prochain ? (
            <CarteRdv rdv={prochain} />
          ) : (
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
              Aucun rendez-vous à venir. Lancez une recherche pour réserver votre premier
              rendez-vous — la réservation est gratuite.
            </p>
          )}
          <div className="section-t">Raccourcis</div>
          <div className="menu">
            <Link href="/resultats" className="mrow">
              <span className="mi" aria-hidden>
                🔍
              </span>
              <span>
                <b>Trouver un médecin</b>
              </span>
              <span className="ch" aria-hidden>
                ›
              </span>
            </Link>
            <Link href="/mes-rendez-vous" className="mrow">
              <span className="mi" aria-hidden>
                📅
              </span>
              <span>
                <b>Mes rendez-vous</b>
              </span>
              <span className="ch" aria-hidden>
                ›
              </span>
            </Link>
            <Link href="/patient/proches" className="mrow">
              <span className="mi" aria-hidden>
                👨‍👩‍👧
              </span>
              <span>
                <b>Mes proches</b>
              </span>
              <span className="ch" aria-hidden>
                ›
              </span>
            </Link>
          </div>
        </div>
      </div>

      {/* ===== Version web (inchangée) ===== */}
      <div className="hidden md:block">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">
            Bonjour, {patient.prenom} 👋
          </h2>
          <small className="text-[13px] text-muted">Voici un aperçu de vos rendez-vous</small>
        </div>
        <Link
          href="/resultats"
          className="rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
        >
          + Nouveau rendez-vous
        </Link>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-white p-[18px]">
          <span className="text-lg" aria-hidden>
            📅
          </span>
          <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-blue">
            {aVenir.length}
          </b>
          <small className="text-xs font-semibold text-muted">RDV à venir</small>
        </div>
        <div className="rounded-2xl border border-line bg-white p-[18px]">
          <span className="text-lg" aria-hidden>
            ✅
          </span>
          <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-green">
            {passes.length}
          </b>
          <small className="text-xs font-semibold text-muted">RDV passés</small>
        </div>
        <div className="rounded-2xl border border-line bg-white p-[18px]">
          <span className="text-lg" aria-hidden>
            👨‍⚕️
          </span>
          <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-teal">
            {medecinsConsultes}
          </b>
          <small className="text-xs font-semibold text-muted">Médecins consultés</small>
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-[14px] text-[15px] font-extrabold">Votre prochain rendez-vous</h3>
        {prochain ? (
          <div className="[&>div]:mb-0">
            <CarteRdv rdv={prochain} />
          </div>
        ) : (
          <p className="text-[13px] leading-relaxed text-muted">
            Aucun rendez-vous à venir. Lancez une recherche pour réserver votre premier
            rendez-vous — la réservation est gratuite.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-[14px] text-[15px] font-extrabold">Raccourcis</h3>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/resultats"
            className="rounded-[11px] border-[1.5px] border-line bg-white px-[18px] py-[11px] text-[13.5px] font-bold text-blue transition-colors hover:bg-bg"
          >
            🔍 Trouver un médecin
          </Link>
          <Link
            href="/mes-rendez-vous"
            className="rounded-[11px] border-[1.5px] border-line bg-white px-[18px] py-[11px] text-[13.5px] font-bold text-blue transition-colors hover:bg-bg"
          >
            📅 Mes rendez-vous
          </Link>
          <Link
            href="/patient/proches"
            className="rounded-[11px] border-[1.5px] border-line bg-white px-[18px] py-[11px] text-[13.5px] font-bold text-blue transition-colors hover:bg-bg"
          >
            👨‍👩‍👧 Mes proches
          </Link>
        </div>
      </div>
      </div>
    </PatientShell>
  );
}
