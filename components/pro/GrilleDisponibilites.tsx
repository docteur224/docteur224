"use client";

import { useRef, useState } from "react";
import {
  capitaliser,
  creneauPasse,
  depuisISO,
  formatDateLongue,
  JOURS_COURTS,
  jourPasse,
  versISO,
} from "@/lib/dates";
import { basculerCreneau, useAgenda } from "@/lib/pro";

/**
 * Grille de créneaux 30 min (08:00 → 20:00) à 3 états — reproduit le bloc
 * « Créneaux de consultation » des maquettes (couleurs exactes).
 * Partagée entre l'espace médecin et l'espace assistant(e) :
 * - `peutModifier` : si false, la bascule ouvert/fermé est désactivée ;
 * - `basculer` : l'action réelle — si elle est refusée (permissions),
 *   le message d'erreur est affiché.
 * Règle C.4.3 : les créneaux réservés sont verrouillés dans tous les cas.
 * Le passé l'est également : on consulte librement une journée écoulée — c'est
 * utile pour vérifier ce qui avait été ouvert — mais on ne la réécrit pas.
 */
/** Choix proposés pour la fenêtre de réservation (en mois). */
const HORIZONS_MOIS = [1, 2, 3, 4, 5, 6, 9, 12];

export default function GrilleDisponibilites({
  medecinId,
  peutModifier,
  horizonMois,
  onChangeHorizon,
}: {
  medecinId: string;
  peutModifier: boolean;
  /**
   * Fenêtre de réservation du médecin, en mois. Fournie uniquement sur l'écran
   * du praticien (migration 0089) : avec `onChangeHorizon`, affiche le
   * sélecteur. Omise (écran assistant), rien ne s'affiche.
   */
  horizonMois?: number;
  onChangeHorizon?: (mois: number) => void;
}) {
  const { creneauxJour, recharger } = useAgenda(medecinId);
  const [dateISO, setDateISO] = useState(() => versISO(new Date()));
  const [message, setMessage] = useState("");
  const champDate = useRef<HTMLInputElement>(null);

  const creneaux = creneauxJour(dateISO);
  const journeePassee = jourPasse(dateISO);
  const dateCourante = depuisISO(dateISO);
  const lundi = new Date(dateCourante);
  lundi.setDate(lundi.getDate() - ((lundi.getDay() + 6) % 7));
  const semaine = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lundi);
    d.setDate(lundi.getDate() + i);
    return d;
  });

  function decalerSemaine(sens: number) {
    const d = depuisISO(dateISO);
    d.setDate(d.getDate() + sens * 7);
    setDateISO(versISO(d));
  }

  function ouvrirCalendrier() {
    const champ = champDate.current;
    if (!champ) return;
    try {
      champ.showPicker();
    } catch {
      champ.click();
    }
  }

  async function cliquerCreneau(heure: string) {
    if (creneauPasse(dateISO, heure)) {
      setMessage("Créneau passé — il n'est plus modifiable.");
      return;
    }
    const statut = creneaux.find((c) => c.heure === heure)?.statut ?? "ouvert";
    const resultat = await basculerCreneau(medecinId, dateISO, heure, statut);
    setMessage(resultat.erreur ?? "");
    if (!resultat.erreur) recharger();
  }

  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <h3 className="mb-2 text-[15px] font-extrabold">Créneaux de consultation · 30 min</h3>
      <p className="mb-[14px] text-[12.5px] text-muted">
        Cliquez sur un créneau pour le <b>fermer</b> (indisponible) ou le <b>rouvrir</b>. Les
        créneaux déjà réservés ne peuvent pas être fermés.
      </p>

      {/* Navigation de date + fenêtre de réservation (à droite) */}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex w-full max-w-[480px] items-center gap-[9px]">
          <button
            type="button"
            onClick={() => decalerSemaine(-1)}
            aria-label="Semaine précédente"
            className="h-[46px] w-10 flex-none rounded-xl border-[1.5px] border-line bg-white text-xl font-extrabold text-blue hover:bg-bg"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={ouvrirCalendrier}
            className="relative flex-1 rounded-xl border-[1.5px] border-line bg-teal-soft px-3 py-[7px] text-center hover:border-teal"
          >
            <span className="block text-sm font-extrabold text-blue">
              {capitaliser(formatDateLongue(dateISO))}
            </span>
            <span className="block text-[10px] font-semibold text-muted">
              📅 Cliquez pour choisir une date
            </span>
            <input
              ref={champDate}
              type="date"
              value={dateISO}
              onChange={(e) => e.target.value && setDateISO(e.target.value)}
              className="pointer-events-none absolute h-px w-px opacity-0"
              tabIndex={-1}
              aria-hidden
            />
          </button>
          <button
            type="button"
            onClick={() => decalerSemaine(1)}
            aria-label="Semaine suivante"
            className="h-[46px] w-10 flex-none rounded-xl border-[1.5px] border-line bg-white text-xl font-extrabold text-blue hover:bg-bg"
          >
            ›
          </button>
        </div>

        {/* Fenêtre de réservation — réglage côté praticien (migration 0089).
            Affiché seulement si l'écran fournit l'horizon et un gestionnaire. */}
        {horizonMois !== undefined && onChangeHorizon && (
          <div className="min-w-[230px] flex-1 rounded-xl border-[1.5px] border-line bg-white px-[14px] py-[9px]">
            <label
              htmlFor="horizon-reservation"
              className="block text-[12.5px] font-extrabold text-ink"
            >
              Fenêtre de réservation
            </label>
            <div className="mt-[6px] flex items-center gap-2">
              <span className="text-[12px] font-semibold text-muted">Réservable jusqu’à</span>
              <select
                id="horizon-reservation"
                value={horizonMois}
                onChange={(e) => onChangeHorizon(Number(e.target.value))}
                className="rounded-lg border-[1.5px] border-line bg-white px-2 py-[6px] text-[12.5px] font-bold text-blue hover:border-teal focus:border-teal focus:outline-none"
              >
                {HORIZONS_MOIS.map((m) => (
                  <option key={m} value={m}>
                    {m} mois
                  </option>
                ))}
              </select>
              <span className="text-[12px] font-semibold text-muted">à l’avance</span>
            </div>
            <p className="mt-[6px] text-[11px] leading-snug text-muted">
              Les patients ne voient vos créneaux que jusqu’à cette échéance. Vous pouvez toujours
              ouvrir un créneau au-delà manuellement.
            </p>
          </div>
        )}
      </div>

      {/* Pastilles de la semaine (le dimanche est grisé, cf. maquette) */}
      <div className="mb-1 flex flex-wrap gap-2">
        {semaine.map((d) => {
          const iso = versISO(d);
          const dimanche = d.getDay() === 0;
          const passe = jourPasse(iso);
          const selectionne = iso === dateISO;
          return (
            <button
              key={iso}
              type="button"
              disabled={dimanche}
              onClick={() => setDateISO(iso)}
              className={`flex w-[52px] flex-col items-center rounded-[13px] border-[1.5px] py-2 ${
                selectionne ? "border-blue bg-blue" : "border-line bg-white"
              } ${
                dimanche
                  ? "cursor-not-allowed opacity-40"
                  : passe && !selectionne
                    ? "cursor-pointer opacity-55"
                    : "cursor-pointer"
              }`}
            >
              <span
                className={`text-[10px] font-bold uppercase ${
                  selectionne ? "text-white" : "text-muted"
                }`}
              >
                {JOURS_COURTS[d.getDay()]}
              </span>
              <span
                className={`text-[15px] font-extrabold ${selectionne ? "text-white" : "text-ink"}`}
              >
                {d.getDate()}
              </span>
            </button>
          );
        })}
      </div>

      {/* Légende (couleurs exactes de la maquette) */}
      <div className="my-[14px] flex flex-wrap gap-4 text-[11.5px] font-semibold text-muted">
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-[13px] w-[13px] rounded border-[1.5px] border-green-line bg-green-soft" />
          Ouvert
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-[13px] w-[13px] rounded border-[1.5px] border-line bg-bg" />
          Fermé
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-[13px] w-[13px] rounded border-[1.5px] border-teal-line bg-[repeating-linear-gradient(45deg,var(--teal-soft),var(--teal-soft)_4px,var(--teal-line)_4px,var(--teal-line)_8px)]" />
          Réservé
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-[13px] w-[13px] rounded border-[1.5px] border-dashed border-line bg-card" />
          Passé
        </span>
      </div>

      {journeePassee && (
        <div className="mb-3 rounded-xl border border-line bg-bg px-[14px] py-3 text-[12.5px] font-semibold text-muted">
          Journée écoulée — consultation seule, les créneaux ne sont plus modifiables.
        </div>
      )}

      {message && (
        <div className="mb-3 rounded-xl border border-red-line bg-red-soft px-[14px] py-3 text-[12.5px] font-bold text-red">
          {message}
        </div>
      )}

      {/* Grille des 25 créneaux */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(82px,1fr))] gap-[9px]">
        {creneaux.map((creneau) => {
          const passe = creneauPasse(dateISO, creneau.heure);
          if (creneau.statut === "reserve") {
            return (
              <button
                key={creneau.heure}
                type="button"
                title={`Réservé — ${creneau.patient}. Annulez d’abord le rendez-vous associé pour fermer ce créneau.`}
                className="cursor-not-allowed rounded-[11px] border-[1.5px] border-teal-line bg-[repeating-linear-gradient(45deg,var(--teal-soft),var(--teal-soft)_6px,var(--teal-line)_6px,var(--teal-line)_12px)] px-1 py-[10px] text-center text-[13.5px] font-extrabold text-blue"
              >
                {creneau.heure}
                <span className="mt-[3px] block text-[9px] font-bold uppercase tracking-[.04em] text-teal">
                  Réservé
                </span>
              </button>
            );
          }
          const ouvert = creneau.statut === "ouvert";
          if (passe) {
            // Ni ouvert ni fermé à l'écran : l'état d'un créneau écoulé n'a
            // plus d'effet, l'afficher en vert inviterait à cliquer pour rien.
            return (
              <button
                key={creneau.heure}
                type="button"
                disabled
                title="Créneau passé — il n'est plus modifiable."
                className="cursor-not-allowed rounded-[11px] border-[1.5px] border-dashed border-line bg-card px-1 py-[10px] text-center text-[13.5px] font-extrabold text-muted-soft"
              >
                {creneau.heure}
                <span className="mt-[3px] block text-[9px] font-bold uppercase tracking-[.04em] text-line">
                  Passé
                </span>
              </button>
            );
          }
          return (
            <button
              key={creneau.heure}
              type="button"
              disabled={!peutModifier}
              title={
                peutModifier
                  ? undefined
                  : "Permission « Ouvrir / fermer des créneaux » non accordée"
              }
              onClick={() => cliquerCreneau(creneau.heure)}
              className={`rounded-[11px] border-[1.5px] px-1 py-[10px] text-center text-[13.5px] font-extrabold transition-colors ${
                ouvert
                  ? "border-green-line bg-green-soft text-green"
                  : "border-line bg-bg text-muted-soft"
              } ${
                peutModifier
                  ? ouvert
                    ? "hover:border-green"
                    : "hover:border-muted-soft"
                  : "cursor-not-allowed opacity-60"
              }`}
            >
              {creneau.heure}
              <span
                className={`mt-[3px] block text-[9px] font-bold uppercase tracking-[.04em] ${
                  ouvert ? "text-green" : "text-muted-soft"
                }`}
              >
                {ouvert ? "Ouvert" : "Fermé"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
