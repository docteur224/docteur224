"use client";

import Link from "next/link";
import AssistantShell from "@/components/assistant/AssistantShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";

import { useContextePro, usePatientsCabinet } from "@/lib/pro";

/*
 * Patients (assistant(e)) — reproduit l'écran « asst-patients » de la
 * maquette web : coordonnées uniquement (nom, téléphone) pour organiser les
 * rendez-vous. Le dossier médical n'est pas accessible (spec C.5).
 */
export default function PatientsAssistant() {
  const { medecin, permissions } = useContextePro();
  const { patients } = usePatientsCabinet(medecin?.id);
  const peutCreer = permissions.creerRdv;

  return (
    <AssistantShell>
      {/* ===== Version mobile (écran « m-asst-patients » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <EnTeteMobile retour="/espace-assistant/compte" titre="Patients" />
        <div className="pad">
          <div className="noteboxm" style={{ marginTop: 0 }}>
            <span aria-hidden>🔒</span>
            <div>
              Coordonnées uniquement (nom, téléphone). Le <b>dossier médical</b> n&apos;est pas
              accessible.
            </div>
          </div>
          <div className="card2" style={{ marginTop: 10 }}>
            <h4>Liste des patients</h4>
            {patients.map((patient) => (
              <div key={patient.id} className="asstrowm">
                <span className="av" aria-hidden style={{ background: patient.gradient }}>
                  {`${patient.prenom.charAt(0)}${patient.nom.charAt(0)}`.toUpperCase()}
                </span>
                <span className="meta">
                  <b>
                    {patient.prenom} {patient.nom}
                  </b>
                  <small>
                    {patient.derniereVisite} · {patient.telephone}
                  </small>
                </span>
                {peutCreer ? (
                  <Link href="/espace-assistant/nouveau-rdv" className="btnm gh">
                    RDV
                  </Link>
                ) : (
                  <span
                    className="btnm gh"
                    style={{ opacity: 0.5 }}
                    title="Permission « Créer un rendez-vous pour un patient » non accordée"
                  >
                    RDV 🔒
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== Version web (inchangée) ===== */}
      <div className="hidden md:block">
      <div className="mb-5">
        <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Patients</h2>
        <small className="text-[13px] text-muted">
          Coordonnées pour organiser et rappeler les rendez-vous
        </small>
      </div>

      <div className="mb-4 flex items-start gap-[9px] rounded-xl border border-[#F2D9B6] bg-[#FFF5E9] px-[14px] py-3 text-[12.5px] font-semibold leading-relaxed text-[#8A5A1B]">
        <span aria-hidden>🔒</span>
        <div>
          Vous accédez uniquement aux <b>coordonnées</b> (nom, téléphone) nécessaires à la prise
          de rendez-vous. Le <b>dossier médical</b> n’est pas accessible.
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">Liste des patients</h3>
        {patients.map((patient) => (
          <div
            key={patient.id}
            className="flex flex-wrap items-center gap-[13px] border-b border-line py-[14px] last:border-b-0"
          >
            <span
              aria-hidden
              className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl text-sm font-extrabold text-white"
              style={{ background: patient.gradient }}
            >
              {`${patient.prenom.charAt(0)}${patient.nom.charAt(0)}`.toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <b className="block text-sm font-extrabold">
                {patient.prenom} {patient.nom}
              </b>
              <small className="text-xs text-muted">
                Dernier RDV : {patient.derniereVisite} · {patient.telephone}
              </small>
            </div>
            {peutCreer ? (
              <Link
                href="/espace-assistant/nouveau-rdv"
                className="rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue transition-colors hover:bg-bg"
              >
                Prendre RDV
              </Link>
            ) : (
              <span
                title="Permission « Créer un rendez-vous pour un patient » non accordée"
                className="cursor-not-allowed rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue opacity-50"
              >
                Prendre RDV 🔒
              </span>
            )}
          </div>
        ))}
      </div>
      </div>
    </AssistantShell>
  );
}
