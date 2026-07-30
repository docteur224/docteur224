"use client";

import { useState } from "react";
import PatientShell from "@/components/patient/PatientShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import { calculerAge, formatDateCourte } from "@/lib/dates";
import {
  ajouterProche,
  LIENS_PROCHE,
  modifierProche,
  useProches,
  type Proche,
} from "@/lib/patient";

/*
 * Mes proches — reproduit l'écran « pat-proches » de la maquette web :
 * bandeau d'information, liste des proches enregistrés (Modifier) et
 * formulaire d'ajout. Un proche n'a pas besoin de compte (spec C.3).
 * Lecture/écriture réelles dans la table `proches` (RLS : titulaire seul).
 */

const FORMULAIRE_VIDE = {
  nom: "",
  prenom: "",
  lien: LIENS_PROCHE[0],
  dateNaissance: "",
  genre: "Femme",
};

const initialesProche = (p: { prenom: string; nom: string }) =>
  `${p.prenom.charAt(0)}${p.nom.charAt(0)}`.toUpperCase();

export default function MesProches() {
  const { proches, recharger } = useProches();
  const [formulaire, setFormulaire] = useState(FORMULAIRE_VIDE);
  const [enEdition, setEnEdition] = useState<Proche | null>(null);
  const [message, setMessage] = useState("");

  const valide =
    formulaire.nom.trim() !== "" &&
    formulaire.prenom.trim() !== "" &&
    formulaire.dateNaissance !== "";

  function commencerEdition(proche: Proche) {
    setEnEdition(proche);
    setFormulaire({
      nom: proche.nom,
      prenom: proche.prenom,
      lien: proche.lien,
      dateNaissance: proche.dateNaissance,
      genre: proche.genre,
    });
    setMessage("");
  }

  async function enregistrer() {
    if (!valide) return;
    if (enEdition) {
      const res = await modifierProche(enEdition.id, formulaire);
      setMessage(res.erreur ? `⚠️ ${res.erreur}` : `✓ ${formulaire.prenom} ${formulaire.nom} a été mis à jour.`);
    } else {
      const res = await ajouterProche(formulaire);
      setMessage(res.erreur ? `⚠️ ${res.erreur}` : `✓ ${formulaire.prenom} ${formulaire.nom} a été ajouté à vos proches.`);
    }
    recharger();
    setFormulaire(FORMULAIRE_VIDE);
    setEnEdition(null);
  }

  const classeChamp =
    "w-full rounded-[11px] border border-line bg-white px-[13px] py-3 text-[13.5px] outline-none focus:border-teal";

  return (
    <PatientShell>
      {/* ===== Version mobile (écran « m-pat-proches » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <EnTeteMobile retour="/patient/compte" titre="Mes proches" recherche />
        <div className="pad">
          <div className="abannerm">
            <span aria-hidden>ℹ️</span>
            <div>
              Un proche <b>n&apos;a pas besoin de compte</b>. Vous prenez et gérez ses rendez-vous.
              Lors d&apos;une réservation, choisissez « Pour qui ».
            </div>
          </div>
          <div className="card2">
            <h4>Proches enregistrés</h4>
            {proches.map((proche) => (
              <div key={proche.id} className="asstrowm">
                <span className="av" aria-hidden style={{ background: proche.gradient }}>
                  {initialesProche(proche)}
                </span>
                <span className="meta">
                  <b>
                    {proche.prenom} {proche.nom}
                  </b>
                  <small>
                    {proche.lien} · {calculerAge(proche.dateNaissance)} an
                    {calculerAge(proche.dateNaissance) > 1 ? "s" : ""} ·{" "}
                    {proche.genre === "Femme" ? "née" : "né"} le{" "}
                    {formatDateCourte(proche.dateNaissance)}
                  </small>
                </span>
                <button type="button" className="btnm gh" onClick={() => commencerEdition(proche)}>
                  Modifier
                </button>
              </div>
            ))}
            {proches.length === 0 && (
              <p className="muted" style={{ fontSize: 13 }}>
                Aucun proche enregistré pour le moment.
              </p>
            )}
          </div>
          <div className="card2">
            <h4>{enEdition ? `Modifier ${enEdition.prenom} ${enEdition.nom}` : "Ajouter un proche"}</h4>
            <div className="fgrid2">
              <div>
                <div className="flabel">Nom *</div>
                <input
                  className="inp"
                  placeholder="Nom"
                  value={formulaire.nom}
                  onChange={(e) => setFormulaire({ ...formulaire, nom: e.target.value })}
                />
              </div>
              <div>
                <div className="flabel">Prénom *</div>
                <input
                  className="inp"
                  placeholder="Prénom"
                  value={formulaire.prenom}
                  onChange={(e) => setFormulaire({ ...formulaire, prenom: e.target.value })}
                />
              </div>
            </div>
            <div className="fgrid2">
              <div>
                <div className="flabel">Lien *</div>
                <select
                  className="selm"
                  value={formulaire.lien}
                  onChange={(e) => setFormulaire({ ...formulaire, lien: e.target.value })}
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
                  value={formulaire.dateNaissance}
                  onChange={(e) => setFormulaire({ ...formulaire, dateNaissance: e.target.value })}
                />
              </div>
            </div>
            <div className="flabel">Genre</div>
            <select
              className="selm"
              value={formulaire.genre}
              onChange={(e) =>
                setFormulaire({ ...formulaire, genre: e.target.value })
              }
            >
              <option>Femme</option>
              <option>Homme</option>
            </select>
            {message && (
              <div style={{ color: "var(--green)", fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>
                {message}
              </div>
            )}
            <button
              type="button"
              className="btn block"
              style={{ opacity: valide ? 1 : 0.5 }}
              disabled={!valide}
              onClick={enregistrer}
            >
              {enEdition ? "Enregistrer les modifications" : "Enregistrer le proche"}
            </button>
            {enEdition && (
              <button
                type="button"
                className="btn ghost block"
                onClick={() => {
                  setEnEdition(null);
                  setFormulaire(FORMULAIRE_VIDE);
                }}
              >
                Annuler la modification
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ===== Version web (inchangée) ===== */}
      <div className="hidden md:block">
      <div className="mb-5">
        <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Mes proches</h2>
        <small className="text-[13px] text-muted">
          Réservez pour vos enfants ou vos proches, sans compte séparé
        </small>
      </div>

      <div className="mb-[18px] flex items-start gap-[9px] rounded-xl border border-[#BFE0EF] bg-teal-soft px-[14px] py-3 text-[12.5px] font-semibold leading-relaxed text-blue">
        <span aria-hidden>ℹ️</span>
        <div>
          Un proche <b>n’a pas besoin de son propre compte</b>. Vous prenez et gérez ses
          rendez-vous depuis votre espace. Lors d’une réservation, vous choisissez simplement
          « Pour qui ».
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-[14px] text-[15px] font-extrabold">Proches enregistrés</h3>
        {proches.map((proche) => (
          <div
            key={proche.id}
            className="flex items-center gap-[13px] border-b border-line py-[14px] last:border-b-0 last:pb-0"
          >
            <span
              aria-hidden
              className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl text-sm font-extrabold text-white"
              style={{ background: proche.gradient }}
            >
              {initialesProche(proche)}
            </span>
            <div className="flex-1">
              <b className="block text-sm font-extrabold">
                {proche.prenom} {proche.nom}
              </b>
              <small className="text-xs text-muted">
                {proche.lien} · {calculerAge(proche.dateNaissance)} an
                {calculerAge(proche.dateNaissance) > 1 ? "s" : ""} ·{" "}
                {proche.genre === "Femme" ? "née" : "né"} le{" "}
                {formatDateCourte(proche.dateNaissance)}
              </small>
            </div>
            <button
              type="button"
              onClick={() => commencerEdition(proche)}
              className="rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue transition-colors hover:bg-bg"
            >
              Modifier
            </button>
          </div>
        ))}
        {proches.length === 0 && (
          <p className="text-[13px] text-muted">Aucun proche enregistré pour le moment.</p>
        )}
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-[14px] text-[15px] font-extrabold">
          {enEdition ? `Modifier ${enEdition.prenom} ${enEdition.nom}` : "Ajouter un proche"}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 text-[12.5px] font-bold">Nom *</div>
            <input
              className={classeChamp}
              placeholder="Nom"
              value={formulaire.nom}
              onChange={(e) => setFormulaire({ ...formulaire, nom: e.target.value })}
            />
          </div>
          <div>
            <div className="mb-1.5 text-[12.5px] font-bold">Prénom *</div>
            <input
              className={classeChamp}
              placeholder="Prénom"
              value={formulaire.prenom}
              onChange={(e) => setFormulaire({ ...formulaire, prenom: e.target.value })}
            />
          </div>
          <div>
            <div className="mb-1.5 text-[12.5px] font-bold">Lien avec vous *</div>
            <select
              className={classeChamp}
              value={formulaire.lien}
              onChange={(e) => setFormulaire({ ...formulaire, lien: e.target.value })}
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
              value={formulaire.dateNaissance}
              onChange={(e) => setFormulaire({ ...formulaire, dateNaissance: e.target.value })}
            />
          </div>
        </div>
        <div className="mt-3">
          <div className="mb-1.5 text-[12.5px] font-bold">Genre</div>
          <select
            className={classeChamp}
            value={formulaire.genre}
            onChange={(e) =>
              setFormulaire({ ...formulaire, genre: e.target.value })
            }
          >
            <option>Femme</option>
            <option>Homme</option>
          </select>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={enregistrer}
            disabled={!valide}
            className="rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {enEdition ? "Enregistrer les modifications" : "Enregistrer le proche"}
          </button>
          {enEdition && (
            <button
              type="button"
              onClick={() => {
                setEnEdition(null);
                setFormulaire(FORMULAIRE_VIDE);
              }}
              className="rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
            >
              Annuler la modification
            </button>
          )}
          {message && <span className="text-[12.5px] font-bold text-green">{message}</span>}
        </div>
      </div>
      </div>
    </PatientShell>
  );
}
