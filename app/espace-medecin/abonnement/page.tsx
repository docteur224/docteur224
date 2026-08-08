"use client";

import MedecinShell from "@/components/medecin/MedecinShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import { formatGNF } from "@/lib/format";
import { useState } from "react";
import { useAbonnement } from "@/lib/pro";
import RappelsEtSms from "@/components/medecin/RappelsEtSms";

/*
 * Mon abonnement — reproduit l'écran « med-abonnement » de la maquette web
 * (spec C.4.4) : abonnement en cours, bascule Mensuel / Annuel, formules
 * Standard et Premium. Le choix est écrit dans la table `abonnements`.
 * Rappel spec : la prise de RDV reste gratuite pour les patients.
 */



/*
 * Le quota SMS est LU dans la grille tarifaire, pas écrit ici.
 *
 * La carte annonçait « Statistiques avancées · quota SMS » sous Premium et
 * rien sous Standard, ce qui laissait croire que le Standard n'en avait
 * aucun — il en a 100 par mois. Et la mention étant en dur, elle a survécu
 * telle quelle au recalage des quotas : un chiffre affiché doit venir de la
 * même source que celui qui sera appliqué.
 *
 * « par mois » est explicite parce que la carte peut afficher un prix annuel :
 * sans ça, « 200 SMS » se lit comme 200 pour l'année.
 */
const avantages = (formule: "standard" | "premium", quotaSms: number): string[] => [
  ...(formule === "standard"
    ? ["Profil & fiche enrichie", "Agenda & gestion des RDV", "Disponibilités & créneaux", "1 assistant(e)"]
    : [
        "Tout le Standard",
        "Mise en avant (en vedette)",
        "Priorité dans la recherche",
        "Plus de photos & d'assistant(e)s",
        "Statistiques avancées",
      ]),
  `${quotaSms.toLocaleString("fr-FR")} SMS inclus par mois`,
  // WhatsApp ne consomme pas le quota : c'est l'argument qui rend les rappels
  // abordables, et il n'apparaissait nulle part.
  "Rappels WhatsApp hors quota",
];

