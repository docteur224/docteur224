"use client";

import { useEffect, useState } from "react";
import { creerClientNavigateur } from "@/lib/supabase/client";
import { creneauReservable } from "@/lib/dates";

/*
 * Couche de données du parcours patient (client) : session, proches,
 * rendez-vous — lectures et écritures réelles dans Supabase, protégées
 * par RLS (un patient ne voit que ses données et celles de ses proches).
 * Remplace lib/mock-patient.ts, lib/mock-proches.ts et lib/mock-rdv.ts.
 */

export interface ProfilConnecte {
  id: string;
  role: string;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  dateNaissance?: string;
  genre?: string;
  villeId?: string | null;
}

let cacheProfil: ProfilConnecte | null | undefined;
const ecouteursProfil = new Set<() => void>();

async function chargerProfil(): Promise<ProfilConnecte | null> {
  const supabase = creerClientNavigateur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data: u } = await supabase
    .from("utilisateurs")
    .select("id, role, nom, prenom, email, telephone")
    .eq("id", auth.user.id)
    .single();
  if (!u) return null;
  let dateNaissance: string | undefined;
  let genre: string | undefined;
  let villeId: string | null = null;
  if (u.role === "patient") {
    const { data: p } = await supabase
      .from("patients")
      .select("date_naissance, genre, ville_id")
      .eq("id", u.id)
      .single();
    dateNaissance = p?.date_naissance ?? undefined;
    genre = p?.genre ?? undefined;
    villeId = p?.ville_id ?? null;
  }
  return {
    id: u.id,
    role: u.role,
    nom: u.nom ?? "",
    prenom: u.prenom ?? "",
    email: u.email,
    telephone: u.telephone ?? "",
    dateNaissance,
    genre,
    villeId,
  };
}

/** Profil de l'utilisateur connecté (null si déconnecté). */
export function useProfilConnecte(): { profil: ProfilConnecte | null; chargement: boolean } {
  const [profil, setProfil] = useState<ProfilConnecte | null>(cacheProfil ?? null);
  const [chargement, setChargement] = useState(cacheProfil === undefined);

  useEffect(() => {
    let actif = true;
    const rafraichir = () =>
      chargerProfil().then((p) => {
        cacheProfil = p;
        if (actif) {
          setProfil(p);
          setChargement(false);
        }
        ecouteursProfil.forEach((e) => e());
      });
    rafraichir();
    const { data: abo } = creerClientNavigateur().auth.onAuthStateChange(() => {
      cacheProfil = undefined;
      rafraichir();
    });
    return () => {
      actif = false;
      abo.subscription.unsubscribe();
    };
  }, []);

  return { profil, chargement };
}

/** Villes du référentiel (pour le sélecteur de profil). */
export function useVilles(): { id: string; nom: string }[] {
  const [villes, setVilles] = useState<{ id: string; nom: string }[]>([]);
  useEffect(() => {
    let actif = true;
    creerClientNavigateur()
      .from("villes")
      .select("id, nom")
      .order("nom")
      .then(({ data }) => {
        if (actif) setVilles(data ?? []);
      });
    return () => {
      actif = false;
    };
  }, []);
  return villes;
}

/** Enregistre le profil du patient connecté (utilisateurs + patients). */
export async function enregistrerProfilPatient(d: {
  nom: string;
  prenom: string;
  telephone: string;
  dateNaissance: string;
  genre: string; // "Féminin" | "Masculin"
  villeId: string | null;
}): Promise<{ erreur?: string }> {
  const supabase = creerClientNavigateur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { erreur: "Session expirée — reconnectez-vous." };
  const { error: e1 } = await supabase
    .from("utilisateurs")
    .update({ nom: d.nom, prenom: d.prenom, telephone: d.telephone })
    .eq("id", auth.user.id);
  if (e1) return { erreur: e1.message };
  const { error: e2 } = await supabase
    .from("patients")
    .update({
      date_naissance: d.dateNaissance || null,
      genre: d.genre === "Masculin" ? "M" : "F",
      ville_id: d.villeId,
    })
    .eq("id", auth.user.id);
  if (e2) return { erreur: e2.message };
  cacheProfil = undefined; // le prochain useProfilConnecte relira la base
  return {};
}

/* ===== Paramètres (préférences de notification, en base) ===== */

export interface ParametresPatient {
  rappelsSms: boolean;
  rappelsEmail: boolean;
  offres: boolean;
  deuxFacteurs: boolean; // pas encore fonctionnel côté auth — non persisté
}

