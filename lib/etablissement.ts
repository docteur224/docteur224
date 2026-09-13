"use client";

import { useEffect, useState } from "react";
import { creerClientNavigateur } from "@/lib/supabase/client";
import { formatDateCourte, MOIS_ABREGES } from "@/lib/dates";
import { chiffresTelephone } from "@/lib/telephone";

/*
 * Couche de données de l'espace établissement : profil du gestionnaire,
 * médecins rattachés (medecins.etablissement_id), invitations réelles,
 * paramètres persistés dans etablissements.parametres.
 * Remplace lib/mock-etablissement.ts.
 */

const GRADIENTS = [
  "linear-gradient(135deg,#2E9CCA,#15506B)",
  "linear-gradient(135deg,#6C5CE7,#341F97)",
  "linear-gradient(135deg,#E08E45,#C0392B)",
  "linear-gradient(135deg,#16A085,#0E6655)",
  "linear-gradient(135deg,#C0392B,#7B241C)",
  "linear-gradient(135deg,#7A5BB5,#15506B)",
];

const gradientPour = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return GRADIENTS[Math.abs(h) % GRADIENTS.length];
};

export function initialesDepuisNom(nom: string): string {
  const mots = nom
    .replace(/^(Dr|Pr)\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean);
  return mots
    .slice(0, 2)
    .map((m) => m.charAt(0))
    .join("")
    .toUpperCase();
}

/* ===== Établissement connecté ===== */

export interface EtablissementConnecte {
  id: string;
  nom: string;
  nomCourt: string;
  type: string;
  description: string;
  /** Adresse d'affichage, « adresse, quartier, ville » — non modifiable telle quelle. */
  adresse: string;
  /** Numéro de rue / repère, seul morceau modifiable de l'adresse. */
  adresseRue: string;
  quartier: string;
  /** Libellé de la ville (relation `ville_id`), en lecture seule. */
  ville: string;
  telephone: string;
  email: string;
  siteWeb: string;
  /** Registre du Commerce et du Crédit Mobilier. */
  rccm: string;
  /** Photo principale (Cloudinary) ; null = pictogramme par défaut. */
  photoUrl: string | null;
  gradient: string;
  statut: string;
  parametres: Record<string, boolean>;
  gestionnaire: { nom: string; role: string; email: string; telephone: string };
}

/*
 * Repli affiché pendant le chargement. Il était recopié à la main dans
 * chacun des quatre écrans, et trois copies avaient pris du retard :
 * `rccm` et `photoUrl` y manquaient, ce qui obligeait /informations à
 * caster son propre objet pour compiler. Un seul repli, partagé.
 */
export const ETABLISSEMENT_VIDE: EtablissementConnecte = {
  id: "",
  nom: "…",
  nomCourt: "…",
  type: "",
  description: "",
  adresse: "",
  adresseRue: "",
  quartier: "",
  ville: "",
  telephone: "",
  email: "",
  siteWeb: "",
  rccm: "",
  photoUrl: null,
  gradient: "linear-gradient(135deg,#16A085,#0E6655)",
  statut: "",
  parametres: {},
  gestionnaire: { nom: "", role: "", email: "", telephone: "" },
};

