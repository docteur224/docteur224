"use client";

import { useState } from "react";
import AdminShell from "@/components/admin/AdminShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import Interrupteur from "@/components/patient/Interrupteur";
import { useEffect } from "react";
import {
  ecrireReglageBool,
  lireReglagesBool,
  tracerAudit,
  useConfigAbonnements,
} from "@/lib/admin";

interface ConfigAbonnements {
  standardMensuel: string;
  standardAnnuel: string;
  premiumMensuel: string;
  premiumAnnuel: string;
  palierStructure: string;
  palierCabinet: string;
  palierClinique: string;
  palierHopital: string;
  periodeGratuite: boolean;
  essaiGratuit: boolean;
  orangeMoney: boolean;
  mtnMomo: boolean;
}

const fmt = (n: number) => n.toLocaleString("fr-FR").replace(/ | /g, " ");
const parseGNF = (t: string) => Number(t.replace(/[^0-9]/g, "")) || 0;

/** Clés des réglages booléens de l'écran, dans `parametres_plateforme`. */
const CLES_REGLAGES = ["periode_gratuite", "essai_gratuit", "orange_money", "mtn_momo"];

/*
 * Abonnements — reproduit l'écran « admin-abonnements » de la maquette web
 * (spec C.10.2) : tarifs des formules médecin, paliers établissement,
 * réglages de lancement et de paiement. « 💾 Enregistrer » persiste la
 * configuration en local et trace l'action dans le journal d'audit.
 */

/*
 * Les quatre paliers établissement, dans l'ordre de la grille.
 *
 * « Structure » est le palier d'entrée ouvert aux postes et centres de santé,
 * cabinets de soins infirmiers, kinés et opticiens : à 800 000 GNF/mois, le
 * palier cabinet mettait tout ce segment hors de portée. Et « Hôpital »
 * s'affichait « Sur devis », sans champ de saisie, alors que la base facturait
 * bien un montant — l'admin ne pouvait le corriger que par SQL.
 *
 * La colonne « Médecins » décrit la taille visée : c'est elle qui guide la
 * requalification d'une structure qui grandit. À l'inscription, le palier
 * découle du type déclaré (voir `lib/types-etablissement`), la structure
 * n'ayant encore aucun médecin rattaché.
 */
const PALIERS: { cle: keyof ConfigAbonnements; nom: string; medecins: string }[] = [
  { cle: "palierStructure", nom: "Structure de proximité", medecins: "0–3" },
  { cle: "palierCabinet", nom: "Cabinet / plateau technique", medecins: "1–3" },
  { cle: "palierClinique", nom: "Clinique / centre médical", medecins: "4–15" },
  { cle: "palierHopital", nom: "Hôpital / centre hospitalier", medecins: "16+" },
];

const LANCEMENT: { cle: keyof ConfigAbonnements; titre: string; detail?: string }[] = [
  {
    cle: "periodeGratuite",
    titre: "Période gratuite de lancement",
    detail: "Aucune facturation des professionnels pendant la phase pilote",
  },
  { cle: "essaiGratuit", titre: "Essai gratuit à l'inscription", detail: "30 jours" },
  { cle: "orangeMoney", titre: "Paiement Orange Money" },
  { cle: "mtnMomo", titre: "Paiement MTN MoMo" },
];

/*
 * La période gratuite de lancement l'emporte sur l'essai (voir l'ordre de
 * précédence de /api/inscription/finaliser). Tant qu'elle est active,
 * basculer l'essai ne change rien pour personne — l'écran le disait nulle
 * part, et on pouvait croire le réglage cassé.
 */
const NOTE_NEUTRALISE = "Sans effet tant que la période gratuite de lancement est active.";

