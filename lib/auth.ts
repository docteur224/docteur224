import { creerClientNavigateur } from "@/lib/supabase/client";

/*
 * Authentification réelle (Supabase Auth + table `utilisateurs`).
 * Chaque rôle est redirigé vers son espace après connexion.
 */

export type Role = "patient" | "medecin" | "assistant" | "etablissement" | "admin";

export const ESPACE_PAR_ROLE: Record<Role, string> = {
  patient: "/patient",
  medecin: "/espace-medecin",
  assistant: "/espace-assistant",
  etablissement: "/espace-etablissement",
  admin: "/espace-admin",
};

/**
 * Le rôle n'est lisible qu'APRÈS authentification (il vit dans `utilisateurs`,
 * pas dans le jeton) : chaque porte d'entrée doit donc ouvrir la session, lire
 * le rôle, puis refermer si le rôle n'est pas le sien. D'où le `role` rendu
 * ici, et `refuserSession()` pour annuler proprement.
 */
export async function seConnecter(
  email: string,
  motDePasse: string
): Promise<{ role?: Role; cible?: string; erreur?: string }> {
  const supabase = creerClientNavigateur();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: motDePasse });
  if (error) {
    return { erreur: error.message.includes("Invalid login credentials") ? "E-mail ou mot de passe incorrect." : error.message };
  }
  const { data: profil } = await supabase
    .from("utilisateurs")
    .select("role")
    .eq("id", data.user.id)
    .single();
  if (!profil) {
    await supabase.auth.signOut();
    return { erreur: "Profil introuvable. Contactez le support." };
  }
  const role = profil.role as Role;
  return { role, cible: ESPACE_PAR_ROLE[role] };
}

/** Referme une session ouverte par la mauvaise porte. */
export async function refuserSession(): Promise<void> {
  await creerClientNavigateur().auth.signOut();
}

export async function seDeconnecter(): Promise<void> {
  await creerClientNavigateur().auth.signOut();
}

export interface DonneesInscriptionPatient {
  nom: string;
  prenom: string;
  genre: string;
  telephone: string; // sans le préfixe +224
  email: string;
  motDePasse: string;
}

/** Appelle la route serveur d'inscription puis connecte l'utilisateur. */
async function inscrireEtConnecter(corps: Record<string, unknown>, email: string, motDePasse: string): Promise<{ erreur?: string }> {
  const reponse = await fetch("/api/inscription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  });
  if (!reponse.ok) {
    const { erreur } = await reponse.json().catch(() => ({ erreur: "Création du compte impossible." }));
    return { erreur };
  }
  const { error } = await creerClientNavigateur().auth.signInWithPassword({ email, password: motDePasse });
  if (error) return { erreur: error.message };
  return {};
}

export async function inscrirePatient(d: DonneesInscriptionPatient): Promise<{ erreur?: string }> {
  return inscrireEtConnecter(
    { role: "patient", email: d.email, motDePasse: d.motDePasse, nom: d.nom, prenom: d.prenom, telephone: d.telephone, genre: d.genre },
    d.email,
    d.motDePasse
  );
}

export interface DonneesInscriptionPro {
  typeCompte: "medecin" | "etablissement";
  nom: string;
  prenom: string;
  telephone: string;
  email: string;
  motDePasse: string;
  /** Médecin : id de la spécialité ; Établissement : type (Clinique privée…) */
  specialiteId?: string;
  typeEtablissement?: string;
  nomEtablissement?: string;
  villeId?: string;
  commune?: string;
}

export async function inscrireProfessionnel(d: DonneesInscriptionPro): Promise<{ erreur?: string }> {
  return inscrireEtConnecter(
    {
      role: d.typeCompte,
      email: d.email,
      motDePasse: d.motDePasse,
      nom: d.nom,
      prenom: d.prenom,
      telephone: d.telephone,
      specialiteId: d.specialiteId,
      typeEtablissement: d.typeEtablissement,
      nomEtablissement: d.nomEtablissement,
      villeId: d.villeId,
      commune: d.commune,
    },
    d.email,
    d.motDePasse
  );
}
