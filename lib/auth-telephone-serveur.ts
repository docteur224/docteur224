import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { creerClientServeur } from "@/lib/supabase/server";
import type { ObjetCode } from "@/lib/pin";

/*
 * Connexion par téléphone — ce que partagent les routes /api/telephone/*.
 *
 * SERVEUR UNIQUEMENT (node:crypto, clé service_role).
 *
 * Le compte Auth d'un patient inscrit par téléphone porte un mot de passe
 * aléatoire que personne ne connaît : le PIN n'est jamais transmis à
 * Supabase (voir l'en-tête de la migration 0077). Une fois le PIN reconnu ici,
 * la session s'ouvre par un lien magique FABRIQUÉ sans être envoyé
 * (`generateLink`) et vérifié aussitôt dans la route, ce qui pose les cookies
 * de session sur la réponse.
 */

/** Ce qu'il faut pour qu'un jeton de vérification reste utilisable. */
const VALIDITE_JETON_MINUTES = 20;

function scryptAsync(secret: string, sel: Buffer): Promise<Buffer> {
  return new Promise((resoudre, rejeter) =>
    scrypt(secret, sel, 32, (e, cle) => (e ? rejeter(e) : resoudre(cle)))
  );
}

export async function hacherPin(pin: string): Promise<string> {
  const sel = randomBytes(16);
  const cle = await scryptAsync(pin, sel);
  return `scrypt$${sel.toString("base64url")}$${cle.toString("base64url")}`;
}

export async function pinCorrespond(pin: string, stocke: string): Promise<boolean> {
  const [algo, sel, attendu] = stocke.split("$");
  if (algo !== "scrypt" || !sel || !attendu) return false;
  const cle = await scryptAsync(pin, Buffer.from(sel, "base64url"));
  const ref = Buffer.from(attendu, "base64url");
  return ref.length === cle.length && timingSafeEqual(ref, cle);
}

/*
 * Pour un numéro inconnu, on calcule quand même un scrypt : sans cela la
 * réponse « inconnu » reviendrait sensiblement plus vite que « PIN faux », et
 * le chronomètre dirait qui est inscrit.
 */
let hacheFactice: Promise<string> | null = null;
export async function simulerVerificationPin(pin: string): Promise<void> {
  hacheFactice ??= hacherPin("0000");
  await pinCorrespond(pin, await hacheFactice);
}

export function empreinte(valeur: string): string {
  return createHash("sha256").update(valeur).digest("hex");
}

/** Six chiffres tirés au sort cryptographiquement (0 en tête compris). */
export function tirerCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function tirerJeton(): string {
  return randomBytes(32).toString("base64url");
}

/** Le haché d'un code est lié à sa ligne : deux numéros n'ont jamais le même. */
export function empreinteCode(id: string, code: string): string {
  return empreinte(`${id}:${code}`);
}

export function adresseIp(requete: Request): string | null {
  const transmise = requete.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return transmise || requete.headers.get("x-real-ip") || null;
}

/**
 * Adresse de connexion d'un compte qui n'a pas donné d'e-mail. Supabase Auth
 * exige un identifiant et la connexion par téléphone n'est pas activée côté
 * Supabase ; le domaine réservé `.invalid` garantit qu'aucun message ne peut
 * jamais y être remis. Elle n'apparaît nulle part ailleurs : `utilisateurs.email`
 * reste vide.
 */
export function emailTechnique(international: string): string {
  return `tel-${international.replace(/\D/g, "")}@telephone.docteur224.invalid`;
}

/**
 * Le jeton remis après un code reconnu : valide pour ce numéro, cet objet,
 * vingt minutes, une seule fois. Rend l'id de la ligne, ou null.
 */
export async function lireJeton(
  admin: SupabaseClient,
  jeton: unknown,
  telephone: string,
  objet: ObjetCode
): Promise<string | null> {
  if (typeof jeton !== "string" || jeton.length < 20) return null;
  const depuis = new Date(Date.now() - VALIDITE_JETON_MINUTES * 60_000).toISOString();
  const { data } = await admin
    .from("codes_telephone")
    .select("id")
    .eq("jeton_hash", empreinte(jeton))
    .eq("telephone", telephone)
    .eq("objet", objet)
    .is("utilise_le", null)
    .gt("verifie_le", depuis)
    .maybeSingle();
  return data?.id ?? null;
}

export async function marquerJetonUtilise(admin: SupabaseClient, id: string): Promise<void> {
  await admin.from("codes_telephone").update({ utilise_le: new Date().toISOString() }).eq("id", id);
}

/**
 * Le compte au nom duquel les codes partent : le compte administrateur
 * principal. Un message de la plateforme n'est débité d'aucun quota
 * professionnel (migration 0039), mais `messages_envoyes` exige un titulaire.
 */
export async function titulairePlateforme(admin: SupabaseClient): Promise<string | null> {
  const { data } = await admin
    .from("utilisateurs")
    .select("id")
    .eq("admin_principal", true)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Ouvre la session du compte dans les cookies de la réponse en cours.
 * Les refus de Supabase (compte banni : fermé ou suspendu par
 * l'administration) sont traduits sans dire lequel des deux s'applique —
 * même règle que `seConnecter`.
 */
export async function ouvrirSession(
  admin: SupabaseClient,
  utilisateurId: string
): Promise<{ erreur?: string }> {
  const { data: compte, error: eCompte } = await admin.auth.admin.getUserById(utilisateurId);
  if (eCompte || !compte.user?.email) return { erreur: "Compte introuvable. Contactez le support." };
  const { data: lien, error: eLien } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: compte.user.email,
  });
  if (eLien || !lien.properties?.hashed_token) {
    return { erreur: "Connexion impossible pour le moment. Réessayez dans un instant." };
  }
  const supabase = await creerClientServeur();
  const { error } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: lien.properties.hashed_token,
  });
  if (error) {
    if (/banned/i.test(error.message)) {
      return {
        erreur:
          "Ce compte n’est plus accessible. Si vous pensez qu’il s’agit d’une erreur, écrivez à support@docteur224.com.",
      };
    }
    return { erreur: "Connexion impossible pour le moment. Réessayez dans un instant." };
  }
  return {};
}

/**
 * Un compte qui peut entrer par la porte du public. Un compte fermé garde sa
 * ligne (l'historique des rendez-vous la référence) ; un administrateur ne
 * prend pas de session par un écran public.
 */
export async function compteOuvrable(
  admin: SupabaseClient,
  utilisateurId: string
): Promise<{ role?: string; erreur?: string }> {
  const { data } = await admin
    .from("utilisateurs")
    .select("role, statut")
    .eq("id", utilisateurId)
    .maybeSingle();
  if (!data) return { erreur: "Profil introuvable. Contactez le support." };
  if (data.statut === "supprime") return { erreur: "Ce compte a été fermé." };
  if (data.role === "admin") {
    return { erreur: "Les comptes administrateurs se connectent depuis la console d’administration." };
  }
  return { role: data.role };
}
