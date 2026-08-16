"use client";

import { useEffect, useMemo, useState } from "react";
import { creerClientNavigateur } from "@/lib/supabase/client";
import { chargerMedecins, type MedecinAvecPlages } from "@/lib/donnees";
import { versISO } from "@/lib/dates";

/*
 * Couche de données du centre d'appel (espace admin).
 *
 * L'opérateur qui décroche ne travaille pas comme un praticien : il ne
 * réserve pas sur SON agenda, il doit d'abord retrouver l'appelant dans toute
 * la plateforme, puis choisir un praticien, puis un créneau. Les trois
 * fonctions de la migration 0046 portent ce travail côté base — recherche
 * unifiée, premières disponibilités en un aller-retour, et création tracée.
 *
 * Tout passe par des RPC et non par PostgREST : les jointures sont
 * conditionnelles (compte / proche / fiche sans compte) et la création doit
 * rester une seule transaction.
 */

/* ===== 1. Retrouver l'appelant ===== */

export type TypeFiche = "compte" | "proche" | "sans_compte";

export interface FichePatient {
  /** « c-<uuid> » compte, « p-<uuid> » proche, « s-<uuid> » fiche sans compte. */
  cle: string;
  type: TypeFiche;
  nom: string;
  prenom: string;
  nomComplet: string;
  telephone: string;
  dateNaissance: string | null;
  /** Titulaire du compte, pour un proche. */
  titulaire: string;
  lien: string;
  ville: string;
  /** `actif` | `suspendu` | `en_attente` | `sans_compte`. */
  statutCompte: string;
  /** Rendez-vous à venir déjà posés pour cette personne. */
  nbRdv: number;
  prochainRdv: { date: string; heure: string; medecin: string } | null;
  gradient: string;
}

const GRADIENTS = [
  "linear-gradient(135deg,#E08E45,#C0392B)",
  "linear-gradient(135deg,#2E9CCA,#15506B)",
  "linear-gradient(135deg,#16A085,#0E6655)",
  "linear-gradient(135deg,#6C5CE7,#341F97)",
  "linear-gradient(135deg,#1E7B45,#15506B)",
  "linear-gradient(135deg,#7A5BB5,#15506B)",
];

function gradientPour(cle: string): string {
  let h = 0;
  for (let i = 0; i < cle.length; i++) h = (Math.imul(h, 31) + cle.charCodeAt(i)) | 0;
  return GRADIENTS[Math.abs(h) % GRADIENTS.length];
}

export const LIBELLE_TYPE_FICHE: Record<TypeFiche, string> = {
  compte: "Compte patient",
  proche: "Proche",
  sans_compte: "Fiche cabinet",
};

/** Deux caractères : en deçà, la base ne répond rien (elle ne déverse pas l'annuaire). */
export const LONGUEUR_RECHERCHE_MINI = 2;

interface LigneRecherche {
  cle: string;
  type_fiche: TypeFiche;
  nom: string;
  prenom: string;
  telephone: string;
  date_naissance: string | null;
  titulaire: string;
  lien: string;
  ville: string;
  statut_compte: string;
  nb_rdv: number;
  prochain_rdv_date: string | null;
  prochain_rdv_heure: string | null;
  prochain_rdv_medecin: string | null;
}

export function useRecherchePatients(recherche: string): {
  fiches: FichePatient[];
  chargement: boolean;
  erreur: string;
} {
  // La clé de requête vit dans l'état : `chargement` s'en déduit sans
  // setState en tête d'effet, que le linter React interdit.
  const [resultat, setResultat] = useState<{
    cle: string;
    fiches: FichePatient[];
    erreur: string;
  } | null>(null);
  const assezLong = recherche.trim().length >= LONGUEUR_RECHERCHE_MINI;

  useEffect(() => {
    // Recherche trop courte : rien à demander, et rien à poser dans l'état —
    // le cas vide se lit au rendu (le linter refuse un setState en tête
    // d'effet, et il aurait déclenché un rendu de plus par frappe).
    if (!assezLong) return;
    let actif = true;
    creerClientNavigateur()
      .rpc("rechercher_patients_centre_appel", { p_recherche: recherche, p_limite: 12 })
      .then(({ data, error }) => {
        if (!actif) return;
        setResultat({
          cle: recherche,
          erreur: error?.message ?? "",
          fiches: ((data ?? []) as LigneRecherche[]).map((l) => ({
            cle: l.cle,
            type: l.type_fiche,
            nom: l.nom,
            prenom: l.prenom,
            nomComplet: `${l.prenom} ${l.nom}`.trim(),
            telephone: l.telephone,
            dateNaissance: l.date_naissance,
            titulaire: l.titulaire,
            lien: l.lien,
            ville: l.ville,
            statutCompte: l.statut_compte,
            nbRdv: Number(l.nb_rdv ?? 0),
            prochainRdv: l.prochain_rdv_date
              ? {
                  date: l.prochain_rdv_date,
                  heure: String(l.prochain_rdv_heure ?? "").slice(0, 5),
                  medecin: l.prochain_rdv_medecin ?? "",
                }
              : null,
            gradient: gradientPour(l.cle),
          })),
        });
      });
    return () => {
      actif = false;
    };
  }, [recherche, assezLong]);

  const aJour = assezLong && resultat?.cle === recherche;
  return {
    fiches: aJour ? resultat.fiches : AUCUNE_FICHE,
    chargement: assezLong && !aJour,
    erreur: aJour ? resultat.erreur : "",
  };
}

