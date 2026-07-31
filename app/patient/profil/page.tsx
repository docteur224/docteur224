"use client";

import { useState } from "react";
import PatientShell from "@/components/patient/PatientShell";
import ChangerEmail from "@/components/patient/ChangerEmail";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import {
  enregistrerProfilPatient,
  useProfilConnecte,
  useVilles,
} from "@/lib/patient";

/*
 * Mon profil — reproduit l'écran « pat-profil » de la maquette web :
 * avatar, grille de champs (prénom, nom, téléphone, e-mail, naissance,
 * sexe, ville) et bouton Enregistrer. Écrit réellement dans les tables
 * `utilisateurs` et `patients` (RLS : sa propre ligne uniquement).
 */

interface ChampsProfil {
  prenom: string;
  nom: string;
  telephone: string;
  email: string;
  dateNaissance: string;
  sexe: string;
  ville: string; // id de la ville
}

const initialesPatient = (p: { prenom: string; nom: string }) =>
  `${p.prenom.charAt(0)}${p.nom.charAt(0)}`.toUpperCase() || "?";

export default function MonProfil() {
  const { profil } = useProfilConnecte();
  const villesRef = useVilles();
  const villes = villesRef.map((v) => v.id);
  const nomVille = (id: string) => villesRef.find((v) => v.id === id)?.nom ?? "—";
  // Modifications non enregistrées, superposées au profil chargé.
  const [brouillon, setBrouillon] = useState<Partial<ChampsProfil>>({});
  const [message, setMessage] = useState("");

  const patient: ChampsProfil = {
    prenom: profil?.prenom ?? "",
    nom: profil?.nom ?? "",
    telephone: profil?.telephone ?? "",
    email: profil?.email ?? "",
    dateNaissance: profil?.dateNaissance ?? "",
    sexe: profil?.genre === "M" ? "Masculin" : "Féminin",
    ville: profil?.villeId ?? "",
    ...brouillon,
  };

  function setPatient(valeurs: ChampsProfil) {
    setBrouillon({ ...brouillon, ...valeurs });
    setMessage("");
  }

  async function enregistrer() {
    const res = await enregistrerProfilPatient({
      nom: patient.nom,
      prenom: patient.prenom,
      telephone: patient.telephone,
      dateNaissance: patient.dateNaissance,
      genre: patient.sexe,
      villeId: patient.ville || null,
    });
    setMessage(res.erreur ? `⚠️ ${res.erreur}` : "✓ Profil enregistré");
    if (!res.erreur) setBrouillon({});
  }

  const classeChamp =
    "w-full rounded-[11px] border border-line bg-white px-[13px] py-3 text-[13.5px] outline-none focus:border-teal";

  return (
    <PatientShell>
      {/* ===== Version mobile (écran « m-pat-profil » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <EnTeteMobile retour="/patient/compte" titre="Mon profil" recherche />
        <div className="pad">
          <div className="acctop">
            <span
              className="av"
              aria-hidden
              style={{ background: "linear-gradient(135deg,#2E9CCA,#15506B)" }}
            >
              {initialesPatient(patient)}
            </span>
            <div>
              <b>
                {patient.prenom} {patient.nom}
              </b>
              <small>{patient.sexe === "Masculin" ? "Patient" : "Patiente"}</small>
            </div>
          </div>
          <div className="fldm">
            <label>Prénom</label>
            <input
              className="v"
              value={patient.prenom}
              onChange={(e) => setPatient({ ...patient, prenom: e.target.value })}
            />
          </div>
          <div className="fldm">
            <label>Nom</label>
            <input
              className="v"
              value={patient.nom}
              onChange={(e) => setPatient({ ...patient, nom: e.target.value })}
            />
          </div>
          <div className="fldm">
            <label>Téléphone</label>
            <input
              className="v"
              value={patient.telephone}
              onChange={(e) => setPatient({ ...patient, telephone: e.target.value })}
            />
          </div>
          <div className="fldm">
            <label>E-mail</label>
            {/* Lecture seule : le changement passe par un lien de
                confirmation, il ne suit pas le bouton Enregistrer. */}
            <input className="v" readOnly value={patient.email} style={{ color: "var(--muted)" }} />
          </div>
          <ChangerEmail mobile emailActuel={patient.email} />
          <div className="fldm">
            <label>Date de naissance</label>
            <input
              type="date"
              className="v"
              value={patient.dateNaissance}
              onChange={(e) => setPatient({ ...patient, dateNaissance: e.target.value })}
            />
          </div>
          <div className="fldm">
            <label>Sexe</label>
            <select
              className="v"
              value={patient.sexe}
              onChange={(e) =>
                setPatient({ ...patient, sexe: e.target.value })
              }
            >
              <option>Féminin</option>
              <option>Masculin</option>
            </select>
          </div>
          <div className="fldm">
            <label>Ville</label>
            <select
              className="v"
              value={patient.ville}
              onChange={(e) => setPatient({ ...patient, ville: e.target.value })}
            >
              {villes.map((ville) => (
                <option key={ville} value={ville}>{nomVille(ville)}</option>
              ))}
            </select>
          </div>
          {message && (
            <div
              style={{
                color: message.startsWith("⚠️") ? "var(--red)" : "var(--green)",
                fontSize: 12.5,
                fontWeight: 700,
                marginBottom: 10,
              }}
            >
              {message}
            </div>
          )}
          <button type="button" className="btn block" onClick={enregistrer}>
            💾 Enregistrer
          </button>
        </div>
      </div>

      {/* ===== Version web (inchangée) ===== */}
      <div className="hidden md:block">
      <div className="mb-5">
        <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Mon profil</h2>
        <small className="text-[13px] text-muted">Vos informations personnelles</small>
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
            {/* Lecture seule ici : l'e-mail est l'identifiant de connexion,
                son changement passe par un lien de confirmation et ne suit
                donc pas le bouton Enregistrer du formulaire. */}
            <input
              readOnly
              className={`${classeChamp} cursor-not-allowed bg-bg text-muted`}
              value={patient.email}
            />
            <ChangerEmail emailActuel={patient.email} />
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
                setPatient({ ...patient, sexe: e.target.value })
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
                <option key={ville} value={ville}>{nomVille(ville)}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Comme sur « Mes proches » : l'action d'enregistrement clôt le
            formulaire, elle n'est pas reléguée dans l'en-tête de page. */}
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <button
            type="button"
            onClick={enregistrer}
            className="rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
          >
            💾 Enregistrer
          </button>
          {message && (
            <span
              className={`text-[12.5px] font-bold ${
                message.startsWith("⚠️") ? "text-red" : "text-green"
              }`}
            >
              {message}
            </span>
          )}
        </div>
      </div>
      </div>
    </PatientShell>
  );
}
