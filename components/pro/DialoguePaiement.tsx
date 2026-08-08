"use client";

import { useEffect, useState } from "react";
import ChampTelephoneGN from "@/components/site/ChampTelephoneGN";
import { formatGNF } from "@/lib/format";
import { formaterTelephoneGN, telephoneGuineenValide } from "@/lib/telephone";
import {
  HABILLAGE_MOYEN,
  annulerPaiement,
  declarerReference,
  demanderPaiement,
  estMobileMoney,
  type CodeMoyen,
  type MoyenPaiement,
  type Paiement,
} from "@/lib/paiements";

/*
 * Paiement d'un abonnement, en trois temps.
 *
 *   1. Récapitulatif — ce qu'on achète et pour combien. La bascule
 *      mensuel/annuel est REJOUÉE ici : c'est le moment où le prix devient
 *      concret, donc celui où l'on compare vraiment les deux.
 *   2. Moyen de paiement — Orange Money, MTN MoMo ou carte. Le champ de
 *      saisie apparaît sous la tuile choisie, sans étape de plus.
 *   3. Instructions puis confirmation.
 *
 * CE QUE CET ÉCRAN NE FAIT PAS, ET NE DOIT PAS FAIRE SEMBLANT DE FAIRE :
 * débiter. Aucune passerelle n'est branchée. Le versement se fait par USSD
 * vers le compte marchand de la plateforme, et l'abonnement ne devient actif
 * qu'une fois le versement rapproché par l'admin Finance. L'écran le dit —
 * annoncer « paiement accepté » sans encaissement serait un mensonge affiché
 * au moment où le professionnel nous fait le plus confiance.
 *
 * Pas de champ « numéro de carte » non plus, et ce n'est pas un manque :
 * même avec une passerelle, un numéro de carte se saisit sur la page du
 * prestataire, jamais sur la nôtre. La carte passe donc par un lien envoyé.
 */

type Etape = "recap" | "moyen" | "instructions" | "confirme";

const ETAPES: { cle: Etape; libelle: string }[] = [
  { cle: "recap", libelle: "Récapitulatif" },
  { cle: "moyen", libelle: "Paiement" },
  { cle: "confirme", libelle: "Confirmation" },
];

const SOUS_TITRE: Record<CodeMoyen, string> = {
  orange_money: "Versement depuis votre téléphone",
  mtn_momo: "Versement depuis votre téléphone",
  carte: "Lien de paiement sécurisé par e-mail",
};

