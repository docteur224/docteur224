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
  useConsommationSms,
} from "@/lib/admin";
import { COUT_SEGMENT_GNF } from "@/lib/messagerie/cout";

interface ConfigAbonnements {
  standardMensuel: string;
  standardAnnuel: string;
  standardSms: string;
  premiumMensuel: string;
  premiumAnnuel: string;
  premiumSms: string;
  structureMensuel: string;
  structureAnnuel: string;
  structureSms: string;
  structureMin: string;
  structureMax: string;
  cabinetMensuel: string;
  cabinetAnnuel: string;
  cabinetSms: string;
  cabinetMin: string;
  cabinetMax: string;
  cliniqueMensuel: string;
  cliniqueAnnuel: string;
  cliniqueSms: string;
  cliniqueMin: string;
  cliniqueMax: string;
  hopitalMensuel: string;
  hopitalAnnuel: string;
  hopitalSms: string;
  hopitalMin: string;
  hopitalMax: string;
  periodeGratuite: boolean;
  essaiGratuit: boolean;
  orangeMoney: boolean;
  mtnMomo: boolean;
  carteBancaire: boolean;
}

const fmt = (n: number) => n.toLocaleString("fr-FR").replace(/ | /g, " ");
const parseGNF = (t: string) => Number(t.replace(/[^0-9]/g, "")) || 0;

/*
 * Bornes de taille d'un palier. Un champ vide n'est pas zéro : sur le maximum
 * il vaut « pas de plafond » (le « + » de « 16+ »), et la colonne accepte NULL
 * pour ça. `parseGNF` renverrait 0, donc un palier « 16–0 » que la contrainte
 * de la 0032 refuse.
 */
const parseBorne = (t: string): number | null => {
  const chiffres = t.replace(/[^0-9]/g, "");
  return chiffres === "" ? null : Number(chiffres);
};
const fmtBorne = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

/** Clés des réglages booléens de l'écran, dans `parametres_plateforme`. */
const CLES_REGLAGES = [
  "periode_gratuite",
  "essai_gratuit",
  "orange_money",
  "mtn_momo",
  "carte_bancaire",
];

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
 *
 * Le tarif annuel est saisissable au même titre que le mensuel. L'écran ne
 * proposait que le mensuel alors que « annuel » est une période valide pour un
 * établissement : les prix annuels des paliers sont restés à leur valeur
 * d'amorçage pendant que les mensuels changeaient, et une structure qui
 * choisissait l'année se voyait facturer un montant sans rapport avec le sien.
 *
 * Le quota SMS fait partie du plan tarifaire : il porte le coût variable de
 * l'offre. Il était figé à l'amorçage alors que les prix bougeaient, ce qui
 * pouvait mettre un palier à perte — un quota de 15 000 SMS dépasse le prix de
 * l'abonnement dès que le SMS coûte plus de 33 GNF.
 */
const PALIERS = [
  { formule: "structure", nom: "Structure de proximité", mensuel: "structureMensuel", annuel: "structureAnnuel", sms: "structureSms", min: "structureMin", max: "structureMax" },
  { formule: "cabinet", nom: "Cabinet / plateau technique", mensuel: "cabinetMensuel", annuel: "cabinetAnnuel", sms: "cabinetSms", min: "cabinetMin", max: "cabinetMax" },
  { formule: "clinique", nom: "Clinique / centre médical", mensuel: "cliniqueMensuel", annuel: "cliniqueAnnuel", sms: "cliniqueSms", min: "cliniqueMin", max: "cliniqueMax" },
  { formule: "hopital", nom: "Hôpital / centre hospitalier", mensuel: "hopitalMensuel", annuel: "hopitalAnnuel", sms: "hopitalSms", min: "hopitalMin", max: "hopitalMax" },
] as const satisfies readonly {
  formule: string;
  nom: string;
  mensuel: keyof ConfigAbonnements;
  annuel: keyof ConfigAbonnements;
  sms: keyof ConfigAbonnements;
  min: keyof ConfigAbonnements;
  max: keyof ConfigAbonnements;
}[];

/** Les deux formules médecin, décrites comme les paliers pour que les deux
 *  tables se génèrent au lieu d'être écrites ligne à ligne. */
const FORMULES_MEDECIN = [
  { formule: "standard", nom: "Standard", miseEnAvant: false, mensuel: "standardMensuel", annuel: "standardAnnuel", sms: "standardSms" },
  { formule: "premium", nom: "Premium", miseEnAvant: true, mensuel: "premiumMensuel", annuel: "premiumAnnuel", sms: "premiumSms" },
] as const satisfies readonly {
  formule: string;
  nom: string;
  miseEnAvant: boolean;
  mensuel: keyof ConfigAbonnements;
  annuel: keyof ConfigAbonnements;
  sms: keyof ConfigAbonnements;
}[];

