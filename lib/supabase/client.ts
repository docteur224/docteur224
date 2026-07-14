import { createBrowserClient } from "@supabase/ssr";

/*
 * Client Supabase côté navigateur (composants "use client").
 * La session est partagée avec le serveur via les cookies (@supabase/ssr).
 */
export function creerClientNavigateur() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
