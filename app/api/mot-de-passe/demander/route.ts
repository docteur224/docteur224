import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { drainerEmails } from "@/lib/emails/drain";

/*
 * « Mot de passe oublié » — la demande.
 *
 * Trois décisions structurent cette route.
 *
 * 1. LE LIEN VIENT DE SUPABASE, LE COURRIEL VIENT DE NOUS.
 *    `generateLink` fabrique un jeton de récupération sans rien expédier :
 *    c'est exactement ce qu'il faut ici. Le message part ensuite par la file
 *    `emails_en_attente` (migration 0057), donc par notre serveur SMTP, notre
 *    gabarit et notre langue — pas par le modèle anglais de Supabase, dont le
 *    quota d'envoi est de quelques messages par heure, tous comptes confondus.
 *
 * 2. LA RÉPONSE NE DIT JAMAIS SI LE COMPTE EXISTE.
 *    Adresse inconnue, compte fermé, compte suspendu, envoi réussi : le même
 *    `{ ok: true }`. Distinguer ces cas ferait de cet écran un vérificateur
 *    d'adresses : on saurait, en quelques requêtes, qui est inscrit chez un
 *    service de santé. Les causes réelles partent dans le journal du serveur.
 *
 * 3. ON VIDE LA FILE ICI MÊME.
 *    `/api/emails/drainer` exige une session ou la clé du planificateur ; or
 *    celui qui demande un mot de passe est par définition déconnecté. Sans cet
 *    appel, le message attendrait le prochain tour du cron — jusqu'à une
 *    minute devant un écran qui vient de promettre un courriel.
 */

export const maxDuration = 60;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Le chemin ouvert par le lien du courriel. */
const PAGE_NOUVEAU = "/mot-de-passe-oublie/nouveau";

/*
 * Garde-fou contre l'usage du formulaire comme machine à expédier : au-delà
 * de trois demandes en un quart d'heure pour un même compte, on répond
 * exactement comme d'habitude sans rien déposer de plus. Le titulaire a déjà
 * reçu de quoi faire ; celui qui le harcèle n'obtient rien de visible.
 */
const FENETRE_MINUTES = 15;
const DEMANDES_MAX = 3;

export async function POST(requete: Request) {
  const corps = await requete.json().catch(() => null);
  const email = String(corps?.email ?? "").trim().toLowerCase();

  // La réponse est la même dans tous les cas : on la prépare une fois.
  const reponseNeutre = () => NextResponse.json({ ok: true });

  if (!EMAIL.test(email)) {
    return NextResponse.json({ erreur: "Adresse e-mail invalide." }, { status: 400 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: profil } = await admin
    .from("utilisateurs")
    .select("id, statut, suspendu_par_admin")
    .eq("email", email)
    .maybeSingle();

  /*
   * Compte inconnu, fermé ou suspendu : on s'arrête sans rien dire. Le dépôt
   * en file refuserait de toute façon ces deux derniers cas
   * (`email_destinataire`, migration 0057) ; le vérifier ici évite surtout de
   * fabriquer un jeton de récupération pour un compte qui n'a plus le droit
   * d'entrer.
   */
  if (!profil || profil.statut !== "actif" || profil.suspendu_par_admin) return reponseNeutre();

  const depuis = new Date(Date.now() - FENETRE_MINUTES * 60_000).toISOString();
  const { count } = await admin
    .from("emails_en_attente")
    .select("id", { count: "exact", head: true })
    .eq("destinataire_id", profil.id)
    .eq("type", "mot_de_passe_oublie")
    .gte("cree_le", depuis);
  if ((count ?? 0) >= DEMANDES_MAX) return reponseNeutre();

  const { data: lien, error: eLien } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
  });
  const jeton = lien?.properties?.hashed_token;
  if (eLien || !jeton) {
    console.error("[mot-de-passe] jeton non généré :", eLien?.message ?? "réponse sans jeton");
    return reponseNeutre();
  }

  /*
   * Le jeton voyage dans le lien, donc dans la colonne `lien` de la file —
   * table sans policy RLS, lue par la seule service_role. Il vaut une heure
   * (réglage « OTP expiry » du projet) et ne sert qu'une fois : c'est le même
   * secret que celui du courriel, pas un second.
   */
  const { error: eFile } = await admin.rpc("programmer_email", {
    p_destinataire: profil.id,
    p_type: "mot_de_passe_oublie",
    p_titre: "Réinitialisation de votre mot de passe",
    p_corps: null,
    p_lien: `${PAGE_NOUVEAU}?jeton=${encodeURIComponent(jeton)}`,
  });
  if (eFile) {
    console.error("[mot-de-passe] dépôt en file impossible :", eFile.message);
    return reponseNeutre();
  }

  // Un échec d'acheminement ne change pas la réponse : la ligne reste en file
  // et le planificateur la reprendra au tour suivant.
  const resultat = await drainerEmails().catch(() => null);
  if (resultat?.inactif) console.warn("[mot-de-passe] canal e-mail inactif :", resultat.inactif);

  return reponseNeutre();
}
