import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { optionsCookieSession } from "@/lib/supabase/cookies";

/*
 * Client Supabase côté serveur (Server Components, Server Actions, route handlers).
 * Lit et écrit la session dans les cookies de la requête.
 *
 * `cookieOptions` ne fixe QUE les drapeaux (secure, sameSite, httpOnly) ; le
 * nom, le chemin, le domaine et l'encodage restent ceux par défaut — voir
 * lib/supabase/cookies.ts. Les options arrivent déjà fusionnées dans le
 * `options` reçu par `setAll` ci-dessous, qui les repose telles quelles.
 */
export async function creerClientServeur() {
  const magasinCookies = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: optionsCookieSession(),
      cookies: {
        getAll() {
          return magasinCookies.getAll();
        },
        setAll(aDefinir) {
          try {
            aDefinir.forEach(({ name, value, options }) =>
              magasinCookies.set(name, value, options)
            );
          } catch {
            // Appel depuis un Server Component : les cookies seront
            // rafraîchis par le proxy, on peut ignorer.
          }
        },
      },
    }
  );
}
