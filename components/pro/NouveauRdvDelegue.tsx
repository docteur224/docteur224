"use client";

import Link from "next/link";
import { useState } from "react";
import { capitaliser, formatDateLongue, versISO } from "@/lib/dates";
import { getEtablissement, medecinConnecte, nomComplet } from "@/lib/mock-data";
import { creneauxJourPatient, useExceptionsLocales } from "@/lib/mock-disponibilites";
import { assistantePeutCreerRdv } from "@/lib/actions-assistante";
import {
  ajouterPatientCabinet,
  initialesPatientCabinet,
  usePatientsCabinet,
  type PatientCabinet,
} from "@/lib/mock-patients-cabinet";
import { ajouterRendezVousLocal, useRendezVousLocaux } from "@/lib/mock-rdv";

/**
 * « + Nouveau rendez-vous » — réservation déléguée (spec C.2.3), partagée
 * entre l'espace médecin et l'espace assistant(e) : réserver AU NOM d'un
 * patient, existant ou nouveau (fiche minimale sans compte). Le rendez-vous
 * est tracé « Réservé par : le cabinet · canal téléphone » et occupe
 * immédiatement le créneau partout.
 * Pour l'assistant(e), l'enregistrement repasse par la garde de permissions.
 */

const FICHE_VIDE = { nom: "", prenom: "", telephone: "" };