const PARAMETRES_DEFAUT: ParametresPatient = {
  rappelsSms: true,
  rappelsEmail: true,
  offres: false,
  deuxFacteurs: false,
};

export function useParametresPatient(): {
  parametres: ParametresPatient;
  basculer: (cle: keyof ParametresPatient, valeur: boolean) => void;
} {
  const [parametres, setParametres] = useState<ParametresPatient>(PARAMETRES_DEFAUT);

  useEffect(() => {
    let actif = true;
    (async () => {
      const supabase = creerClientNavigateur();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase
        .from("patients")
        .select("pref_rappels_sms, pref_rappels_email, pref_offres")
        .eq("id", auth.user.id)
        .single();
      if (actif && data) {
        setParametres((p) => ({
          ...p,
          rappelsSms: data.pref_rappels_sms,
          rappelsEmail: data.pref_rappels_email,
          offres: data.pref_offres,
        }));
      }
    })();
    return () => {
      actif = false;
    };
  }, []);

  function basculer(cle: keyof ParametresPatient, valeur: boolean) {
    setParametres((p) => ({ ...p, [cle]: valeur }));
    if (cle === "deuxFacteurs") return; // pas de persistance pour l'instant
    const colonne =
      cle === "rappelsSms" ? "pref_rappels_sms" : cle === "rappelsEmail" ? "pref_rappels_email" : "pref_offres";
    (async () => {
      const supabase = creerClientNavigateur();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      await supabase.from("patients").update({ [colonne]: valeur }).eq("id", auth.user.id);
    })();
  }

  return { parametres, basculer };
}

/* ===== Proches ===== */

export const LIENS_PROCHE = [
  "Mon fils",
  "Ma fille",
  "Mon conjoint",
  "Ma conjointe",
  "Mon père",
  "Ma mère",
  "Autre",
];

export interface Proche {
  id: string;
  nom: string;
  prenom: string;
  lien: string;
  dateNaissance: string;
  genre: string;
  gradient: string;
}

const GRADIENTS_PROCHES = [
  "linear-gradient(135deg,#E08E45,#C0392B)",
  "linear-gradient(135deg,#16A085,#0E6655)",
  "linear-gradient(135deg,#6C5CE7,#341F97)",
  "linear-gradient(135deg,#1E7B45,#15506B)",
];

function gradientProche(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return GRADIENTS_PROCHES[Math.abs(h) % GRADIENTS_PROCHES.length];
}

interface LigneProche {
  id: string;
  nom: string;
  prenom: string;
  lien: string;
  date_naissance: string | null;
  genre: string | null;
}

const versProche = (l: LigneProche): Proche => ({
  id: l.id,
  nom: l.nom,
  prenom: l.prenom,
  lien: l.lien,
  dateNaissance: l.date_naissance ?? "",
  genre: l.genre === "M" ? "Homme" : "Femme",
  gradient: gradientProche(l.id),
});

export function useProches(): { proches: Proche[]; recharger: () => void } {
  const [proches, setProches] = useState<Proche[]>([]);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let actif = true;
    creerClientNavigateur()
      .from("proches")
      .select("id, nom, prenom, lien, date_naissance, genre")
      .order("cree_le")
      .then(({ data }) => {
        if (actif) setProches(((data ?? []) as LigneProche[]).map(versProche));
      });
    return () => {
      actif = false;
    };
  }, [version]);
  return { proches, recharger: () => setVersion((v) => v + 1) };
}

export async function ajouterProche(d: {
  nom: string;
  prenom: string;
  lien: string;
  dateNaissance: string;
  genre: string;
}): Promise<{ proche?: Proche; erreur?: string }> {
  const supabase = creerClientNavigateur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { erreur: "Connectez-vous pour ajouter un proche." };
  const { data, error } = await supabase
    .from("proches")
    .insert({
      patient_id: auth.user.id,
      nom: d.nom,
      prenom: d.prenom,
      lien: d.lien,
      date_naissance: d.dateNaissance || null,
      genre: d.genre === "Homme" ? "M" : "F",
    })
    .select("id, nom, prenom, lien, date_naissance, genre")
    .single();
  if (error) return { erreur: error.message };
  return { proche: versProche(data as LigneProche) };
}

