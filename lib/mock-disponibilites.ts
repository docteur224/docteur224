import { creerMagasinLocal, useMagasinLocal } from "@/lib/stockage-local";
import { lireRendezVousLocaux, type RendezVousLocal } from "@/lib/mock-rdv";
import {
  empreinte,
  HEURES_JOURNEE,
  statutBase,
  type StatutCreneau,
} from "@/lib/horaire-type";

/*
 * Modèle de disponibilités unifié (spec C.4.2/C.4.3), version mocks :
 *
 *   statut effectif d'un créneau =
 *     1. « réservé »  s'il y a un rendez-vous confirmé (réel, en localStorage)
 *                     ou une réservation de démonstration (déterministe) ;
 *     2. sinon l'« exception par date » posée par le médecin (localStorage) ;
 *     3. sinon l'« horaire-type » de base (lib/horaire-type.ts).
 *
 * Le côté médecin (grille 3 états) et le côté patient (créneaux réservables)
 * lisent LE MÊME modèle : fermer un créneau côté médecin le retire
 * immédiatement des disponibilités visibles côté patient.
 *
 * NB : ce module contient des hooks React — à n'importer que depuis des
 * composants client. Les composants serveur utilisent lib/horaire-type.ts.
 */

export { HEURES_JOURNEE, statutBase, type StatutCreneau };

/* ===== Exceptions par date (modifications du médecin) ===== */

export interface ExceptionCreneau {
  medecinId: string;
  /** Format AAAA-MM-JJ */
  date: string;
  /** Format HH:MM */
  heure: string;
  statut: "ouvert" | "ferme";
}

const AUCUNE_EXCEPTION: ExceptionCreneau[] = [];

const magasinExceptions = creerMagasinLocal<ExceptionCreneau[]>(
  "docteur224.exceptions",
  AUCUNE_EXCEPTION,
  (json) => (Array.isArray(json) ? (json as ExceptionCreneau[]) : AUCUNE_EXCEPTION)
);

/** Lecture réactive des exceptions posées par le médecin. */
export function useExceptionsLocales(): ExceptionCreneau[] {
  return useMagasinLocal(magasinExceptions);
}

export function lireExceptionsLocales(): ExceptionCreneau[] {
  return magasinExceptions.lire();
}

/* ===== Statut effectif ===== */

function rdvConfirmePour(
  rdvs: RendezVousLocal[],
  medecinId: string,
  dateISO: string,
  heure: string
): RendezVousLocal | undefined {
  return rdvs.find(
    (r) =>
      r.medecinId === medecinId &&
      r.date === dateISO &&
      r.heure === heure &&
      r.statut === "confirme"
  );
}

export function statutEffectif(
  medecinId: string,
  dateISO: string,
  heure: string,
  exceptions: ExceptionCreneau[],
  rdvs: RendezVousLocal[]
): StatutCreneau {
  if (rdvConfirmePour(rdvs, medecinId, dateISO, heure)) return "reserve";
  const base = statutBase(medecinId, dateISO, heure);
  if (base === "reserve") return "reserve";
  const exception = exceptions.find(
    (e) => e.medecinId === medecinId && e.date === dateISO && e.heure === heure
  );
  return exception ? exception.statut : base;
}

/**
 * Bascule ouvert ↔ fermé d'un créneau (action du médecin).
 * Règle C.4.3 : un créneau réservé est verrouillé — la bascule est refusée.
 */
export function basculerCreneauLocal(medecinId: string, dateISO: string, heure: string): void {
  const exceptions = magasinExceptions.lire();
  const statut = statutEffectif(medecinId, dateISO, heure, exceptions, lireRendezVousLocaux());
  if (statut === "reserve") return;
  const nouveau: "ouvert" | "ferme" = statut === "ouvert" ? "ferme" : "ouvert";
  const restantes = exceptions.filter(
    (e) => !(e.medecinId === medecinId && e.date === dateISO && e.heure === heure)
  );
  // On ne stocke une exception que si elle diffère de l'horaire-type.
  if (statutBase(medecinId, dateISO, heure) !== nouveau) {
    restantes.push({ medecinId, date: dateISO, heure, statut: nouveau });
  }
  magasinExceptions.ecrire(restantes);
}

/* ===== Vues dérivées ===== */

/** Côté patient : uniquement les créneaux ouverts ou réservés (jamais les fermés). */
export interface CreneauPatient {
  heure: string;
  statut: "ouvert" | "reserve";
}

export function creneauxJourPatient(
  medecinId: string,
  dateISO: string,
  exceptions: ExceptionCreneau[],
  rdvs: RendezVousLocal[]
): CreneauPatient[] {
  return HEURES_JOURNEE.map((heure) => ({
    heure,
    statut: statutEffectif(medecinId, dateISO, heure, exceptions, rdvs),
  })).filter((c): c is CreneauPatient => c.statut !== "ferme");
}

/** Côté médecin : tous les créneaux avec leur statut, patient et motif. */
export interface CreneauMedecin {
  heure: string;
  statut: StatutCreneau;
  patient?: string;
  motif?: string;
  /** true pour les réservations de démonstration (sans rendez-vous réel) */
  demo?: boolean;
}

const PATIENTS_DEMO = [
  "Mariama Sow",
  "Ibrahim Sylla",
  "Aïcha Condé",
  "Sékou Touré",
  "Aboubacar Sylla",
  "Hadja Camara",
  "Ousmane Baldé",
  "Aminata Diané",
];

const MOTIFS_DEMO = [
  "Consultation générale",
  "Contrôle",
  "Vaccination",
  "Suivi",
  "Première visite",
];

export function creneauxJourMedecin(
  medecinId: string,
  dateISO: string,
  exceptions: ExceptionCreneau[],
  rdvs: RendezVousLocal[]
): CreneauMedecin[] {
  return HEURES_JOURNEE.map((heure) => {
    const rdv = rdvConfirmePour(rdvs, medecinId, dateISO, heure);
    if (rdv) {
      return {
        heure,
        statut: "reserve" as const,
        patient: rdv.pourQui,
        motif: rdv.motif || "Consultation",
        demo: false,
      };
    }
    const statut = statutEffectif(medecinId, dateISO, heure, exceptions, rdvs);
    if (statut === "reserve") {
      const e = empreinte(`${medecinId}|${dateISO}|${heure}|demo`);
      return {
        heure,
        statut,
        patient: PATIENTS_DEMO[e % PATIENTS_DEMO.length],
        motif: MOTIFS_DEMO[e % MOTIFS_DEMO.length],
        demo: true,
      };
    }
    return { heure, statut };
  });
}
