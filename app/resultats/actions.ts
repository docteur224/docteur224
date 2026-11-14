"use server";

import {
  chargerIndisponibilites,
  chargerMedecins,
  prochaineDisponibilite,
  type EtatCreneau,
} from "@/lib/donnees";
import { prochainsJours } from "@/lib/dates";

/**
 * Prochaine heure réservable de chaque médecin d'une fournée — pour le
 * défilement infini de la liste mobile (voir ResultatsMobileInfini).
 *
 * La page rend la première fournée avec ses dispos déjà calculées ; les
 * fournées suivantes arrivent ici, au fil du défilement, pour ne pas lancer
 * une requête par praticien sur toute la liste d'un coup.
 *
 * On ne reçoit que des identifiants : les plages horaires sont relues côté
 * serveur plutôt que renvoyées par le client (qui pourrait mentir). Les
 * identifiants inconnus sont ignorés, et le nombre traité par appel est
 * plafonné — une Server Action est joignable par POST direct, pas seulement
 * par notre interface.
 */
const PLAFOND = 60;

export async function chargerDisposResultats(
  ids: string[]
): Promise<Record<string, string>> {
  const voulus = [...new Set(ids)].slice(0, PLAFOND);
  if (voulus.length === 0) return {};

  // Table des plages horaires, relue et indexée par identifiant. Un seul
  // chargement, partagé par toute la fournée.
  const parId = new Map((await chargerMedecins()).map((m) => [m.id, m] as const));

  const jours = prochainsJours([], 14);
  const paires = await Promise.all(
    voulus.map(async (id) => {
      const m = parId.get(id);
      if (!m) return [id, ""] as const;

      let etats: Map<string, EtatCreneau>;
      try {
        etats = await chargerIndisponibilites(m.id, jours[0]?.iso, jours.at(-1)?.iso);
      } catch {
        // Indisponibilités illisibles : on retombe sur les horaires-types
        // seuls plutôt que de faire échouer la fournée entière.
        etats = new Map();
      }
      const joursMedecin = jours.map((j) => ({
        iso: j.iso,
        ferme: m.joursFermes.includes(new Date(`${j.iso}T00:00:00`).getDay()),
      }));
      const dispo = prochaineDisponibilite(m.plages, etats, joursMedecin, 4);
      return [id, dispo?.heures[0] ?? ""] as const;
    })
  );
  return Object.fromEntries(paires);
}