export async function modifierProche(id: string, d: Partial<{ nom: string; prenom: string; lien: string; dateNaissance: string; genre: string }>): Promise<{ erreur?: string }> {
  const { error } = await creerClientNavigateur()
    .from("proches")
    .update({
      ...(d.nom !== undefined && { nom: d.nom }),
      ...(d.prenom !== undefined && { prenom: d.prenom }),
      ...(d.lien !== undefined && { lien: d.lien }),
      ...(d.dateNaissance !== undefined && { date_naissance: d.dateNaissance || null }),
      ...(d.genre !== undefined && { genre: d.genre === "Homme" ? "M" : "F" }),
    })
    .eq("id", id);
  return error ? { erreur: error.message } : {};
}

export async function supprimerProche(id: string): Promise<{ erreur?: string }> {
  const { error } = await creerClientNavigateur().from("proches").delete().eq("id", id);
  return error ? { erreur: error.message } : {};
}

/* ===== Rendez-vous ===== */

export interface RendezVousPatient {
  id: string;
  medecinId: string;
  medecinNom: string;
  specialite: string;
  etablissementNom: string;
  ville: string;
  date: string;
  heure: string;
  tarif: number;
  motif: string;
  pourQui: string;
  procheId?: string;
  statut: "en_attente" | "confirme" | "annule" | "honore";
}

interface LigneRdv {
  id: string;
  medecin_id: string;
  date: string;
  heure: string;
  motif: string | null;
  statut: RendezVousPatient["statut"];
  proche_id: string | null;
  patient_id: string | null;
  medecins: {
    civilite: string;
    tarif_consultation: number | null;
    utilisateurs: { nom: string | null; prenom: string | null } | null;
    specialites: { nom: string } | null;
    villes: { nom: string } | null;
    etablissements: { nom: string } | null;
  } | null;
  proches: { nom: string; prenom: string; lien: string } | null;
}

const SELECTION_RDV = `
  id, medecin_id, date, heure, motif, statut, proche_id, patient_id,
  medecins (
    civilite, tarif_consultation,
    utilisateurs ( nom, prenom ),
    specialites ( nom ),
    villes ( nom ),
    etablissements ( nom )
  ),
  proches ( nom, prenom, lien )
`;

function versRdv(l: LigneRdv): RendezVousPatient {
  const m = l.medecins;
  return {
    id: l.id,
    medecinId: l.medecin_id,
    medecinNom: m
      ? `${m.civilite === "Pr" ? "Pr" : "Dr"} ${m.utilisateurs?.prenom ?? ""} ${m.utilisateurs?.nom ?? ""}`.trim()
      : "Médecin",
    specialite: m?.specialites?.nom ?? "",
    etablissementNom: m?.etablissements?.nom ?? "Cabinet",
    ville: m?.villes?.nom ?? "",
    date: l.date,
    heure: l.heure.slice(0, 5),
    tarif: m?.tarif_consultation ?? 0,
    motif: l.motif ?? "",
    pourQui: l.proches
      ? `${l.proches.prenom} ${l.proches.nom} (${l.proches.lien.toLowerCase()})`
      : "Moi-même",
    procheId: l.proche_id ?? undefined,
    statut: l.statut,
  };
}

export function useMesRendezVous(): { rdvs: RendezVousPatient[]; chargement: boolean; recharger: () => void } {
  const [rdvs, setRdvs] = useState<RendezVousPatient[]>([]);
  const [chargement, setChargement] = useState(true);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let actif = true;
    creerClientNavigateur()
      .from("rendez_vous")
      .select(SELECTION_RDV)
      .order("date", { ascending: false })
      .order("heure", { ascending: false })
      .then(({ data }) => {
        if (!actif) return;
        setRdvs(((data ?? []) as unknown as LigneRdv[]).map(versRdv));
        setChargement(false);
      });
    return () => {
      actif = false;
    };
  }, [version]);
  return { rdvs, chargement, recharger: () => setVersion((v) => v + 1) };
}

/* ----- Détail d'un rendez-vous (écran /mes-rendez-vous/[id]) ----- */

/**
 * Tout ce que la carte ne montre pas : coordonnées du lieu de consultation,
 * téléphone à appeler, motif. Sert uniquement à l'écran de détail.
 */
export interface DetailRendezVous extends RendezVousPatient {
  etablissementType: string;
  adresse: string;
  quartier: string;
  /** Téléphone à composer : secrétariat du médecin, sinon standard de l'établissement. */
  telephone: string;
  /** URL Google Maps du médecin, ou "lat,long" — vide si non renseigné. */
  localisation: string;
  civilite: string;
}

