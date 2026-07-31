"use client";

import { useEffect, useState } from "react";
import { creerClientNavigateur } from "@/lib/supabase/client";
import { creneauReservable, versISO } from "@/lib/dates";

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
  const { data: lignes, error: e2 } = await supabase
    .from("patients")
    .update({
      date_naissance: d.dateNaissance || null,
      genre: d.genre === "Masculin" ? "M" : "F",
      ville_id: d.villeId,
    })
    .eq("id", auth.user.id)
    .select("id");
  if (e2) return { erreur: e2.message };
  // Un update qui ne touche aucune ligne ne remonte pas d'erreur : sans ce
  // contrôle, un compte sans fiche patient croyait avoir tout enregistré.
  if (!lignes?.length) {
    return { erreur: "Aucune fiche patient n'est rattachée à ce compte." };
  }
  cacheProfil = undefined; // le prochain useProfilConnecte relira la base
  return {};
}

/* ===== Sécurité du compte ===== */

/**
 * Change le mot de passe du compte connecté.
 * Supabase n'exige pas l'ancien mot de passe : on le vérifie nous-mêmes en
 * rejouant une connexion (même utilisateur, la session reste donc valide).
 */
export async function changerMotDePasse(
  actuel: string,
  nouveau: string
): Promise<{ erreur?: string }> {
  if (nouveau.length < 8) {
    return { erreur: "Le nouveau mot de passe doit contenir au moins 8 caractères." };
  }
  if (nouveau === actuel) {
    return { erreur: "Le nouveau mot de passe doit être différent de l'actuel." };
  }
  const supabase = creerClientNavigateur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user?.email) return { erreur: "Session expirée — reconnectez-vous." };
  const { error: eVerification } = await supabase.auth.signInWithPassword({
    email: auth.user.email,
    password: actuel,
  });
  if (eVerification) return { erreur: "Mot de passe actuel incorrect." };
  const { error } = await supabase.auth.updateUser({ password: nouveau });
  return error ? { erreur: error.message } : {};
}

/**
 * Demande le changement de l'adresse de connexion.
 *
 * Supabase envoie un lien de confirmation ; l'adresse ne bouge qu'une fois
 * celui-ci ouvert (et, si « Secure email change » est actif, après
 * confirmation des DEUX adresses). Rien n'est donc à jour immédiatement :
 * l'écran doit annoncer une demande, pas un changement. La table
 * `utilisateurs` est réalignée par le trigger `trg_synchroniser_email`
 * (migration 0014), sans quoi le profil afficherait l'ancienne adresse.
 */
export async function changerEmail(nouveau: string): Promise<{ erreur?: string; ancien?: string }> {
  const adresse = nouveau.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(adresse)) {
    return { erreur: "Cette adresse e-mail n'est pas valide." };
  }
  const supabase = creerClientNavigateur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { erreur: "Session expirée — reconnectez-vous." };
  if (auth.user.email?.toLowerCase() === adresse) {
    return { erreur: "C'est déjà votre adresse actuelle." };
  }
  const { error } = await supabase.auth.updateUser(
    { email: adresse },
    { emailRedirectTo: `${window.location.origin}/patient/profil` }
  );
  if (error) {
    return {
      erreur: error.message.includes("already registered")
        ? "Un compte utilise déjà cette adresse."
        : error.message,
    };
  }
  return { ancien: auth.user.email ?? "" };
}

/**
 * Suppression du compte patient : anonymisation côté serveur (les
 * consultations passées appartiennent au dossier du médecin) puis
 * déconnexion. Voir app/api/compte/supprimer/route.ts.
 */
export async function supprimerMonCompte(): Promise<{ erreur?: string }> {
  const reponse = await fetch("/api/compte/supprimer", { method: "POST" });
  if (!reponse.ok) {
    const { erreur } = await reponse
      .json()
      .catch(() => ({ erreur: "La suppression a échoué. Réessayez." }));
    return { erreur };
  }
  await creerClientNavigateur().auth.signOut();
  cacheProfil = undefined;
  oublierProchainRendezVous();
  return {};
}

/* ===== Paramètres (préférences de notification, en base) ===== */

export interface ParametresPatient {
  rappelsSms: boolean;
  rappelsEmail: boolean;
  offres: boolean;
}

const PARAMETRES_DEFAUT: ParametresPatient = {
  rappelsSms: true,
  rappelsEmail: true,
  offres: false,
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

/** Traduit les erreurs Postgres en message compréhensible par le patient. */
function messageErreurProche(message: string): string {
  if (message.includes("proches_patient_id_fkey")) {
    return "Ce compte n'est pas un compte patient : un proche ne peut être rattaché qu'à un compte patient.";
  }
  if (message.includes("rendez_vous_proche_id_fkey")) {
    return "Ce proche a déjà des rendez-vous : il ne peut plus être supprimé.";
  }
  return message;
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
  if (error) return { erreur: messageErreurProche(error.message) };
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
  return error ? { erreur: messageErreurProche(error.message) } : {};
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

/* ----- Prochain rendez-vous (bandeau de la barre haute mobile) ----- */

let cacheProchain: RendezVousPatient | null | undefined;
const ecouteursProchain = new Set<(r: RendezVousPatient | null) => void>();

/**
 * Le seul rendez-vous à venir le plus proche, pour le bandeau de rappel.
 * Volontairement distinct de `useMesRendezVous`, qui rapatrie tout
 * l'historique : le bandeau est monté sur beaucoup d'écrans, il ne doit
 * coûter qu'une ligne, et le résultat est mis en cache pour le reste de la
 * session de navigation.
 */
export function useProchainRendezVous(): RendezVousPatient | null {
  const [prochain, setProchain] = useState<RendezVousPatient | null>(cacheProchain ?? null);

  useEffect(() => {
    ecouteursProchain.add(setProchain);
    if (cacheProchain === undefined) {
      cacheProchain = null; // évite deux requêtes si plusieurs bandeaux montent
      const maintenant = new Date();
      const aujourdhui = versISO(maintenant);
      const heure = `${String(maintenant.getHours()).padStart(2, "0")}:${String(
        maintenant.getMinutes()
      ).padStart(2, "0")}:00`;
      creerClientNavigateur()
        .from("rendez_vous")
        .select(SELECTION_RDV)
        .in("statut", ["confirme", "en_attente"])
        // « À venir » se juge à l'heure près, pas à la journée : les premiers
        // rendez-vous du jour sont souvent déjà passés quand on ouvre l'app.
        .or(`date.gt.${aujourdhui},and(date.eq.${aujourdhui},heure.gt.${heure})`)
        .order("date", { ascending: true })
        .order("heure", { ascending: true })
        .limit(1)
        .then(({ data }) => {
          const lignes = ((data ?? []) as unknown as LigneRdv[]).map(versRdv);
          cacheProchain = lignes[0] ?? null;
          ecouteursProchain.forEach((e) => e(cacheProchain ?? null));
        });
    }
    return () => {
      ecouteursProchain.delete(setProchain);
    };
  }, []);

  return prochain;
}

/** À appeler après une réservation, une annulation ou une reprogrammation. */
export function oublierProchainRendezVous() {
  cacheProchain = undefined;
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
  oublierProchainRendezVous();
  return {};
}

export async function annulerRendezVous(id: string): Promise<{ erreur?: string }> {
  const { error } = await creerClientNavigateur()
    .from("rendez_vous")
    .update({ statut: "annule" })
    .eq("id", id);
  oublierProchainRendezVous();
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
  oublierProchainRendezVous();
  return error ? { erreur: error.message } : {};
}