export default function NouveauRdvDelegue({
  reservePar,
  lienRetour,
}: {
  reservePar: "medecin" | "assistant";
  lienRetour: string;
}) {
  const patients = usePatientsCabinet();
  const rdvs = useRendezVousLocaux();
  const exceptions = useExceptionsLocales();

  const [recherche, setRecherche] = useState("");
  const [patientChoisi, setPatientChoisi] = useState<PatientCabinet | null>(null);
  const [fiche, setFiche] = useState(FICHE_VIDE);
  const [dateISO, setDateISO] = useState(() => {
    const demain = new Date();
    demain.setDate(demain.getDate() + 1);
    return versISO(demain);
  });
  const [heure, setHeure] = useState<string | null>(null);
  const [motif, setMotif] = useState("");
  const [erreur, setErreur] = useState("");
  const [rdvEnregistre, setRdvEnregistre] = useState<{ nomPatient: string; heure: string } | null>(
    null
  );

  const etab = getEtablissement(medecinConnecte.etablissementId);
  const filtre = recherche.trim().toLowerCase();
  const resultats =
    filtre === ""
      ? []
      : patients
          .filter(
            (p) =>
              `${p.prenom} ${p.nom}`.toLowerCase().includes(filtre) ||
              p.telephone.replace(/\s/g, "").includes(filtre.replace(/\s/g, ""))
          )
          .slice(0, 3);

  const creneauxOuverts = creneauxJourPatient(medecinConnecte.id, dateISO, exceptions, rdvs).filter(
    (c) => c.statut === "ouvert"
  );

  const fichePrete =
    fiche.nom.trim() !== "" && fiche.prenom.trim() !== "" && fiche.telephone.trim() !== "";
  const patientPret = patientChoisi !== null || fichePrete;
  const tout = patientPret && heure !== null;

  function enregistrer() {
    if (!tout || heure === null) return;
    // Garde de permissions (équivalent mock de la RLS) pour l'assistant(e).
    if (reservePar === "assistant") {
      const acces = assistantePeutCreerRdv();
      if (!acces.ok) {
        setErreur(acces.erreur ?? "Action refusée.");
        return;
      }
    }
    const patient = patientChoisi ?? ajouterPatientCabinet(fiche);
    const nomPatient = `${patient.prenom} ${patient.nom}`;
    ajouterRendezVousLocal({
      id: `rdv-${Date.now()}`,
      medecinId: medecinConnecte.id,
      medecinNom: nomComplet(medecinConnecte),
      specialite: medecinConnecte.specialite,
      etablissementNom: etab?.nom ?? "",
      ville: etab?.ville ?? medecinConnecte.ville,
      date: dateISO,
      heure,
      tarif: medecinConnecte.tarifConsultation,
      motif: motif.trim() || "Consultation",
      pourQui: `${nomPatient} (patient du cabinet)`,
      pourQuiId: patient.id,
      statut: "confirme",
      reservePar,
      creeLe: new Date().toISOString(),
    });
    setErreur("");
    setRdvEnregistre({ nomPatient, heure });
  }

  function reinitialiser() {
    setRecherche("");
    setPatientChoisi(null);
    setFiche(FICHE_VIDE);
    setHeure(null);
    setMotif("");
    setErreur("");
    setRdvEnregistre(null);
  }

  const classeChamp =
    "w-full rounded-[11px] border border-line bg-white px-[13px] py-3 text-[13.5px] outline-none focus:border-teal";

  /* ===== Écran de succès ===== */
  if (rdvEnregistre) {
    return (
      <div className="mx-auto max-w-[560px] py-[40px] text-center">
        <div className="mx-auto mb-[22px] grid h-[104px] w-[104px] animate-[pop_.4s_ease] place-items-center rounded-full bg-green-soft">
          <div className="grid h-[72px] w-[72px] place-items-center rounded-full bg-green text-4xl text-white">
            ✓
          </div>
        </div>
        <h2 className="text-[25px] font-extrabold tracking-[-0.4px]">Rendez-vous enregistré !</h2>
        <p className="mt-[10px] text-[14.5px] leading-relaxed text-muted">
          Le rendez-vous de <b>{rdvEnregistre.nomPatient}</b> est réservé pour le{" "}
          <b>
            {formatDateLongue(dateISO)} à {rdvEnregistre.heure}
          </b>
          .
        </p>
        <div className="mt-[18px] inline-flex items-center gap-2 rounded-xl bg-green-soft px-[18px] py-[11px] text-[13px] font-bold text-green">
          📩 SMS de confirmation envoyé au patient
        </div>
        <p className="mt-2 text-[11.5px] text-muted">
          Mode démonstration : le SMS simulé est visible dans le centre de notifications (🔔).
          L’envoi réel sera branché avec la base de données.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link
            href={lienRetour}
            className="rounded-[11px] bg-teal px-[18px] py-[11px] text-[13.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
          >
            Voir l’agenda
          </Link>
          <button
            type="button"
            onClick={reinitialiser}
            className="rounded-[11px] border-[1.5px] border-line bg-white px-[18px] py-[11px] text-[13.5px] font-bold text-blue transition-colors hover:bg-bg"
          >
            + Nouveau rendez-vous
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[780px]">
      <div className="mb-4 flex items-center gap-3">
        <Link
          href={lienRetour}
          className="rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
        >
          ← Retour
        </Link>
        <h2 className="text-[22px] font-extrabold tracking-[-0.3px]">Nouveau rendez-vous</h2>
      </div>

      <div className="mb-[18px] flex items-start gap-[9px] rounded-xl border border-[#BFE0EF] bg-teal-soft px-[14px] py-3 text-[12.5px] font-semibold leading-relaxed text-blue">
        <span aria-hidden>📞</span>
        <div>
          Réservez un rendez-vous <b>au nom d’un patient</b>. Il recevra une confirmation par{" "}
          <b>SMS</b>. Réservation gratuite, consultation réglée sur place.
        </div>
      </div>

      {/* 1 · Patient */}
      <div className="mb-[18px] rounded-[18px] border border-line bg-white p-6">
        <h3 className="mb-[14px] text-base font-extrabold">1 · Patient</h3>
        <div className="mb-1.5 text-[12.5px] font-bold">Rechercher un patient existant</div>
        <input
          className={classeChamp}
          placeholder="Nom ou téléphone (ex. Mariama, 620…)"
          value={recherche}
          onChange={(e) => {
            setRecherche(e.target.value);
            setPatientChoisi(null);
          }}
        />
        {patientChoisi === null &&
          resultats.map((patient) => (
            <div
              key={patient.id}
              className="mt-2 flex items-center gap-[11px] rounded-[13px] border-[1.5px] border-line bg-white p-3"
            >
              <span
                aria-hidden
                className="grid h-10 w-10 flex-none place-items-center rounded-[11px] text-[13px] font-extrabold text-white"
                style={{ background: patient.gradient }}
              >
                {initialesPatientCabinet(patient)}
              </span>
              <span className="flex-1">
                <b className="block text-[13.5px]">
                  {patient.prenom} {patient.nom}
                </b>
                <small className="text-[11.5px] text-muted">{patient.telephone}</small>
              </span>
              <button
                type="button"
                onClick={() => setPatientChoisi(patient)}
                className="rounded-[9px] bg-teal px-3 py-1.5 text-[11.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
              >
                Choisir
              </button>
            </div>
          ))}
        {patientChoisi && (
          <div className="mt-2 flex items-center gap-[11px] rounded-[13px] border-[1.5px] border-teal bg-teal-soft p-3">
            <span
              aria-hidden
              className="grid h-10 w-10 flex-none place-items-center rounded-[11px] text-[13px] font-extrabold text-white"
              style={{ background: patientChoisi.gradient }}
            >
              {initialesPatientCabinet(patientChoisi)}
            </span>
            <span className="flex-1">
              <b className="block text-[13.5px]">
                {patientChoisi.prenom} {patientChoisi.nom}
              </b>
              <small className="text-[11.5px] text-muted">{patientChoisi.telephone}</small>
            </span>
            <button
              type="button"
              onClick={() => setPatientChoisi(null)}
              className="rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue"
            >
              Changer
            </button>
          </div>
        )}

        <div className="my-[10px] text-center text-xs text-muted">— ou nouveau patient —</div>
        <div className="mb-3 flex items-start gap-[9px] rounded-xl bg-teal-soft px-[14px] py-3 text-[12.5px] font-semibold leading-relaxed text-blue">
          <span aria-hidden>ℹ️</span>
          <div>
            Le patient <b>n’a pas besoin de compte</b>. Créez une fiche minimale ; il pourra
            réclamer son compte plus tard.
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 text-[12.5px] font-bold">Nom *</div>
            <input
              className={classeChamp}
              placeholder="Nom"
              value={fiche.nom}
              disabled={patientChoisi !== null}
              onChange={(e) => setFiche({ ...fiche, nom: e.target.value })}
            />
          </div>
          <div>
            <div className="mb-1.5 text-[12.5px] font-bold">Prénom *</div>
            <input
              className={classeChamp}
              placeholder="Prénom"
              value={fiche.prenom}
              disabled={patientChoisi !== null}
              onChange={(e) => setFiche({ ...fiche, prenom: e.target.value })}
            />
          </div>
        </div>
        <div className="mt-3">
          <div className="mb-1.5 text-[12.5px] font-bold">Téléphone *</div>
          <div className="flex gap-2">
            <span className="flex flex-none items-center gap-1.5 rounded-[11px] border border-line bg-[#F4F8FA] px-[13px] text-[13.5px] font-bold">
              🇬🇳 +224
            </span>
            <input
              className={classeChamp}
              placeholder="6XX XX XX XX"
              value={fiche.telephone}
              disabled={patientChoisi !== null}
              onChange={(e) => setFiche({ ...fiche, telephone: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* 2 · Médecin & créneau */}
      <div className="mb-[18px] rounded-[18px] border border-line bg-white p-6">
        <h3 className="mb-[14px] text-base font-extrabold">2 · Médecin &amp; créneau</h3>
        <div className="mb-1.5 text-[12.5px] font-bold">Médecin</div>
        <div className="rounded-[11px] border border-line bg-[#F4F8FA] px-[13px] py-3 text-[13.5px] font-bold">
          {nomComplet(medecinConnecte)} · {medecinConnecte.specialite}
        </div>
        <div className="mb-1.5 mt-3 text-[12.5px] font-bold">Date</div>
        <input
          type="date"
          className={classeChamp}
          value={dateISO}
          min={versISO(new Date())}
          onChange={(e) => {
            if (e.target.value) {
              setDateISO(e.target.value);
              setHeure(null);
            }
          }}
        />
        <div className="mb-1.5 mt-3 text-[12.5px] font-bold">
          Créneau · {capitaliser(formatDateLongue(dateISO))}
        </div>
        <div className="flex flex-wrap gap-3">
          {creneauxOuverts.map((creneau) => (
            <button
              key={creneau.heure}
              type="button"
              onClick={() => setHeure(creneau.heure)}
              className={`rounded-[13px] border-[1.5px] px-[15px] py-3 text-center text-[13px] font-bold transition-colors ${
                heure === creneau.heure
                  ? "border-teal bg-teal-soft text-blue"
                  : "border-line bg-white"
              }`}
            >
              {creneau.heure}
            </button>
          ))}
          {creneauxOuverts.length === 0 && (
            <p className="text-[13px] text-muted">
              Aucun créneau ouvert à cette date — choisissez une autre date.
            </p>
          )}
        </div>
      </div>

      {/* 3 · Motif */}
      <div className="mb-[18px] rounded-[18px] border border-line bg-white p-6">
        <h3 className="mb-[14px] text-base font-extrabold">3 · Motif</h3>
        <textarea
          rows={3}
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          placeholder="Ex. Vaccination, suivi, fièvre…"
          className="w-full resize-none rounded-xl border border-line bg-white p-[13px] text-[13.5px] outline-none focus:border-teal"
        />
        <div className="mt-3 flex items-start gap-[9px] rounded-xl border border-[#BFE0EF] bg-teal-soft px-[14px] py-3 text-[12.5px] font-semibold leading-relaxed text-blue">
          <span aria-hidden>🧾</span>
          <div>
            Réservé par : <b>{reservePar === "assistant" ? "l’assistante" : "le cabinet"}</b> ·
            canal <b>téléphone</b>. Cette information est tracée.
          </div>
        </div>
      </div>

      {erreur && (
        <div className="mb-3 rounded-xl border border-[#F3C9C2] bg-red-soft px-[14px] py-3 text-[12.5px] font-bold text-red">
          {erreur}
        </div>
      )}

      <div className="flex gap-3">
        <Link
          href={lienRetour}
          className="rounded-[11px] border-[1.5px] border-line bg-white px-[18px] py-[11px] text-[13.5px] font-bold text-blue transition-colors hover:bg-bg"
        >
          Annuler
        </Link>
        <button
          type="button"
          onClick={enregistrer}
          disabled={!tout}
          className="flex-1 rounded-[11px] bg-green px-[18px] py-[11px] text-[13.5px] font-bold text-white transition-colors hover:bg-[#196a3b] disabled:cursor-not-allowed disabled:opacity-50"
        >
          ✅ Enregistrer le rendez-vous
        </button>
      </div>
    </div>
  );
}