interface LigneRdvDetail extends LigneRdv {
  medecins:
    | (NonNullable<LigneRdv["medecins"]> & {
        telephone_secretariat: string | null;
        localisation: string | null;
        quartier: string | null;
        etablissements:
          | {
              nom: string;
              type: string | null;
              adresse: string | null;
              quartier: string | null;
              telephone: string | null;
            }
          | null;
      })
    | null;
}

const SELECTION_RDV_DETAIL = `
  id, medecin_id, date, heure, motif, statut, proche_id, patient_id,
  medecins (
    civilite, tarif_consultation, telephone_secretariat, localisation, quartier,
    utilisateurs ( nom, prenom ),
    specialites ( nom ),
    villes ( nom ),
    etablissements ( nom, type, adresse, quartier, telephone )
  ),
  proches ( nom, prenom, lien )
`;

/**
 * Un rendez-vous du patient connecté, avec les détails du lieu.
 * `null` = introuvable ou hors périmètre RLS (rendez-vous d'un autre patient).
 */
export function useRendezVous(id: string): {
  rdv: DetailRendezVous | null;
  chargement: boolean;
  recharger: () => void;
} {
  // `resultat` porte la clé de la requête qui l'a produit : tant qu'elle ne
  // correspond pas à la demande courante, on est en chargement — pas besoin
  // d'un setState synchrone dans l'effet (interdit par le linter React).
  const [resultat, setResultat] = useState<{ cle: string; rdv: DetailRendezVous | null } | null>(
    null
  );
  const [version, setVersion] = useState(0);
  const cle = `${id}#${version}`;

  useEffect(() => {
    let actif = true;
    creerClientNavigateur()
      .from("rendez_vous")
      .select(SELECTION_RDV_DETAIL)
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (!actif) return;
        const l = data as unknown as LigneRdvDetail | null;
        const m = l?.medecins;
        const etab = m?.etablissements ?? null;
        setResultat({
          cle,
          rdv: l
            ? {
                ...versRdv(l),
                etablissementType: etab?.type ?? "",
                adresse: etab?.adresse ?? "",
                quartier: etab?.quartier ?? m?.quartier ?? "",
                telephone: m?.telephone_secretariat || etab?.telephone || "",
                localisation: m?.localisation ?? "",
                civilite: m?.civilite === "Pr" ? "Pr" : "Dr",
              }
            : null,
        });
      });
    return () => {
      actif = false;
    };
  }, [id, cle]);

  const aJour = resultat?.cle === cle;
  return {
    rdv: aJour ? resultat.rdv : null,
    chargement: !aJour,
    recharger: () => setVersion((v) => v + 1),
  };
}

export async function reserverRendezVous(d: {
  medecinId: string;
  date: string;
  heure: string;
  motif: string;
  procheId?: string;
}): Promise<{ erreur?: string }> {
  if (!creneauReservable(d.date, d.heure)) {
    return { erreur: "Ce créneau n'est plus disponible. Choisissez un autre horaire." };
  }
  const supabase = creerClientNavigateur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { erreur: "non_connecte" };
  const { error } = await supabase.from("rendez_vous").insert({
    medecin_id: d.medecinId,
    date: d.date,
    heure: d.heure,
    reserve_par: auth.user.id,
    reserve_par_role: "patient",
    patient_id: d.procheId ? null : auth.user.id,
    proche_id: d.procheId ?? null,
    motif: d.motif || null,
    statut: "en_attente",
    source: "en_ligne",
  });
  if (error) {
    if (error.code === "23505") return { erreur: "Ce créneau vient d'être réservé. Choisissez-en un autre." };
    return { erreur: error.message };
  }
  return {};
}

export async function annulerRendezVous(id: string): Promise<{ erreur?: string }> {
  const { error } = await creerClientNavigateur()
    .from("rendez_vous")
    .update({ statut: "annule" })
    .eq("id", id);
  return error ? { erreur: error.message } : {};
}

export async function reprogrammerRendezVous(
  id: string,
  date: string,
  heure: string
): Promise<{ erreur?: string }> {
  if (!creneauReservable(date, heure)) {
    return { erreur: "Ce créneau n'est plus disponible. Choisissez un autre horaire." };
  }
  const { error } = await creerClientNavigateur()
    .from("rendez_vous")
    .update({ date, heure, statut: "en_attente" })
    .eq("id", id);
  return error ? { erreur: error.message } : {};
}
