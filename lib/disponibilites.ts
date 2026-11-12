"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  chargerDerniereOuvertureManuelle,
  chargerHorairesTypes,
  chargerIndisponibilites,
  statutCreneau,
  HEURES_JOURNEE,
  type EtatCreneau,
} from "@/lib/donnees";
import {
  creneauReservable,
  dateLimiteReservation,
  joursJusqua,
  versISO,
  HORIZON_RESERVATION_JOURS,
} from "@/lib/dates";

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
  /**
   * Horizon de navigation EFFECTIF, en jours : la fenêtre de réservation du
   * médecin, étendue s'il a ouvert manuellement un créneau plus loin. Le
   * bandeau de dates et le sélecteur de mois s'arrêtent là. Sans horizon
   * (écrans admin), vaut l'horizon global (1 an).
   */
  horizonJours: number;
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

export interface OptionsDisponibilites {
  /**
   * Fenêtre de réservation du médecin, en mois (côté patient). Omise, aucune
   * borne n'est appliquée — c'est le cas des écrans admin/centre d'appel, qui
   * lisent `plages`/`etats` directement sans passer par `creneauxJour`.
   */
  horizonMois?: number;
  /** Jours d'indisponibilités chargés d'emblée (défaut 60). */
  joursAvance?: number;
}

export function useDisponibilites(
  medecinId: string,
  options: OptionsDisponibilites = {}
): Disponibilites {
  const { horizonMois, joursAvance = 60 } = options;
  const [version, setVersion] = useState(0);
  const [fenetreJours, setFenetreJours] = useState(joursAvance);
  const [derniereOuverture, setDerniereOuverture] = useState<string | null>(null);
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

  // L'ouverture manuelle la plus lointaine : elle seule peut POUSSER l'horizon
  // de navigation au-delà de la fenêtre du médecin (Règle 1). Une requête
  // scalaire, chargée une fois par praticien ; inutile sans fenêtre (admin).
  useEffect(() => {
    if (horizonMois == null) return;
    let actif = true;
    chargerDerniereOuvertureManuelle(medecinId).then((d) => {
      if (actif) setDerniereOuverture(d);
    });
    return () => {
      actif = false;
    };
  }, [medecinId, horizonMois, version]);

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

  // Borne de la fenêtre de réservation (null = pas de borne, écrans admin).
  const limiteISO = useMemo(
    () => (horizonMois == null ? null : dateLimiteReservation(horizonMois)),
    [horizonMois]
  );

  // Horizon de navigation effectif : la fenêtre du médecin, étendue jusqu'à la
  // dernière ouverture manuelle si elle tombe plus loin.
  const horizonJours = useMemo(() => {
    if (limiteISO == null) return HORIZON_RESERVATION_JOURS;
    const base = joursJusqua(limiteISO);
    const manuel = derniereOuverture ? joursJusqua(derniereOuverture) : 0;
    return Math.max(base, manuel);
  }, [limiteISO, derniereOuverture]);

  // Les créneaux déjà passés — ou trop proches pour respecter le délai de
  // prévenance — sont retirés : les proposer n'aurait aucun sens côté patient.
  // Les créneaux réservés restent affichés (barrés) tant qu'ils sont à venir.
  //
  // Fenêtre de réservation : au-delà de `limiteISO`, un créneau n'est proposé
  // QUE si le médecin l'a ouvert manuellement (exception `etat='ouvert'`).
  // Dans la fenêtre, rien ne change. Un créneau réservé/congé/absence n'est
  // jamais « rouvert » : il n'a pas d'exception 'ouvert', donc il reste masqué
  // hors fenêtre (Règle 2).
  const creneauxJour = useCallback(
    (dateISO: string): CreneauPatient[] => {
      const dansFenetre = limiteISO == null || dateISO <= limiteISO;
      return HEURES_JOURNEE.map((heure) => ({
        heure,
        statut: statutCreneau(plages, etats, dateISO, heure),
      }))
        .filter((c): c is CreneauPatient => c.statut !== "ferme")
        .filter((c) => creneauReservable(dateISO, c.heure))
        .filter((c) => dansFenetre || etats.get(`${dateISO}|${c.heure}`) === "ouvert");
    },
    [plages, etats, limiteISO]
  );

  return {
    chargement,
    plages,
    etats,
    creneauxJour,
    recharger: () => setVersion((v) => v + 1),
    etendreFenetre,
    fenetreJours,
    horizonJours,
  };
}