export function useEtablissementConnecte(): {
  etablissement: EtablissementConnecte | null;
  chargement: boolean;
  recharger: () => void;
} {
  const [etablissement, setEtablissement] = useState<EtablissementConnecte | null>(null);
  const [chargement, setChargement] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let actif = true;
    (async () => {
      const supabase = creerClientNavigateur();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        if (actif) setChargement(false);
        return;
      }
      const [{ data: e }, { data: u }] = await Promise.all([
        supabase
          .from("etablissements")
          .select("id, nom, type, description, adresse, quartier, telephone, email, site_web, rccm, statut, parametres, photo_url, villes ( nom )")
          .eq("gestionnaire_id", auth.user.id)
          .maybeSingle(),
        supabase.from("utilisateurs").select("nom, prenom, email, telephone").eq("id", auth.user.id).single(),
      ]);
      if (!actif) return;
      if (e) {
        const ville = (e as unknown as { villes: { nom: string } | null }).villes?.nom ?? "";
        setEtablissement({
          id: e.id,
          nom: e.nom,
          nomCourt: e.nom.length > 22 ? `${e.nom.slice(0, 20)}…` : e.nom,
          type: e.type,
          description: e.description ?? "",
          adresse: [e.adresse, e.quartier, ville].filter(Boolean).join(", "),
          adresseRue: e.adresse ?? "",
          quartier: e.quartier ?? "",
          ville,
          telephone: e.telephone ?? "",
          email: e.email ?? "",
          siteWeb: (e as unknown as { site_web: string | null }).site_web ?? "",
          rccm: (e as unknown as { rccm: string | null }).rccm ?? "",
          photoUrl: (e as unknown as { photo_url: string | null }).photo_url ?? null,
          gradient: gradientPour(e.id),
          statut: e.statut,
          parametres: (e.parametres as Record<string, boolean>) ?? {},
          gestionnaire: {
            nom: `${u?.prenom ?? ""} ${u?.nom ?? ""}`.trim(),
            role: "Administrateur de l'établissement",
            email: u?.email ?? "",
            telephone: u?.telephone ?? "",
          },
        });
      }
      setChargement(false);
    })();
    return () => {
      actif = false;
    };
  }, [version]);

  return { etablissement, chargement, recharger: () => setVersion((v) => v + 1) };
}

/** Champs de la fiche que le gestionnaire peut corriger lui-même. */
export interface InformationsEtablissement {
  nom: string;
  type: string;
  description: string;
  adresse: string;
  quartier: string;
  telephone: string;
  email: string;
  siteWeb: string;
  rccm: string;
}

export async function enregistrerInformationsEtablissement(
  etabId: string,
  d: Partial<InformationsEtablissement>
): Promise<{ erreur?: string }> {
  // `siteWeb` est le seul champ dont le nom diffère de la colonne ; le
  // reste passe tel quel.
  const { siteWeb, ...reste } = d;
  const { error } = await creerClientNavigateur()
    .from("etablissements")
    .update(siteWeb === undefined ? reste : { ...reste, site_web: siteWeb })
    .eq("id", etabId);
  return error ? { erreur: error.message } : {};
}

export async function enregistrerParametresEtablissement(
  etabId: string,
  parametres: Record<string, boolean>
): Promise<{ erreur?: string }> {
  const { error } = await creerClientNavigateur()
    .from("etablissements")
    .update({ parametres })
    .eq("id", etabId);
  return error ? { erreur: error.message } : {};
}

/* ===== Médecins rattachés ===== */

export interface MedecinRattache {
  id: string;
  nom: string;
  specialite: string;
  initiales: string;
  gradient: string;
}

export function useMedecinsRattaches(etabId: string | undefined): {
  rattaches: MedecinRattache[];
  recharger: () => void;
} {
  const [rattaches, setRattaches] = useState<MedecinRattache[]>([]);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!etabId) return;
    let actif = true;
    creerClientNavigateur()
      .from("medecins")
      .select("id, civilite, utilisateurs ( nom, prenom ), specialites ( nom )")
      .eq("etablissement_id", etabId)
      .then(({ data }) => {
        if (!actif) return;
        type L = {
          id: string;
          civilite: string;
          utilisateurs: { nom: string | null; prenom: string | null } | null;
          specialites: { nom: string } | null;
        };
        setRattaches(((data ?? []) as unknown as L[]).map((m) => {
          const nom = `${m.civilite === "Pr" ? "Pr" : "Dr"} ${m.utilisateurs?.prenom ?? ""} ${m.utilisateurs?.nom ?? ""}`.trim();
          return {
            id: m.id,
            nom,
            specialite: m.specialites?.nom ?? "",
            initiales: initialesDepuisNom(nom),
            gradient: gradientPour(m.id),
          };
        }));
      });
    return () => {
      actif = false;
    };
  }, [etabId, version]);
  return { rattaches, recharger: () => setVersion((v) => v + 1) };
}

/**
 * Retire un médecin de l'établissement. Passe par une fonction
 * SECURITY DEFINER : la RLS réserve l'écriture de
 * `medecins.etablissement_id` au médecin lui-même (voir 0054).
 */
