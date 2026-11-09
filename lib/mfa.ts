import { creerClientNavigateur } from "@/lib/supabase/client";

/*
 * Deuxième facteur (TOTP) — appels du SDK Supabase depuis le navigateur.
 *
 * Supabase Auth GARDE le facteur : on ne stocke aucun secret de notre côté.
 * Ce module ne fait que transporter, et rendre `{ erreur }` au lieu de lever,
 * comme `lib/auth.ts`.
 *
 * LOT 2FA, pièce 1 — ENRÔLEMENT UNIQUEMENT. Rien ici n'impose la 2FA ni ne
 * l'exige à la connexion : un administrateur peut l'activer ou la retirer,
 * c'est tout. L'exigence (niveau AAL2 côté serveur) viendra dans une pièce
 * suivante, derrière un interrupteur.
 */

export interface FacteurTotp {
  id: string;
  nom: string;
  creeLe: string;
}

/** Les facteurs TOTP VÉRIFIÉS (ceux qui protègent réellement la connexion). */
export async function listerFacteursTotp(): Promise<FacteurTotp[]> {
  const { data, error } = await creerClientNavigateur().auth.mfa.listFactors();
  if (error || !data) return [];
  return (data.totp ?? []).map((f) => ({
    id: f.id,
    nom: f.friendly_name || "Application d’authentification",
    creeLe: f.created_at,
  }));
}

export interface EnrolementTotp {
  factorId: string;
  /** L'URI otpauth:// à encoder dans le QR, et dont on tire le secret manuel. */
  uri: string;
  /** Le secret en clair, pour la saisie à la main si le QR ne peut pas être scanné. */
  secret: string;
}

/**
 * Ouvre un enrôlement : rend le secret et l'URI à présenter.
 *
 * Un enrôlement laissé en plan (QR affiché puis abandonné) crée un facteur
 * NON VÉRIFIÉ qui traîne ; on nettoie donc ces brouillons avant d'en ouvrir un
 * neuf, pour qu'un second clic sur « Activer » ne bute pas sur un doublon.
 */
export async function commencerEnrolementTotp(): Promise<{ enrolement?: EnrolementTotp; erreur?: string }> {
  const supabase = creerClientNavigateur();

  const { data: liste } = await supabase.auth.mfa.listFactors();
  for (const f of liste?.all ?? []) {
    if (f.factor_type === "totp" && f.status !== "verified") {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Application d’authentification",
  });
  if (error || !data) return { erreur: error?.message ?? "Impossible d’ouvrir l’enrôlement." };
  return { enrolement: { factorId: data.id, uri: data.totp.uri, secret: data.totp.secret } };
}

type ClientNavigateur = ReturnType<typeof creerClientNavigateur>;

/** Défi + vérification d'un facteur par un code à 6 chiffres. Partagé par
 *  l'enrôlement (confirmation) et la connexion (franchissement). */
async function defierEtVerifier(
  supabase: ClientNavigateur,
  factorId: string,
  code: string
): Promise<{ erreur?: string }> {
  const { data: defi, error: eDefi } = await supabase.auth.mfa.challenge({ factorId });
  if (eDefi || !defi) return { erreur: eDefi?.message ?? "Vérification impossible. Réessayez." };
  const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: defi.id, code });
  if (error) {
    return {
      erreur: /invalid|incorrect|expired/i.test(error.message)
        ? "Code incorrect. Vérifiez l’heure de votre téléphone et réessayez."
        : error.message,
    };
  }
  return {};
}

/**
 * Confirme l'enrôlement par un premier code. La réussite VÉRIFIE le facteur et
 * monte la session au niveau AAL2.
 */
export async function confirmerEnrolementTotp(factorId: string, code: string): Promise<{ erreur?: string }> {
  return defierEtVerifier(creerClientNavigateur(), factorId, code);
}

/** Retire un facteur (désactive la 2FA pour ce compte). */
export async function retirerFacteurTotp(factorId: string): Promise<{ erreur?: string }> {
  const { error } = await creerClientNavigateur().auth.mfa.unenroll({ factorId });
  if (error) return { erreur: error.message };
  return {};
}

/**
 * La session en cours RÉCLAME-t-elle un second facteur ? Vrai quand le compte
 * a un facteur vérifié (le niveau atteignable est AAL2) mais que la session
 * n'en est encore qu'au mot de passe (AAL1). C'est ce qui, à la connexion,
 * retient un administrateur sur l'écran du code au lieu de le laisser entrer.
 */
export async function aBesoinDeSecondFacteur(): Promise<boolean> {
  const { data } = await creerClientNavigateur().auth.mfa.getAuthenticatorAssuranceLevel();
  return data?.nextLevel === "aal2" && data.currentLevel !== "aal2";
}

/** Franchit le second facteur à la connexion : monte la session en AAL2. */
export async function verifierSecondFacteur(code: string): Promise<{ erreur?: string }> {
  const supabase = creerClientNavigateur();
  const { data, error } = await supabase.auth.mfa.listFactors();
  const facteur = data?.totp?.[0];
  if (error || !facteur) return { erreur: "Aucun second facteur n’est configuré sur ce compte." };
  return defierEtVerifier(supabase, facteur.id, code);
}

/**
 * Abandonne une connexion restée au premier facteur : on referme la session
 * AAL1 plutôt que de la laisser traîner (un administrateur qui renonce au code
 * ne doit pas garder une session à moitié ouverte).
 */
export async function annulerSecondFacteur(): Promise<void> {
  await creerClientNavigateur().auth.signOut();
}
