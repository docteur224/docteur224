import { basculerCreneauLocal } from "@/lib/mock-disponibilites";
import {
  lirePermissionsAssistante,
  type PermissionsAssistante,
} from "@/lib/mock-medecin";
import {
  annulerRendezVousLocal,
  reprogrammerRendezVousLocal,
} from "@/lib/mock-rdv";

/*
 * Actions de l'assistant(e), TOUJOURS gardées par les permissions accordées
 * par le médecin (grille C.4.3/C.4.4) — l'équivalent mock de la future Row
 * Level Security : même si l'interface était contournée, ces fonctions
 * refusent l'action. La vraie barrière côté serveur (RLS) arrivera avec la
 * base de données ; les écrans, eux, ne changeront pas.
 */

export interface ResultatAction {
  ok: boolean;
  erreur?: string;
}

function verifier(cle: keyof PermissionsAssistante, libelle: string): ResultatAction {
  if (!lirePermissionsAssistante()[cle]) {
    return {
      ok: false,
      erreur: `⛔ Action refusée : la permission « ${libelle} » ne vous a pas été accordée par le médecin.`,
    };
  }
  return { ok: true };
}

export function assistanteBasculeCreneau(
  medecinId: string,
  dateISO: string,
  heure: string
): ResultatAction {
  const acces = verifier("gererCreneaux", "Ouvrir / fermer des créneaux");
  if (!acces.ok) return acces;
  basculerCreneauLocal(medecinId, dateISO, heure);
  return { ok: true };
}

export function assistanteAnnuleRdv(id: string): ResultatAction {
  const acces = verifier("confirmerAnnuler", "Confirmer / annuler les rendez-vous");
  if (!acces.ok) return acces;
  annulerRendezVousLocal(id);
  return { ok: true };
}

export function assistanteReprogrammeRdv(
  id: string,
  dateISO: string,
  heure: string
): ResultatAction {
  const acces = verifier("reprogrammer", "Reprogrammer un rendez-vous");
  if (!acces.ok) return acces;
  reprogrammerRendezVousLocal(id, dateISO, heure);
  return { ok: true };
}

export function assistantePeutCreerRdv(): ResultatAction {
  return verifier("creerRdv", "Créer un rendez-vous pour un patient");
}