export async function detacherMedecin(medecinId: string): Promise<{ erreur?: string }> {
  const { error } = await creerClientNavigateur().rpc("detacher_medecin", {
    p_medecin_id: medecinId,
  });
  return error ? { erreur: error.message } : {};
}

/* ===== Invitations réelles ===== */

export type StatutInvitation = "envoyee" | "acceptee" | "refusee";

export interface InvitationMedecin {
  id: string;
  medecinId: string;
  nom: string;
  specialite: string;
  initiales: string;
  gradient: string;
  envoyeeLe: string;
  statut: StatutInvitation;
}

export function useInvitations(etabId: string | undefined): {
  invitations: InvitationMedecin[];
  recharger: () => void;
} {
  const [invitations, setInvitations] = useState<InvitationMedecin[]>([]);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!etabId) return;
    let actif = true;
    creerClientNavigateur()
      .from("invitations_etablissement")
      .select("id, statut, cree_le, medecin_id, medecins ( civilite, utilisateurs ( nom, prenom ), specialites ( nom ) )")
      .eq("etablissement_id", etabId)
      .order("cree_le", { ascending: false })
      .then(({ data }) => {
        if (!actif) return;
        type L = {
          id: string;
          statut: StatutInvitation;
          cree_le: string;
          medecin_id: string;
          medecins: {
            civilite: string;
            utilisateurs: { nom: string | null; prenom: string | null } | null;
            specialites: { nom: string } | null;
          } | null;
        };
        setInvitations(((data ?? []) as unknown as L[]).map((i) => {
          const nom = i.medecins
            ? `${i.medecins.civilite === "Pr" ? "Pr" : "Dr"} ${i.medecins.utilisateurs?.prenom ?? ""} ${i.medecins.utilisateurs?.nom ?? ""}`.trim()
            : "Médecin";
          return {
            id: i.id,
            medecinId: i.medecin_id,
            nom,
            specialite: i.medecins?.specialites?.nom ?? "",
            initiales: initialesDepuisNom(nom),
            gradient: gradientPour(i.medecin_id),
            envoyeeLe: formatDateCourte(i.cree_le.slice(0, 10)),
            statut: i.statut,
          };
        }));
      });
    return () => {
      actif = false;
    };
  }, [etabId, version]);
  return { invitations, recharger: () => setVersion((v) => v + 1) };
}

/** Médecins validés sans établissement, pour la recherche d'invitation. */
/** Minuscules sans accents : « pediatrie » doit trouver « Pédiatrie ». */
const sansAccent = (t: string) =>
  t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export interface MedecinInvitable {
  id: string;
  nom: string;
  specialite: string;
  /** Numéro à l'Ordre national des médecins — vide tant qu'il n'est pas saisi. */
  numeroOrdre: string;
  /** « Tambassa, Mamou » — ce qui situe le cabinet. */
  lieu: string;
  anneesExperience: number | null;
  photoUrl: string | null;
  initiales: string;
  gradient: string;
  /**
   * Vrai quand un AUTRE résultat porte le même nom et la même spécialité.
   * L'écran le dit alors franchement plutôt que de laisser choisir à
   * l'aveugle : c'est le seul cas où se tromper de praticien est facile.
   */
  homonyme: boolean;
  /**
   * Par quoi la ligne a été trouvée, quand c'est un identifiant que seul
   * quelqu'un connaissant le praticien peut taper. L'écran s'en sert pour
   * confirmer « c'est bien lui » SANS réafficher l'adresse ou le numéro :
   * une liste d'invitation n'a pas à devenir un annuaire de coordonnées
   * personnelles.
   */
  correspondance: "email" | "telephone" | null;
}

/**
 * Plafond de la liste chargée. Le filtrage se fait côté navigateur — c'est
 * ce qui permet d'ignorer les accents et de chercher dans six champs à la
 * fois, ce que `ilike` ne sait pas faire simplement à travers une jointure.
 * Quelques centaines de praticiens tiennent sans peine ; au-delà, il
 * faudra une recherche côté base, et l'écran prévient plutôt que de couper
 * en silence.
 */
export const PLAFOND_MEDECINS_INVITABLES = 1000;