/** Uniquement les clés de tarif : le spread de `config` ne doit pas prétendre
 *  porter les booléens de réglage, qu'il écraserait. */
type CleTarif =
  | (typeof PALIERS)[number]["mensuel" | "annuel" | "sms" | "min" | "max"]
  | (typeof FORMULES_MEDECIN)[number]["mensuel" | "annuel" | "sms"];

const LANCEMENT: { cle: keyof ConfigAbonnements; titre: string; detail?: string }[] = [
  {
    cle: "periodeGratuite",
    titre: "Période gratuite de lancement",
    detail: "Aucune facturation des professionnels pendant la phase pilote",
  },
  { cle: "essaiGratuit", titre: "Essai gratuit à l'inscription", detail: "30 jours" },
  /*
   * Ces trois interrupteurs commandent les tuiles de l'écran de paiement
   * (migration 0040) : éteindre un moyen le retire du choix des
   * professionnels, et la fonction serveur refuse toute demande le citant.
   * Les numéros marchands, eux, se saisissent dans /espace-admin/finances.
   */
  { cle: "orangeMoney", titre: "Paiement Orange Money" },
  { cle: "mtnMomo", titre: "Paiement MTN MoMo" },
  {
    cle: "carteBancaire",
    titre: "Paiement par carte bancaire",
    detail: "Lien de paiement envoyé par e-mail",
  },
];

/*
 * La période gratuite de lancement l'emporte sur l'essai (voir l'ordre de
 * précédence de /api/inscription/finaliser). Tant qu'elle est active,
 * basculer l'essai ne change rien pour personne — l'écran le disait nulle
 * part, et on pouvait croire le réglage cassé.
 */
const NOTE_NEUTRALISE = "Sans effet tant que la période gratuite de lancement est active.";

const NOM_FORMULE: Record<string, string> = {
  standard: "Standard",
  premium: "Premium",
  structure: "Structure de proximité",
  cabinet: "Cabinet / plateau technique",
  clinique: "Clinique / centre médical",
  hopital: "Hôpital / centre hospitalier",
};