/** Constantes de module : une valeur vide recréée à chaque rendu ferait
 *  repartir les `useMemo` qui la reçoivent en dépendance. */
const AUCUNE_FICHE: FichePatient[] = [];
const AUCUNE_DISPO = new Map<string, DispoMedecin>();

/* ===== 2. Les praticiens et leur première disponibilité ===== */

export interface DispoMedecin {
  /** Première date libre, « AAAA-MM-JJ ». */
  date: string;
  heure: string;
  /** Créneaux encore libres ce jour-là. */
  libresCeJour: number;
  /** Créneaux libres sur toute la fenêtre interrogée. */
  libresTotal: number;
}

/** Fenêtre d'anticipation : deux semaines suffisent au téléphone. */
export const JOURS_DISPO = 14;

/**
 * Annuaire des praticiens validés — la même source que la recherche
 * publique, pour que l'opérateur voie exactement ce que voit un patient
 * (tarifs, spécialité, ville, visite à domicile).
 */
export function useAnnuaireMedecins(): { medecins: MedecinAvecPlages[]; chargement: boolean } {
  const [medecins, setMedecins] = useState<MedecinAvecPlages[] | null>(null);
  useEffect(() => {
    let actif = true;
    chargerMedecins()
      .then((liste) => actif && setMedecins(liste))
      .catch(() => actif && setMedecins([]));
    return () => {
      actif = false;
    };
  }, []);
  return { medecins: medecins ?? [], chargement: medecins === null };
}

/**
 * Première disponibilité de chaque praticien, en un seul appel.
 *
 * La page de résultats publique fait le même calcul dans le navigateur, mais
 * en interrogeant `heures_indisponibles` une fois PAR médecin. Au téléphone,
 * l'attente se compte en secondes : le calcul revient à la base.
 */
export function useProchainesDispos(medecinIds: string[]): {
  dispos: Map<string, DispoMedecin>;
  chargement: boolean;
  recharger: () => void;
} {
  const cle = medecinIds.join(",");
  const [version, setVersion] = useState(0);
  const [resultat, setResultat] = useState<{ cle: string; dispos: Map<string, DispoMedecin> } | null>(
    null
  );

  useEffect(() => {
    // Annuaire pas encore chargé : rien à interroger. Le cas vide se lit au
    // rendu, pas dans l'état (même règle que la recherche ci-dessus).
    if (!cle) return;
    const ids = cle.split(",");
    let actif = true;
    creerClientNavigateur()
      .rpc("prochaines_dispos_medecins", { p_medecin_ids: ids, p_jours: JOURS_DISPO })
      .then(({ data }) => {
        if (!actif) return;
        const dispos = new Map<string, DispoMedecin>();
        for (const l of (data ?? []) as {
          medecin_id: string;
          jour: string;
          heure: string;
          libres_ce_jour: number;
          libres_total: number;
        }[]) {
          dispos.set(l.medecin_id, {
            date: l.jour,
            heure: String(l.heure).slice(0, 5),
            libresCeJour: Number(l.libres_ce_jour ?? 0),
            libresTotal: Number(l.libres_total ?? 0),
          });
        }
        setResultat({ cle, dispos });
      });
    return () => {
      actif = false;
    };
  }, [cle, version]);

  const aJour = resultat?.cle === cle;
  return {
    dispos: aJour ? resultat.dispos : AUCUNE_DISPO,
    chargement: cle !== "" && !aJour,
    recharger: () => setVersion((v) => v + 1),
  };
}

/**
 * Filtre et classe l'annuaire pour l'opérateur. `dispos` n'entre dans le tri
 * que lorsqu'il est chargé : sans cela la liste se réordonnerait sous la
 * souris au retour de la requête.
 */
