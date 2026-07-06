"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { calculerAge } from "@/lib/dates";
import { formatGNF } from "@/lib/format";
import { initialesPatient, usePatientLocal } from "@/lib/mock-patient";
import {
  ajouterProcheLocal,
  initialesProche,
  LIENS_PROCHE,
  useProchesLocaux,
  type ProcheLocal,
} from "@/lib/mock-proches";
import { ajouterRendezVousLocal } from "@/lib/mock-rdv";

/**
 * Partie interactive de l'écran de réservation :
 * - « Pour qui est ce rendez-vous ? » : moi-même ou un proche enregistré,
 *   avec ajout d'un proche sans quitter l'écran (spec C.2.1 / C.3) ;
 * - motif de consultation et bandeau « réservation gratuite » ;
 * - à la confirmation, le rendez-vous part dans le stockage local (mock
 *   de la future table « rendez_vous »).
 */

const NOUVEAU_PROCHE_VIDE = {
  nom: "",
  prenom: "",
  lien: LIENS_PROCHE[0],
  dateNaissance: "",
  genre: "Femme" as ProcheLocal["genre"],
};

export default function FormulaireReservation({
  medecinId,
  medecinNom,
  specialite,
  etablissementNom,
  ville,
  date,
  heure,
  tarif,
}: {
  medecinId: string;
  medecinNom: string;
  specialite: string;
  etablissementNom: string;
  ville: string;
  date: string;
  heure: string;
  tarif: number;
}) {
  const router = useRouter();
  const patient = usePatientLocal();
  const proches = useProchesLocaux();
  const [selection, setSelection] = useState<string>("moi");
  const [ajoutOuvert, setAjoutOuvert] = useState(false);
  const [nouveau, setNouveau] = useState(NOUVEAU_PROCHE_VIDE);
  const [motif, setMotif] = useState("");
  const [enCours, setEnCours] = useState(false);

  const nouveauValide =
    nouveau.nom.trim() !== "" && nouveau.prenom.trim() !== "" && nouveau.dateNaissance !== "";

  function enregistrerNouveauProche() {
    if (!nouveauValide) return;
    const proche = ajouterProcheLocal(nouveau);
    setSelection(proche.id);
    setNouveau(NOUVEAU_PROCHE_VIDE);
    setAjoutOuvert(false);
  }

  function confirmer() {
    setEnCours(true);
    const procheChoisi = proches.find((p) => p.id === selection);
    const pourQui = procheChoisi
      ? `${procheChoisi.prenom} ${procheChoisi.nom} (${procheChoisi.lien.toLowerCase()})`
      : `${patient.prenom} ${patient.nom} (moi-même)`;
    ajouterRendezVousLocal({
      id: `rdv-${Date.now()}`,
      medecinId,
      medecinNom,
      specialite,
      etablissementNom,
      ville,
      date,
      heure,
      tarif,
      motif: motif.trim(),
      pourQui,
      pourQuiId: procheChoisi ? procheChoisi.id : "moi",
      statut: "confirme",
      reservePar: "patient",
      creeLe: new Date().toISOString(),
    });
    router.push(
      `/confirmation?medecin=${medecinId}&date=${date}&heure=${encodeURIComponent(heure)}`
    );
  }

  const classeChamp =
    "w-full rounded-[11px] border border-line bg-white px-[13px] py-3 text-[13.5px] outline-none focus:border-teal";

  return (
    <>
      {/* ================= VERSION MOBILE (écran « reservation » de la maquette mobile) ================= */}
      <div className="md:hidden">
        <div className="pad" style={{ paddingBottom: 0 }}>
          <span className="labelm">Pour qui est ce rendez-vous ?</span>
          <div className="benelist">
            <button type="button" className={`bene${selection === "moi" ? " on" : ""}`} onClick={() => setSelection("moi")}>
              <span
                className="ba"
                aria-hidden
                style={{ background: "linear-gradient(135deg,#2E9CCA,#15506B)" }}
              >
                {initialesPatient(patient)}
              </span>
              <span className="bt">
                <b>Moi-même</b>
                <small>
                  {patient.prenom} {patient.nom} · {calculerAge(patient.dateNaissance)} ans
                </small>
              </span>
              <span className="rc" />
            </button>
            {proches.map((proche) => (
              <button
                key={proche.id}
                type="button"
                className={`bene${selection === proche.id ? " on" : ""}`}
                onClick={() => setSelection(proche.id)}
              >
                <span className="ba" aria-hidden style={{ background: proche.gradient }}>
                  {initialesProche(proche)}
                </span>
                <span className="bt">
                  <b>
                    {proche.prenom} {proche.nom}
                  </b>
                  <small>
                    {proche.lien} · {calculerAge(proche.dateNaissance)} an
                    {calculerAge(proche.dateNaissance) > 1 ? "s" : ""}
                  </small>
                </span>
                <span className="rc" />
              </button>
            ))}
            <button type="button" className="bene add" onClick={() => setAjoutOuvert(!ajoutOuvert)}>
              <span className="plus" aria-hidden>
                +
              </span>
              Ajouter un proche
            </button>
          </div>

          {ajoutOuvert && (
            <div className="addbene">
              <div className="abannerm">
                <span aria-hidden>ℹ️</span>
                <div>
                  Le proche <b>n&apos;a pas besoin de compte</b>. Vous gérez ses rendez-vous depuis
                  votre espace.
                </div>
              </div>
              <div className="fgrid2">
                <div>
                  <div className="flabel">Nom *</div>
                  <input
                    className="inp"
                    placeholder="Nom"
                    value={nouveau.nom}
                    onChange={(e) => setNouveau({ ...nouveau, nom: e.target.value })}
                  />
                </div>
                <div>
                  <div className="flabel">Prénom *</div>
                  <input
                    className="inp"
                    placeholder="Prénom"
                    value={nouveau.prenom}
                    onChange={(e) => setNouveau({ ...nouveau, prenom: e.target.value })}
                  />
                </div>
              </div>
              <div className="fgrid2">
                <div>
                  <div className="flabel">Lien *</div>
                  <select
                    className="selm"
                    value={nouveau.lien}
                    onChange={(e) => setNouveau({ ...nouveau, lien: e.target.value })}
                  >
                    {LIENS_PROCHE.map((lien) => (
                      <option key={lien}>{lien}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="flabel">Naissance *</div>
                  <input
                    type="date"
                    className="inp"
                    value={nouveau.dateNaissance}
                    onChange={(e) => setNouveau({ ...nouveau, dateNaissance: e.target.value })}
                  />
                </div>
              </div>
              <div className="flabel">Genre</div>
              <select
                className="selm"
                value={nouveau.genre}
                onChange={(e) =>
                  setNouveau({ ...nouveau, genre: e.target.value as ProcheLocal["genre"] })
                }
              >
                <option>Femme</option>
                <option>Homme</option>
              </select>
              <div style={{ display: "flex", gap: 9 }}>
                <button type="button" className="btnm gh" onClick={() => setAjoutOuvert(false)}>
                  Annuler
                </button>
                <button
                  type="button"
                  className="btnm"
                  style={{ flex: 1, opacity: nouveauValide ? 1 : 0.5 }}
                  disabled={!nouveauValide}
                  onClick={enregistrerNouveauProche}
                >
                  Enregistrer
                </button>
              </div>
            </div>
          )}

          <span className="labelm">Motif de la consultation</span>
          <textarea
            className="textarea"
            rows={3}
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            placeholder="Ex. Vaccination de mon enfant, fièvre depuis 2 jours…"
          />
          <div className="abannerm" style={{ background: "var(--green-soft)", marginTop: 14 }}>
            <span aria-hidden>✅</span>
            <div>
              <b>Réservation gratuite.</b> La consultation ({formatGNF(tarif)}) se règle{" "}
              <b>sur place</b>. Aucun paiement en ligne requis.
            </div>
          </div>
        </div>
        <div className="ctafoot">
          <button type="button" className="btn green" onClick={confirmer} disabled={enCours}>
            {enCours ? "Enregistrement…" : "✅ Confirmer le rendez-vous"}
          </button>
        </div>
      </div>

      {/* ================= VERSION WEB (inchangée) ================= */}
      <div className="hidden md:block">
      {/* ===== Pour qui est ce rendez-vous ? ===== */}
      <div className="mb-[18px] rounded-[18px] border border-line bg-white p-6">
        <h3 className="mb-[14px] text-base font-extrabold">Pour qui est ce rendez-vous ?</h3>
        <div className="grid gap-[10px] sm:grid-cols-2">
          {/* Moi-même */}
          <button
            type="button"
            onClick={() => setSelection("moi")}
            className={`flex items-center gap-[11px] rounded-[13px] border-[1.5px] p-3 text-left transition-colors ${
              selection === "moi" ? "border-teal bg-teal-soft" : "border-line bg-white"
            }`}
          >
            <span
              aria-hidden
              className="grid h-10 w-10 flex-none place-items-center rounded-[11px] text-[13px] font-extrabold text-white"
              style={{ background: "linear-gradient(135deg,#2E9CCA,#15506B)" }}
            >
              {initialesPatient(patient)}
            </span>
            <span className="flex-1">
              <b className="block text-[13.5px]">Moi-même</b>
              <small className="text-[11.5px] text-muted">
                {patient.prenom} {patient.nom} · {calculerAge(patient.dateNaissance)} ans
              </small>
            </span>
            <span
              className={`h-[18px] w-[18px] flex-none rounded-full border-2 ${
                selection === "moi"
                  ? "border-teal bg-teal shadow-[inset_0_0_0_3px_#fff]"
                  : "border-line"
              }`}
            />
          </button>

          {/* Proches enregistrés */}
          {proches.map((proche) => (
            <button
              key={proche.id}
              type="button"
              onClick={() => setSelection(proche.id)}
              className={`flex items-center gap-[11px] rounded-[13px] border-[1.5px] p-3 text-left transition-colors ${
                selection === proche.id ? "border-teal bg-teal-soft" : "border-line bg-white"
              }`}
            >
              <span
                aria-hidden
                className="grid h-10 w-10 flex-none place-items-center rounded-[11px] text-[13px] font-extrabold text-white"
                style={{ background: proche.gradient }}
              >
                {initialesProche(proche)}
              </span>
              <span className="flex-1">
                <b className="block text-[13.5px]">
                  {proche.prenom} {proche.nom}
                </b>
                <small className="text-[11.5px] text-muted">
                  {proche.lien} · {calculerAge(proche.dateNaissance)} an
                  {calculerAge(proche.dateNaissance) > 1 ? "s" : ""}
                </small>
              </span>
              <span
                className={`h-[18px] w-[18px] flex-none rounded-full border-2 ${
                  selection === proche.id
                    ? "border-teal bg-teal shadow-[inset_0_0_0_3px_#fff]"
                    : "border-line"
                }`}
              />
            </button>
          ))}

          {/* Ajouter un proche */}
          <button
            type="button"
            onClick={() => setAjoutOuvert(!ajoutOuvert)}
            className="flex items-center justify-center gap-1 rounded-[13px] border-[1.5px] border-dashed border-line bg-white p-3 text-[13.5px] font-bold text-teal transition-colors hover:border-teal"
          >
            <span className="mr-1.5 text-lg" aria-hidden>
              +
            </span>
            Ajouter un proche
          </button>
        </div>

        {/* Formulaire d'ajout inline (comme la maquette) */}
        {ajoutOuvert && (
          <div className="mt-[14px] border-t border-line pt-4">
            <div className="mb-3 flex items-start gap-[9px] rounded-xl border border-[#BFE0EF] bg-teal-soft px-[14px] py-3 text-[12.5px] font-semibold leading-relaxed text-blue">
              <span aria-hidden>ℹ️</span>
              <div>
                Le proche <b>n’a pas besoin de compte</b>. Vous prenez et gérez ses rendez-vous
                depuis votre espace.
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-1.5 text-[12.5px] font-bold">Nom *</div>
                <input
                  className={classeChamp}
                  placeholder="Nom"
                  value={nouveau.nom}
                  onChange={(e) => setNouveau({ ...nouveau, nom: e.target.value })}
                />
              </div>
              <div>
                <div className="mb-1.5 text-[12.5px] font-bold">Prénom *</div>
                <input
                  className={classeChamp}
                  placeholder="Prénom"
                  value={nouveau.prenom}
                  onChange={(e) => setNouveau({ ...nouveau, prenom: e.target.value })}
                />
              </div>
              <div>
                <div className="mb-1.5 text-[12.5px] font-bold">Lien avec vous *</div>
                <select
                  className={classeChamp}
                  value={nouveau.lien}
                  onChange={(e) => setNouveau({ ...nouveau, lien: e.target.value })}
                >
                  {LIENS_PROCHE.map((lien) => (
                    <option key={lien}>{lien}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="mb-1.5 text-[12.5px] font-bold">Date de naissance *</div>
                <input
                  type="date"
                  className={classeChamp}
                  value={nouveau.dateNaissance}
                  onChange={(e) => setNouveau({ ...nouveau, dateNaissance: e.target.value })}
                />
              </div>
            </div>
            <div className="mt-3">
              <div className="mb-1.5 text-[12.5px] font-bold">Genre</div>
              <select
                className={classeChamp}
                value={nouveau.genre}
                onChange={(e) =>
                  setNouveau({ ...nouveau, genre: e.target.value as ProcheLocal["genre"] })
                }
              >
                <option>Femme</option>
                <option>Homme</option>
              </select>
            </div>
            <div className="mt-3 flex gap-[10px]">
              <button
                type="button"
                onClick={() => setAjoutOuvert(false)}
                className="rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={enregistrerNouveauProche}
                disabled={!nouveauValide}
                className="flex-1 rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Enregistrer le proche
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ===== Motif ===== */}
      <div className="mb-[18px] rounded-[18px] border border-line bg-white p-6">
        <h3 className="mb-[14px] text-base font-extrabold">Motif de la consultation</h3>
        <textarea
          rows={3}
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          placeholder="Ex. Vaccination de mon enfant, fièvre depuis 2 jours…"
          className="w-full resize-none rounded-xl border border-line bg-white p-[13px] text-[13.5px] outline-none focus:border-teal"
        />
        <div className="mt-4 flex items-start gap-[9px] rounded-xl border border-[#BFE3CC] bg-green-soft px-[14px] py-3 text-[12.5px] font-semibold leading-normal text-blue">
          <span aria-hidden>✅</span>
          <div>
            <b>Réservation gratuite.</b> La consultation ({formatGNF(tarif)}) se règle{" "}
            <b>sur place, chez le médecin</b>. Aucun paiement en ligne n’est requis.
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <Link
          href={`/medecin/${medecinId}`}
          className="rounded-[11px] border-[1.5px] border-line bg-white px-[18px] py-[11px] text-[13.5px] font-bold text-blue transition-colors hover:bg-bg"
        >
          ← Retour
        </Link>
        <button
          type="button"
          onClick={confirmer}
          disabled={enCours}
          className="flex-1 rounded-[11px] bg-green px-[18px] py-[11px] text-[13.5px] font-bold text-white transition-colors hover:bg-[#196a3b] disabled:opacity-60"
        >
          {enCours ? "Enregistrement…" : "✅ Confirmer le rendez-vous"}
        </button>
      </div>
      </div>
    </>
  );
}
