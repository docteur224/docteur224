"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { prochainsJours } from "@/lib/dates";
import { useDisponibilites } from "@/lib/disponibilites";
import { formatGNF } from "@/lib/format";

/**
 * Panneau « Réserver un rendez-vous » de la fiche médecin — reproduit la
 * .bookcard de la maquette web : bandeau de dates, grille d'horaires
 * (barrés si réservés), bouton qui s'active à la sélection d'un horaire.
 *
 * Les créneaux viennent du modèle de disponibilités PARTAGÉ avec l'espace
 * médecin : seuls les créneaux « ouverts » sont réservables, les « fermés »
 * n'apparaissent pas (spec C.4.2), et une fermeture côté médecin se reflète
 * immédiatement ici.
 */
export default function PanneauReservation({
  medecinId,
  tarif,
  joursFermes,
}: {
  medecinId: string;
  tarif: number;
  joursFermes: number[];
}) {
  const { chargement, creneauxJour } = useDisponibilites(medecinId);
  const jours = useMemo(() => prochainsJours(joursFermes, 5), [joursFermes]);
  const premierOuvert = jours.find((j) => !j.ferme)?.iso ?? jours[0]?.iso ?? "";
  const [jourISO, setJourISO] = useState(premierOuvert);
  const [heure, setHeure] = useState<string | null>(null);

  const creneaux = chargement ? [] : creneauxJour(jourISO);

  return (
    <div className="rounded-[18px] border border-line bg-white p-[22px] shadow-[0_8px_22px_rgba(16,59,80,.06)] lg:sticky lg:top-[86px]">
      <div className="mb-1 flex items-baseline justify-between">
        <b className="text-[15px] font-extrabold">Réserver un rendez-vous</b>
        <span className="text-[15px] font-extrabold text-blue">{formatGNF(tarif)}</span>
      </div>
      <div className="mb-4 text-xs text-muted">Choisissez une date et un horaire disponibles.</div>

      {/* Bandeau de dates */}
      <div className="flex gap-2 overflow-auto pb-2">
        {jours.map((j) => {
          const selectionne = j.iso === jourISO;
          return (
            <button
              key={j.iso}
              type="button"
              disabled={j.ferme}
              onClick={() => {
                setJourISO(j.iso);
                setHeure(null);
              }}
              className={`w-[58px] flex-none rounded-xl border py-[10px] text-center transition ${
                selectionne
                  ? "border-blue bg-blue"
                  : "border-line bg-white hover:border-teal"
              } ${j.ferme ? "cursor-not-allowed opacity-40" : "cursor-pointer"}`}
            >
              <small
                className={`block text-[10.5px] font-bold uppercase ${
                  selectionne ? "text-white" : "text-muted"
                }`}
              >
                {j.labelJour}
              </small>
              <b className={`block text-base font-extrabold ${selectionne ? "text-white" : ""}`}>
                {j.numero}
              </b>
              <span
                className={`block text-[9.5px] ${selectionne ? "text-white" : "text-muted"}`}
              >
                {j.mois}
              </span>
            </button>
          );
        })}
      </div>

      {/* Grille des horaires du jour sélectionné (ouverts + réservés barrés) */}
      <div className="mt-[14px] grid max-h-[300px] grid-cols-3 gap-2 overflow-auto">
        {creneaux.map((c) =>
          c.statut === "reserve" ? (
            <span
              key={c.heure}
              className="rounded-[10px] border-[1.5px] border-line bg-white py-[11px] text-center text-[13px] font-bold text-blue line-through opacity-30"
            >
              {c.heure}
            </span>
          ) : (
            <button
              key={c.heure}
              type="button"
              onClick={() => setHeure(c.heure)}
              className={`rounded-[10px] border-[1.5px] py-[11px] text-center text-[13px] font-bold transition ${
                heure === c.heure
                  ? "border-blue bg-blue text-white"
                  : "border-line bg-white text-blue hover:border-teal"
              }`}
            >
              {c.heure}
            </button>
          )
        )}
        {creneaux.length === 0 && (
          <p className="col-span-3 py-2 text-center text-xs text-muted">
            Aucun créneau ce jour — choisissez une autre date.
          </p>
        )}
      </div>

      {/* Bouton d'action : inactif tant qu'aucun horaire n'est choisi */}
      {heure ? (
        <Link
          href={`/reservation?medecin=${medecinId}&date=${jourISO}&heure=${encodeURIComponent(heure)}`}
          className="mt-[18px] block w-full rounded-[11px] bg-teal py-[14px] text-center text-[15px] font-bold text-white transition-colors hover:bg-[#2790bc]"
        >
          Continuer · {heure}
        </Link>
      ) : (
        <span className="mt-[18px] block w-full cursor-not-allowed rounded-[11px] bg-teal py-[14px] text-center text-[15px] font-bold text-white opacity-50">
          Sélectionnez un horaire
        </span>
      )}
    </div>
  );
}
