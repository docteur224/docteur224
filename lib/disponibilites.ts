"use client";

import { useCallback, useEffect, useState } from "react";
import {
  chargerHorairesTypes,
  chargerIndisponibilites,
  statutCreneau,
  HEURES_JOURNEE,
  type EtatCreneau,
} from "@/lib/donnees";
import { creneauReservable, versISO } from "@/lib/dates";

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
/* Références stables : elles servent de dépendances aux crochets ci-dessous. */
const AUCUNE_PLAGE: Disponibilites["plages"] = [];
const AUCUN_ETAT = new Map<string, EtatCreneau>();

export function useDisponibilites(medecinId: string, joursAvance = 60): Disponibilites {
  const [version, setVersion] = useState(0);
  const [fenetreJours, setFenetreJours] = useState(joursAvance);
  const [charge, setCharge] = useState<{
    cle: string;
    plages: Disponibilites["plages"];
    etats: Map<string, EtatCreneau>;
  } | null>(null);

  // Ce que la vue demande en ce moment : praticien, largeur de fenêtre, et
  // le compteur de rechargement.
  const cle = `${medecinId}|${fenetreJours}|${version}`;

  const etendreFenetre = useCallback((jours: number) => {
    setFenetreJours((actuelle) => (jours > actuelle ? jours : actuelle));
  }, []);

  useEffect(() => {
    let actif = true;
    const fin = versISO(new Date(Date.now() + fenetreJours * 86400000));
    Promise.all([
      chargerHorairesTypes(medecinId),
      chargerIndisponibilites(medecinId, versISO(new Date()), fin),
    ]).then(([p, e]) => {
      if (actif) setCharge({ cle, plages: p, etats: e });
    });
    return () => {
      actif = false;
    };
  }, [cle, medecinId, fenetreJours]);

  /*
   * « En cours de chargement » n'est pas un état à tenir à jour, c'est une
   * CONSTATATION : ce qu'on a en mémoire ne répond pas encore à ce qui est
   * demandé. Le poser depuis l'effet (`setChargement(true)` en tête) faisait
   * rendre deux fois à chaque élargissement de la fenêtre, et laissait la
   * porte ouverte à un drapeau resté bloqué si l'effet changeait de forme.
   */
  const aJour = charge?.cle === cle;
  const plages = aJour ? charge.plages : AUCUNE_PLAGE;
  const etats = aJour ? charge.etats : AUCUN_ETAT;
  const chargement = !aJour;

  // Les créneaux déjà passés — ou trop proches pour respecter le délai de
  // prévenance — sont retirés : les proposer n'aurait aucun sens côté patient.
  // Les créneaux réservés restent affichés (barrés) tant qu'ils sont à venir.
  const creneauxJour = useCallback(
    (dateISO: string): CreneauPatient[] =>
      HEURES_JOURNEE.map((heure) => ({
        heure,
        statut: statutCreneau(plages, etats, dateISO, heure),
      }))
        .filter((c): c is CreneauPatient => c.statut !== "ferme")
        .filter((c) => creneauReservable(dateISO, c.heure)),
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
