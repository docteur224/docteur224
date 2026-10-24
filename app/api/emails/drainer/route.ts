import { NextResponse } from "next/server";
import { appelantLegitime } from "@/lib/drain-acces";
import { drainerEmails } from "@/lib/emails/drain";
import { drainerRappels } from "@/lib/rappels/drain";

/*
 * Vidange de la file d'e-mails.
 *
 * Deux appelants légitimes, et deux preuves différentes :
 *
 *   1. le planificateur `pg_cron`, qui frappe toutes les minutes depuis
 *      Supabase et présente la clé `EMAIL_CLE_DRAIN` ;
 *   2. le navigateur d'un utilisateur qui vient d'agir — réserver, annuler —
 *      et qui présente sa session.
 *
 * La poussée du navigateur existe pour une seule raison : sans elle, une
 * confirmation de rendez-vous attend le prochain tour du cron, jusqu'à une
 * minute. Elle est sans danger parce que cette route N'ACCEPTE AUCUN CONTENU :
 * elle ne fait que vider une file que seuls des triggers remplissent. Le pire
 * qu'un appelant puisse provoquer, c'est que des messages déjà dus partent un
 * peu plus tôt.
 *
 * Elle ne rend jamais 500 : le cron n'en ferait rien, et un échec d'envoi est
 * une information à lire, pas une panne de la route.
 */

/** Le lot est plafonné côté base ; la route doit rendre la main vite. */
export const maxDuration = 60;

export async function POST(requete: Request) {
  if (!(await appelantLegitime(requete))) {
    /*
     * Le refus dit s'il existe une clé CÔTÉ SERVEUR — jamais sa valeur, ni
     * celle qui a été présentée. Sans cette indication, deux causes très
     * différentes rendent le même 401 muet : une variable d'environnement
     * absente du déploiement, et une valeur qui ne correspond pas. La
     * première se règle chez l'hébergeur, la seconde dans le planificateur,
     * et rien ne permettait de les distinguer depuis l'extérieur.
     *
     * Savoir qu'un secret est configuré n'aide personne à le deviner.
     */
    return NextResponse.json(
      { erreur: "Appel non autorisé.", cleConfiguree: !!process.env.EMAIL_CLE_DRAIN },
      { status: 401 }
    );
  }
  const resultat = await drainerEmails();
  // Les rappels SMS/WhatsApp (0066) partent au même rythme : le planificateur
  // qui appelle cette route chaque minute suffit, sans second travail pg_cron.
  const rappels = await drainerRappels();
  return NextResponse.json({ ...resultat, rappels });
}
