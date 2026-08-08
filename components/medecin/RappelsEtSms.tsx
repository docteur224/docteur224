"use client";

import { useState } from "react";
import Interrupteur from "@/components/patient/Interrupteur";
import DialoguePaiement from "@/components/pro/DialoguePaiement";
import { formatGNF } from "@/lib/format";
import { LIBELLES_STATUT, usePaiements } from "@/lib/paiements";
import { useRappelsEtSms, type PackSms, type PreferencesRappels } from "@/lib/pro";

/*
 * Rappels aux patients et crédits SMS.
 *
 * Deux idées à faire passer au professionnel, sans jargon :
 *
 * 1. Le SMS est à SA charge et coûte cher (150 GNF le segment) ; WhatsApp
 *    coûte une fraction du prix. D'où le SMS désactivé par défaut, et le
 *    coût affiché en face de l'interrupteur plutôt qu'enfoui dans une aide.
 * 2. Le quota se recharge s'il est épuisé — mais le crédit n'arrive qu'après
 *    règlement, validé par l'équipe. Rien ne s'attribue tout seul.
 *
 * Le clic sur une recharge ouvre le dialogue de paiement (migration 0041),
 * le même que pour l'abonnement. Avant, il posait une commande « en attente »
 * et répondait « le crédit sera ajouté dès réception du règlement » sans
 * jamais dire OÙ payer : 15 recharges s'y étaient accumulées, qu'aucun écran
 * d'administration ne montrait.
 */

const DELAIS = [
  { valeur: 2, label: "2 heures avant" },
  { valeur: 6, label: "6 heures avant" },
  { valeur: 24, label: "24 heures avant" },
  { valeur: 48, label: "48 heures avant" },
];