export function useMedecinsFiltres(
  medecins: MedecinAvecPlages[],
  filtres: { recherche: string; specialite: string; ville: string; domicile: boolean },
  dispos: Map<string, DispoMedecin>,
  tri: "plus_tot" | "note"
): MedecinAvecPlages[] {
  const { recherche, specialite, ville, domicile } = filtres;
  return useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const liste = medecins.filter((m) => {
      if (specialite && m.specialite !== specialite) return false;
      if (ville && m.ville !== ville) return false;
      if (domicile && !m.visiteDomicile) return false;
      if (!q) return true;
      return `${m.civilite} ${m.prenom} ${m.nom} ${m.specialite} ${m.ville} ${m.commune}`
        .toLowerCase()
        .includes(q);
    });
    if (tri === "note") {
      return [...liste].sort((a, b) => b.note - a.note || b.nbAvis - a.nbAvis);
    }
    // « Le plus tôt » : un praticien sans créneau dans la fenêtre part en fin
    // de liste plutôt que d'être masqué — l'opérateur doit pouvoir le
    // proposer quand même, quitte à rappeler.
    const quand = (id: string) => {
      const d = dispos.get(id);
      return d ? `${d.date} ${d.heure}` : "9999";
    };
    return [...liste].sort(
      (a, b) => quand(a.id).localeCompare(quand(b.id)) || b.note - a.note
    );
  }, [medecins, recherche, specialite, ville, domicile, dispos, tri]);
}

/* ===== 3. Poser le rendez-vous ===== */

export interface DemandeRdv {
  medecinId: string;
  date: string;
  heure: string;
  motif: string;
  lieu: "cabinet" | "domicile";
  adresseDomicile: string;
  /** Patient déjà connu de la plateforme. */
  patientCle?: string;
  /** Sinon, fiche minimale à créer (le patient n'a pas besoin de compte). */
  nouvelleFiche?: { nom: string; prenom: string; telephone: string };
}

/**
 * Une seule écriture : la base crée la fiche s'il le faut, pose le
 * rendez-vous, et inscrit la décision au journal d'audit. Les messages de
 * refus remontent en clair — ils sont rédigés en français par la fonction et
 * disent précisément ce qui a bloqué (créneau pris, praticien non validé…).
 */
export async function creerRdvCentreAppel(
  d: DemandeRdv
): Promise<{ id?: string; erreur?: string }> {
  const { data, error } = await creerClientNavigateur().rpc("creer_rdv_centre_appel", {
    p_medecin_id: d.medecinId,
    p_date: d.date,
    p_heure: d.heure,
    p_motif: d.motif || null,
    p_lieu: d.lieu,
    p_adresse_domicile: d.lieu === "domicile" ? d.adresseDomicile : null,
    p_patient_cle: d.patientCle ?? null,
    p_nouveau_nom: d.nouvelleFiche?.nom ?? null,
    p_nouveau_prenom: d.nouvelleFiche?.prenom ?? null,
    p_nouveau_telephone: d.nouvelleFiche?.telephone ?? null,
  });
  if (error) return { erreur: error.message };
  return { id: data as unknown as string };
}

/* ===== 4. Main courante ===== */

export interface RdvRecent {
  id: string;
  date: string;
  heure: string;
  patient: string;
  medecin: string;
  motif: string;
  lieu: string;
  statut: string;
  prisPar: string;
  prisLe: string;
}

/** Derniers rendez-vous posés par l'équipe d'administration. */
export function useRdvRecents(): { rdvs: RdvRecent[]; recharger: () => void } {
  const [rdvs, setRdvs] = useState<RdvRecent[]>([]);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let actif = true;
    creerClientNavigateur()
      .rpc("rdv_centre_appel_recents", { p_limite: 8 })
      .then(({ data }) => {
        if (!actif) return;
        setRdvs(
          ((data ?? []) as {
            id: string;
            jour: string;
            heure: string;
            patient: string;
            medecin: string;
            motif: string;
            lieu: string;
            statut: string;
            pris_par: string;
            pris_le: string;
          }[]).map((l) => ({
            id: l.id,
            date: l.jour,
            heure: String(l.heure).slice(0, 5),
            patient: l.patient,
            medecin: l.medecin,
            motif: l.motif,
            lieu: l.lieu,
            statut: l.statut,
            prisPar: l.pris_par,
            prisLe: l.pris_le,
          }))
        );
      });
    return () => {
      actif = false;
    };
  }, [version]);
  return { rdvs, recharger: () => setVersion((v) => v + 1) };
}

/* ===== Divers ===== */

/** Aujourd'hui au format ISO — borne minimale des sélecteurs de date. */
export const aujourdHuiISO = () => versISO(new Date());
