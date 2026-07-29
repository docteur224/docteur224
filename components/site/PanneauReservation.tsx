"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  joursACharger,
  moisDeLHorizon,
  nbJoursAffichables,
  prochainsJours,
} from "@/lib/dates";
import { useDisponibilites } from "@/lib/disponibilites";
import { formatGNF } from "@/lib/format";

const JOURS_PAR_PAGE = 5;

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
  const { chargement, creneauxJour, etendreFenetre } = useDisponibilites(medecinId);
  const [decalage, setDecalage] = useState(0);
  const jours = useMemo(
    () => prochainsJours(joursFermes, JOURS_PAR_PAGE, decalage),
    [joursFermes, decalage]
  );
  const total = useMemo(() => nbJoursAffichables(), []);
  const mois = useMemo(() => moisDeLHorizon(), []);

  // Chargement progressif : on n'élargit la fenêtre de disponibilités que
  // lorsque la navigation dépasse ce qui est déjà chargé.
  useEffect(() => {
    etendreFenetre(joursACharger(decalage, JOURS_PAR_PAGE));
  }, [decalage, etendreFenetre]);
  const premiereSemaine = useMemo(
    () => prochainsJours(joursFermes, JOURS_PAR_PAGE),
    [joursFermes]
  );
  const premierOuvert =
    premiereSemaine.find((j) => !j.ferme)?.iso ?? premiereSemaine[0]?.iso ?? "";
  const [jourISO, setJourISO] = useState(premierOuvert);
  const [heure, setHeure] = useState<string | null>(null);

  const peutReculer = decalage > 0;
  const peutAvancer = decalage + JOURS_PAR_PAGE < total;

  // Le sélecteur suit la navigation aux flèches : dernier mois dont le début
  // est déjà atteint par le décalage courant.
  const moisCourant = useMemo(() => {
    let valeur = mois[0]?.decalage ?? 0;
    for (const m of mois) if (m.decalage <= decalage) valeur = m.decalage;
    return valeur;
  }, [mois, decalage]);

  const creneaux = chargement ? [] : creneauxJour(jourISO);

  // En fin de journée, tous les créneaux d'aujourd'hui sont écoulés : plutôt
  // que d'ouvrir sur une grille vide, on sélectionne le premier jour de la
  // page qui a encore quelque chose à proposer.
  useEffect(() => {
    if (chargement || heure || creneaux.length > 0) return;
    const jourUtile = jours.find((j) => !j.ferme && creneauxJour(j.iso).length > 0);
    if (jourUtile && jourUtile.iso !== jourISO) setJourISO(jourUtile.iso);
  }, [chargement, heure, creneaux.length, jours, creneauxJour, jourISO]);

  return (
    <div className="rounded-[18px] border border-line bg-white p-[22px] shadow-[0_8px_22px_rgba(16,59,80,.06)] lg:sticky lg:top-[86px]">
      {/* Le tarif de consultation n'apparaît pas ici : placé à côté du titre,
          il laissait croire que la réservation elle-même est payante. Le prix
          reste indiqué plus bas, rattaché au règlement sur place. */}
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <b className="text-[15px] font-extrabold">Réserver un rendez-vous</b>
        <span className="flex-none rounded-lg bg-green-soft px-[9px] py-1 text-[11px] font-extrabold text-green">
          Réservation gratuite
        </span>
      </div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs text-muted">Choisissez une date et un horaire disponibles.</span>
        {/* Saut direct à un mois : évite d'enchaîner les clics sur « › ». */}
        <select
          aria-label="Aller à un mois"
          value={moisCourant}
          onChange={(e) => setDecalage(Number(e.target.value))}
          className="flex-none rounded-lg border border-line bg-white px-2 py-1 text-xs font-bold text-blue"
        >
          {mois.map((m) => (
            <option key={m.decalage} value={m.decalage}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {/* Bandeau de dates, navigable au-delà des 5 premiers jours */}
      <div className="flex items-center gap-2 pb-2">
        <button
          type="button"
          onClick={() => setDecalage((d) => Math.max(0, d - JOURS_PAR_PAGE))}
          disabled={!peutReculer}
          aria-label="Jours précédents"
          className={`flex-none rounded-full border border-line bg-white px-2 py-3 text-sm font-bold text-blue transition ${
            peutReculer ? "hover:border-teal" : "cursor-not-allowed opacity-30"
          }`}
        >
          ‹
        </button>
        <div className="flex flex-1 gap-2 overflow-auto">
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
        <button
          type="button"
          onClick={() =>
            setDecalage((d) => Math.min(d + JOURS_PAR_PAGE, Math.max(0, total - JOURS_PAR_PAGE)))
          }
          disabled={!peutAvancer}
          aria-label="Jours suivants"
          className={`flex-none rounded-full border border-line bg-white px-2 py-3 text-sm font-bold text-blue transition ${
            peutAvancer ? "hover:border-teal" : "cursor-not-allowed opacity-30"
          }`}
        >
          ›
        </button>
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

      {/* Le tarif est rappelé ici, explicitement rattaché au paiement sur
          place, pour lever toute confusion avec le coût de la réservation. */}
      <p className="mt-[10px] text-center text-[11.5px] leading-relaxed text-muted">
        Réservation gratuite. Consultation {formatGNF(tarif)}, à régler sur place.
      </p>
    </div>
  );
}
