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

/** Espaces privés et porte à laquelle renvoyer un visiteur sans session. */
const ESPACES_PRIVES: { prefixe: string; connexion: string }[] = [
  { prefixe: "/espace-admin", connexion: CONNEXION_ADMIN },
  { prefixe: "/espace-medecin", connexion: "/connexion" },
  { prefixe: "/espace-assistant", connexion: "/connexion" },
  { prefixe: "/espace-etablissement", connexion: "/connexion" },
];

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
  const espace = ESPACES_PRIVES.find((e) => chemin.startsWith(e.prefixe));
  if (!user && espace && chemin !== espace.connexion) {
    const cible = request.nextUrl.clone();
    cible.pathname = espace.connexion;
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