/**
 * Médecins validés sans établissement, pour la recherche d'invitation.
 *
 * Rend de quoi RECONNAÎTRE quelqu'un, et plus seulement son nom et sa
 * spécialité : deux « Dr Wizard Testeur », tous deux cardiologues à
 * Conakry, existent réellement en base. Le numéro d'ordre les départage
 * quand il est renseigné ; sinon le lieu, l'expérience et la photo s'en
 * chargent, et `homonyme` signale les cas où rien ne suffit.
 *
 * Plus de `.slice(0, 5)` muet : il coupait sans le dire, et le praticien
 * cherché pouvait être le sixième.
 */
export async function rechercherMedecinsInvitables(q: string): Promise<MedecinInvitable[]> {
  const { data } = await creerClientNavigateur()
    .from("medecins")
    .select(
      "id, civilite, numero_ordre, quartier, commune, annees_experience, photo_url, telephone_secretariat, utilisateurs ( nom, prenom, email, telephone ), specialites ( nom ), villes ( nom )"
    )
    .eq("statut", "valide")
    .is("etablissement_id", null)
    .limit(PLAFOND_MEDECINS_INVITABLES);
  type L = {
    id: string;
    civilite: string;
    numero_ordre: string | null;
    quartier: string | null;
    commune: string | null;
    annees_experience: number | null;
    photo_url: string | null;
    telephone_secretariat: string | null;
    utilisateurs: {
      nom: string | null;
      prenom: string | null;
      email: string | null;
      telephone: string | null;
    } | null;
    specialites: { nom: string } | null;
    villes: { nom: string } | null;
  };

  const norm = sansAccent(q.trim());
  // Un numéro se tape « 622 00 00 00 », « +224622000000 » ou « 622000000 » :
  // on ne compare que les chiffres, des deux côtés.
  const chiffres = chiffresTelephone(q);
  const chercheNumero = chiffres.length >= 5;

  const liste = ((data ?? []) as unknown as L[])
    .map((m) => {
      const nom = `${m.civilite === "Pr" ? "Pr" : "Dr"} ${m.utilisateurs?.prenom ?? ""} ${m.utilisateurs?.nom ?? ""}`.trim();
      const email = m.utilisateurs?.email ?? "";
      const numeros = [m.utilisateurs?.telephone, m.telephone_secretariat]
        .filter(Boolean)
        .map((t) => chiffresTelephone(t as string));
      return {
        fiche: {
          id: m.id,
          nom,
          specialite: m.specialites?.nom ?? "",
          numeroOrdre: m.numero_ordre ?? "",
          lieu: [m.quartier, m.commune, m.villes?.nom].filter(Boolean).join(", "),
          anneesExperience: m.annees_experience,
          photoUrl: m.photo_url,
          initiales: initialesDepuisNom(nom),
          gradient: gradientPour(m.id),
          homonyme: false,
          correspondance: null as MedecinInvitable["correspondance"],
        },
        email,
        numeros,
      };
    })
    .map(({ fiche, email, numeros }) => {
      if (norm === "") return { fiche, garde: true };
      /*
       * L'e-mail et le téléphone servent à TROUVER, jamais à parcourir :
       * ils ne comptent que si la saisie en reprend une part sérieuse.
       * Sans ce seuil, taper « a » ferait « correspondre » la moitié des
       * adresses et l'indication ne voudrait plus rien dire.
       */
      const parEmail = norm.length >= 4 && email !== "" && sansAccent(email).includes(norm);
      const parNumero = chercheNumero && numeros.some((n) => n.includes(chiffres));
      const parReste =
        sansAccent(fiche.nom).includes(norm) ||
        sansAccent(fiche.specialite).includes(norm) ||
        sansAccent(fiche.numeroOrdre).includes(norm) ||
        sansAccent(fiche.lieu).includes(norm);
      if (!parEmail && !parNumero && !parReste) return { fiche, garde: false };
      return {
        fiche: {
          ...fiche,
          // Le nom l'emporte : si la saisie est un nom, dire « e-mail
          // correspond » embrouillerait plus que ça n'aiderait.
          correspondance: parReste
            ? null
            : parEmail
              ? ("email" as const)
              : ("telephone" as const),
        },
        garde: true,
      };
    })
    .filter((r) => r.garde)
    .map((r) => r.fiche)
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

  const comptes = new Map<string, number>();
  for (const m of liste) {
    const cle = `${sansAccent(m.nom)}|${sansAccent(m.specialite)}`;
    comptes.set(cle, (comptes.get(cle) ?? 0) + 1);
  }
  return liste.map((m) => ({
    ...m,
    homonyme: (comptes.get(`${sansAccent(m.nom)}|${sansAccent(m.specialite)}`) ?? 0) > 1,
  }));
}

