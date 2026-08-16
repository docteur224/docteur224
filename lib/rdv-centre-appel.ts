"use client";

import { useEffect, useMemo, useState } from "react";
import { creerClientNavigateur } from "@/lib/supabase/client";
import { chargerMedecins, type MedecinAvecPlages } from "@/lib/donnees";
import { cleGeo } from "@/lib/carte";
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
/**
 * Communes réellement couvertes dans une ville, dans l'ordre alphabétique.
 *
 * Déduites des praticiens eux-mêmes et NON du référentiel `communes` :
 * `medecins.commune` est du texte libre depuis la migration 0023, et proposer
 * une commune du référentiel où personne n'exerce ne ramènerait aucun
 * résultat. Le regroupement se fait sur la clé normalisée (`cleGeo`), pour que
 * « Matam » et « matam » ne fassent qu'une entrée ; le libellé affiché est le
 * premier rencontré.
 */
export function useCommunesDeLaVille(
  medecins: MedecinAvecPlages[],
  ville: string
): { cle: string; libelle: string; nb: number }[] {
  return useMemo(() => {
    if (!ville) return [];
    const parCle = new Map<string, { cle: string; libelle: string; nb: number }>();
    for (const m of medecins) {
      if (m.ville !== ville || !m.commune?.trim()) continue;
      const cle = cleGeo(m.commune);
      const connue = parCle.get(cle);
      if (connue) connue.nb += 1;
      else parCle.set(cle, { cle, libelle: m.commune.trim(), nb: 1 });
    }
    return [...parCle.values()].sort((a, b) => a.libelle.localeCompare(b.libelle, "fr"));
  }, [medecins, ville]);
}

