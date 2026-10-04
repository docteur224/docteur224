import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/*
 * Proxy Next 16 (ex-middleware) : rafraîchit la session Supabase à chaque
 * requête pour que les Server Components disposent toujours d'un JWT valide.
 *
 * Il porte aussi le premier filtre des espaces privés : sans session, on
 * n'affiche pas une console — même vide. C'est une vérification OPTIMISTE,
 * au sens de la documentation Next : elle évite d'envoyer l'écran à un
 * visiteur anonyme, elle ne remplace ni la RLS (qui décide de chaque
 * ligne), ni les routes /api (qui relisent le rôle et les droits de
 * l'appelant en base).
 *
 * Le RÔLE, lui, n'est pas contrôlé ici : il vit dans `utilisateurs`, pas
 * dans le jeton, et le lire imposerait une requête à chaque requête. Ce
 * sont les coquilles (AdminShell, MedecinShell…) qui s'en chargent.
 */

/** La porte de l'espace admin doit rester ouverte, sinon plus personne n'entre. */
const CONNEXION_ADMIN = "/espace-admin/connexion";

/*
 * Espaces privés et porte à laquelle renvoyer un visiteur sans session.
 *
 * L'espace patient y figure au même titre que les quatre autres : sa
 * coquille posait bien la garde côté navigateur, mais la page partait
 * quand même au visiteur anonyme, qui voyait le menu et les libellés le
 * temps d'une redirection. « Mes rendez-vous » suit la même règle — c'est
 * l'agenda personnel du patient, pas une page publique.
 */
const ESPACES_PRIVES: { prefixe: string; connexion: string }[] = [
  { prefixe: "/espace-admin", connexion: CONNEXION_ADMIN },
  { prefixe: "/espace-medecin", connexion: "/connexion" },
  { prefixe: "/espace-assistant", connexion: "/connexion" },
  { prefixe: "/espace-etablissement", connexion: "/connexion" },
  { prefixe: "/patient", connexion: "/connexion" },
  { prefixe: "/mes-rendez-vous", connexion: "/connexion" },
];

/*
 * Mode maintenance — ce qui RESTE ouvert quand l'interrupteur est actif.
 *
 * La maintenance ferme le site aux PATIENTS ; l'équipe doit continuer à
 * travailler et, surtout, pouvoir rouvrir la plateforme. Restent donc
 * accessibles les espaces professionnels, les deux portes de connexion, les
 * routes /api (les espaces en dépendent, et chacune relit ses propres droits),
 * les liens de désinscription des e-mails déjà partis, et la page /maintenance
 * elle-même (sinon : boucle de réécriture).
 *
 * Le gardiennage se fait par CHEMIN : lire le rôle à chaque requête est
 * précisément ce que ce proxy s'interdit (voir l'en-tête). Patients et
 * professionnels se distinguent déjà par l'URL qu'ils visitent.
 */
const MAINTENANCE_OUVERTS = [
  "/espace-admin",
  "/espace-medecin",
  "/espace-assistant",
  "/espace-etablissement",
  "/connexion",
  "/desinscription",
  "/maintenance",
  "/api",
];

function maintenanceOuvert(chemin: string): boolean {
  return MAINTENANCE_OUVERTS.some((p) => chemin === p || chemin.startsWith(p + "/"));
}

async function maintenanceActive(
  supabase: ReturnType<typeof createServerClient>
): Promise<boolean> {
  // Fail-open : une lecture qui échoue laisse passer. Une maintenance n'a pas
  // à transformer un hoquet de base en panne totale du site.
  try {
    const { data } = await supabase
      .from("parametres_plateforme")
      .select("valeur")
      .eq("cle", "mode_maintenance")
      .maybeSingle();
    return data?.valeur === true;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  let reponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(aDefinir) {
          aDefinir.forEach(({ name, value }) => request.cookies.set(name, value));
          reponse = NextResponse.next({ request });
          aDefinir.forEach(({ name, value, options }) =>
            reponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Ne pas supprimer : force le rafraîchissement du jeton si expiré.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const chemin = request.nextUrl.pathname;

  // Mode maintenance — on ne consulte le drapeau que pour les chemins
  // concernés (page publique à fermer, ou /maintenance à rouvrir), jamais sur
  // les espaces pros ni l'API, pour ne pas leur coller une lecture de plus.
  const ouvert = maintenanceOuvert(chemin);
  if (!ouvert || chemin === "/maintenance") {
    const active = await maintenanceActive(supabase);
    if (active && !ouvert) {
      // Réécriture (pas redirection) : l'URL demandée est conservée, un simple
      // rafraîchissement rouvre la vraie page une fois la maintenance levée.
      return NextResponse.rewrite(new URL("/maintenance", request.url));
    }
    if (!active && chemin === "/maintenance") {
      // Hors maintenance, la page ne doit pas rester une impasse accessible.
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  const espace = ESPACES_PRIVES.find((e) => chemin.startsWith(e.prefixe));
  if (!user && espace && chemin !== espace.connexion) {
    const cible = request.nextUrl.clone();
    cible.pathname = espace.connexion;
    // On revient où l'on allait : sans cela, un lien partagé vers un
    // rendez-vous précis retombait sur l'accueil de l'espace après
    // identification. `/connexion` n'accepte qu'un chemin interne.
    cible.search = "";
    if (espace.connexion === "/connexion") cible.searchParams.set("retour", chemin);
    const redirection = NextResponse.redirect(cible);
    // Les cookies posés plus haut (session expirée effacée) doivent suivre :
    // la redirection remplace la réponse, elle n'en hérite pas.
    reponse.cookies.getAll().forEach((c) => redirection.cookies.set(c));
    return redirection;
  }

  return reponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