/* ===== Détail d'un médecin rattaché ===== */

export interface DetailMedecin {
  id: string;
  nom: string;
  specialite: string;
  numeroOrdre: string;
  lieu: string;
  anneesExperience: number | null;
  langues: string[];
  presentation: string;
  telephoneSecretariat: string;
  photoUrl: string | null;
  initiales: string;
  gradient: string;
  note: number;
  nbAvis: number;
}

/**
 * Fiche professionnelle d'un médecin, pour le gestionnaire.
 *
 * Ce qui est rendu est ce qui figure sur sa FICHE PUBLIQUE : identité
 * professionnelle, lieu d'exercice, numéro d'ordre, téléphone du
 * secrétariat. Ni l'e-mail ni le téléphone personnels de `utilisateurs`,
 * bien que la RLS les laisse lire : l'établissement gère un rattachement,
 * il n'hérite pas du carnet d'adresses privé du praticien — même principe
 * que les rendez-vous, qu'il ne voit pas non plus.
 */
export async function chargerDetailMedecin(medecinId: string): Promise<DetailMedecin | null> {
  const { data } = await creerClientNavigateur()
    .from("medecins")
    .select(
      "id, civilite, numero_ordre, quartier, commune, annees_experience, langues, presentation, telephone_secretariat, photo_url, note_moyenne, nb_avis, utilisateurs ( nom, prenom ), specialites ( nom ), villes ( nom )"
    )
    .eq("id", medecinId)
    .maybeSingle();
  if (!data) return null;
  type L = {
    id: string;
    civilite: string;
    numero_ordre: string | null;
    quartier: string | null;
    commune: string | null;
    annees_experience: number | null;
    langues: string[] | null;
    presentation: string | null;
    telephone_secretariat: string | null;
    photo_url: string | null;
    note_moyenne: number | null;
    nb_avis: number | null;
    utilisateurs: { nom: string | null; prenom: string | null } | null;
    specialites: { nom: string } | null;
    villes: { nom: string } | null;
  };
  const m = data as unknown as L;
  const nom = `${m.civilite === "Pr" ? "Pr" : "Dr"} ${m.utilisateurs?.prenom ?? ""} ${m.utilisateurs?.nom ?? ""}`.trim();
  return {
    id: m.id,
    nom,
    specialite: m.specialites?.nom ?? "",
    numeroOrdre: m.numero_ordre ?? "",
    lieu: [m.quartier, m.commune, m.villes?.nom].filter(Boolean).join(", "),
    anneesExperience: m.annees_experience,
    langues: m.langues ?? [],
    presentation: m.presentation ?? "",
    telephoneSecretariat: m.telephone_secretariat ?? "",
    photoUrl: m.photo_url,
    initiales: initialesDepuisNom(nom),
    gradient: gradientPour(m.id),
    note: m.note_moyenne ?? 0,
    nbAvis: m.nb_avis ?? 0,
  };
}

export async function inviterMedecin(etabId: string, medecinId: string): Promise<{ erreur?: string }> {
  const { error } = await creerClientNavigateur()
    .from("invitations_etablissement")
    .insert({ etablissement_id: etabId, medecin_id: medecinId });
  if (error) {
    if (error.code === "23505") return { erreur: "Ce médecin a déjà été invité." };
    return { erreur: error.message };
  }
  return {};
}

/**
 * Retire une invitation encore en attente. La policy `del_invitations`
 * l'autorisait depuis le début (« le gestionnaire peut annuler »), mais
 * aucun écran ne l'appelait : une invitation partie par erreur restait
 * affichée « En attente » indéfiniment.
 */
export async function annulerInvitation(invitationId: string): Promise<{ erreur?: string }> {
  const { error } = await creerClientNavigateur()
    .from("invitations_etablissement")
    .delete()
    .eq("id", invitationId);
  return error ? { erreur: error.message } : {};
}

