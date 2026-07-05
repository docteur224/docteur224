"use client";

import Link from "next/link";
import { useState } from "react";
import AssistantShell from "@/components/assistant/AssistantShell";
import { capitaliser, depuisISO, formatDateLongue, versISO } from "@/lib/dates";
import { medecinConnecte } from "@/lib/mock-data";
import {
  creneauxJourMedecin,
  creneauxJourPatient,
  useExceptionsLocales,
} from "@/lib/mock-disponibilites";
import { useRendezVousLocaux } from "@/lib/mock-rdv";
import {
  assistanteAnnuleRdv,
  assistantePeutCreerRdv,
  assistanteReprogrammeRdv,
} from "@/lib/actions-assistante";
import { usePermissionsAssistante } from "@/lib/mock-medecin";

/*
 * Rendez-vous (assistant(e)) — reproduit l'écran « asst-agenda » de la
 * maquette web : liste du jour avec Reprogrammer / Annuler.
 * Chaque action repasse par la garde de permissions (lib/actions-assistante) :
 * si le médecin retire une permission, l'action est réellement refusée,
 * pas seulement masquée.
 */
export default function RendezVousAssistant() {
  const rdvs = useRendezVousLocaux();
  const exceptions = useExceptionsLocales();
  const permissions = usePermissionsAssistante();
  const [dateISO, setDateISO] = useState(() => versISO(new Date()));
  const [erreur, setErreur] = useState("");
  const [enReprogrammation, setEnReprogrammation] = useState<string | null>(null);

  const rdvJour = creneauxJourMedecin(medecinConnecte.id, dateISO, exceptions, rdvs).filter(
    (c) => c.statut === "reserve"
  );
  const creneauxLibres = creneauxJourPatient(medecinConnecte.id, dateISO, exceptions, rdvs).filter(
    (c) => c.statut === "ouvert"
  );

  function idRdvReel(heure: string): string | undefined {
    return rdvs.find(
      (r) =>
        r.medecinId === medecinConnecte.id &&
        r.date === dateISO &&
        r.heure === heure &&
        r.statut === "confirme"
    )?.id;
  }

  function decaler(jours: number) {
    const d = depuisISO(dateISO);
    d.setDate(d.getDate() + jours);
    setDateISO(versISO(d));
    setEnReprogrammation(null);
  }

  function annuler(heure: string) {
    const id = idRdvReel(heure);
    if (!id) return;
    if (!window.confirm("Annuler ce rendez-vous ?")) return;
    const resultat = assistanteAnnuleRdv(id);
    setErreur(resultat.ok ? "" : (resultat.erreur ?? ""));
  }

  function reprogrammer(heureActuelle: string, nouvelleHeure: string) {
    const id = idRdvReel(heureActuelle);
    if (!id) return;
    const resultat = assistanteReprogrammeRdv(id, dateISO, nouvelleHeure);
    setErreur(resultat.ok ? "" : (resultat.erreur ?? ""));
    if (resultat.ok) setEnReprogrammation(null);
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

  const peutCreer = assistantePeutCreerRdv().ok;

  return (
    <AssistantShell>
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
          const reel = creneau.demo === false;
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
                    {reel ? " · réservé en ligne" : " · démonstration"}
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
    </AssistantShell>
  );
}
