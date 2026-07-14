"use client";

import { useState } from "react";
import MedecinShell from "@/components/medecin/MedecinShell";
import { useContextePro, usePatientsCabinet } from "@/lib/pro";

/*
 * Mes patients — reproduit l'écran « med-patients » de la maquette web :
 * recherche et tableau Patient / Téléphone / Dernière visite. La liste vient du
 * magasin local partagé avec l'écran « + Nouveau rendez-vous ».
 */
export default function PatientsMedecin() {
  const { medecin } = useContextePro();
  const { patients } = usePatientsCabinet(medecin?.id);
  const [recherche, setRecherche] = useState("");

  const filtre = recherche.trim().toLowerCase();
  const liste = patients.filter(
    (p) =>
      `${p.prenom} ${p.nom}`.toLowerCase().includes(filtre) ||
      p.telephone.replace(/\s/g, "").includes(filtre.replace(/\s/g, ""))
  );

  return (
    <MedecinShell>
      {/* ===== Version mobile (écran « m-med-patients » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <div className="appbar">
          <h3 style={{ paddingLeft: 4 }}>Mes patients</h3>
          <span className="sub" style={{ marginLeft: "auto", paddingRight: 6 }}>
            {patients.length} suivis
          </span>
        </div>
        <div className="pad" style={{ paddingTop: 8 }}>
          <input
            className="inp"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="🔍 Rechercher un patient…"
          />
          {liste.map((patient) => (
            <div key={patient.id} className="paycard">
              <span
                className="pi"
                aria-hidden
                style={{ background: patient.gradient, color: "#fff", fontWeight: 800 }}
              >
                {patient.prenom.charAt(0)}
                {patient.nom.charAt(0)}
              </span>
              <span className="pinfo">
                <b>
                  {patient.prenom} {patient.nom}
                </b>
                <small>
                  dernière visite {patient.derniereVisite}
                </small>
              </span>
              <span className="ch" aria-hidden>
                ›
              </span>
            </div>
          ))}
          {liste.length === 0 && (
            <p className="muted" style={{ fontSize: 13 }}>
              Aucun patient ne correspond à « {recherche} ».
            </p>
          )}
          <div className="noteboxm">
            <span aria-hidden>🔒</span>
            <div>
              Le dossier médical détaillé arrivera avec la base de données ; seules les coordonnées
              nécessaires aux rendez-vous sont affichées ici.
            </div>
          </div>
        </div>
      </div>

      {/* ===== Version web (inchangée) ===== */}
      <div className="hidden md:block">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Mes patients</h2>
          <small className="text-[13px] text-muted">{patients.length} patients suivis</small>
        </div>
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="🔍 Rechercher un patient…"
          className="min-w-[220px] rounded-[11px] border border-line bg-white px-[13px] py-3 text-[13.5px] outline-none focus:border-teal"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <div className="grid grid-cols-[1fr_90px_130px] items-center gap-3 bg-[#F3F7FA] px-[18px] py-[13px] text-[11px] font-extrabold uppercase tracking-[.04em] text-muted sm:grid-cols-[1fr_110px_150px_140px]">
          <span>Patient</span>
          <span>Téléphone</span>
          <span>Dernière visite</span>
          <span className="hidden sm:block">Téléphone</span>
        </div>
        {liste.map((patient) => (
          <div
            key={patient.id}
            className="grid grid-cols-[1fr_90px_130px] items-center gap-3 border-t border-line px-[18px] py-[13px] text-[13px] sm:grid-cols-[1fr_110px_150px_140px]"
          >
            <b className="font-extrabold">
              {patient.prenom} {patient.nom}
            </b>
            <span>{patient.telephone || "—"}</span>
            <span>{patient.derniereVisite}</span>
            <span className="hidden text-muted sm:block">{patient.telephone}</span>
          </div>
        ))}
        {liste.length === 0 && (
          <p className="border-t border-line px-[18px] py-[13px] text-[13px] text-muted">
            Aucun patient ne correspond à « {recherche} ».
          </p>
        )}
      </div>

      <p className="mt-3 text-[11.5px] text-muted">
        🔒 Le dossier médical détaillé arrivera avec la base de données ; seules les coordonnées
        nécessaires aux rendez-vous sont affichées ici.
      </p>
      </div>
    </MedecinShell>
  );
}