export default function DialoguePaiement({
  onFermer,
  formule,
  libelleFormule,
  periode,
  onPeriode,
  prix,
  moyens,
  reprise = null,
  apres,
}: {
  onFermer: () => void;
  formule: string;
  libelleFormule: string;
  periode: "mensuel" | "annuel";
  /** Laissé libre : l'appelant garde la maîtrise de la période affichée. */
  onPeriode?: (p: "mensuel" | "annuel") => void;
  prix: { mensuel: number; annuel: number };
  moyens: MoyenPaiement[];
  /** Demande déjà ouverte : on rouvre alors directement les instructions. */
  reprise?: Paiement | null;
  apres?: () => void;
}) {
  /*
   * L'appelant NE MONTE ce dialogue que lorsqu'il est ouvert : l'état de
   * départ se calcule donc à l'initialisation, sans effet de remise à zéro.
   * Le linter React refuse un setState en tête d'effet, et un dialogue
   * démonté n'a de toute façon rien à retenir de la fois précédente.
   *
   * Une reprise repart des instructions : le professionnel rouvre justement
   * pour relire le numéro marchand et sa référence.
   */
  const [etape, setEtape] = useState<Etape>(
    reprise ? (estMobileMoney(reprise.moyen) ? "instructions" : "confirme") : "recap"
  );
  const [moyen, setMoyen] = useState<CodeMoyen | null>(reprise?.moyen ?? null);
  const [numero, setNumero] = useState("");
  const [referenceOperateur, setReferenceOperateur] = useState(reprise?.referenceOperateur ?? "");
  const [paiement, setPaiement] = useState<Paiement | null>(reprise);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  const [copie, setCopie] = useState("");

  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFermer();
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [onFermer]);

  const montant = paiement?.montantGnf ?? (periode === "annuel" ? prix.annuel : prix.mensuel);
  const economie = prix.mensuel * 12 - prix.annuel;
  const compte = moyens.find((m) => m.code === moyen) ?? null;
  const coordonneesManquantes = !!compte && estMobileMoney(compte.code) && !compte.numeroMarchand;
  const numeroValide = telephoneGuineenValide(numero);
  /*
   * En reprise, le numéro saisi est perdu (le dialogue a été démonté) mais il
   * est en base : la consigne repart de celui-là, groupé comme partout ailleurs.
   */
  const numeroPayeur = formaterTelephoneGN(numero || paiement?.numeroPayeur || "");

  async function copier(texte: string, quoi: string) {
    try {
      await navigator.clipboard.writeText(texte);
      setCopie(quoi);
      setTimeout(() => setCopie(""), 2000);
    } catch {
      // Presse-papiers refusé (contexte non sécurisé) : le texte reste
      // sélectionnable à la main, inutile d'alarmer.
    }
  }

  /** Ouvre la demande côté serveur : c'est lui qui fixe le montant. */
  async function lancer() {
    if (!moyen || enCours) return;
    setEnCours(true);
    setErreur("");
    const res = await demanderPaiement({
      formule,
      periode,
      moyen,
      numero: estMobileMoney(moyen) ? numero : undefined,
    });
    setEnCours(false);
    if (res.erreur || !res.paiement) {
      setErreur(res.erreur ?? "Demande impossible.");
      return;
    }
    setPaiement(res.paiement);
    setEtape(estMobileMoney(moyen) ? "instructions" : "confirme");
    apres?.();
  }

  /** « J'ai payé » : on note l'identifiant du SMS, on ne confirme rien. */
  async function declarer() {
    if (!paiement || enCours) return;
    setEnCours(true);
    setErreur("");
    const res = referenceOperateur.trim()
      ? await declarerReference(paiement.id, referenceOperateur.trim())
      : {};
    setEnCours(false);
    if (res.erreur) {
      setErreur(res.erreur);
      return;
    }
    setEtape("confirme");
    apres?.();
  }

  async function renoncer() {
    if (!paiement || enCours) return;
    setEnCours(true);
    const res = await annulerPaiement(paiement.id);
    setEnCours(false);
    if (res.erreur) {
      setErreur(res.erreur);
      return;
    }
    apres?.();
    onFermer();
  }

  const indexEtape = etape === "instructions" ? 1 : ETAPES.findIndex((e) => e.cle === etape);
  const champ =
    "w-full rounded-xl border border-line bg-white px-[13px] py-2.5 text-[13.5px] outline-none focus:border-teal";
  const boutonPrincipal =
    "w-full rounded-[11px] bg-teal px-[14px] py-3 text-[13px] font-extrabold text-white transition-colors hover:bg-[#2790bc] disabled:cursor-not-allowed disabled:opacity-50";
  const boutonSecondaire =
    "w-full rounded-[11px] border-[1.5px] border-line bg-white px-[14px] py-3 text-[13px] font-bold text-blue transition-colors hover:bg-bg disabled:opacity-50";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Paiement de l’abonnement ${libelleFormule}`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 md:items-start md:overflow-y-auto md:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onFermer();
      }}
    >
      {/* Feuille montante sur téléphone, carte centrée à partir de md. */}
      <div className="flex max-h-[94vh] w-full flex-col rounded-t-2xl border border-line bg-white md:max-h-none md:max-w-[520px] md:rounded-2xl md:shadow-xl">
        {/* ---- En-tête et fil des étapes ---- */}
        <div className="border-b border-line p-4 pb-3">
          <div className="flex items-start justify-between gap-3">
            <h4 className="text-[15.5px] font-extrabold">
              {etape === "confirme" ? "Demande enregistrée" : `Abonnement ${libelleFormule}`}
              <span className="mt-0.5 block text-[12px] font-semibold text-muted">
                {etape === "confirme"
                  ? "Nous vérifions votre règlement"
                  : `${periode === "annuel" ? "Facturation annuelle" : "Facturation mensuelle"} · ${formatGNF(montant)}`}
              </span>
            </h4>
            <button
              type="button"
              onClick={onFermer}
              aria-label="Fermer"
              className="flex-none rounded-lg px-2 py-1 text-lg text-muted hover:bg-bg"
            >
              ✕
            </button>
          </div>

          <ol className="mt-3 flex items-center gap-1.5">
            {ETAPES.map((e, i) => (
              <li key={e.cle} className="flex flex-1 items-center gap-1.5">
                <span
                  aria-current={i === indexEtape ? "step" : undefined}
                  className={`flex-1 rounded-full text-[10.5px] font-bold uppercase tracking-[0.4px] ${
                    i <= indexEtape ? "text-blue" : "text-muted"
                  }`}
                >
                  <span
                    className={`mb-1 block h-[3px] rounded-full ${
                      i <= indexEtape ? "bg-teal" : "bg-line"
                    }`}
                  />
                  {e.libelle}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {/* ================= 1. Récapitulatif ================= */}
          {etape === "recap" && (
            <>
              <div role="radiogroup" aria-label="Périodicité" className="grid gap-2">
                {(
                  [
                    ["mensuel", "Mensuel", prix.mensuel, "par mois"],
                    ["annuel", "Annuel", prix.annuel, "par an"],
                  ] as ["mensuel" | "annuel", string, number, string][]
                ).map(([valeur, libelle, somme, unite]) => (
                  <button
                    key={valeur}
                    type="button"
                    role="radio"
                    aria-checked={periode === valeur}
                    onClick={() => onPeriode?.(valeur)}
                    disabled={!onPeriode}
                    className={`flex items-center justify-between gap-3 rounded-[14px] border-[1.5px] p-[13px] text-left transition-colors ${
                      periode === valeur
                        ? "border-teal bg-teal-soft"
                        : "border-line bg-white hover:bg-bg"
                    }`}
                  >
                    <span>
                      <b className="block text-[13.5px] font-extrabold">{libelle}</b>
                      {valeur === "annuel" && economie > 0 && (
                        <small className="text-[11.5px] font-bold text-green">
                          Économisez {formatGNF(economie)}
                        </small>
                      )}
                      {valeur === "mensuel" && (
                        <small className="text-[11.5px] text-muted">Sans engagement</small>
                      )}
                    </span>
                    <span className="flex-none text-right">
                      <b className="block text-[15px] font-extrabold text-blue">
                        {formatGNF(somme)}
                      </b>
                      <small className="text-[11px] text-muted">{unite}</small>
                    </span>
                  </button>
                ))}
              </div>

              <div className="mt-3 flex items-center justify-between rounded-xl bg-bg px-[14px] py-3">
                <b className="text-[13px]">Total à payer</b>
                <b className="text-[19px] font-extrabold text-blue">{formatGNF(montant)}</b>
              </div>

              <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
                🔒 Votre abonnement passe en <b>{libelleFormule}</b> dès que le règlement est
                confirmé par notre équipe. La prise de rendez-vous reste gratuite pour vos patients.
              </p>
            </>
          )}

          {/* ================= 2. Moyen de paiement ================= */}
          {etape === "moyen" && (
            <>
              <div role="radiogroup" aria-label="Moyen de paiement" className="grid gap-2">
                {moyens.map((m) => {
                  const habillage = HABILLAGE_MOYEN[m.code];
                  const choisi = moyen === m.code;
                  return (
                    <div key={m.code}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={choisi}
                        onClick={() => {
                          setMoyen(m.code);
                          setErreur("");
                        }}
                        className="flex w-full items-center gap-3 rounded-[14px] border-[1.5px] p-[13px] text-left transition-colors"
                        style={{
                          borderColor: choisi ? habillage.teinte : "var(--line)",
                          background: choisi ? "#FBFCFD" : "#fff",
                        }}
                      >
                        <span
                          aria-hidden
                          className="grid h-10 w-10 flex-none place-items-center rounded-xl text-lg"
                          style={{ background: habillage.bordure }}
                        >
                          {habillage.icone}
                        </span>
                        <span className="min-w-0 flex-1">
                          <b className="block text-[13.5px] font-extrabold">{m.libelle}</b>
                          <small className="text-[11.5px] text-muted">{SOUS_TITRE[m.code]}</small>
                        </span>
                        <span
                          aria-hidden
                          className="grid h-[18px] w-[18px] flex-none place-items-center rounded-full border-[1.5px]"
                          style={{ borderColor: choisi ? habillage.teinte : "var(--line)" }}
                        >
                          {choisi && (
                            <span
                              className="h-[9px] w-[9px] rounded-full"
                              style={{ background: habillage.teinte }}
                            />
                          )}
                        </span>
                      </button>

                      {/* La saisie s'ouvre sous la tuile : pas d'étape de plus. */}
                      {choisi && estMobileMoney(m.code) && (
                        <div className="mt-2 rounded-[14px] bg-bg p-[13px]">
                          <div className="mb-1.5 text-[12px] font-bold">
                            Numéro {m.libelle} qui effectuera le versement
                          </div>
                          <ChampTelephoneGN
                            valeur={numero}
                            onChange={setNumero}
                            ariaLabel={`Numéro ${m.libelle}`}
                          />
                          <p className="text-[11px] leading-relaxed text-muted">
                            Il sert au rapprochement de votre versement. Aucun débit n’est
                            déclenché depuis cet écran.
                          </p>
                        </div>
                      )}
                      {choisi && !estMobileMoney(m.code) && (
                        <div className="mt-2 rounded-[14px] bg-bg p-[13px] text-[11.5px] leading-relaxed text-muted">
                          Nous vous envoyons un <b>lien de paiement sécurisé</b> à l’adresse
                          e-mail de votre compte. Votre numéro de carte se saisit sur la page de
                          notre prestataire — jamais sur Docteur&nbsp;224.
                        </div>
                      )}
                    </div>
                  );
                })}
                {moyens.length === 0 && (
                  <p className="rounded-xl bg-amber-soft px-3 py-2 text-[12.5px] font-semibold text-amber">
                    Aucun moyen de paiement n’est ouvert pour le moment. Notre équipe vous
                    contactera pour le règlement.
                  </p>
                )}
              </div>
            </>
          )}

          {/* ================= 3. Instructions de versement ================= */}
          {etape === "instructions" && paiement && compte && (
            <>
              <div className="mb-3 rounded-[14px] border-[1.5px] border-teal bg-teal-soft p-[13px]">
                <div className="flex items-baseline justify-between gap-3">
                  <small className="text-[11.5px] font-bold text-blue">Montant à verser</small>
                  <b className="text-[19px] font-extrabold text-blue">{formatGNF(montant)}</b>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-white/70 pt-1.5">
                  <small className="text-[11.5px] font-bold text-blue">Référence</small>
                  <button
                    type="button"
                    onClick={() => copier(paiement.reference, "reference")}
                    className="text-[13px] font-extrabold tracking-[0.5px] text-blue underline decoration-dotted"
                  >
                    {paiement.reference}
                    <span className="ml-1 text-[10.5px] font-bold">
                      {copie === "reference" ? "copié ✓" : "copier"}
                    </span>
                  </button>
                </div>
              </div>

              {coordonneesManquantes ? (
                <p className="mb-3 rounded-xl bg-amber-soft px-3 py-2.5 text-[12.5px] font-semibold leading-relaxed text-amber">
                  Les coordonnées de versement {compte.libelle} ne sont pas encore publiées. Votre
                  demande est bien enregistrée sous la référence <b>{paiement.reference}</b> :
                  notre équipe vous rappelle pour l’encaissement.
                </p>
              ) : (
                <ol className="mb-3 grid gap-2">
                  {[
                    <>
                      Composez <b>{compte.codeUssd || "le code de votre opérateur"}</b>{" "}
                      {numeroPayeur
                        ? `depuis le ${numeroPayeur}`
                        : "depuis le téléphone titulaire du compte"}
                      .
                    </>,
                    <>
                      Envoyez <b>{formatGNF(montant)}</b> au numéro marchand{" "}
                      <button
                        type="button"
                        onClick={() => copier(compte.numeroMarchand, "numero")}
                        className="font-extrabold text-teal underline decoration-dotted"
                      >
                        {compte.numeroMarchand}
                        <span className="ml-1 text-[10.5px]">
                          {copie === "numero" ? "copié ✓" : "copier"}
                        </span>
                      </button>
                      .
                    </>,
                    <>
                      Indiquez la référence <b>{paiement.reference}</b> en motif, puis conservez
                      l’identifiant de transaction reçu par SMS.
                    </>,
                  ].map((texte, i) => (
                    <li key={i} className="flex gap-2.5 rounded-xl bg-bg p-[11px]">
                      <span
                        aria-hidden
                        className="grid h-[22px] w-[22px] flex-none place-items-center rounded-full bg-teal text-[11px] font-extrabold text-white"
                      >
                        {i + 1}
                      </span>
                      <span className="text-[12.5px] leading-relaxed">{texte}</span>
                    </li>
                  ))}
                </ol>
              )}

              {compte.instructions && !coordonneesManquantes && (
                <p className="mb-3 text-[11.5px] leading-relaxed text-muted">
                  {compte.instructions}
                </p>
              )}

              <div className="mb-1.5 text-[12px] font-bold">
                Identifiant de la transaction <span className="text-muted">(facultatif)</span>
              </div>
              <input
                className={champ}
                placeholder="Ex. PP240815.1432.A12345"
                aria-label="Identifiant de la transaction"
                value={referenceOperateur}
                onChange={(e) => setReferenceOperateur(e.target.value)}
              />
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                Le renseigner accélère la vérification, mais n’est pas obligatoire : nous
                retrouvons votre versement avec la référence.
              </p>
            </>
          )}

          {/* ================= 4. Confirmation ================= */}
          {etape === "confirme" && paiement && (
            <>
              <div className="mb-3 flex flex-col items-center gap-2 py-2 text-center">
                <span
                  aria-hidden
                  className="grid h-12 w-12 place-items-center rounded-full bg-green-soft text-[22px] text-green"
                >
                  ✓
                </span>
                <b className="text-[15px] font-extrabold">
                  {estMobileMoney(paiement.moyen)
                    ? "Nous vérifions votre versement"
                    : "Lien de paiement demandé"}
                </b>
                <p className="max-w-[380px] text-[12.5px] leading-relaxed text-muted">
                  {estMobileMoney(paiement.moyen) ? (
                    <>
                      Votre abonnement <b>{libelleFormule}</b> sera activé dès que notre équipe
                      aura rapproché le versement. Vous recevrez une notification — inutile de
                      payer une seconde fois.
                    </>
                  ) : (
                    <>
                      Nous vous envoyons le lien de paiement sécurisé à l’adresse e-mail de votre
                      compte. Votre abonnement <b>{libelleFormule}</b> sera activé après le
                      règlement.
                    </>
                  )}
                </p>
              </div>

              <dl className="grid gap-1.5 rounded-[14px] bg-bg p-[13px] text-[12.5px]">
                {[
                  ["Formule", `${libelleFormule} · ${periode === "annuel" ? "annuel" : "mensuel"}`],
                  ["Montant", formatGNF(paiement.montantGnf)],
                  ["Moyen", moyens.find((m) => m.code === paiement.moyen)?.libelle ?? "—"],
                  ["Référence", paiement.reference],
                ].map(([cle, valeur]) => (
                  <div key={cle} className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted">{cle}</dt>
                    <dd className="font-bold">{valeur}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}

          {erreur && (
            <p role="alert" className="mt-3 text-[12.5px] font-bold text-red">
              ⚠️ {erreur}
            </p>
          )}
        </div>

        {/* ---- Actions ---- */}
        <div className="grid gap-2 border-t border-line p-4">
          {etape === "recap" && (
            <button type="button" className={boutonPrincipal} onClick={() => setEtape("moyen")}>
              Continuer · {formatGNF(montant)}
            </button>
          )}

          {etape === "moyen" && (
            <>
              <button
                type="button"
                className={boutonPrincipal}
                disabled={
                  !moyen || enCours || (estMobileMoney(moyen) && !numeroValide) || moyens.length === 0
                }
                onClick={lancer}
              >
                {enCours
                  ? "Enregistrement…"
                  : moyen && !estMobileMoney(moyen)
                    ? "Recevoir le lien de paiement"
                    : `Payer ${formatGNF(montant)}`}
              </button>
              <button
                type="button"
                className={boutonSecondaire}
                onClick={() => setEtape("recap")}
                disabled={enCours}
              >
                Retour
              </button>
            </>
          )}

          {etape === "instructions" && (
            <>
              <button
                type="button"
                className={boutonPrincipal}
                onClick={declarer}
                disabled={enCours}
              >
                {enCours ? "Enregistrement…" : "J’ai effectué le versement"}
              </button>
              <button
                type="button"
                className={boutonSecondaire}
                onClick={onFermer}
                disabled={enCours}
              >
                Je paierai plus tard
              </button>
              <button
                type="button"
                onClick={renoncer}
                disabled={enCours}
                className="text-[12px] font-bold text-muted underline hover:text-red disabled:opacity-50"
              >
                Annuler cette demande
              </button>
            </>
          )}

          {etape === "confirme" && (
            <button type="button" className={boutonPrincipal} onClick={onFermer}>
              Fermer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
