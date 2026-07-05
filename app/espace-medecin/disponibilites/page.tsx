"use client";

import { useRef, useState } from "react";
import MedecinShell from "@/components/medecin/MedecinShell";
import {
  capitaliser,
  depuisISO,
  formatDateLongue,
  JOURS_COURTS,
  versISO,
} from "@/lib/dates";
import { medecinConnecte } from "@/lib/mock-data";
import {
  basculerCreneauLocal,
  creneauxJourMedecin,
  useExceptionsLocales,
} from "@/lib/mock-disponibilites";
import { useRendezVousLocaux } from "@/lib/mock-rdv";

/*
 * Mes disponibilités — reproduit l'écran « med-dispos » de la maquette web :
 * jours d'ouverture, grille de créneaux de 30 min (08:00 → 20:00) avec les
 * 3 états Ouvert / Fermé / Réservé et leurs couleurs exactes.
 * Règle C.4.3 : un créneau réservé est verrouillé tant que le rendez-vous
 * associé n'est pas annulé. Les modifications (exceptions par date) sont
 * visibles immédiatement côté patient (même modèle de données).
 */

const JOURS_OUVERTURE = [
  { jour: "Lun", heures: ["08:00", "17:00"] },
  { jour: "Mar", heures: ["08:00", "17:00"] },
  { jour: "Mer", heures: ["08:00", "13:00"] },
  { jour: "Jeu", heures: ["08:00", "17:00"] },
  { jour: "Ven", heures: ["08:00", "17:00"] },
  { jour: "Sam", heures: ["09:00", "13:00"] },
  { jour: "Dim", heures: null },
];

function lundiDe(d: Date): Date {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

export default function Disponibilites() {
  const rdvs = useRendezVousLocaux();
  const exceptions = useExceptionsLocales();
  const [dateISO, setDateISO] = useState(() => versISO(new Date()));
  const champDate = useRef<HTMLInputElement>(null);

  const creneaux = creneauxJourMedecin(medecinConnecte.id, dateISO, exceptions, rdvs);
  const dateCourante = depuisISO(dateISO);
  const lundi = lundiDe(dateCourante);
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

  return (
    <MedecinShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Mes disponibilités</h2>
          <small className="text-[13px] text-muted">
            Ouvrez ou fermez vos créneaux de consultation
          </small>
        </div>
        <span className="text-[12.5px] font-bold text-green">
          ✓ Modifications enregistrées automatiquement
        </span>
      </div>

      {/* Jours d'ouverture (horaire-type hebdomadaire) */}
      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-[14px] text-[15px] font-extrabold">Jours d’ouverture</h3>
        <div className="grid grid-cols-4 gap-[10px] sm:grid-cols-7">
          {JOURS_OUVERTURE.map((j) => (
            <div
              key={j.jour}
              className={`rounded-[13px] border border-line bg-white px-2 py-3 text-center ${
                j.heures === null ? "opacity-55" : ""
              }`}
            >
              <b className="mb-[9px] block text-[12.5px] font-extrabold">{j.jour}</b>
              {j.heures === null ? (
                <span className="text-[11px] text-muted">Fermé</span>
              ) : (
                j.heures.map((h) => (
                  <div
                    key={h}
                    className="mb-[5px] rounded-[7px] bg-teal-soft py-[5px] text-[11px] font-bold text-blue"
                  >
                    {h}
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Grille de créneaux */}
      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
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
                onClick={() => basculerCreneauLocal(medecinConnecte.id, dateISO, creneau.heure)}
                className={`rounded-[11px] border-[1.5px] px-1 py-[10px] text-center text-[13.5px] font-extrabold transition-colors ${
                  ouvert
                    ? "border-[#9FE3C0] bg-[#E7F7EF] text-[#16794A] hover:border-[#2BA86A]"
                    : "border-[#DCE4E9] bg-[#F1F4F6] text-[#9AA8B2] hover:border-[#9AA8B2]"
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

      {/* Congés et absences (démonstration) */}
      <div className="rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">Congés et absences</h3>
        <div className="flex items-center justify-between gap-[14px] border-b border-line py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">Vacances annuelles</b>
            <small className="text-xs text-muted">Du 1 au 15 août 2026</small>
          </div>
          <span className="rounded-lg bg-amber-soft px-[9px] py-1 text-[11px] font-bold text-amber">
            Programmé
          </span>
        </div>
        <div className="flex items-center justify-between gap-[14px] py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">Jour de congé</b>
            <small className="text-xs text-muted">Chaque dimanche</small>
          </div>
          <span className="rounded-lg bg-green-soft px-[9px] py-1 text-[11px] font-bold text-green">
            Récurrent
          </span>
        </div>
        <button
          type="button"
          disabled
          title="Disponible dans une phase ultérieure"
          className="mt-[14px] cursor-not-allowed rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue opacity-50"
        >
          + Ajouter une absence
        </button>
      </div>
    </MedecinShell>
  );
}