export default function AbonnementMedecin() {
  const { abonnement, tarifs, changerFormule } = useAbonnement();
  const formule = abonnement?.formule ?? "standard";
  const [periodeVue, setPeriodeVue] = useState<"mensuel" | "annuel" | null>(null);
  const periode = periodeVue ?? ((abonnement?.periode as "mensuel" | "annuel") ?? "mensuel");
  const [message, setMessage] = useState("");

  const prix = (f: string) => {
    const t = tarifs.find((x) => x.formule === f);
    return { mensuel: t?.prixMensuel ?? 0, annuel: t?.prixAnnuel ?? 0 };
  };
  const TARIFS = { standard: prix("standard"), premium: prix("premium") };
  const quota = (f: string) => tarifs.find((x) => x.formule === f)?.quotaSms ?? 0;
  const AVANTAGES_STANDARD = avantages("standard", quota("standard"));
  const AVANTAGES_PREMIUM = avantages("premium", quota("premium"));
  const finAbo = abonnement?.dateFin ?? "";

  async function choisir(f: "standard" | "premium") {
    const res = await changerFormule(f, periode);
    setMessage(res.erreur ? `⚠️ ${res.erreur}` : "✓ Abonnement mis à jour");
  }

  const libelleFormule = formule === "premium" ? "Premium" : "Standard";
  const libellePeriode = periode === "annuel" ? "Annuel" : "Mensuel";

  /*
   * L'écran affichait « Actif » en dur, quel que soit l'état réel — et il
   * disait donc vrai par accident, puisque l'ancien code d'écriture s'attribuait
   * `statut: "actif"` depuis le navigateur. Maintenant que le statut est
   * calculé côté serveur d'après les réglages de gratuité, il faut le lire :
   * pendant la phase pilote un abonnement est en « essai », pas « actif ».
   */
  const STATUTS: Record<string, { label: string; ok: boolean }> = {
    actif: { label: "Actif", ok: true },
    essai: { label: "Essai", ok: true },
    expire: { label: "Expiré", ok: false },
    annule: { label: "Annulé", ok: false },
  };
  const etat = STATUTS[abonnement?.statut ?? ""] ?? { label: "Aucun", ok: false };

  return (
    <MedecinShell>
      {/* ===== Version mobile (écran « m-med-abonnement » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <EnTeteMobile retour="/espace-medecin/compte" titre="Mon abonnement" />
        <div className="pad">
          <div className="card2">
            <h4>Abonnement actuel</h4>
            <div className="setrow">
              <div>
                <b>
                  {libelleFormule} · {libellePeriode}
                </b>
                <small>
                  {finAbo ? `Jusqu'au ${finAbo}` : abonnement ? "Sans échéance" : "Aucun abonnement"}
                </small>
              </div>
              <span className={`pill${etat.ok ? " ok" : ""}`}>{etat.label}</span>
            </div>
            <div className="privnote info">
              <span aria-hidden>ℹ️</span>
              <div>
                La prise de RDV reste <b>gratuite pour vos patients</b>.
              </div>
            </div>
          </div>
          <div className="card2">
            <h4>Changer de formule</h4>
            {message && <p style={{ color: "var(--green)", fontSize: 12.5, fontWeight: 700 }}>{message}</p>}
            <div className="seg">
              <button
                type="button"
                className={periode === "mensuel" ? "on" : undefined}
                onClick={() => setPeriodeVue("mensuel")}
              >
                Mensuel
              </button>
              <button
                type="button"
                className={periode === "annuel" ? "on" : undefined}
                onClick={() => setPeriodeVue("annuel")}
              >
                Annuel
              </button>
            </div>
            <div className={`plan${formule === "standard" ? " cur" : ""}`}>
              {formule === "standard" && <span className="tag">Actuel</span>}
              <h4>Standard</h4>
              <div className="pr">
                {formatGNF(TARIFS.standard[periode])}{" "}
                <span style={{ fontSize: 11, color: "var(--muted)" }}>
                  /{periode === "annuel" ? "an" : "mois"}
                </span>
              </div>
              <ul>
                {AVANTAGES_STANDARD.map((avantage) => (
                  <li key={avantage}>{avantage}</li>
                ))}
              </ul>
              {formule === "standard" ? (
                <button type="button" className="btnm" style={{ width: "100%" }} disabled>
                  Formule actuelle
                </button>
              ) : (
                <button
                  type="button"
                  className="btnm gh"
                  style={{ width: "100%" }}
                  onClick={() => choisir("standard")}
                >
                  Choisir Standard
                </button>
              )}
            </div>
            <div className={`plan${formule === "premium" ? " cur" : ""}`}>
              {formule === "premium" && <span className="tag">Actuel</span>}
              <h4>Premium</h4>
              <div className="pr">
                {formatGNF(TARIFS.premium[periode])}{" "}
                <span style={{ fontSize: 11, color: "var(--muted)" }}>
                  /{periode === "annuel" ? "an" : "mois"}
                </span>
              </div>
              <ul>
                {AVANTAGES_PREMIUM.map((avantage, i) => (
                  <li key={avantage}>{i === 1 ? <b>{avantage}</b> : avantage}</li>
                ))}
              </ul>
              {formule === "premium" ? (
                <button type="button" className="btnm" style={{ width: "100%" }} disabled>
                  Formule actuelle
                </button>
              ) : (
                <button
                  type="button"
                  className="btnm gh"
                  style={{ width: "100%" }}
                  onClick={() => choisir("premium")}
                >
                  Choisir Premium
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ===== Version web (inchangée) ===== */}
      <div className="hidden md:block">
      <div className="mb-5">
        <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Mon abonnement</h2>
        <small className="text-[13px] text-muted">Votre présence sur Docteur 224</small>
      </div>

      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">Abonnement actuel</h3>
        <div className="flex items-center justify-between gap-[14px] py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">
              Formule {libelleFormule} · {libellePeriode}
            </b>
            <small className="text-xs text-muted">
              {finAbo ? `Jusqu'au ${finAbo}` : abonnement ? "Sans échéance" : "Aucun abonnement"}
            </small>
          </div>
          <span
            className={`rounded-lg px-[9px] py-1 text-[11px] font-bold ${etat.ok ? "bg-green-soft text-green" : "bg-red-soft text-red"}`}
          >
            {etat.label}
          </span>
        </div>
        <div className="flex items-start gap-[9px] rounded-xl bg-teal-soft px-[14px] py-3 text-[12.5px] font-semibold leading-relaxed text-blue">
          <span aria-hidden>ℹ️</span>
          <div>
            La prise de rendez-vous reste <b>gratuite pour vos patients</b>. Vous payez uniquement
            votre abonnement.
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-[14px] text-[15px] font-extrabold">Changer de formule</h3>
        {message && <p className="mb-2 text-[12.5px] font-bold text-green">{message}</p>}

        {/* Bascule Mensuel / Annuel */}
        <div className="mb-[10px] inline-flex overflow-hidden rounded-[10px] border border-line">
          <button
            type="button"
            onClick={() => setPeriodeVue("mensuel")}
            className={`px-4 py-2 text-[12.5px] font-bold ${
              periode === "mensuel" ? "bg-teal-soft text-blue" : "bg-white text-muted"
            }`}
          >
            Mensuel
          </button>
          <button
            type="button"
            onClick={() => setPeriodeVue("annuel")}
            className={`px-4 py-2 text-[12.5px] font-bold ${
              periode === "annuel" ? "bg-teal-soft text-blue" : "bg-white text-muted"
            }`}
          >
            Annuel (2 mois offerts)
          </button>
        </div>

        <div className="mt-1.5 grid gap-[14px] md:grid-cols-2">
          {/* Standard */}
          <div
            className={`relative rounded-[14px] border-[1.5px] p-4 ${
              formule === "standard" ? "border-teal shadow-[0_0_0_3px_var(--teal-soft)]" : "border-line"
            }`}
          >
            {formule === "standard" && (
              <span className="absolute -top-[10px] right-[14px] rounded-full bg-teal px-[10px] py-[3px] text-[10.5px] font-extrabold text-white">
                Actuel
              </span>
            )}
            <h4 className="text-[15px] font-extrabold">Standard</h4>
            <div className="my-1.5 text-[22px] font-extrabold text-blue">
              {formatGNF(TARIFS.standard[periode])}{" "}
              <span className="text-xs font-semibold text-muted">
                /{periode === "annuel" ? "an" : "mois"}
              </span>
            </div>
            <ul className="mb-3 mt-2">
              {AVANTAGES_STANDARD.map((avantage) => (
                <li key={avantage} className="relative py-1 pl-5 text-[12.5px]">
                  <span className="absolute left-0 font-extrabold text-green" aria-hidden>
                    ✓
                  </span>
                  {avantage}
                </li>
              ))}
            </ul>
            {formule === "standard" ? (
              <button
                type="button"
                disabled
                className="w-full cursor-default rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white"
              >
                Formule actuelle
              </button>
            ) : (
              <button
                type="button"
                onClick={() => choisir("standard")}
                className="w-full rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
              >
                Choisir Standard
              </button>
            )}
          </div>

          {/* Premium */}
          <div
            className={`relative rounded-[14px] border-[1.5px] p-4 ${
              formule === "premium" ? "border-teal shadow-[0_0_0_3px_var(--teal-soft)]" : "border-line"
            }`}
          >
            {formule === "premium" && (
              <span className="absolute -top-[10px] right-[14px] rounded-full bg-teal px-[10px] py-[3px] text-[10.5px] font-extrabold text-white">
                Actuel
              </span>
            )}
            <h4 className="text-[15px] font-extrabold">Premium</h4>
            <div className="my-1.5 text-[22px] font-extrabold text-blue">
              {formatGNF(TARIFS.premium[periode])}{" "}
              <span className="text-xs font-semibold text-muted">
                /{periode === "annuel" ? "an" : "mois"}
              </span>
            </div>
            <ul className="mb-3 mt-2">
              {AVANTAGES_PREMIUM.map((avantage, i) => (
                <li key={avantage} className="relative py-1 pl-5 text-[12.5px]">
                  <span className="absolute left-0 font-extrabold text-green" aria-hidden>
                    ✓
                  </span>
                  {i === 1 ? <b>{avantage}</b> : avantage}
                </li>
              ))}
            </ul>
            {formule === "premium" ? (
              <button
                type="button"
                disabled
                className="w-full cursor-default rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white"
              >
                Formule actuelle
              </button>
            ) : (
              <button
                type="button"
                onClick={() => choisir("premium")}
                className="w-full rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
              >
                Choisir Premium
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Rappels et crédits SMS : ce que l'abonnement finance vraiment côté
          patients, et de quoi recharger quand le quota du mois est épuisé. */}
      <div className="mt-4">
        <RappelsEtSms />
      </div>
      </div>
    </MedecinShell>
  );
}