export default function AbonnementsAdmin() {
  const { tarifs, enregistrer: enregistrerTarif } = useConfigAbonnements();
  const { formules: consoSms, total: consoTotal } = useConsommationSms();
  const [reglagesExtra, setReglagesExtra] = useState<Record<string, boolean>>({});
  useEffect(() => {
    lireReglagesBool(CLES_REGLAGES).then(setReglagesExtra);
  }, []);

  const tarif = (f: string) => tarifs.find((t) => t.formule === f);
  const config: ConfigAbonnements = {
    ...(Object.fromEntries([
      ...FORMULES_MEDECIN.flatMap((f) => [
        [f.mensuel, fmt(tarif(f.formule)?.prixMensuel ?? 0)],
        [f.annuel, fmt(tarif(f.formule)?.prixAnnuel ?? 0)],
        [f.sms, fmt(tarif(f.formule)?.quotaSms ?? 0)],
      ]),
      ...PALIERS.flatMap((p) => [
        [p.mensuel, fmt(tarif(p.formule)?.prixMensuel ?? 0)],
        [p.annuel, fmt(tarif(p.formule)?.prixAnnuel ?? 0)],
        [p.sms, fmt(tarif(p.formule)?.quotaSms ?? 0)],
        [p.min, fmtBorne(tarif(p.formule)?.medecinsMin)],
        [p.max, fmtBorne(tarif(p.formule)?.medecinsMax)],
      ]),
    ]) as Record<CleTarif, string>),
    periodeGratuite: reglagesExtra["periode_gratuite"] ?? true,
    essaiGratuit: reglagesExtra["essai_gratuit"] ?? true,
    orangeMoney: reglagesExtra["orange_money"] ?? true,
    mtnMomo: reglagesExtra["mtn_momo"] ?? true,
    carteBancaire: reglagesExtra["carte_bancaire"] ?? true,
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
      ...FORMULES_MEDECIN.map((f) =>
        enregistrerTarif(f.formule, {
          prixMensuel: parseGNF(valeurs[f.mensuel] as string),
          prixAnnuel: parseGNF(valeurs[f.annuel] as string),
          quotaSms: parseGNF(valeurs[f.sms] as string),
        })
      ),
      ...PALIERS.map((p) =>
        enregistrerTarif(p.formule, {
          prixMensuel: parseGNF(valeurs[p.mensuel] as string),
          prixAnnuel: parseGNF(valeurs[p.annuel] as string),
          quotaSms: parseGNF(valeurs[p.sms] as string),
          medecinsMin: parseBorne(valeurs[p.min] as string),
          medecinsMax: parseBorne(valeurs[p.max] as string),
        })
      ),
      ecrireReglageBool("periode_gratuite", valeurs.periodeGratuite),
      ecrireReglageBool("essai_gratuit", valeurs.essaiGratuit),
      ecrireReglageBool("orange_money", valeurs.orangeMoney),
      ecrireReglageBool("mtn_momo", valeurs.mtnMomo),
      ecrireReglageBool("carte_bancaire", valeurs.carteBancaire),
    ]);
    const messages = [...new Set(resultats.map((r) => r.erreur).filter(Boolean))] as string[];
    if (!messages.length) {
      await tracerAudit(
        "A modifié la configuration des abonnements",
        [
          ...FORMULES_MEDECIN.map(
            (f) => `${f.nom} ${valeurs[f.mensuel]}/mois · ${valeurs[f.annuel]}/an · ${valeurs[f.sms]} SMS`
          ),
          ...PALIERS.map(
            (p) =>
              `${p.nom} (${valeurs[p.min] || 0}–${valeurs[p.max] || "∞"} médecins) ${valeurs[p.mensuel]}/mois · ${valeurs[p.annuel]}/an · ${valeurs[p.sms]} SMS`
          ),
        ].join(" · ")
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
                  <th>SMS</th>
                </tr>
              </thead>
              <tbody>
                {FORMULES_MEDECIN.map((f) => (
                  <tr key={f.formule}>
                    <td>{f.nom}</td>
                    {([f.mensuel, f.annuel, f.sms] as const).map((cle, i) => (
                      <td key={cle}>
                        <input
                          className="inp"
                          style={{ marginBottom: 0, padding: "6px 8px", fontSize: 12 }}
                          value={valeurs[cle] as string}
                          onChange={(e) => modifier(cle, e.target.value)}
                          aria-label={`${f.nom} ${["mensuel", "annuel", "quota SMS"][i]}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
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
                  <th>Mensuel</th>
                  <th>Annuel</th>
                  <th>SMS</th>
                </tr>
              </thead>
              <tbody>
                {PALIERS.map((palier) => (
                  <tr key={palier.formule}>
                    <td>
                      {palier.nom}
                      <span style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                        <input
                          className="inp"
                          style={{ marginBottom: 0, padding: "4px 6px", fontSize: 11, width: 44 }}
                          value={valeurs[palier.min] as string}
                          onChange={(e) => modifier(palier.min, e.target.value)}
                          aria-label={`${palier.nom} médecins minimum`}
                          inputMode="numeric"
                        />
                        <span className="muted" style={{ fontSize: 11 }}>
                          à
                        </span>
                        <input
                          className="inp"
                          style={{ marginBottom: 0, padding: "4px 6px", fontSize: 11, width: 44 }}
                          value={valeurs[palier.max] as string}
                          onChange={(e) => modifier(palier.max, e.target.value)}
                          aria-label={`${palier.nom} médecins maximum`}
                          placeholder="∞"
                          inputMode="numeric"
                        />
                        <span className="muted" style={{ fontSize: 11 }}>
                          médecins
                        </span>
                      </span>
                    </td>
                    {([palier.mensuel, palier.annuel, palier.sms] as const).map((cle, i) => (
                      <td key={cle}>
                        <input
                          className="inp"
                          style={{ marginBottom: 0, padding: "6px 8px", fontSize: 12 }}
                          value={valeurs[cle] as string}
                          onChange={(e) => modifier(cle, e.target.value)}
                          aria-label={`${palier.nom} ${["mensuel", "annuel", "quota SMS"][i]}`}
                        />
                      </td>
                    ))}
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
                {["Formule", "Mensuel (GNF)", "Annuel (GNF)", "SMS inclus", "Mise en avant"].map((th) => (
                  <th key={th} className={enTete}>
                    {th}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FORMULES_MEDECIN.map((f) => (
                <tr key={f.formule}>
                  <td className={caseTab}>
                    <b>{f.nom}</b>
                  </td>
                  {([f.mensuel, f.annuel, f.sms] as const).map((cle, i) => (
                    <td key={cle} className={caseTab}>
                      <input
                        value={valeurs[cle] as string}
                        onChange={(e) => modifier(cle, e.target.value)}
                        aria-label={`${f.nom} ${["mensuel", "annuel", "quota SMS"][i]}`}
                        className={cellule}
                      />
                    </td>
                  ))}
                  <td className={caseTab}>
                    {f.miseEnAvant ? (
                      <span className="rounded-lg bg-green-soft px-[9px] py-1 text-[11px] font-bold text-green">
                        Incluse
                      </span>
                    ) : (
                      <span className="rounded-lg bg-red-soft px-[9px] py-1 text-[11px] font-bold text-red">
                        Non
                      </span>
                    )}
                  </td>
                </tr>
              ))}
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
                {["Palier", "Médecins", "Mensuel (GNF)", "Annuel (GNF)", "SMS inclus"].map((th) => (
                  <th key={th} className={enTete}>
                    {th}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PALIERS.map((palier) => (
                <tr key={palier.formule}>
                  <td className={caseTab}>{palier.nom}</td>
                  <td className={caseTab}>
                    <span className="flex items-center gap-1.5">
                      <input
                        value={valeurs[palier.min] as string}
                        onChange={(e) => modifier(palier.min, e.target.value)}
                        aria-label={`${palier.nom} médecins minimum`}
                        inputMode="numeric"
                        className={`${cellule} !w-[52px] !min-w-0 text-center`}
                      />
                      <span className="text-[12px] text-muted">à</span>
                      <input
                        value={valeurs[palier.max] as string}
                        onChange={(e) => modifier(palier.max, e.target.value)}
                        aria-label={`${palier.nom} médecins maximum`}
                        placeholder="∞"
                        inputMode="numeric"
                        className={`${cellule} !w-[52px] !min-w-0 text-center`}
                      />
                    </span>
                  </td>
                  {([palier.mensuel, palier.annuel, palier.sms] as const).map((cle, i) => (
                    <td key={cle} className={caseTab}>
                      <input
                        value={valeurs[cle] as string}
                        onChange={(e) => modifier(cle, e.target.value)}
                        aria-label={`${palier.nom} ${["mensuel", "annuel", "quota SMS"][i]}`}
                        className={cellule}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-[14px] flex items-start gap-[9px] rounded-[11px] bg-teal-soft px-[13px] py-[11px] text-[12.5px] font-semibold leading-relaxed text-blue">
          <span aria-hidden>ℹ️</span>
          <div>
            Le palier de départ découle du type déclaré à l’inscription ; les bornes de taille
            servent à requalifier une structure qui grandit. Laissez le maximum vide pour un palier
            sans plafond. Un médecin couvert par le plan de son établissement ne paie pas en plus
            (pas de double facturation).
          </div>
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">Consommation SMS du mois</h3>
        <p className="mb-[14px] text-[12.5px] text-muted">
          Ce que la plateforme doit à l’agrégateur ce mois-ci, à {fmt(COUT_SEGMENT_GNF)} GNF le
          segment. Le compteur se remet à zéro le 1er.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {["Formule", "Abonnés", "Quota du mois", "Consommés", "Coût (GNF)"].map((th) => (
                  <th key={th} className={enTete}>
                    {th}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {consoSms.length === 0 && (
                <tr>
                  <td className={`${caseTab} text-muted`} colSpan={5}>
                    Aucun SMS envoyé ce mois-ci.
                  </td>
                </tr>
              )}
              {consoSms.map((f) => {
                // Au-delà de 80 % du quota global d'une formule, le palier est
                // sous-dimensionné : c'est le moment de le corriger, pas quand
                // les dépassements arrivent.
                const part = f.quotaTotal > 0 ? f.consommes / f.quotaTotal : 0;
                return (
                  <tr key={f.formule}>
                    <td className={caseTab}>{NOM_FORMULE[f.formule] ?? f.formule}</td>
                    <td className={caseTab}>{f.abonnes}</td>
                    <td className={caseTab}>{fmt(f.quotaTotal)}</td>
                    <td className={`${caseTab} ${part >= 0.8 ? "font-bold text-amber" : ""}`}>
                      {fmt(f.consommes)}
                      {part >= 0.8 && ` (${Math.round(part * 100)} %)`}
                    </td>
                    <td className={caseTab}>{fmt(f.coutGnf)}</td>
                  </tr>
                );
              })}
              {consoSms.length > 0 && (
                <tr>
                  <td className={caseTab}>
                    <b>Total</b>
                  </td>
                  <td className={caseTab}>{consoTotal.abonnes}</td>
                  <td className={caseTab}>{fmt(consoTotal.quotaTotal)}</td>
                  <td className={caseTab}>{fmt(consoTotal.consommes)}</td>
                  <td className={caseTab}>
                    <b>{fmt(consoTotal.coutGnf)}</b>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
