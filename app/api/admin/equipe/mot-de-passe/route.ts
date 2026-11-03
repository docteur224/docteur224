import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { drainerEmails } from "@/lib/emails/drain";
import { tracerAuditServeur, verifierAdmin } from "@/lib/gardes-serveur";
import { creerClientServeur } from "@/lib/supabase/server";

/*
 * Changement du mot de passe du compte administrateur PRINCIPAL.
 *
 * Pourquoi une route à part, alors que /espace-admin/mon-compte sait déjà
 * changer un mot de passe ? Parce que le compte principal est le dernier
 * recours de la plateforme : il ne peut être ni désactivé, ni supprimé, ni
 * rétrogradé, et c'est le seul dont le mot de passe doit pouvoir être repris
 * depuis l'écran Équipe — là où l'on constate justement qu'il n'y a plus
 * personne d'autre pour rendre la main. Aucun lien par courriel : le lien
 * suppose une boîte accessible, ce qui n'est pas acquis dans ce cas-là.
 *
 * Trois verrous, qui sont la raison d'être du fichier :
 *
 * 1. SEUL LE TITULAIRE AGIT. La route n'accepte que le compte principal
 *    lui-même, et n'écrit jamais ailleurs que sur `appelantId`. Un admin
 *    doté de la permission « equipe » qui pourrait réécrire ce mot de passe
 *    prendrait la main sur la plateforme entière : ce serait une élévation
 *    de privilège offerte par l'écran censé les cloisonner.
 *
 * 2. L'ANCIEN MOT DE PASSE EST EXIGÉ, et vérifié ICI. Sans lui, une session
 *    laissée ouverte sur un poste suffirait à s'emparer du compte. La
 *    vérification se fait avec la clé ANON (un client jetable, sans
 *    persistance) : la clé service_role, elle, changerait le mot de passe
 *    sans jamais connaître l'ancien.
 *
 * 3. LE TITULAIRE EST PRÉVENU. Un courriel part après coup — sans lien,
 *    sans jeton, juste un constat. Si le changement n'est pas de lui, il
 *    l'apprend. Le geste est de surcroît inscrit au journal d'audit.
 *
 * Et une conséquence qu'il a fallu rattraper : changer le mot de passe par
 * l'API d'administration RÉVOQUE toutes les sessions du compte, y compris
 * celle de l'onglet qui vient de le demander — l'écran se retrouvait en
 * « session expirée » une seconde après un succès. On rouvre donc la session
 * ici même, avec le mot de passe qui vient d'être posé : les autres sessions
 * restent fermées (ce qui est le comportement souhaitable), celle du
 * demandeur continue.
 */

export const maxDuration = 60;

const LONGUEUR_MINIMALE = 8;

export async function POST(requete: NextRequest) {
  // Pas de permission exigée : le compte principal les détient toutes, et
  // ce geste n'est de toute façon ouvert qu'à lui.
  const garde = await verifierAdmin();
  if ("refus" in garde) return garde.refus;
  const { admin, appelantId, principal } = garde.acces;

  if (!principal) {
    return NextResponse.json(
      {
        erreur:
          "Seul le compte administrateur principal peut changer son mot de passe depuis cet écran.",
      },
      { status: 403 }
    );
  }

  const corps = await requete.json().catch(() => null);
  const actuel = typeof corps?.actuel === "string" ? corps.actuel : "";
  const nouveau = typeof corps?.nouveau === "string" ? corps.nouveau : "";

  if (!actuel || !nouveau) {
    return NextResponse.json(
      { erreur: "Renseignez le mot de passe actuel et le nouveau." },
      { status: 400 }
    );
  }
  if (nouveau.length < LONGUEUR_MINIMALE) {
    return NextResponse.json(
      { erreur: `Le nouveau mot de passe doit contenir au moins ${LONGUEUR_MINIMALE} caractères.` },
      { status: 400 }
    );
  }
  if (nouveau === actuel) {
    return NextResponse.json(
      { erreur: "Le nouveau mot de passe doit être différent de l’actuel." },
      { status: 400 }
    );
  }

  const { data: compte } = await admin
    .from("utilisateurs")
    .select("email, nom, prenom")
    .eq("id", appelantId)
    .maybeSingle();
  if (!compte?.email) {
    return NextResponse.json({ erreur: "Compte introuvable." }, { status: 404 });
  }

  /*
   * Client jetable à la clé publique : il sert UNIQUEMENT à éprouver
   * l'ancien mot de passe. `persistSession: false` lui interdit d'écrire
   * quoi que ce soit, et surtout de toucher aux cookies de la session en
   * cours — l'administrateur doit rester connecté après l'opération.
   */
  const controle = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { error: eVerification } = await controle.auth.signInWithPassword({
    email: compte.email,
    password: actuel,
  });
  if (eVerification) {
    return NextResponse.json({ erreur: "Mot de passe actuel incorrect." }, { status: 403 });
  }

  const { error: eMaj } = await admin.auth.admin.updateUserById(appelantId, {
    password: nouveau,
  });
  if (eMaj) {
    console.error("[equipe/mot-de-passe] changement refusé :", eMaj.message);
    return NextResponse.json(
      { erreur: "Le mot de passe n’a pas pu être modifié." },
      { status: 500 }
    );
  }

  /*
   * Rouvrir la session de l'appelant. Le client lié aux cookies de la requête
   * repose la session sur la réponse : l'administrateur poursuit son travail
   * sans se reconnecter. Un échec ici ne remet rien en cause — le mot de passe
   * est changé —, il se traduira par un simple retour à l'écran de connexion.
   */
  const session = await creerClientServeur();
  const { error: eSession } = await session.auth.signInWithPassword({
    email: compte.email,
    password: nouveau,
  });
  if (eSession) console.error("[equipe/mot-de-passe] session non rouverte :", eSession.message);

  const nomComplet = `${compte.prenom ?? ""} ${compte.nom ?? ""}`.trim() || compte.email;
  await tracerAuditServeur(
    admin,
    appelantId,
    "A changé le mot de passe du compte principal",
    `${nomComplet} · ${compte.email}`,
    appelantId
  );

  /*
   * L'avis part par notre file (migration 0057) : catégorie « service », donc
   * non désabonnable — un avis de sécurité ne se règle pas. On vide la file
   * dans la foulée pour que le message arrive pendant que l'opération est
   * encore présente à l'esprit. Un échec d'acheminement ne remet pas en cause
   * le changement, déjà effectué : la ligne attendra le prochain tour du cron.
   */
  const { error: eFile } = await admin.rpc("programmer_email", {
    p_destinataire: appelantId,
    p_type: "mot_de_passe_modifie",
    p_titre: "Le mot de passe de votre compte a été modifié",
    p_corps: null,
    p_lien: null,
  });
  if (eFile) console.error("[equipe/mot-de-passe] avis non déposé :", eFile.message);
  else await drainerEmails().catch(() => null);

  // `session` prévient l'appelant qu'il devra repasser par la connexion si
  // la session n'a pas pu être reposée.
  return NextResponse.json({ ok: true, session: !eSession });
}
