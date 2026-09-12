"use client";

import { useEffect, useState } from "react";
import { JOURS_NOMS } from "@/lib/horaires";
import { creerClientNavigateur } from "@/lib/supabase/client";

/*
 * Congés et absences d'un praticien (table `absences`, migration 0052).
 *
 * Deux formes, et deux seulement :
 *   - PONCTUELLE  : une période (`dateDebut` → `dateFin`) — vacances,
 *     congrès, arrêt maladie ;
 *   - RÉCURRENTE  : un jour de la semaine (`jourSemaine`, 0 = dimanche).
 *
 * Heures nulles = journée entière, le cas courant.
 *
 * Ce module ne décide de RIEN sur les créneaux : la fermeture est jugée en
 * base, par `absence_couvre()`, que les trois fonctions de disponibilité
 * appellent. Une règle recopiée ici aurait fini par diverger, et une
 * divergence se paierait en rendez-vous pris pendant des vacances.
 */

export interface Absence {
  id: string;
  motif: string;
  /** Période : les deux ensemble, ou aucun des deux. */
  dateDebut: string | null;
  dateFin: string | null;
  /** Récurrence hebdomadaire : 0 = dimanche. Exclusif de la période. */
  jourSemaine: number | null;
  /** Nuls = journée entière. */
  heureDebut: string | null;
  heureFin: string | null;
}

/** Ce que l'écran manipule, avant traduction vers les colonnes. */
export interface SaisieAbsence {
  motif: string;
  forme: "periode" | "recurrente";
  dateDebut: string;
  dateFin: string;
  jourSemaine: number;
  /** Faux = la saisie porte des heures. */
  journeeEntiere: boolean;
  heureDebut: string;
  heureFin: string;
}

type Ligne = {
  id: string;
  motif: string;
  date_debut: string | null;
  date_fin: string | null;
  jour_semaine: number | null;
  heure_debut: string | null;
  heure_fin: string | null;
};

const hhmm = (h: string | null) => (h ? h.slice(0, 5) : null);

const versAbsence = (l: Ligne): Absence => ({
  id: l.id,
  motif: l.motif,
  dateDebut: l.date_debut,
  dateFin: l.date_fin,
  jourSemaine: l.jour_semaine,
  heureDebut: hhmm(l.heure_debut),
  heureFin: hhmm(l.heure_fin),
});

/** Une absence en cours aujourd'hui, ou déjà terminée ? */
export type EtatAbsence = "en_cours" | "programme" | "recurrent" | "passe";

export function etatAbsence(a: Absence, aujourdhui = new Date()): EtatAbsence {
  if (a.jourSemaine !== null) return "recurrent";
  const jour = aujourdhui.toISOString().slice(0, 10);
  if (a.dateFin && a.dateFin < jour) return "passe";
  if (a.dateDebut && a.dateDebut > jour) return "programme";
  return "en_cours";
}

export const LIBELLE_ETAT: Record<EtatAbsence, string> = {
  en_cours: "En cours",
  programme: "Programmé",
  recurrent: "Récurrent",
  passe: "Terminé",
};

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** « 15 août 2026 », sans passer par toLocaleDateString (fuseau du poste). */
function jourLisible(iso: string): string {
  const [a, m, j] = iso.split("-").map(Number);
  return `${j} ${MOIS[m - 1]} ${a}`;
}

/**
 * La phrase affichée sous le motif : « Du 1 au 15 août 2026 », « Chaque
 * dimanche », « Chaque mercredi de 13:00 à 16:00 ».
 *
 * Le mois et l'année ne sont répétés que s'ils changent : « Du 1 au 15 août
 * 2026 » se lit mieux que « Du 1 août 2026 au 15 août 2026 ».
 */
export function periodeLisible(a: Absence): string {
  const heures = a.heureDebut ? ` de ${a.heureDebut} à ${a.heureFin}` : "";

  if (a.jourSemaine !== null) {
    return `Chaque ${JOURS_NOMS[a.jourSemaine].toLowerCase()}${heures}`;
  }
  if (!a.dateDebut || !a.dateFin) return heures.trim();

  if (a.dateDebut === a.dateFin) return `Le ${jourLisible(a.dateDebut)}${heures}`;

  const [aD, mD, jD] = a.dateDebut.split("-").map(Number);
  const [aF, mF] = a.dateFin.split("-").map(Number);
  const debut = aD === aF && mD === mF ? String(jD) : jourLisible(a.dateDebut);
  return `Du ${debut} au ${jourLisible(a.dateFin)}${heures}`;
}

