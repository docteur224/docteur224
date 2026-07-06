"use client";

import Link from "next/link";
import { depuisISO, MOIS_ABREGES } from "@/lib/dates";
import type { RendezVousLocal } from "@/lib/mock-rdv";

/**
 * Carte de rendez-vous — reproduit la .appt de la maquette web
 * (pastille de date, médecin, lignes de détail, badge de statut, actions).
 */
export default function CarteRdv({
  rdv,
  onAnnuler,
}: {
  rdv: RendezVousLocal;
  onAnnuler?: (id: string) => void;
}) {
  const d = depuisISO(rdv.date);
  const annule = rdv.statut === "annule";
  const pourUnProche = rdv.pourQuiId !== undefined && rdv.pourQuiId !== "moi";

  return (
    <>
    {/* ===== Version mobile : carte .appt de la maquette mobile ===== */}
    <div className="appt md:hidden">
      <div className="top">
        <div className="when">
          <b>{d.getDate()}</b>
          <small>{MOIS_ABREGES[d.getMonth()]}</small>
        </div>
        <div className="who" style={{ flex: 1 }}>
          <b>{rdv.medecinNom}</b>
          <small>
            {rdv.specialite} · {rdv.heure}
          </small>
        </div>
        <span className={`badge ${annule ? "no" : "ok"}`}>{annule ? "Annulé" : "Confirmé"}</span>
      </div>
      <div className="hr" />
      <div className="det">
        📍 {rdv.etablissementNom} · {rdv.ville}
      </div>
      {pourUnProche && <div className="det">👤 Pour : {rdv.pourQui}</div>}
      {onAnnuler && !annule && (
        <div className="acts">
          <Link href={`/medecin/${rdv.medecinId}`}>Modifier</Link>
          <button type="button" className="danger" onClick={() => onAnnuler(rdv.id)}>
            Annuler
          </button>
        </div>
      )}
    </div>

    {/* ===== Version web (inchangée) ===== */}
    <div className="mb-[14px] hidden items-center gap-[18px] rounded-2xl border border-line bg-white p-[18px] sm:grid-cols-[64px_1fr] md:grid lg:grid-cols-[64px_1fr_auto]">
      <div className="rounded-[13px] bg-teal-soft py-3 text-center">
        <b className="block text-[22px] font-extrabold leading-none text-blue">{d.getDate()}</b>
        <small className="text-[10px] font-bold uppercase text-blue">
          {MOIS_ABREGES[d.getMonth()]}
        </small>
      </div>
      <div>
        <b className="block text-[15px] font-extrabold">{rdv.medecinNom}</b>
        <div className="mt-1 flex items-center gap-[7px] text-[12.5px] text-muted">
          🩺 {rdv.specialite} · {rdv.heure}
        </div>
        <div className="mt-1 flex items-center gap-[7px] text-[12.5px] text-muted">
          📍 {rdv.etablissementNom} · {rdv.ville}
        </div>
        {pourUnProche && (
          <div className="mt-1 flex items-center gap-[7px] text-[12.5px] text-muted">
            👤 Pour : {rdv.pourQui}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-[9px]">
        <span
          className={`rounded-lg px-[10px] py-[5px] text-[10.5px] font-extrabold uppercase tracking-[.03em] ${
            annule ? "bg-red-soft text-red" : "bg-green-soft text-green"
          }`}
        >
          {annule ? "Annulé" : "Confirmé"}
        </span>
        {onAnnuler && !annule && (
          <>
            <Link
              href={`/medecin/${rdv.medecinId}`}
              className="rounded-[10px] border-[1.5px] border-line bg-white px-[15px] py-[9px] text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
            >
              Modifier
            </Link>
            <button
              type="button"
              onClick={() => onAnnuler(rdv.id)}
              className="rounded-[10px] border-[1.5px] border-red-soft bg-white px-[15px] py-[9px] text-[12.5px] font-bold text-red transition-colors hover:bg-red-soft"
            >
              Annuler
            </button>
          </>
        )}
      </div>
    </div>
    </>
  );
}
