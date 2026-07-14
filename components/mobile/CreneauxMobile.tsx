"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { prochainsJours } from "@/lib/dates";
import { useDisponibilites } from "@/lib/disponibilites";

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
  const { chargement, creneauxJour } = useDisponibilites(medecinId);
  const jours = useMemo(() => prochainsJours(joursFermes, 6), [joursFermes]);
  const premierOuvert = jours.find((j) => !j.ferme)?.iso ?? jours[0]?.iso ?? "";
  const [jourISO, setJourISO] = useState(premierOuvert);
  const [heure, setHeure] = useState<string | null>(null);

  const creneaux = chargement ? [] : creneauxJour(jourISO);
  const matin = creneaux.filter((c) => Number(c.heure.slice(0, 2)) < 13);
  const apresMidi = creneaux.filter((c) => Number(c.heure.slice(0, 2)) >= 13);

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
        <div className="section-t" style={{ marginTop: 6 }}>
          Choisissez une date
        </div>
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
