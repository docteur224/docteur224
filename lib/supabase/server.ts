import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/*
 * Client Supabase côté serveur (Server Components, Server Actions, route handlers).
 * Lit et écrit la session dans les cookies de la requête.
 */
export async function creerClientServeur() {
  const magasinCookies = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
