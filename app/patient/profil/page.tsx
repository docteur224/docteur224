"use client";

import { useState } from "react";
import PatientShell from "@/components/patient/PatientShell";
import { villes } from "@/lib/mock-data";
import {
  enregistrerPatientLocal,
  initialesPatient,
  usePatientLocal,
  type PatientLocal,
} from "@/lib/mock-patient";

/*
 * Mon profil — reproduit l'écran « pat-profil » de la maquette web :
 * avatar, grille de champs (prénom, nom, téléphone, e-mail, naissance,
 * sexe, ville) et bouton Enregistrer. Persisté en local (mock).
 */
export default function MonProfil() {
  const enregistre = usePatientLocal();
  // Modifications non enregistrées, superposées au profil stocké.
  const [brouillon, setBrouillon] = useState<Partial<PatientLocal>>({});
  const [message, setMessage] = useState("");

  const patient: PatientLocal = { ...enregistre, ...brouillon };

  function setPatient(valeurs: PatientLocal) {
    setBrouillon({ ...brouillon, ...valeurs });
    setMessage("");
  }

  function enregistrer() {
    enregistrerPatientLocal(patient);
    setBrouillon({});
    setMessage("✓ Profil enregistré");
  }

  const classeChamp =
    "w-full rounded-[11px] border border-line bg-white px-[13px] py-3 text-[13.5px] outline-none focus:border-teal";

  return (
    <PatientShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Mon profil</h2>
          <small className="text-[13px] text-muted">Vos informations personnelles</small>
        </div>
        <div className="flex items-center gap-3">
          {message && <span className="text-[12.5px] font-bold text-green">{message}</span>}
          <button
            type="button"
            onClick={enregistrer}
            className="rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
          >
            💾 Enregistrer
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <div className="mb-5 flex items-center gap-4">
          <span
            aria-hidden
            className="grid h-[72px] w-[72px] place-items-center rounded-[20px] text-2xl font-extrabold text-white"
            style={{ background: "linear-gradient(135deg,#2E9CCA,#15506B)" }}
          >
            {initialesPatient(patient)}
          </span>
          <div>
            <b className="block text-base font-extrabold">
              {patient.prenom} {patient.nom}
            </b>
            <div className="text-[12.5px] text-muted">
              {patient.sexe === "Masculin" ? "Patient" : "Patiente"} · membre depuis 2026
            </div>
            <button
              type="button"
              disabled
              title="Disponible dans une phase ultérieure"
              className="mt-2 cursor-not-allowed rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue opacity-50"
            >
              Changer la photo
            </button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-muted">Prénom</label>
            <input
              className={classeChamp}
              value={patient.prenom}
              onChange={(e) => setPatient({ ...patient, prenom: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-muted">Nom</label>
            <input
              className={classeChamp}
              value={patient.nom}
              onChange={(e) => setPatient({ ...patient, nom: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-muted">Téléphone</label>
            <input
              className={classeChamp}
              value={patient.telephone}
              onChange={(e) => setPatient({ ...patient, telephone: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-muted">E-mail</label>
            <input
              className={classeChamp}
              value={patient.email}
              onChange={(e) => setPatient({ ...patient, email: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-muted">Date de naissance</label>
            <input
              type="date"
              className={classeChamp}
              value={patient.dateNaissance}
              onChange={(e) => setPatient({ ...patient, dateNaissance: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-muted">Sexe</label>
            <select
              className={classeChamp}
              value={patient.sexe}
              onChange={(e) =>
                setPatient({ ...patient, sexe: e.target.value as PatientLocal["sexe"] })
              }
            >
              <option>Féminin</option>
              <option>Masculin</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-bold text-muted">Ville</label>
            <select
              className={classeChamp}
              value={patient.ville}
              onChange={(e) => setPatient({ ...patient, ville: e.target.value })}
            >
              {villes.map((ville) => (
                <option key={ville}>{ville}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </PatientShell>
  );
}