export function useMedecinsFiltres(
  medecins: MedecinAvecPlages[],
  filtres: {
    recherche: string;
    specialite: string;
    ville: string;
    /** Clé normalisée (`cleGeo`), pas le libellé : la colonne est du texte libre. */
    commune: string;
    domicile: boolean;
  },
  dispos: Map<string, DispoMedecin>,
  tri: "plus_tot" | "note"
): MedecinAvecPlages[] {
  const { recherche, specialite, ville, commune, domicile } = filtres;
  return useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const liste = medecins.filter((m) => {
      if (specialite && m.specialite !== specialite) return false;
      if (ville && m.ville !== ville) return false;
      if (commune && cleGeo(m.commune ?? "") !== commune) return false;
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
  }, [medecins, recherche, specialite, ville, commune, domicile, dispos, tri]);
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

/** Ce qui est réellement parti chez le patient, canal par canal. */
export interface EnvoiConfirmation {
  canalTelephone: string | null;
  telephone: string | null;
  emailEnvoye: boolean;
  email: string | null;
  simule: boolean;
  erreurs: string[];
}

/** Phrase à afficher à l'opérateur : ce que le patient a reçu, ou non. */
export function resumeEnvoi(envoi: EnvoiConfirmation | null | undefined): string {
  if (!envoi) return "";
  const partis: string[] = [];
  if (envoi.canalTelephone) {
    partis.push(envoi.canalTelephone === "sms" ? "SMS" : "WhatsApp");
  }
  if (envoi.emailEnvoye) partis.push("e-mail");
  if (partis.length === 0) {
    return envoi.erreurs[0] ?? "Aucun message n’a pu être envoyé — prévenez l’appelant de vive voix.";
  }
  // « Simulé » n'est pas un détail à cacher : tant que la messagerie n'est pas
  // en mode réel, le patient ne reçoit RIEN et l'opérateur doit le savoir.
  return envoi.simule
    ? `Confirmation ${partis.join(" + ")} préparée, mais la messagerie est en mode simulé : rien n’est parti.`
    : `Confirmation envoyée par ${partis.join(" + ")}.`;
}

async function appelerRoute(
  url: string,
  init: RequestInit
): Promise<{ id?: string; envoi?: EnvoiConfirmation; erreur?: string }> {
  try {
    const reponse = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    const corps = await reponse.json().catch(() => ({}));
    if (!reponse.ok) return { erreur: corps.erreur ?? "L’opération a échoué." };
    return corps;
  } catch {
    return { erreur: "Connexion impossible. Vérifiez votre réseau, puis réessayez." };
  }
}

/**
 * Une seule écriture côté base — la fonction crée la fiche s'il le faut, pose
 * le rendez-vous et inscrit la décision au journal d'audit — puis la
 * confirmation part chez le patient.
 *
 * Le passage par une route serveur n'est pas un détour : l'envoi lit les
 * secrets de l'agrégateur et appelle `enregistrer_message`, tous deux
 * inaccessibles depuis le navigateur. Les messages de refus remontent en
 * clair, rédigés en français par la fonction SQL.
 */
export async function creerRdvCentreAppel(
  d: DemandeRdv
): Promise<{ id?: string; envoi?: EnvoiConfirmation; erreur?: string }> {
  return appelerRoute("/api/admin/rdv-centre-appel", {
    method: "POST",
    body: JSON.stringify({
      medecinId: d.medecinId,
      date: d.date,
      heure: d.heure,
      motif: d.motif,
      lieu: d.lieu,
      adresseDomicile: d.adresseDomicile,
      patientCle: d.patientCle,
      nouvelleFiche: d.nouvelleFiche,
    }),
  });
}

/* ===== 3 bis. Reprendre un rendez-vous déjà posé ===== */

/** Déplacer : le patient est prévenu du nouvel horaire. */
export async function reprogrammerRdv(
  id: string,
  date: string,
  heure: string,
  motif?: string
): Promise<{ envoi?: EnvoiConfirmation; erreur?: string }> {
  return appelerRoute(`/api/admin/rdv-centre-appel/${id}`, {
    method: "PUT",
    body: JSON.stringify({ date, heure, motif }),
  });
}

/** Annuler : le motif est obligatoire, le patient et le praticien sont prévenus. */
export async function annulerRdv(
  id: string,
  motif: string
): Promise<{ envoi?: EnvoiConfirmation; erreur?: string }> {
  return appelerRoute(`/api/admin/rdv-centre-appel/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ motif }),
  });
}

/**
 * Supprimer définitivement. Aucun message n'est envoyé : la fonction SQL
 * n'accepte qu'un rendez-vous DÉJÀ annulé, donc dont les intéressés ont déjà
 * été prévenus. L'appel reste une RPC directe, rien n'a à sortir du serveur.
 */
export async function supprimerRdv(id: string): Promise<{ erreur?: string }> {
  const { error } = await creerClientNavigateur().rpc("supprimer_rdv_centre_appel", { p_rdv: id });
  return error ? { erreur: error.message } : {};
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

/* ===== 5. Les appels traités ===== */

export interface AppelTraite {
  id: string;
  date: string;
  heure: string;
  patient: string;
  typeFiche: TypeFiche;
  /** Numéro à rappeler — celui du titulaire quand le RDV est pour un proche. */
  telephone: string;
  email: string;
  /** Renseigné seulement pour un proche : le titulaire du compte. */
  titulaire: string;
  medecinId: string;
  medecin: string;
  medecinTelephone: string;
  motif: string;
  lieu: string;
  adresseDomicile: string;
  statut: string;
  motifAnnulation: string;
  source: string;
  prisPar: string;
  prisLe: string;
  gradient: string;
}

/** Filtres d'état de la liste, dans l'ordre où l'opérateur les cherche. */
export const FILTRES_APPELS = [
  { cle: "", label: "Tous les états" },
  { cle: "a_venir", label: "À venir" },
  { cle: "confirme", label: "Confirmés" },
  { cle: "passes", label: "Passés" },
  { cle: "honore", label: "Honorés" },
  { cle: "annule", label: "Annulés" },
] as const;

export const APPELS_PAR_PAGE = 15;

export function useAppelsTraites(
  recherche: string,
  statut: string,
  portee: "console" | "tous",
  page: number
): {
  appels: AppelTraite[];
  total: number;
  chargement: boolean;
  erreur: string;
  recharger: () => void;
} {
  const [version, setVersion] = useState(0);
  const [resultat, setResultat] = useState<{
    cle: string;
    appels: AppelTraite[];
    total: number;
    erreur: string;
  } | null>(null);
  const cle = `${recherche}#${statut}#${portee}#${page}#${version}`;

  useEffect(() => {
    let actif = true;
    creerClientNavigateur()
      .rpc("appels_centre_appel", {
        p_recherche: recherche,
        p_statut: statut,
        p_portee: portee,
        p_limite: APPELS_PAR_PAGE,
        p_decalage: page * APPELS_PAR_PAGE,
      })
      .then(({ data, error }) => {
        if (!actif) return;
        const lignes = (data ?? []) as {
          id: string;
          jour: string;
          heure: string;
          patient: string;
          type_fiche: TypeFiche;
          telephone: string;
          email: string;
          titulaire: string;
          medecin_id: string;
          medecin: string;
          medecin_telephone: string;
          motif: string;
          lieu: string;
          adresse_domicile: string;
          statut: string;
          motif_annulation: string;
          source: string;
          pris_par: string;
          pris_le: string;
          total: number;
        }[];
        setResultat({
          cle,
          erreur: error?.message ?? "",
          total: Number(lignes[0]?.total ?? 0),
          appels: lignes.map((l) => ({
            id: l.id,
            date: l.jour,
            heure: String(l.heure).slice(0, 5),
            patient: l.patient,
            typeFiche: l.type_fiche,
            telephone: l.telephone,
            email: l.email,
            titulaire: l.titulaire,
            medecinId: l.medecin_id,
            medecin: l.medecin,
            medecinTelephone: l.medecin_telephone,
            motif: l.motif,
            lieu: l.lieu,
            adresseDomicile: l.adresse_domicile,
            statut: l.statut,
            motifAnnulation: l.motif_annulation,
            source: l.source,
            prisPar: l.pris_par,
            prisLe: l.pris_le,
            gradient: gradientPour(l.id),
          })),
        });
      });
    return () => {
      actif = false;
    };
  }, [cle, recherche, statut, portee, page]);

  const aJour = resultat?.cle === cle;
  return {
    appels: aJour ? resultat.appels : AUCUN_APPEL,
    total: aJour ? resultat.total : 0,
    chargement: !aJour,
    erreur: aJour ? resultat.erreur : "",
    recharger: () => setVersion((v) => v + 1),
  };
}

const AUCUN_APPEL: AppelTraite[] = [];

/* ===== Divers ===== */

/** Aujourd'hui au format ISO — borne minimale des sélecteurs de date. */
export const aujourdHuiISO = () => versISO(new Date());
