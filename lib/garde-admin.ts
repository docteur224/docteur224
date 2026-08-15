import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { creerClientServeur } from "@/lib/supabase/server";
import type { Permission } from "@/lib/permissions-admin";

/*
 * Garde des routes d'administration qui ont besoin de la clé service_role
 * (création de compte, bannissement : l'API auth admin n'est pas accessible
 * depuis le navigateur).
 *
 * Cette clé traverse la RLS : c'est précisément pourquoi la permission de
 * l'appelant est relue EN BASE ici, jamais déduite de ce qu'il poste. Le
 * cheminement est toujours le même — session utilisateur pour savoir QUI
 * appelle, client service_role pour savoir ce qu'il a le droit de faire.
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

/**
 * Rend l'accès, ou la réponse d'erreur à renvoyer telle quelle.
 * Un compte administrateur suspendu n'est plus administrateur — même règle
 * qu'en base depuis `est_admin()` (migration 0043).
 */
export async function verifierAdmin(
  permission: Permission
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
  if (!principal && !(appelant.sous_roles_admin ?? []).includes(permission)) {
    return {
      refus: NextResponse.json(
        { erreur: "Vous n’avez pas la permission « Équipe admin »." },
        { status: 403 }
      ),
    };
  }

  return { acces: { admin, appelantId: auth.user.id, principal } };
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
