"use client";

import { useCallback, useEffect, useState } from "react";
import {
  chargerHorairesTypes,
  chargerIndisponibilites,
  statutCreneau,
  HEURES_JOURNEE,
  type EtatCreneau,
} from "@/lib/donnees";
import { versISO } from "@/lib/dates";

/*
 * Disponibilités réelles côté client (spec C.4.2/C.4.3) :
 * horaires-types + exceptions + rendez-vous, lus dans Supabase via la
 * fonction publique heures_indisponibles (aucune donnée personnelle).
 * Remplace lib/mock-disponibilites.ts pour le parcours patient.
 */

export interface CreneauPatient {
  heure: string;
  statut: "ouvert" | "reserve";
}

export interface Disponibilites {
  chargement: boolean;
  plages: { jour_semaine: number; heure_debut: string; heure_fin: string }[];
  etats: Map<string, EtatCreneau>;
  /** Créneaux visibles côté patient pour un jour : ouverts + réservés (jamais les fermés). */
  creneauxJour: (dateISO: string) => CreneauPatient[];
  recharger: () => void;
  /**
   * Étend la fenêtre chargée jusqu'à couvrir `jours` jours à partir
   * d'aujourd'hui. Appelée quand le patient navigue au-delà de ce qui est
   * déjà chargé ; sans effet si la fenêtre est déjà assez large.
   */
  etendreFenetre: (jours: number) => void;
  /** Étendue actuellement chargée, en jours à partir d'aujourd'hui. */
  fenetreJours: number;
}

/**
 * Chargement progressif : on ne tire au départ que `joursAvance` jours
 * d'indisponibilités (le bandeau de dates n'en montre qu'une poignée), et la
 * fenêtre s'élargit à la demande via etendreFenetre() quand le patient
 * navigue plus loin dans l'horizon de réservation.
 */
export function useDisponibilites(medecinId: string, joursAvance = 60): Disponibilites {
  const [chargement, setChargement] = useState(true);
  const [plages, setPlages] = useState<Disponibilites["plages"]>([]);
  const [etats, setEtats] = useState<Map<string, EtatCreneau>>(new Map());
  const [version, setVersion] = useState(0);
  const [fenetreJours, setFenetreJours] = useState(joursAvance);

  const etendreFenetre = useCallback((jours: number) => {
    setFenetreJours((actuelle) => (jours > actuelle ? jours : actuelle));
  }, []);

  useEffect(() => {
    let actif = true;
    setChargement(true);
    const fin = versISO(new Date(Date.now() + fenetreJours * 86400000));
    Promise.all([
      chargerHorairesTypes(medecinId),
      chargerIndisponibilites(medecinId, versISO(new Date()), fin),
    ]).then(([p, e]) => {
      if (!actif) return;
      setPlages(p);
      setEtats(e);
      setChargement(false);
    });
    return () => {
      actif = false;
    };
  }, [medecinId, fenetreJours, version]);

  const creneauxJour = useCallback(
    (dateISO: string): CreneauPatient[] =>
      HEURES_JOURNEE.map((heure) => ({
        heure,
        statut: statutCreneau(plages, etats, dateISO, heure),
      })).filter((c): c is CreneauPatient => c.statut !== "ferme"),
    [plages, etats]
  );

  return {
    chargement,
    plages,
    etats,
    creneauxJour,
    recharger: () => setVersion((v) => v + 1),
    etendreFenetre,
    fenetreJours,
  };
}
