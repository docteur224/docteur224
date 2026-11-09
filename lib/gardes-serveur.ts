import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { creerClientServeur } from "@/lib/supabase/server";
import type { Permission } from "@/lib/permissions-admin";

/*
 * Gardes des routes qui ont besoin de la clé service_role (création de
 * compte, bannissement : l'API auth admin n'est pas accessible depuis le
 * navigateur).
 *
 * Cette clé traverse la RLS : c'est précisément pourquoi le rôle et les
 * droits de l'appelant sont relus EN BASE ici, jamais déduits de ce qu'il
 * poste. Le cheminement est toujours le même — session utilisateur pour
 * savoir QUI appelle, client service_role pour agir une fois seulement
 * qu'on sait ce qu'il a le droit de faire.
 */

export interface AccesAdmin {
  /** Client service_role : traverse la RLS, à n'utiliser qu'après cette garde. */
  admin: SupabaseClient;
  appelantId: string;
  principal: boolean;
}

export function clientServiceRole(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/*
 * Deuxième facteur (2FA) — ce que lisent les gardes pour exiger un niveau AAL2.
 *
 * Le jeton a DÉJÀ été validé par getUser() juste avant qu'on lise son `aal` :
 * décoder la charge utile sans revérifier la signature est donc sûr ici.
 */
function aalDuJeton(token: string | null | undefined): "aal1" | "aal2" {
  if (!token) return "aal1";
  try {
    const charge = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return charge?.aal === "aal2" ? "aal2" : "aal1";
  } catch {
    return "aal1";
  }
}

/** Le compte a-t-il un facteur 2FA VÉRIFIÉ ? (API admin, clé de service.) */
async function aUnFacteurVerifie(admin: SupabaseClient, utilisateurId: string): Promise<boolean> {
  try {
    const { data } = await admin.auth.admin.mfa.listFactors({ userId: utilisateurId });
    return (data?.factors ?? []).some((f) => f.status === "verified");
  } catch {
    // Fail-open : une lecture qui échoue ne doit pas verrouiller un
    // administrateur hors de la console. L'autre règle (interrupteur) tranche.
    return false;
  }
}

/** L'interrupteur « 2FA obligatoire » (migration 0087). Fail-open : absent → non. */
async function mfaAdminObligatoire(admin: SupabaseClient): Promise<boolean> {
  try {
    const { data } = await admin
      .from("parametres_plateforme")
      .select("valeur")
      .eq("cle", "mfa_admin_obligatoire")
      .maybeSingle();
    return data?.valeur === true;
  } catch {
    return false;
  }
}

/**
 * Rend l'accès, ou la réponse d'erreur à renvoyer telle quelle.
 * Un compte administrateur suspendu n'est plus administrateur — même règle
 * qu'en base depuis `est_admin()` (migration 0043).
 */
export async function verifierAdmin(
  /**
   * Omise, la garde exige seulement un compte administrateur actif : c'est le
   * cas des écrans ouverts à toute l'équipe (tableau de bord, prise de
   * rendez-vous au téléphone), qui ne relèvent d'aucune section cloisonnée.
   */
  permission?: Permission
): Promise<{ acces: AccesAdmin } | { refus: NextResponse }> {
  const session = await creerClientServeur();
  const { data: auth } = await session.auth.getUser();
  if (!auth.user) {
    return {
      refus: NextResponse.json({ erreur: "Session expirée — reconnectez-vous." }, { status: 401 }),
    };
  }

  const admin = clientServiceRole();
  const { data: appelant } = await admin
    .from("utilisateurs")
    .select("role, statut, sous_roles_admin, admin_principal")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (appelant?.role !== "admin" || appelant.statut !== "actif") {
    return { refus: NextResponse.json({ erreur: "Réservé aux administrateurs." }, { status: 403 }) };
  }
  const principal = Boolean(appelant.admin_principal);

  /*
   * Deuxième facteur. Une action d'administration exige une session AAL2 :
   *   - dès que le compte a un facteur vérifié (indépendant de l'interrupteur) ;
   *   - et, si l'interrupteur « 2FA obligatoire » est posé, même pour un compte
   *     qui n'en a pas encore — il doit alors s'enrôler.
   * Un compte sans facteur, interrupteur éteint, passe comme avant : déployer
   * cette garde ne change donc rien tant que personne ne s'est enrôlé.
   */
  if (aalDuJeton((await session.auth.getSession()).data.session?.access_token) !== "aal2") {
    if (await aUnFacteurVerifie(admin, auth.user.id)) {
      return {
        refus: NextResponse.json(
          { erreur: "Terminez la vérification en deux étapes pour agir dans la console.", mfa: "requise" },
          { status: 403 }
        ),
      };
    }
    if (await mfaAdminObligatoire(admin)) {
      return {
        refus: NextResponse.json(
          { erreur: "Activez la vérification en deux étapes (2FA) pour accéder à la console.", mfa: "enrolement" },
          { status: 403 }
        ),
      };
    }
  }

  if (permission && !principal && !(appelant.sous_roles_admin ?? []).includes(permission)) {
    return {
      refus: NextResponse.json(
        { erreur: `Vous n’avez pas la permission « ${permission} ».` },
        { status: 403 }
      ),
    };
  }

  return { acces: { admin, appelantId: auth.user.id, principal } };
}

export interface AccesMedecin {
  admin: SupabaseClient;
  medecinId: string;
}

/**
 * Garde des routes de l'espace médecin.
 *
 * Un(e) assistant(e) est refusé(e) : il/elle travaille DANS l'équipe, il/elle
 * ne la compose pas. La RLS le dit déjà (`mod_assistants_medecin` exige
 * `medecin_id = auth.uid()`), mais ces routes emploient la clé service_role,
 * qui la traverse — le contrôle doit donc être refait ici.
 */
export async function verifierMedecin(): Promise<
  { acces: AccesMedecin } | { refus: NextResponse }
> {
  const session = await creerClientServeur();
  const { data: auth } = await session.auth.getUser();
  if (!auth.user) {
    return {
      refus: NextResponse.json({ erreur: "Session expirée — reconnectez-vous." }, { status: 401 }),
    };
  }

  const admin = clientServiceRole();
  const { data: appelant } = await admin
    .from("utilisateurs")
    .select("role, statut")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (appelant?.role !== "medecin" || appelant.statut !== "actif") {
    return {
      refus: NextResponse.json(
        { erreur: "Réservé au médecin titulaire du compte." },
        { status: 403 }
      ),
    };
  }
  return { acces: { admin, medecinId: auth.user.id } };
}

export interface AccesPatient {
  admin: SupabaseClient;
  patientId: string;
}

/**
 * Garde des routes réservées au patient titulaire (ex. synchronisation de son
 * agenda Google). Même cheminement que `verifierMedecin` : la session dit QUI
 * appelle, le rôle est relu EN BASE (jamais déduit de ce qui est posté), puis
 * on rend le client service_role pour agir.
 */
export async function verifierPatient(): Promise<
  { acces: AccesPatient } | { refus: NextResponse }
> {
  const session = await creerClientServeur();
  const { data: auth } = await session.auth.getUser();
  if (!auth.user) {
    return {
      refus: NextResponse.json({ erreur: "Session expirée — reconnectez-vous." }, { status: 401 }),
    };
  }

  const admin = clientServiceRole();
  const { data: appelant } = await admin
    .from("utilisateurs")
    .select("role, statut")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (appelant?.role !== "patient" || appelant.statut !== "actif") {
    return {
      refus: NextResponse.json({ erreur: "Réservé aux comptes patients." }, { status: 403 }),
    };
  }
  return { acces: { admin, patientId: auth.user.id } };
}

/**
 * Trace une décision au nom de l'appelant.
 *
 * Écriture directe plutôt que la RPC `ecrire_audit` : celle-ci renseigne
 * l'acteur avec auth.uid(), nul sous service_role — ce qui effacerait
 * justement l'information la plus importante, qui a agi.
 */
export async function tracerAuditServeur(
  admin: SupabaseClient,
  acteurId: string,
  action: string,
  cible: string,
  cibleId?: string
): Promise<void> {
  await admin.from("journal_audit").insert({
    action,
    acteur_id: acteurId,
    cible_type: "utilisateur",
    cible_id: cibleId ?? null,
    details: { cible },
  });
}
