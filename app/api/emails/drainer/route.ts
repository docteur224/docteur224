import { NextResponse } from "next/server";
import { creerClientServeur } from "@/lib/supabase/server";
import { drainerEmails } from "@/lib/emails/drain";

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

async function appelantLegitime(requete: Request): Promise<boolean> {
  const cle = process.env.EMAIL_CLE_DRAIN;
  const presentee = requete.headers.get("x-cle-drain");
  /*
   * Comparaison en longueur constante. Le gain est théorique sur une route
   * appelée par un cron, mais une comparaison de secret qui s'interrompt au
   * premier caractère différent est le genre de détail qu'on ne veut pas avoir
   * à revoir quand la route servira à autre chose.
   */
  if (cle && presentee && presentee.length === cle.length) {
    let egal = 0;
    for (let i = 0; i < cle.length; i++) egal |= cle.charCodeAt(i) ^ presentee.charCodeAt(i);
    if (egal === 0) return true;
  }

  const session = await creerClientServeur();
  const { data } = await session.auth.getUser();
  return !!data.user;
}

export async function POST(requete: Request) {
  if (!(await appelantLegitime(requete))) {
    return NextResponse.json({ erreur: "Appel non autorisé." }, { status: 401 });
  }
  const resultat = await drainerEmails();
  return NextResponse.json(resultat);
}
