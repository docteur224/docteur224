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

const JOURS_PAR_PAGE = 6;

/**
 * Écran mobile « Choisir un créneau » — reproduit la scène « creneaux » de la
 * maquette mobile (bandeau de dates .daysel, grilles Matin / Après-midi,
 * CTA collant activé à la sélection). Même modèle de disponibilités que le
 * PanneauReservation web : ouverts réservables, réservés barrés, fermés absents.
 */
export default function CreneauxMobile({
  medecinId,
  joursFermes,
}: {
  medecinId: string;
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

  // Chargement progressif : la fenêtre de disponibilités s'élargit seulement
  // quand la navigation dépasse ce qui est déjà chargé.
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

  // Le sélecteur suit la navigation aux flèches.
  const moisCourant = useMemo(() => {
    let valeur = mois[0]?.decalage ?? 0;
    for (const m of mois) if (m.decalage <= decalage) valeur = m.decalage;
    return valeur;
  }, [mois, decalage]);

  const creneaux = chargement ? [] : creneauxJour(jourISO);
  const matin = creneaux.filter((c) => Number(c.heure.slice(0, 2)) < 13);
  const apresMidi = creneaux.filter((c) => Number(c.heure.slice(0, 2)) >= 13);

  // En fin de journée, aucun créneau ne reste aujourd'hui : on ouvre sur le
  // premier jour de la page qui a encore quelque chose à proposer.
  useEffect(() => {
    if (chargement || heure || creneaux.length > 0) return;
    const jourUtile = jours.find((j) => !j.ferme && creneauxJour(j.iso).length > 0);
    if (jourUtile && jourUtile.iso !== jourISO) setJourISO(jourUtile.iso);
  }, [chargement, heure, creneaux.length, jours, creneauxJour, jourISO]);

  const grille = (liste: typeof creneaux) => (
    <div className="slots">
      {liste.map((c) =>
        c.statut === "reserve" ? (
          <span key={c.heure} className="slot taken">
            {c.heure}
          </span>
        ) : (
          <button
            key={c.heure}
            type="button"
            className={`slot${heure === c.heure ? " sel" : ""}`}
            onClick={() => setHeure(c.heure)}
          >
            {c.heure}
          </button>
        )
      )}
      {liste.length === 0 && (
        <p className="muted" style={{ gridColumn: "1 / -1", fontSize: 12, textAlign: "center", padding: "6px 0" }}>
          Aucun créneau — choisissez une autre date.
        </p>
      )}
    </div>
  );

  return (
    <>
      <div className="pad" style={{ paddingTop: 6 }}>
        <div className="daytitle">
          <div className="section-t" style={{ marginTop: 6 }}>
            Choisissez une date
          </div>
          {/* Saut direct à un mois de l'horizon (un an). */}
          <select
            aria-label="Aller à un mois"
            className="moissel"
            value={moisCourant}
            onChange={(e) => setDecalage(Number(e.target.value))}
          >
            {mois.map((m) => (
              <option key={m.decalage} value={m.decalage}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="dayrow">
          <button
            type="button"
            className="daynav"
            aria-label="Jours précédents"
            disabled={!peutReculer}
            onClick={() => setDecalage((d) => Math.max(0, d - JOURS_PAR_PAGE))}
          >
            ‹
          </button>
          <div className="daysel">
          {jours.map((j) => (
            <button
              key={j.iso}
              type="button"
              disabled={j.ferme}
              className={`day${j.iso === jourISO ? " on" : ""}${j.ferme ? " off" : ""}`}
              onClick={() => {
                setJourISO(j.iso);
                setHeure(null);
              }}
            >
              <small>{j.labelJour}</small>
              <b>{j.numero}</b>
              <span className="mois">{j.mois}</span>
            </button>
          ))}
          </div>
          <button
            type="button"
            className="daynav"
            aria-label="Jours suivants"
            disabled={!peutAvancer}
            onClick={() =>
              setDecalage((d) =>
                Math.min(d + JOURS_PAR_PAGE, Math.max(0, total - JOURS_PAR_PAGE))
              )
            }
          >
            ›
          </button>
        </div>
        <div className="section-t">Matin</div>
        {grille(matin)}
        <div className="section-t">Après-midi</div>
        {grille(apresMidi)}
      </div>
      <div className="ctafoot">
        {heure ? (
          <Link
            href={`/reservation?medecin=${medecinId}&date=${jourISO}&heure=${encodeURIComponent(heure)}`}
            className="btn"
          >
            Continuer · {heure}
          </Link>
        ) : (
          <span className="btn" style={{ opacity: 0.5, pointerEvents: "none" }}>
            Sélectionnez un horaire
          </span>
        )}
      </div>
    </>
  );
}