export function useAbsences(medecinId: string | undefined): {
  absences: Absence[];
  chargement: boolean;
  recharger: () => void;
} {
  const [etat, setEtat] = useState<{ cle: string; absences: Absence[] }>({ cle: "", absences: [] });
  const [version, setVersion] = useState(0);
  const cle = medecinId ? `${medecinId}:${version}` : "";

  useEffect(() => {
    if (!medecinId) return;
    let actif = true;
    (async () => {
      const { data } = await creerClientNavigateur()
        .from("absences")
        .select("id, motif, date_debut, date_fin, jour_semaine, heure_debut, heure_fin")
        // Les congés à venir d'abord, les récurrents ensuite : c'est l'ordre
        // dans lequel on les cherche quand on ouvre cet écran.
        .eq("medecin_id", medecinId)
        .order("date_debut", { ascending: true, nullsFirst: false })
        .order("jour_semaine", { ascending: true, nullsFirst: false });
      if (!actif) return;
      setEtat({ cle, absences: ((data ?? []) as Ligne[]).map(versAbsence) });
    })();
    return () => {
      actif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medecinId, version]);

  return {
    absences: etat.cle === cle ? etat.absences : [],
    chargement: !!medecinId && etat.cle !== cle,
    recharger: () => setVersion((v) => v + 1),
  };
}

/**
 * Ce que la base refusera, dit en français et AVANT l'aller-retour.
 *
 * Les mêmes règles sont posées en contraintes (`absence_forme`,
 * `absence_periode`, `absence_heures`, `absence_motif`) : c'est la base qui
 * verrouille, cette fonction ne fait qu'éviter un message technique.
 */
export function erreurSaisie(s: SaisieAbsence): string | null {
  if (s.motif.trim().length < 2) return "Indiquez un motif (« Vacances annuelles », « Congrès »…).";
  if (s.motif.trim().length > 80) return "Le motif ne doit pas dépasser 80 caractères.";

  if (s.forme === "periode") {
    if (!s.dateDebut || !s.dateFin) return "Indiquez la date de début et la date de fin.";
    if (s.dateFin < s.dateDebut) return "La date de fin doit suivre la date de début.";
  }
  if (!s.journeeEntiere) {
    if (!s.heureDebut || !s.heureFin) return "Indiquez l’heure de début et l’heure de fin.";
    if (s.heureFin <= s.heureDebut) return "L’heure de fin doit suivre l’heure de début.";
  }
  return null;
}

/** La saisie traduite en colonnes — une seule fois, pour l'ajout comme pour la modification. */
function versColonnes(s: SaisieAbsence) {
  const periode = s.forme === "periode";
  return {
    motif: s.motif.trim(),
    date_debut: periode ? s.dateDebut : null,
    date_fin: periode ? s.dateFin : null,
    jour_semaine: periode ? null : s.jourSemaine,
    heure_debut: s.journeeEntiere ? null : s.heureDebut,
    heure_fin: s.journeeEntiere ? null : s.heureFin,
  };
}

/** Les rendez-vous déjà pris que cette absence recouvrirait. */
export async function rdvPendantAbsence(
  medecinId: string,
  s: SaisieAbsence
): Promise<number | null> {
  const c = versColonnes(s);
  const { data, error } = await creerClientNavigateur().rpc("rdv_pendant_absence", {
    p_medecin_id: medecinId,
    p_date_debut: c.date_debut,
    p_date_fin: c.date_fin,
    p_jour_semaine: c.jour_semaine,
    p_heure_debut: c.heure_debut,
    p_heure_fin: c.heure_fin,
  });
  // Un échec ici ne doit pas empêcher d'enregistrer : c'est un avertissement,
  // pas une condition. L'écran n'affichera simplement rien.
  return error ? null : Number(data) || 0;
}

export async function ajouterAbsence(
  medecinId: string,
  s: SaisieAbsence
): Promise<{ erreur?: string }> {
  const faute = erreurSaisie(s);
  if (faute) return { erreur: faute };
  const { data, error } = await creerClientNavigateur()
    .from("absences")
    .insert({ medecin_id: medecinId, ...versColonnes(s) })
    .select("id");
  if (error) return { erreur: error.message };
  // Un INSERT bloqué par la RLS ne lève rien : il n'écrit aucune ligne.
  if (!data?.length) return { erreur: REFUS };
  return {};
}

export async function modifierAbsence(
  id: string,
  s: SaisieAbsence
): Promise<{ erreur?: string }> {
  const faute = erreurSaisie(s);
  if (faute) return { erreur: faute };
  const { data, error } = await creerClientNavigateur()
    .from("absences")
    .update(versColonnes(s))
    .eq("id", id)
    .select("id");
  if (error) return { erreur: error.message };
  if (!data?.length) return { erreur: REFUS };
  return {};
}

export async function supprimerAbsence(id: string): Promise<{ erreur?: string }> {
  const { data, error } = await creerClientNavigateur()
    .from("absences")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return { erreur: error.message };
  if (!data?.length) return { erreur: REFUS };
  return {};
}

const REFUS =
  "Modification refusée : seul le praticien, ou un(e) assistant(e) autorisé(e) à gérer les créneaux, peut toucher aux congés.";

/** Une absence existante ramenée dans le formulaire. */
export function versSaisie(a: Absence): SaisieAbsence {
  return {
    motif: a.motif,
    forme: a.jourSemaine !== null ? "recurrente" : "periode",
    dateDebut: a.dateDebut ?? "",
    dateFin: a.dateFin ?? "",
    jourSemaine: a.jourSemaine ?? 0,
    journeeEntiere: a.heureDebut === null,
    heureDebut: a.heureDebut ?? "08:00",
    heureFin: a.heureFin ?? "12:00",
  };
}

/** Formulaire vierge : une journée entière, aujourd'hui, en période. */
export function saisieVierge(aujourdhui = new Date()): SaisieAbsence {
  const jour = aujourdhui.toISOString().slice(0, 10);
  return {
    motif: "",
    forme: "periode",
    dateDebut: jour,
    dateFin: jour,
    jourSemaine: 0,
    journeeEntiere: true,
    heureDebut: "08:00",
    heureFin: "12:00",
  };
}