/** Réponse du médecin (RPC SECURITY DEFINER) — utilisée depuis son espace. */
export async function repondreInvitation(invitationId: string, accepte: boolean): Promise<{ erreur?: string }> {
  const { error } = await creerClientNavigateur().rpc("repondre_invitation", {
    p_invitation_id: invitationId,
    p_accepte: accepte,
  });
  return error ? { erreur: error.message } : {};
}

/* ===== Côté médecin : les invitations qu'il reçoit ===== */

export interface InvitationRecue {
  id: string;
  etablissementNom: string;
  etablissementType: string;
  gradient: string;
  envoyeeLe: string;
  statut: StatutInvitation;
}

/**
 * Invitations adressées au médecin connecté, et l'établissement auquel
 * il est déjà rattaché.
 *
 * Ce hook manquait complètement : `repondre_invitation` existait en base
 * depuis la migration 0007 mais n'était appelée par AUCUN écran. Le
 * gestionnaire envoyait donc une invitation, le médecin recevait une
 * notification pointant sur /espace-medecin/compte… où il n'y avait rien.
 * Aucun rattachement n'a jamais pu aboutir.
 */
export function useInvitationsRecues(): {
  invitations: InvitationRecue[];
  rattachement: { nom: string; type: string } | null;
  chargement: boolean;
  recharger: () => void;
} {
  const [invitations, setInvitations] = useState<InvitationRecue[]>([]);
  const [rattachement, setRattachement] = useState<{ nom: string; type: string } | null>(null);
  const [chargement, setChargement] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let actif = true;
    (async () => {
      const supabase = creerClientNavigateur();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        if (actif) setChargement(false);
        return;
      }
      const [{ data: inv }, { data: moi }] = await Promise.all([
        supabase
          .from("invitations_etablissement")
          .select("id, statut, cree_le, etablissement_id, etablissements ( nom, type )")
          .eq("medecin_id", auth.user.id)
          .order("cree_le", { ascending: false }),
        supabase
          .from("medecins")
          .select("etablissement_id, etablissements ( nom, type )")
          .eq("id", auth.user.id)
          .maybeSingle(),
      ]);
      if (!actif) return;
      type L = {
        id: string;
        statut: StatutInvitation;
        cree_le: string;
        etablissement_id: string;
        etablissements: { nom: string; type: string } | null;
      };
      setInvitations(
        ((inv ?? []) as unknown as L[]).map((i) => ({
          id: i.id,
          etablissementNom: i.etablissements?.nom ?? "Établissement",
          etablissementType: i.etablissements?.type ?? "",
          gradient: gradientPour(i.etablissement_id),
          envoyeeLe: formatDateCourte(i.cree_le.slice(0, 10)),
          statut: i.statut,
        }))
      );
      const e = (moi as unknown as { etablissements: { nom: string; type: string } | null } | null)
        ?.etablissements;
      setRattachement(e ? { nom: e.nom, type: e.type } : null);
      setChargement(false);
    })();
    return () => {
      actif = false;
    };
  }, [version]);

  return { invitations, rattachement, chargement, recharger: () => setVersion((v) => v + 1) };
}

/* ===== Statistiques consolidées ===== */

export interface ProchainRdvEtablissement {
  id: string;
  date: string;
  heure: string;
  statut: "en_attente" | "confirme";
  medecinId: string;
}

export interface StatistiquesEtablissement {
  medecins: number;
  assistants: number;
  rdvAujourdhui: number;
  rdvSemaine: number;
  rdvMois: number;
  /** Pourcentages entiers, ou null quand il n'y a rien à mesurer. */
  tauxAnnulation: number | null;
  tauxHonores: number | null;
  /** Six mois glissants, mois vides compris. `mois` est un « AAAA-MM ». */
  parMois: { mois: string; total: number }[];
  /** Nombre de RDV de la semaine, par identifiant de médecin. */
  parMedecin: Record<string, number>;
  prochains: ProchainRdvEtablissement[];
}

