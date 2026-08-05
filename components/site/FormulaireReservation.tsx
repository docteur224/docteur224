"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { calculerAge } from "@/lib/dates";
import { formatGNF } from "@/lib/format";
import type { LieuConsultation } from "@/types";
import {
  ajouterProche,
  LIENS_PROCHE,
  reserverRendezVous,
  useProches,
  useProfilConnecte,
} from "@/lib/patient";

/**
 * Partie interactive de l'écran de réservation :
 * - « Pour qui est ce rendez-vous ? » : moi-même ou un proche enregistré,
 *   avec ajout d'un proche sans quitter l'écran (spec C.2.1 / C.3) ;
 * - motif de consultation et bandeau « réservation gratuite » ;
 * - à la confirmation, écriture réelle dans la table `rendez_vous`.
 */

const NOUVEAU_PROCHE_VIDE = {
  nom: "",
  prenom: "",
  lien: LIENS_PROCHE[0],
  dateNaissance: "",
  genre: "Femme",
};

const initiales = (prenom: string, nom: string) =>
  `${prenom.charAt(0)}${nom.charAt(0)}`.toUpperCase() || "?";

export default function FormulaireReservation({
  medecinId,
  date,
  heure,
  tarif,
  adresseCabinet,
  visiteDomicile = false,
  zoneDomicile = "",
  tarifs = [],
}: {
  medecinId: string;
  date: string;
  heure: string;
  tarif: number;
  /** Adresse affichée pour l'option « Au cabinet ». */
  adresseCabinet: string;
  /** Le praticien se déplace-t-il ? Sans cela, aucun choix n'est proposé. */
  visiteDomicile?: boolean;
  zoneDomicile?: string;
  /** Grille tarifaire, pour n'afficher que les prix du lieu retenu. */
  tarifs?: { libelle: string; montant: number; lieu: LieuConsultation | "tous" }[];
}) {
  const router = useRouter();
  const { profil, chargement } = useProfilConnecte();
  const { proches, recharger } = useProches();
  const [selection, setSelection] = useState<string>("moi");
  const [ajoutOuvert, setAjoutOuvert] = useState(false);
  const [nouveau, setNouveau] = useState(NOUVEAU_PROCHE_VIDE);
  const [motif, setMotif] = useState("");
  const [lieu, setLieu] = useState<LieuConsultation>("cabinet");
  const [adresse, setAdresse] = useState<{ saisie: string; depuis: string } | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  /*
   * L'adresse de visite est pré-remplie avec le quartier du patient, mais
   * reste modifiable : la visite peut avoir lieu ailleurs (travail, chez un
   * parent). Le pré-remplissage est dérivé au rendu et non posé par un
   * effet — le linter interdit setState dans un effet, et le profil
   * arrive de façon asynchrone.
   */
  const suggestion = profil?.quartier ? `${profil.quartier}, ` : "";
  const adresseVisite = adresse?.depuis === suggestion ? adresse.saisie : suggestion;

  // Tarifs applicables au lieu choisi ; « tous » vaut pour les deux.
  const tarifsDuLieu = tarifs.filter((t) => t.lieu === lieu || t.lieu === "tous");
  const tarifAffiche = tarifsDuLieu[0]?.montant ?? tarif;

  const nouveauValide =
    nouveau.nom.trim() !== "" && nouveau.prenom.trim() !== "" && nouveau.dateNaissance !== "";

  async function enregistrerNouveauProche() {
    if (!nouveauValide) return;
    const res = await ajouterProche(nouveau);
    if (res.erreur) {
      setErreur(res.erreur);
      return;
    }
    recharger();
    setSelection(res.proche!.id);
    setNouveau(NOUVEAU_PROCHE_VIDE);
    setAjoutOuvert(false);
  }

  async function confirmer() {
    if (enCours) return;
    setErreur(null);
    if (lieu === "domicile" && !adresseVisite.trim()) {
      return setErreur("Indiquez l’adresse où le médecin doit se rendre.");
    }
    setEnCours(true);
    const res = await reserverRendezVous({
      medecinId,
      date,
      heure,
      motif: motif.trim(),
      procheId: selection === "moi" ? undefined : selection,
      lieu,
      adresseDomicile: adresseVisite.trim(),
    });
    setEnCours(false);
    if (res.erreur === "non_connecte") {
      router.push(`/connexion`);
      return;
    }
    if (res.erreur) {
      setErreur(res.erreur);
      return;
    }
    router.push(
      `/confirmation?medecin=${medecinId}&date=${date}&heure=${encodeURIComponent(heure)}`
    );
  }

  // Identité affichée sur la carte « Moi-même »
  const patient = {
    prenom: profil?.prenom ?? "",
    nom: profil?.nom ?? "",
    dateNaissance: profil?.dateNaissance ?? "",
  };

  if (!chargement && !profil) {
    return (
      <div className="mx-4 my-6 rounded-2xl border border-line bg-white p-6 text-center md:mx-0">
        <div className="text-3xl" aria-hidden>🔒</div>
        <b className="mt-3 block text-base font-extrabold">Connectez-vous pour réserver</b>
        <p className="mt-2 text-[13px] text-muted">
          La réservation nécessite un compte patient (gratuit).
        </p>
        <div className="mt-4 flex justify-center gap-3">
          <Link href="/connexion" className="rounded-[11px] bg-teal px-[18px] py-[11px] text-[13.5px] font-bold text-white">
            Se connecter
          </Link>
          <Link href="/inscription/patient" className="rounded-[11px] border-[1.5px] border-line bg-white px-[18px] py-[11px] text-[13.5px] font-bold text-blue">
            Créer un compte
          </Link>
        </div>
      </div>
    );
  }

  const classeChamp =
    "w-full rounded-[11px] border border-line bg-white px-[13px] py-3 text-[13.5px] outline-none focus:border-teal";

  /*
   * Choix du lieu — rendu une seule fois et posé dans les deux mises en
   * page. Il n'apparaît que si le praticien se déplace : proposer un choix
   * qui n'en est pas un ajouterait une étape à tout le monde pour rien.
   */
  const blocLieu = visiteDomicile && (
    <div className="rounded-[18px] border border-line bg-white p-5 md:mb-[18px] md:p-6">
      <h3 className="mb-1 text-base font-extrabold">Où souhaitez-vous consulter ?</h3>
      <p className="mb-[14px] text-[12.5px] text-muted">
        Ce praticien reçoit au cabinet et se déplace à domicile.
      </p>
      <div className="grid gap-[10px] sm:grid-cols-2">
        {(
          [
            { valeur: "cabinet" as const, icone: "🏥", titre: "Au cabinet", detail: adresseCabinet },
            {
              valeur: "domicile" as const,
              icone: "🏠",
              titre: "À domicile",
              detail: zoneDomicile ? `Zones desservies : ${zoneDomicile}` : "Le médecin se déplace chez vous",
            },
          ]
        ).map((option) => (
          <button
            key={option.valeur}
            type="button"
            aria-pressed={lieu === option.valeur}
            onClick={() => setLieu(option.valeur)}
            className={`flex items-center gap-[11px] rounded-[13px] border-[1.5px] p-3 text-left transition-colors ${
              lieu === option.valeur ? "border-teal bg-teal-soft" : "border-line bg-white"
            }`}
          >
            <span aria-hidden className="text-xl">
              {option.icone}
            </span>
            <span className="min-w-0 flex-1">
              <b className="block text-[13.5px]">{option.titre}</b>
              <small className="block truncate text-[11.5px] text-muted">{option.detail}</small>
            </span>
            <span
              className={`h-[18px] w-[18px] flex-none rounded-full border-2 ${
                lieu === option.valeur
                  ? "border-teal bg-teal shadow-[inset_0_0_0_3px_#fff]"
                  : "border-line"
              }`}
            />
          </button>
        ))}
      </div>

      {lieu === "domicile" && (
        <div className="mt-[14px]">
          <label className="mb-1.5 block text-[12.5px] font-bold" htmlFor="adresse-visite">
            Adresse de la visite *
          </label>
          <input
            id="adresse-visite"
            className={classeChamp}
            placeholder="Ex. Ratoma, Kipé, immeuble Diallo, 2e étage"
            value={adresseVisite}
            onChange={(e) => setAdresse({ saisie: e.target.value, depuis: suggestion })}
          />
          <p className="mt-1.5 text-[11.5px] text-muted">
            Ajoutez un repère (école, mosquée, boutique) : le médecin doit pouvoir vous trouver.
          </p>
        </div>
      )}

      {tarifsDuLieu.length > 0 && (
        <div className="mt-[14px] overflow-hidden rounded-xl border border-line">
          {tarifsDuLieu.map((t, i) => (
            <div
              key={`${t.libelle}-${i}`}
              className={`flex items-center justify-between gap-3 px-[13px] py-2 text-[12.5px] ${
                i > 0 ? "border-t border-line" : ""
              }`}
            >
              <b className="min-w-0 font-bold">{t.libelle}</b>
              <span className="flex-none font-extrabold text-blue">{formatGNF(t.montant)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* ================= VERSION MOBILE (écran « reservation » de la maquette mobile) ================= */}
      <div className="md:hidden">
        <div className="pad" style={{ paddingBottom: 0 }}>
          {erreur && (
            <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-600">
              {erreur}
            </p>
          )}
          {blocLieu && <div style={{ marginBottom: 14 }}>{blocLieu}</div>}
          <span className="labelm">Pour qui est ce rendez-vous ?</span>
          <div className="benelist">
            <button type="button" className={`bene${selection === "moi" ? " on" : ""}`} onClick={() => setSelection("moi")}>
              <span
                className="ba"
                aria-hidden
                style={{ background: "linear-gradient(135deg,#2E9CCA,#15506B)" }}
              >
                {initiales(patient.prenom, patient.nom)}
              </span>
              <span className="bt">
                <b>Moi-même</b>
                <small>
                  {patient.prenom} {patient.nom} · {patient.dateNaissance ? `${calculerAge(patient.dateNaissance)} ans` : "titulaire du compte"}
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
                  {initiales(proche.prenom, proche.nom)}
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
                  setNouveau({ ...nouveau, genre: e.target.value })
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
              <b>Réservation gratuite.</b> La consultation ({formatGNF(tarifAffiche)}) se règle{" "}
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
      {erreur && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-600">
          {erreur}
        </p>
      )}
      {blocLieu}
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
              {initiales(patient.prenom, patient.nom)}
            </span>
            <span className="flex-1">
              <b className="block text-[13.5px]">Moi-même</b>
              <small className="text-[11.5px] text-muted">
                {patient.prenom} {patient.nom} · {patient.dateNaissance ? `${calculerAge(patient.dateNaissance)} ans` : "titulaire du compte"}
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
                {initiales(proche.prenom, proche.nom)}
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
                  setNouveau({ ...nouveau, genre: e.target.value })
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
            <b>Réservation gratuite.</b> La consultation ({formatGNF(tarifAffiche)}) se règle{" "}
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
