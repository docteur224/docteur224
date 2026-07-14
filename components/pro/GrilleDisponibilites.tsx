"use client";

import { useRef, useState } from "react";
import { capitaliser, depuisISO, formatDateLongue, JOURS_COURTS, versISO } from "@/lib/dates";
import { basculerCreneau, useAgenda } from "@/lib/pro";

/**
 * Grille de créneaux 30 min (08:00 → 20:00) à 3 états — reproduit le bloc
 * « Créneaux de consultation » des maquettes (couleurs exactes).
 * Partagée entre l'espace médecin et l'espace assistant(e) :
 * - `peutModifier` : si false, la bascule ouvert/fermé est désactivée ;
 * - `basculer` : l'action réelle — si elle est refusée (permissions),
 *   le message d'erreur est affiché.
 * Règle C.4.3 : les créneaux réservés sont verrouillés dans tous les cas.
 */
export default function GrilleDisponibilites({
  medecinId,
  peutModifier,
}: {
  medecinId: string;
  peutModifier: boolean;
}) {
  const { creneauxJour, recharger } = useAgenda(medecinId);
  const [dateISO, setDateISO] = useState(() => versISO(new Date()));
  const [message, setMessage] = useState("");
  const champDate = useRef<HTMLInputElement>(null);

  const creneaux = creneauxJour(dateISO);
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

      {/* Navigation de date */}
      <div className="mb-3 flex max-w-[480px] items-center gap-[9px]">
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

      {/* Pastilles de la semaine (le dimanche est grisé, cf. maquette) */}
      <div className="mb-1 flex flex-wrap gap-2">
        {semaine.map((d) => {
          const iso = versISO(d);
          const dimanche = d.getDay() === 0;
          const selectionne = iso === dateISO;
          return (
            <button
              key={iso}
              type="button"
              disabled={dimanche}
              onClick={() => setDateISO(iso)}
              className={`flex w-[52px] flex-col items-center rounded-[13px] border-[1.5px] py-2 ${
                selectionne ? "border-blue bg-blue" : "border-line bg-white"
              } ${dimanche ? "cursor-not-allowed opacity-40" : "cursor-pointer"}`}
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
          <i className="inline-block h-[13px] w-[13px] rounded border-[1.5px] border-[#9FE3C0] bg-[#E7F7EF]" />
          Ouvert
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-[13px] w-[13px] rounded border-[1.5px] border-[#DCE4E9] bg-[#F1F4F6]" />
          Fermé
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-[13px] w-[13px] rounded border-[1.5px] border-[#BBD9EE] bg-[repeating-linear-gradient(45deg,#EAF3FA,#EAF3FA_4px,#D5E8F5_4px,#D5E8F5_8px)]" />
          Réservé
        </span>
      </div>

      {message && (
        <div className="mb-3 rounded-xl border border-[#F3C9C2] bg-red-soft px-[14px] py-3 text-[12.5px] font-bold text-red">
          {message}
        </div>
      )}

      {/* Grille des 25 créneaux */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(82px,1fr))] gap-[9px]">
        {creneaux.map((creneau) => {
          if (creneau.statut === "reserve") {
            return (
              <button
                key={creneau.heure}
                type="button"
                title={`Réservé — ${creneau.patient}. Annulez d’abord le rendez-vous associé pour fermer ce créneau.`}
                className="cursor-not-allowed rounded-[11px] border-[1.5px] border-[#BBD9EE] bg-[repeating-linear-gradient(45deg,#EAF3FA,#EAF3FA_6px,#D5E8F5_6px,#D5E8F5_12px)] px-1 py-[10px] text-center text-[13.5px] font-extrabold text-[#15506B]"
              >
                {creneau.heure}
                <span className="mt-[3px] block text-[9px] font-bold uppercase tracking-[.04em] text-[#3E7CA6]">
                  Réservé
                </span>
              </button>
            );
          }
          const ouvert = creneau.statut === "ouvert";
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
                  ? "border-[#9FE3C0] bg-[#E7F7EF] text-[#16794A]"
                  : "border-[#DCE4E9] bg-[#F1F4F6] text-[#9AA8B2]"
              } ${
                peutModifier
                  ? ouvert
                    ? "hover:border-[#2BA86A]"
                    : "hover:border-[#9AA8B2]"
                  : "cursor-not-allowed opacity-60"
              }`}
            >
              {creneau.heure}
              <span
                className={`mt-[3px] block text-[9px] font-bold uppercase tracking-[.04em] ${
                  ouvert ? "text-[#2BA86A]" : "text-[#AEBCC4]"
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