/**
 * Les quatre compteurs du tableau de bord et tout l'écran Statistiques.
 *
 * Le gestionnaire n'a pas le droit de lire `rendez_vous` (la RLS ne lui
 * accorde aucune policy de lecture, et c'est délibéré). Les chiffres
 * viennent donc d'une fonction SECURITY DEFINER qui ne rend que des
 * agrégats — jamais l'identité d'un patient. Voir la migration 0054.
 */
export function useStatistiquesEtablissement(etabId: string | undefined): {
  stats: StatistiquesEtablissement | null;
  chargement: boolean;
  erreur: string | null;
} {
  const [stats, setStats] = useState<StatistiquesEtablissement | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    // `chargement` démarre déjà à true et l'identifiant ne change qu'une
    // fois, quand la fiche arrive : le remettre à true ici déclencherait
    // un rendu en cascade pour rien.
    if (!etabId) return;
    let actif = true;
    creerClientNavigateur()
      .rpc("statistiques_etablissement", { p_etablissement_id: etabId })
      .then(({ data, error }) => {
        if (!actif) return;
        if (error) setErreur(error.message);
        else setStats(data as unknown as StatistiquesEtablissement);
        setChargement(false);
      });
    return () => {
      actif = false;
    };
  }, [etabId]);

  return { stats, chargement, erreur };
}

/** « 2026-09 » → « SEPT », avec les noms de mois français du projet. */
export function libelleMois(aaaaMm: string): string {
  const index = Number(aaaaMm.slice(5, 7)) - 1;
  return MOIS_ABREGES[index] ?? aaaaMm;
}

/**
 * Un pourcentage, ou « — » quand la mesure n'a aucun support (aucun
 * rendez-vous encore passé, par exemple). Afficher « 0 % » laisserait
 * croire à un résultat, alors qu'il n'y a rien à mesurer.
 */
export function formatTaux(taux: number | null | undefined): string {
  return taux === null || taux === undefined ? "—" : `${taux} %`;
}

/* ===== Paliers d'abonnement (spec C.6.1 / C.10.2) ===== */

/*
 * AUDIT — l'écran Abonnement affichait sa PROPRE grille, écrite en dur :
 * trois paliers « Cabinet 1–3 / Clinique 4–15 / Hôpital 16+ » avec des
 * tarifs « individuel / intermédiaire / sur devis ». Rien de tout cela
 * n'existait en base :
 *
 *   · le palier « structure » (0–3 médecins), le moins cher, manquait ;
 *   · les prix réels sont dans `tarifs_plateforme` et se règlent depuis
 *     /espace-admin/abonnements — la page en ignorait les changements ;
 *   · surtout, le « palier actuel » était DÉDUIT du nombre de médecins,
 *     alors que ce qui est facturé est la formule de `abonnements`. Un
 *     établissement de deux médecins facturé « clinique » lisait donc
 *     « Palier Cabinet · Actuel » : ni le bon nom, ni le bon prix.
 *
 * Les bornes et les prix viennent maintenant de la grille tarifaire. Il
 * ne reste ici que les LIBELLÉS, les mêmes que ceux de l'écran admin.
 */

/** Nom lisible d'un palier de structure. */
export const NOMS_PALIERS: Record<string, string> = {
  structure: "Structure de proximité",
  cabinet: "Cabinet / plateau technique",
  clinique: "Clinique / centre médical",
  hopital: "Hôpital / centre hospitalier",
};

export const DETAILS_PALIERS: Record<string, string[]> = {
  structure: ["Fiche établissement publique", "Agenda de chaque médecin", "Statistiques de base"],
  cabinet: ["Tout le palier Structure", "Plateau technique", "Statistiques consolidées"],
  clinique: ["Tout le palier Cabinet", "Statistiques consolidées", "Plus d'assistant(e)s"],
  hopital: ["Tout le palier Clinique", "Accompagnement dédié", "Volume de SMS le plus large"],
};

/** « 4 à 15 médecins », « 16 médecins et plus », « jusqu'à 3 médecins ». */
export function libelleTaille(min: number | null, max: number | null): string {
  if (min === null && max === null) return "—";
  if (max === null) return `${min} médecins et plus`;
  if (min === null || min <= 0) return `jusqu'à ${max} médecins`;
  return `${min} à ${max} médecins`;
}