export default function AbonnementsAdmin() {
  const { tarifs, enregistrer: enregistrerTarif } = useConfigAbonnements();
  const [reglagesExtra, setReglagesExtra] = useState<Record<string, boolean>>({});
  useEffect(() => {
    lireReglagesBool(CLES_REGLAGES).then(setReglagesExtra);
  }, []);

  const tarif = (f: string) => tarifs.find((t) => t.formule === f);
  const config: ConfigAbonnements = {
    standardMensuel: fmt(tarif("standard")?.prixMensuel ?? 0),
    standardAnnuel: fmt(tarif("standard")?.prixAnnuel ?? 0),
    premiumMensuel: fmt(tarif("premium")?.prixMensuel ?? 0),
    premiumAnnuel: fmt(tarif("premium")?.prixAnnuel ?? 0),
    palierStructure: `${fmt(tarif("structure")?.prixMensuel ?? 0)} / mois`,
    palierCabinet: `${fmt(tarif("cabinet")?.prixMensuel ?? 0)} / mois`,
    palierClinique: `${fmt(tarif("clinique")?.prixMensuel ?? 0)} / mois`,
    palierHopital: `${fmt(tarif("hopital")?.prixMensuel ?? 0)} / mois`,
    periodeGratuite: reglagesExtra["periode_gratuite"] ?? true,
    essaiGratuit: reglagesExtra["essai_gratuit"] ?? true,
    orangeMoney: reglagesExtra["orange_money"] ?? true,
    mtnMomo: reglagesExtra["mtn_momo"] ?? true,
  };
  const [brouillon, setBrouillon] = useState<ConfigAbonnements | null>(null);
  const [enregistre, setEnregistre] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const valeurs = brouillon ?? config;

  function modifier(cle: keyof ConfigAbonnements, valeur: string | boolean) {
    setEnregistre(false);
    setErreur(null);
    setBrouillon({ ...valeurs, [cle]: valeur });
  }

  async function enregistrer() {
    setEnvoi(true);
    setErreur(null);
    const resultats = await Promise.all([
      enregistrerTarif("standard", { prixMensuel: parseGNF(valeurs.standardMensuel), prixAnnuel: parseGNF(valeurs.standardAnnuel) }),
      enregistrerTarif("premium", { prixMensuel: parseGNF(valeurs.premiumMensuel), prixAnnuel: parseGNF(valeurs.premiumAnnuel) }),
      enregistrerTarif("structure", { prixMensuel: parseGNF(valeurs.palierStructure) }),
      enregistrerTarif("cabinet", { prixMensuel: parseGNF(valeurs.palierCabinet) }),
      enregistrerTarif("clinique", { prixMensuel: parseGNF(valeurs.palierClinique) }),
      enregistrerTarif("hopital", { prixMensuel: parseGNF(valeurs.palierHopital) }),
      ecrireReglageBool("periode_gratuite", valeurs.periodeGratuite),
      ecrireReglageBool("essai_gratuit", valeurs.essaiGratuit),
      ecrireReglageBool("orange_money", valeurs.orangeMoney),
      ecrireReglageBool("mtn_momo", valeurs.mtnMomo),
    ]);
    const messages = [...new Set(resultats.map((r) => r.erreur).filter(Boolean))] as string[];
    if (!messages.length) {
      await tracerAudit(
        "A modifié la configuration des abonnements",
        `Standard ${valeurs.standardMensuel} · Premium ${valeurs.premiumMensuel} · Structure ${valeurs.palierStructure} · Cabinet ${valeurs.palierCabinet} · Clinique ${valeurs.palierClinique} · Hôpital ${valeurs.palierHopital}`
      );
    }
    // Les interrupteurs sont dérivés de `reglagesExtra`, lu une seule fois au
    // montage : sans cette relecture, abandonner le brouillon les ramenait à
    // leur ancienne valeur alors que la base avait bien été mise à jour.
    const reglagesFrais = await lireReglagesBool(CLES_REGLAGES);
    setReglagesExtra(reglagesFrais);
    setEnvoi(false);
    if (messages.length) {
      // Le brouillon est conservé : la saisie de l'admin ne doit pas être
      // perdue quand une partie seulement de l'enregistrement a échoué.
      setErreur(messages.join(" "));
      setEnregistre(false);
      return;
    }
    setBrouillon(null);
    setEnregistre(true);
  }

  const cellule =
    "w-full min-w-[110px] rounded-[9px] border border-line bg-white px-2 py-1.5 text-[13px] outline-none focus:border-teal";
  const enTete =
    "border-b border-line px-[10px] py-[9px] text-left text-[11px] font-extrabold uppercase tracking-[0.04em] text-muted";
  const caseTab = "border-b border-line px-[10px] py-[9px]";

  return (
    <AdminShell>
      {/* ===== Version mobile (écran « m-admin-abonnements » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <EnTeteMobile retour="/espace-admin/plus" titre="Abonnements" />
        <div className="pad">
          <div className="card2">
            <h4>Formules médecin</h4>
            <table className="atab">
              <thead>
                <tr>
                  <th>Formule</th>
                  <th>Mensuel</th>
                  <th>Annuel</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Standard</td>
                  <td>
                    <input
                      className="inp"
                      style={{ marginBottom: 0, padding: "6px 8px", fontSize: 12 }}
                      value={valeurs.standardMensuel}
                      onChange={(e) => modifier("standardMensuel", e.target.value)}
                      aria-label="Standard mensuel"
                    />
                  </td>
                  <td>
                    <input
                      className="inp"
                      style={{ marginBottom: 0, padding: "6px 8px", fontSize: 12 }}
                      value={valeurs.standardAnnuel}
                      onChange={(e) => modifier("standardAnnuel", e.target.value)}
                      aria-label="Standard annuel"
                    />
                  </td>
                </tr>
                <tr>
                  <td>Premium</td>
                  <td>
                    <input
                      className="inp"
                      style={{ marginBottom: 0, padding: "6px 8px", fontSize: 12 }}
                      value={valeurs.premiumMensuel}
                      onChange={(e) => modifier("premiumMensuel", e.target.value)}
                      aria-label="Premium mensuel"
                    />
                  </td>
                  <td>
                    <input
                      className="inp"
                      style={{ marginBottom: 0, padding: "6px 8px", fontSize: 12 }}
                      value={valeurs.premiumAnnuel}
                      onChange={(e) => modifier("premiumAnnuel", e.target.value)}
                      aria-label="Premium annuel"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="setrow">
              <div>
                <b>Mise en avant incluse en Premium</b>
              </div>
              <span className="pill ok">Oui</span>
            </div>
          </div>
          <div className="card2">
            <h4>Paliers établissement</h4>
            <table className="atab">
              <thead>
                <tr>
                  <th>Palier</th>
                  <th>Médecins</th>
                  <th>Tarif/mois</th>
                </tr>
              </thead>
              <tbody>
                {PALIERS.map((palier) => (
                  <tr key={palier.cle}>
                    <td>{palier.nom}</td>
                    <td>{palier.medecins}</td>
                    <td>
                      <input
                        className="inp"
                        style={{ marginBottom: 0, padding: "6px 8px", fontSize: 12 }}
                        value={valeurs[palier.cle] as string}
                        onChange={(e) => modifier(palier.cle, e.target.value)}
                        aria-label={`Tarif palier ${palier.nom}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="privnote info">
              <span aria-hidden>ℹ️</span>
              <div>Un médecin couvert par son établissement ne paie pas en plus.</div>
            </div>
          </div>
          <div className="card2">
            <h4>Lancement &amp; paiement</h4>
            {LANCEMENT.map((ligne) => (
              <div key={ligne.cle} className="setrow">
                <div>
                  <b>{ligne.titre}</b>
                  {ligne.detail && <small>{ligne.detail}</small>}
                  {ligne.cle === "essaiGratuit" && valeurs.periodeGratuite && (
                    <small style={{ color: "var(--red)" }}>{NOTE_NEUTRALISE}</small>
                  )}
                </div>
                <Interrupteur
                  actif={valeurs[ligne.cle] as boolean}
                  onChange={(v) => modifier(ligne.cle, v)}
                  label={ligne.titre}
                />
              </div>
            ))}
            {enregistre && (
              <div style={{ color: "var(--green)", fontSize: 12.5, fontWeight: 700, marginTop: 8 }}>
                ✓ Enregistré
              </div>
            )}
            {erreur && (
              <div role="alert" style={{ color: "var(--red)", fontSize: 12.5, fontWeight: 700, marginTop: 8 }}>
                {erreur}
              </div>
            )}
            <button
              type="button"
              className="btn block"
              style={{ marginTop: 10, opacity: brouillon && !envoi ? 1 : 0.5 }}
              disabled={!brouillon || envoi}
              onClick={enregistrer}
            >
              {envoi ? "Enregistrement…" : "💾 Enregistrer"}
            </button>
          </div>
        </div>
      </div>

      {/* ===== Version web (inchangée) ===== */}
      <div className="hidden md:block">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Abonnements</h2>
          <small className="text-[13px] text-muted">Configurer les offres de la plateforme</small>
        </div>
        <span className="flex items-center gap-3">
          {enregistre && (
            <small className="text-[12.5px] font-bold text-green">✓ Enregistré</small>
          )}
          <button
            type="button"
            onClick={enregistrer}
            disabled={!brouillon || envoi}
            className="rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {envoi ? "Enregistrement…" : "💾 Enregistrer"}
          </button>
        </span>
      </div>

      {erreur && (
        <div
          role="alert"
          className="mb-4 rounded-[11px] bg-red-soft px-[13px] py-[11px] text-[12.5px] font-semibold leading-relaxed text-red"
        >
          {erreur}
        </div>
      )}

      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-[14px] text-[15px] font-extrabold">Formules médecin</h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {["Formule", "Mensuel (GNF)", "Annuel (GNF)", "Mise en avant"].map((th) => (
                  <th key={th} className={enTete}>
                    {th}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={caseTab}>
                  <b>Standard</b>
                </td>
                <td className={caseTab}>
                  <input
                    value={valeurs.standardMensuel}
                    onChange={(e) => modifier("standardMensuel", e.target.value)}
                    aria-label="Standard mensuel"
                    className={cellule}
                  />
                </td>
                <td className={caseTab}>
                  <input
                    value={valeurs.standardAnnuel}
                    onChange={(e) => modifier("standardAnnuel", e.target.value)}
                    aria-label="Standard annuel"
                    className={cellule}
                  />
                </td>
                <td className={caseTab}>
                  <span className="rounded-lg bg-red-soft px-[9px] py-1 text-[11px] font-bold text-red">
                    Non
                  </span>
                </td>
              </tr>
              <tr>
                <td className={caseTab}>
                  <b>Premium</b>
                </td>
                <td className={caseTab}>
                  <input
                    value={valeurs.premiumMensuel}
                    onChange={(e) => modifier("premiumMensuel", e.target.value)}
                    aria-label="Premium mensuel"
                    className={cellule}
                  />
                </td>
                <td className={caseTab}>
                  <input
                    value={valeurs.premiumAnnuel}
                    onChange={(e) => modifier("premiumAnnuel", e.target.value)}
                    aria-label="Premium annuel"
                    className={cellule}
                  />
                </td>
                <td className={caseTab}>
                  <span className="rounded-lg bg-green-soft px-[9px] py-1 text-[11px] font-bold text-green">
                    Incluse
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-[14px] text-[15px] font-extrabold">Paliers établissement</h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {["Palier", "Médecins", "Tarif (GNF)"].map((th) => (
                  <th key={th} className={enTete}>
                    {th}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PALIERS.map((palier) => (
                <tr key={palier.cle}>
                  <td className={caseTab}>{palier.nom}</td>
                  <td className={caseTab}>{palier.medecins}</td>
                  <td className={caseTab}>
                    <input
                      value={valeurs[palier.cle] as string}
                      onChange={(e) => modifier(palier.cle, e.target.value)}
                      aria-label={`Tarif palier ${palier.nom}`}
                      className={cellule}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-[14px] flex items-start gap-[9px] rounded-[11px] bg-teal-soft px-[13px] py-[11px] text-[12.5px] font-semibold leading-relaxed text-blue">
          <span aria-hidden>ℹ️</span>
          <div>
            Le palier de départ découle du type déclaré à l’inscription ; requalifiez une structure
            qui grandit. Un médecin couvert par le plan de son établissement ne paie pas en plus
            (pas de double facturation).
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">Lancement & paiement</h3>
        {LANCEMENT.map((ligne) => (
          <div
            key={ligne.cle}
            className="flex items-center justify-between gap-[14px] border-b border-line py-[15px] last:border-b-0"
          >
            <div>
              <b className="block text-[13.5px] font-bold">{ligne.titre}</b>
              {ligne.detail && <small className="text-xs text-muted">{ligne.detail}</small>}
              {ligne.cle === "essaiGratuit" && valeurs.periodeGratuite && (
                <small className="block text-xs font-semibold text-red">{NOTE_NEUTRALISE}</small>
              )}
            </div>
            <Interrupteur
              actif={valeurs[ligne.cle] as boolean}
              onChange={(v) => modifier(ligne.cle, v)}
              label={ligne.titre}
            />
          </div>
        ))}
      </div>
      </div>
    </AdminShell>
  );
}
