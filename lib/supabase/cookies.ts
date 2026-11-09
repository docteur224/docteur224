/*
 * Attributs du cookie de session Supabase (@supabase/ssr).
 *
 * UN SEUL ENDROIT décide des drapeaux du cookie, partagé par les trois
 * fabriques qui écrivent la session : le navigateur (`client.ts`), les Server
 * Components et routes (`server.ts`), et le proxy (`proxy.ts`). Sans ce point
 * unique, un durcissement posé à un seul endroit laisserait les deux autres
 * réécrire le cookie à l'ancienne au prochain rafraîchissement.
 *
 * CE QU'ON NE TOUCHE PAS, ET POURQUOI. Le navigateur ne retrouve un cookie
 * existant que par son NOM, son PATH et son DOMAIN ; il ne le relit que si le
 * FORMAT de son contenu n'a pas changé. Quatre choses, donc, qu'on laisse à
 * leur valeur par défaut — les omettre ici, c'est les garder :
 *   - `name`    : défaut `sb-<ref>-auth-token` (dérivé de l'URL du projet) ;
 *   - `path`    : défaut `/` ;
 *   - `domain`  : défaut absent (cookie « host-only ») ;
 *   - l'encodage : défaut `base64url`, qu'on ne redéfinit nulle part.
 * En changer un seul déconnecterait toutes les sessions en cours.
 *
 * CE QU'ON FIXE :
 *   - `secure`   : le cookie ne part qu'en HTTPS. Conditionné à la production
 *                  (Vercel sert toujours en HTTPS) ; désactivé en développement,
 *                  sinon le navigateur refuse le cookie sur http://localhost et
 *                  la connexion locale casse. Même convention que le cookie
 *                  d'état OAuth (app/api/agenda-google/connexion/route.ts).
 *   - `sameSite` : « lax ». C'est déjà le défaut de la bibliothèque, mais le
 *                  POSER explicitement le fige : c'est sur cette valeur, et elle
 *                  seule, que repose aujourd'hui la protection CSRF du site. Un
 *                  défaut de bibliothèque peut changer à une mise à jour ; une
 *                  valeur écrite ici, non.
 *   - `httpOnly` : « false », ASSUMÉ. Le SDK navigateur DOIT lire le cookie en
 *                  JavaScript pour en extraire le jeton et le présenter à
 *                  Supabase (en-tête Authorization). Le passer à `true`
 *                  aveuglerait tout l'accès aux données depuis le navigateur —
 *                  c'est un chantier distinct (passage de tous les appels côté
 *                  serveur), pas un drapeau à basculer. L'écrire explicitement
 *                  empêche qu'on l'« active » un jour par mégarde.
 *
 * CE QU'ON NE PEUT PAS FIXER ICI : la DURÉE (`maxAge`). @supabase/ssr réécrit
 * le `maxAge` du cookie de session à sa valeur par défaut (400 jours) au moment
 * de l'écriture, quels que soient les `cookieOptions` fournis (voir
 * node_modules/@supabase/ssr : la construction de `setCookieOptions` force
 * `maxAge: DEFAULT_COOKIE_OPTIONS.maxAge`). Le passer ici n'aurait aucun effet.
 * La durée de vie RÉELLE d'une session est de toute façon celle du jeton de
 * rafraîchissement, réglée côté Supabase (« Session timeouts »), pas celle du
 * cookie — c'est là que se pose le plafond de 30 jours, comme l'expiration du
 * jeton d'accès (900 s) s'y pose déjà.
 */

/** Les drapeaux à fusionner dans `cookieOptions` (sans name/path/domain/maxAge). */
export interface DrapeauxCookieSession {
  secure: boolean;
  sameSite: "lax";
  httpOnly: false;
}

/**
 * Rend les drapeaux du cookie de session.
 *
 * `enProduction` est un paramètre (avec sa valeur réelle par défaut) pour que
 * le test puisse exercer les deux mondes sans variable d'environnement.
 */
export function optionsCookieSession(
  enProduction: boolean = process.env.NODE_ENV === "production"
): DrapeauxCookieSession {
  return {
    secure: enProduction,
    sameSite: "lax",
    httpOnly: false,
  };
}