export default function RappelsEtSms() {
  const {
    preferences,
    etat,
    packs,
    achatEnAttente,
    historiqueAchats,
    enregistrerPreferences,
    recharger,
  } = useRappelsEtSms();
  const { moyens } = usePaiements();
  const [message, setMessage] = useState<string | null>(null);
  /** Recharge à régler : `null` = dialogue fermé. */
  const [aRegler, setARegler] = useState<{ pack: PackSms; reprise: boolean } | null>(null);

  async function changer(champ: keyof PreferencesRappels, valeur: boolean | number) {
    setMessage(null);
    const res = await enregistrerPreferences({ ...preferences, [champ]: valeur });
    setMessage(res.erreur ?? "Préférences enregistrées.");
  }

  /*
   * Reprendre une demande en cours suppose de retrouver son pack : le
   * dialogue affiche le nombre de SMS, qui ne vit pas dans la ligne d'achat
   * mais dans le catalogue. On le retrouve par les segments, stables — un
   * pack retarifé garde le même volume.
   */
  const packDeLAchat = achatEnAttente
    ? (packs.find((p) => p.segments === achatEnAttente.segments) ?? {
        id: "",
        nom: achatEnAttente.formule,
        segments: achatEnAttente.segments,
        prixGnf: achatEnAttente.montantGnf,
      })
    : null;

  const dateCourte = (iso: string) =>
    new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });

  const ligne = "flex items-center justify-between gap-3 border-b border-line py-[13px] last:border-b-0";
  const total = etat ? etat.restants + etat.credits : 0;
  const epuise = etat !== null && total === 0;

  return (
    <>
      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">Rappels aux patients</h3>
        <p className="mb-2 text-[12.5px] text-muted">
          Un patient prévenu se déplace. Les rappels partent d’abord par WhatsApp, bien moins cher
          que le SMS — vous choisissez si le SMS peut prendre le relais.
        </p>

        <div className={ligne}>
          <div>
            <b className="block text-[13.5px]">Envoyer des rappels</b>
            <small className="text-xs text-muted">Confirmation et rappel avant le rendez-vous</small>
          </div>
          <Interrupteur
            actif={preferences.rappelsActifs}
            onChange={(v) => changer("rappelsActifs", v)}
            label="Envoyer des rappels"
          />
        </div>

        <div className={ligne}>
          <div>
            <b className="block text-[13.5px]">Par WhatsApp</b>
            <small className="text-xs text-muted">Le canal le moins cher, et le plus lu</small>
          </div>
          <Interrupteur
            actif={preferences.whatsappAutorise}
            onChange={(v) => changer("whatsappAutorise", v)}
            label="Rappels WhatsApp"
          />
        </div>

        <div className={ligne}>
          <div>
            <b className="block text-[13.5px]">Par SMS</b>
            <small className="text-xs text-muted">
              Décompté de votre quota — pour les patients sans WhatsApp
            </small>
          </div>
          <Interrupteur
            actif={preferences.smsAutorise}
            onChange={(v) => changer("smsAutorise", v)}
            label="Rappels SMS"
          />
        </div>

        <div className={ligne}>
          <div>
            <b className="block text-[13.5px]">Quand prévenir</b>
          </div>
          <select
            aria-label="Délai du rappel"
            className="rounded-[9px] border border-line bg-white px-2 py-1.5 text-[12.5px]"
            value={preferences.delaiHeures}
            onChange={(e) => changer("delaiHeures", Number(e.target.value))}
          >
            {DELAIS.map((d) => (
              <option key={d.valeur} value={d.valeur}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        {!preferences.whatsappAutorise && !preferences.smsAutorise && preferences.rappelsActifs && (
          <p className="mt-3 text-[12px] font-semibold text-amber">
            Aucun canal actif : vos patients ne verront leurs rappels que dans l’application.
          </p>
        )}
        {message && <p className="mt-3 text-[12.5px] font-semibold text-blue">{message}</p>}
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">Crédits SMS</h3>
        {etat === null ? (
          <p className="text-[13px] text-muted">Disponible dès l’ouverture de votre abonnement.</p>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Quota du mois", valeur: etat.quota },
                { label: "Consommés", valeur: etat.consommes },
                { label: "Restants ce mois", valeur: etat.restants },
                { label: "Crédits achetés", valeur: etat.credits },
              ].map((c) => (
                <div key={c.label} className="rounded-xl bg-bg px-3 py-2">
                  <b className="block text-[17px] font-extrabold">{c.valeur.toLocaleString("fr-FR")}</b>
                  <small className="text-[11px] text-muted">{c.label}</small>
                </div>
              ))}
            </div>
            <p className="mb-3 text-[12.5px] text-muted">
              {etat.whatsapp > 0 && `${etat.whatsapp.toLocaleString("fr-FR")} message(s) WhatsApp ce mois-ci — hors quota. `}
              Les crédits achetés ne se périment pas au changement de mois.
            </p>
            {epuise && (
              <p className="mb-3 rounded-lg bg-red-soft px-3 py-2 text-[12.5px] font-semibold text-red">
                Quota épuisé : plus aucun SMS ne partira ce mois-ci sans recharge.
              </p>
            )}
            {achatEnAttente && packDeLAchat && (
              <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border-[1.5px] border-amber bg-amber-soft px-3 py-2.5">
                <span aria-hidden>⏳</span>
                <div className="min-w-0 flex-1">
                  <b className="block text-[12.5px] font-extrabold text-amber">
                    Recharge de {achatEnAttente.segments.toLocaleString("fr-FR")} SMS en attente de
                    règlement
                  </b>
                  <small className="text-[11.5px] font-semibold text-amber">
                    {formatGNF(achatEnAttente.montantGnf)}
                    {achatEnAttente.reference ? ` · réf. ${achatEnAttente.reference}` : ""} — les
                    crédits arrivent dès que le versement est confirmé.
                  </small>
                </div>
                <button
                  type="button"
                  onClick={() => setARegler({ pack: packDeLAchat, reprise: true })}
                  className="rounded-[9px] bg-amber px-[14px] py-2 text-[12px] font-bold text-white transition-opacity hover:opacity-90"
                >
                  Instructions de paiement
                </button>
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {packs.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setARegler({ pack: p, reprise: false })}
                  className="flex items-center justify-between rounded-xl border-[1.5px] border-line bg-white px-3 py-2.5 text-left transition-colors hover:border-teal"
                >
                  <span>
                    <b className="block text-[13px]">{p.nom}</b>
                    <small className="text-[11px] text-muted">
                      {Math.round(p.prixGnf / p.segments)} GNF le SMS
                    </small>
                  </span>
                  <span className="text-[13px] font-extrabold text-teal">{formatGNF(p.prixGnf)}</span>
                </button>
              ))}
            </div>

            {historiqueAchats.length > 0 && (
              <div className="mt-3 border-t border-line pt-2">
                <b className="mb-1 block text-[12px] font-extrabold text-muted">Mes recharges</b>
                {historiqueAchats.map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center gap-3 py-1.5">
                    <div className="min-w-0 flex-1">
                      <b className="block text-[12.5px]">
                        {a.segments.toLocaleString("fr-FR")} SMS · {formatGNF(a.montantGnf)}
                      </b>
                      <small className="text-[11px] text-muted">
                        {dateCourte(a.creeLe)}
                        {a.reference ? ` · réf. ${a.reference}` : ""}
                        {a.motifRefus ? ` · ${a.motifRefus}` : ""}
                      </small>
                    </div>
                    <span
                      className={`rounded-lg px-[9px] py-1 text-[11px] font-bold ${
                        a.statut === "confirme"
                          ? "bg-green-soft text-green"
                          : a.statut === "refuse"
                            ? "bg-red-soft text-red"
                            : "bg-bg text-muted"
                      }`}
                    >
                      {a.statut === "confirme" ? "Créditée" : LIBELLES_STATUT[a.statut]}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {aRegler && (
        <DialoguePaiement
          achat={{
            type: "recharge",
            packId: aRegler.pack.id,
            libelle: aRegler.pack.nom,
            segments: aRegler.pack.segments,
            montantGnf: aRegler.pack.prixGnf,
          }}
          moyens={moyens}
          reprise={aRegler.reprise ? achatEnAttente : null}
          onFermer={() => setARegler(null)}
          apres={recharger}
        />
      )}
    </>
  );
}
