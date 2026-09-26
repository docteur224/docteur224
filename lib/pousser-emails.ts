/*
 * Coup de pouce au drain, depuis le navigateur.
 *
 * Le planificateur passe toutes les minutes ; c'est très bien pour un rappel
 * programmé la veille, et beaucoup trop lent pour la confirmation d'un
 * rendez-vous qu'on vient de prendre — le patient referme l'onglet en se
 * demandant si c'est passé. Un appel après l'action fait partir le message
 * dans la seconde.
 *
 * Fichier séparé de `lib/emails/drain.ts`, qui lit des secrets et ne doit
 * jamais être importé depuis le navigateur.
 *
 * Aucune valeur de retour, aucune attente : le rendez-vous est déjà
 * enregistré, et l'écran n'a pas à dépendre de l'acheminement d'un courriel.
 */
export function pousserEmails(): void {
  if (typeof window === "undefined") return;
  // La route ne reçoit rien : elle vide une file que seuls des triggers
  // remplissent. On ne lui transmet donc aucun identifiant de message.
  void fetch("/api/emails/drainer", { method: "POST", keepalive: true }).catch(() => {
    // Sans conséquence : le planificateur reprendra la file au tour suivant.
  });
}
