import { creerClientServeur } from "@/lib/supabase/server";

/*
 * Qui peut déclencher une vidange de file (e-mails, rappels) ?
 *
 *   1. le planificateur `pg_cron`, qui frappe toutes les minutes depuis
 *      Supabase et présente la clé `EMAIL_CLE_DRAIN` ;
 *   2. le navigateur d'un utilisateur connecté qui vient d'agir.
 *
 * Sans danger dans le second cas : une vidange N'ACCEPTE AUCUN CONTENU, elle
 * envoie ce que des triggers ont mis en file. Le pire qu'un appelant puisse
 * provoquer, c'est qu'un message déjà dû parte un peu plus tôt.
 *
 * Extrait de la route des e-mails le jour où les rappels SMS/WhatsApp ont eu
 * besoin exactement de la même garde.
 */
export async function appelantLegitime(requete: Request): Promise<boolean> {
  /*
   * `trim` des DEUX CÔTÉS. Une clé partagée voyage par copier-coller — dans
   * une console d'hébergeur, dans un fichier d'environnement — et repart
   * régulièrement avec une espace ou un retour à la ligne accroché. Comme la
   * comparaison exige une longueur identique, ce caractère invisible produit
   * un refus que rien à l'écran n'explique. Le retirer ne coûte rien : un
   * secret ne se distingue pas d'un autre par ses espaces de bord.
   */
  const cle = process.env.EMAIL_CLE_DRAIN?.trim();
  const presentee = requete.headers.get("x-cle-drain")?.trim();
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
