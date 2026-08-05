"use client";

import { useEffect, useState } from "react";
import { creerClientNavigateur } from "@/lib/supabase/client";
import { formatDateCourte } from "@/lib/dates";

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
  adresse: string;
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
          .select("id, nom, type, description, adresse, quartier, telephone, email, rccm, statut, parametres, photo_url, villes ( nom )")
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
          telephone: e.telephone ?? "",
          email: e.email ?? "",
          siteWeb: "",
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

export async function enregistrerInformationsEtablissement(
  etabId: string,
  d: Partial<{ nom: string; type: string; description: string; adresse: string; telephone: string; email: string; rccm: string }>
): Promise<{ erreur?: string }> {
  const { error } = await creerClientNavigateur().from("etablissements").update(d).eq("id", etabId);
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
  rdvSemaine: number;
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
            rdvSemaine: 0, // les RDV des médecins ne sont pas visibles du gestionnaire (RLS)
          };
        }));
      });
    return () => {
      actif = false;
    };
  }, [etabId, version]);
  return { rattaches, recharger: () => setVersion((v) => v + 1) };
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
export async function rechercherMedecinsInvitables(q: string): Promise<{ id: string; nom: string; specialite: string }[]> {
  const { data } = await creerClientNavigateur()
    .from("medecins")
    .select("id, civilite, etablissement_id, utilisateurs ( nom, prenom ), specialites ( nom )")
    .eq("statut", "valide")
    .is("etablissement_id", null);
  type L = {
    id: string;
    civilite: string;
    utilisateurs: { nom: string | null; prenom: string | null } | null;
    specialites: { nom: string } | null;
  };
  const norm = q.trim().toLowerCase();
  return ((data ?? []) as unknown as L[])
    .map((m) => ({
      id: m.id,
      nom: `${m.civilite === "Pr" ? "Pr" : "Dr"} ${m.utilisateurs?.prenom ?? ""} ${m.utilisateurs?.nom ?? ""}`.trim(),
      specialite: m.specialites?.nom ?? "",
    }))
    .filter((m) => norm === "" || m.nom.toLowerCase().includes(norm) || m.specialite.toLowerCase().includes(norm))
    .slice(0, 5);
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

/** Réponse du médecin (RPC SECURITY DEFINER) — utilisée depuis son espace. */
export async function repondreInvitation(invitationId: string, accepte: boolean): Promise<{ erreur?: string }> {
  const { error } = await creerClientNavigateur().rpc("repondre_invitation", {
    p_invitation_id: invitationId,
    p_accepte: accepte,
  });
  return error ? { erreur: error.message } : {};
}

/* ===== Paliers d'abonnement (spec C.6.1 / C.10.2) ===== */

export interface Palier {
  nom: string;
  medecins: string;
  tarif: string;
  min: number;
  max: number;
}

export const PALIERS: Palier[] = [
  { nom: "Cabinet", medecins: "1–3", tarif: "Tarif individuel", min: 1, max: 3 },
  { nom: "Clinique", medecins: "4–15", tarif: "Tarif intermédiaire", min: 4, max: 15 },
  { nom: "Hôpital / Grand centre", medecins: "16+", tarif: "Sur devis", min: 16, max: Infinity },
];

export function palierPour(nbMedecins: number): Palier {
  return PALIERS.find((p) => nbMedecins >= p.min && nbMedecins <= p.max) ?? PALIERS[0];
}
