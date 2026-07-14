"use client";

import Link from "next/link";
import { useState } from "react";
import AssistantShell from "@/components/assistant/AssistantShell";
import { capitaliser, depuisISO, formatDateLongue, versISO } from "@/lib/dates";
import {
  majStatutRdv,
  reprogrammerRdv,
  useAgenda,
  useContextePro,
} from "@/lib/pro";

/*
 * Rendez-vous (assistant(e)) — reproduit l'écran « asst-agenda » de la
 * maquette web : liste du jour avec Reprogrammer / Annuler.
 * Les permissions viennent de la table `assistants` ; la RLS refuse
 * réellement l'écriture si une permission est retirée par le médecin.
 */
export default function RendezVousAssistant() {
  const { medecin, permissions } = useContextePro();
  const { creneauxJour, recharger } = useAgenda(medecin?.id);
  const [dateISO, setDateISO] = useState(() => versISO(new Date()));
  const [erreur, setErreur] = useState("");
  const [enReprogrammation, setEnReprogrammation] = useState<string | null>(null);

  const creneaux = creneauxJour(dateISO);
  const rdvJour = creneaux.filter((c) => c.statut === "reserve");
  const creneauxLibres = creneaux.filter((c) => c.statut === "ouvert");

  function decaler(jours: number) {
    const d = depuisISO(dateISO);
    d.setDate(d.getDate() + jours);
    setDateISO(versISO(d));
    setEnReprogrammation(null);
  }

  async function annuler(heure: string) {
    if (!permissions.confirmerAnnuler) {
      setErreur(
        "⛔ Action refusée : la permission « Confirmer / annuler les rendez-vous » ne vous a pas été accordée par le médecin."
      );
      return;
    }
    const id = rdvJour.find((c) => c.heure === heure)?.rdvId;
    if (!id) return;
    if (!window.confirm("Annuler ce rendez-vous ?")) return;
    const resultat = await majStatutRdv(id, "annule");
    setErreur(resultat.erreur ?? "");
    if (!resultat.erreur) recharger();
  }

  async function reprogrammer(heureActuelle: string, nouvelleHeure: string) {
    const id = rdvJour.find((c) => c.heure === heureActuelle)?.rdvId;
    if (!id) return;
    const resultat = await reprogrammerRdv(id, dateISO, nouvelleHeure);
    setErreur(resultat.erreur ?? "");
    if (!resultat.erreur) {
      setEnReprogrammation(null);
      recharger();
    }
  }

  function ouvrirReprogrammation(heure: string) {
    if (!permissions.reprogrammer) {
      setErreur(
        "⛔ Action refusée : la permission « Reprogrammer un rendez-vous » ne vous a pas été accordée par le médecin."
      );
      return;
    }
    setErreur("");
    setEnReprogrammation(enReprogrammation === heure ? null : heure);
  }

  const peutCreer = permissions.creerRdv;

  return (
    <AssistantShell>
      {/* ===== Version mobile (écran « m-asst-agenda » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <div className="appbar">
          <div>
            <h3 style={{ paddingLeft: 4 }}>Rendez-vous</h3>
            <div className="sub" style={{ paddingLeft: 4 }}>
              {capitaliser(formatDateLongue(dateISO))}
            </div>
          </div>
          {peutCreer ? (
            <Link href="/espace-assistant/nouveau-rdv" className="btnm" style={{ marginLeft: "auto" }}>
              + RDV
            </Link>
          ) : (
            <span
              className="btnm"
              style={{ marginLeft: "auto", opacity: 0.5 }}
              title="Permission « Créer un rendez-vous pour un patient » non accordée"
            >
              + RDV 🔒
            </span>
          )}
        </div>
        <div className="pad" style={{ paddingTop: 8 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button type="button" className="btnm gh" onClick={() => decaler(-1)}>
              ‹ Hier
            </button>
            <button
              type="button"
              className="btnm gh"
              style={{ flex: 1 }}
              onClick={() => setDateISO(versISO(new Date()))}
            >
              Aujourd&apos;hui
            </button>
            <button type="button" className="btnm gh" onClick={() => decaler(1)}>
              Demain ›
            </button>
          </div>
          <div className="abannerm">
            <span aria-hidden>🔒</span>
            <div>
              Vous confirmez, annulez ou reprogrammez les RDV. Le dossier médical reste réservé au
              médecin.
            </div>
          </div>
          {erreur && (
            <div className="noteboxm" style={{ marginBottom: 12, background: "var(--red-soft)", borderColor: "#F3C9C2", color: "var(--red)" }}>
              <div>{erreur}</div>
            </div>
          )}
          {rdvJour.map((creneau) => {
            const reel = true;
            return (
              <div key={creneau.heure}>
                <div className="aptm">
                  <div className="tm">{creneau.heure}</div>
                  <div className="meta">
                    <b>{creneau.patient}</b>
                    <small>
                      {creneau.motif}
                      
                    </small>
                  </div>
                  <div className="acts">
                    <button
                      type="button"
                      className="btnm gh"
                      disabled={!reel}
                      style={reel && permissions.reprogrammer ? undefined : { opacity: 0.5 }}
                      onClick={() => ouvrirReprogrammation(creneau.heure)}
                    >
                      Décaler
                    </button>
                    <button
                      type="button"
                      className="btnm dg"
                      disabled={!reel}
                      style={reel && permissions.confirmerAnnuler ? undefined : { opacity: 0.5 }}
                      onClick={() => annuler(creneau.heure)}
                    >
                      Annuler
                    </button>
                  </div>
                </div>
                {enReprogrammation === creneau.heure && (
                  <div className="addbene" style={{ marginBottom: 9 }}>
                    <div className="flabel">Choisir un nouvel horaire (même journée) :</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {creneauxLibres.map((libre) => (
                        <button
                          key={libre.heure}
                          type="button"
                          className="btnm gh"
                          onClick={() => reprogrammer(creneau.heure, libre.heure)}
                        >
                          {libre.heure}
                        </button>
                      ))}
                      {creneauxLibres.length === 0 && (
                        <p className="muted" style={{ fontSize: 11.5 }}>
                          Aucun créneau libre ce jour.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {rdvJour.length === 0 && (
            <p className="muted" style={{ fontSize: 13 }}>
              Aucun rendez-vous ce jour.
            </p>
          )}
        </div>
      </div>

      {/* ===== Version web (inchangée) ===== */}
      <div className="hidden md:block">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Rendez-vous</h2>
          <small className="text-[13px] text-muted">
            Confirmer, annuler ou reprogrammer — sans accès au dossier médical
          </small>
        </div>
        <div className="flex flex-wrap gap-2">
          {peutCreer ? (
            <Link
              href="/espace-assistant/nouveau-rdv"
              className="rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
            >
              + Nouveau RDV
            </Link>
          ) : (
            <span
              title="Permission « Créer un rendez-vous pour un patient » non accordée"
              className="cursor-not-allowed rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white opacity-50"
            >
              + Nouveau RDV 🔒
            </span>
          )}
          <button
            type="button"
            onClick={() => decaler(-1)}
            className="rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
          >
            ‹ Hier
          </button>
          <button
            type="button"
            onClick={() => setDateISO(versISO(new Date()))}
            className="rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
          >
            Aujourd’hui
          </button>
          <button
            type="button"
            onClick={() => decaler(1)}
            className="rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
          >
            Demain ›
          </button>
        </div>
      </div>

      <div className="mb-[18px] flex items-start gap-[9px] rounded-xl border border-[#BFE0EF] bg-teal-soft px-[14px] py-3 text-[12.5px] font-semibold leading-relaxed text-blue">
        <span aria-hidden>🔒</span>
        <div>
          Vous voyez le <b>nom</b>, le <b>motif</b> et le <b>contact</b> du patient pour organiser
          le rendez-vous. L’historique médical reste réservé au médecin.
        </div>
      </div>

      {erreur && (
        <div className="mb-4 rounded-xl border border-[#F3C9C2] bg-red-soft px-[14px] py-3 text-[12.5px] font-bold text-red">
          {erreur}
        </div>
      )}

      <div className="rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-[14px] text-[15px] font-extrabold">
          {capitaliser(formatDateLongue(dateISO))}
        </h3>
        {rdvJour.map((creneau) => {
          const reel = true;
          return (
            <div key={creneau.heure} className="mb-[10px] last:mb-0">
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-[13px]">
                <span className="flex-none rounded-[9px] bg-teal-soft px-[11px] py-[9px] text-[13px] font-extrabold text-blue">
                  {creneau.heure}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block text-[13.5px]">{creneau.patient}</b>
                  <small className="text-xs text-muted">
                    {creneau.motif}
                    
                  </small>
                </span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    disabled={!reel}
                    title={
                      reel
                        ? undefined
                        : "Rendez-vous de démonstration — réservez un vrai RDV pour tester"
                    }
                    onClick={() => ouvrirReprogrammation(creneau.heure)}
                    className={`rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg ${
                      reel && permissions.reprogrammer ? "" : "cursor-not-allowed opacity-50"
                    }`}
                  >
                    Reprogrammer
                  </button>
                  <button
                    type="button"
                    disabled={!reel}
                    title={
                      reel
                        ? undefined
                        : "Rendez-vous de démonstration — réservez un vrai RDV pour tester"
                    }
                    onClick={() => annuler(creneau.heure)}
                    className={`rounded-[9px] border-[1.5px] border-[#F3C9C2] bg-white px-[14px] py-2 text-[12.5px] font-bold text-red transition-colors hover:bg-red-soft ${
                      reel && permissions.confirmerAnnuler ? "" : "cursor-not-allowed opacity-50"
                    }`}
                  >
                    Annuler
                  </button>
                </span>
              </div>
              {enReprogrammation === creneau.heure && (
                <div className="mt-2 rounded-xl border border-dashed border-line bg-[#FAFCFD] p-3">
                  <div className="mb-2 text-[12.5px] font-bold">
                    Choisir un nouvel horaire (même journée) :
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {creneauxLibres.map((libre) => (
                      <button
                        key={libre.heure}
                        type="button"
                        onClick={() => reprogrammer(creneau.heure, libre.heure)}
                        className="rounded-[10px] border-[1.5px] border-line bg-white px-3 py-2 text-[12.5px] font-bold text-blue hover:border-teal"
                      >
                        {libre.heure}
                      </button>
                    ))}
                    {creneauxLibres.length === 0 && (
                      <p className="text-xs text-muted">Aucun créneau libre ce jour.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {rdvJour.length === 0 && (
          <p className="text-[13px] text-muted">Aucun rendez-vous ce jour.</p>
        )}
      </div>
      </div>
    </AssistantShell>
  );
}
