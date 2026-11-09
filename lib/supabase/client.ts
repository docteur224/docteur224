import { createBrowserClient } from "@supabase/ssr";
import { optionsCookieSession } from "@/lib/supabase/cookies";

/*
 * Client Supabase côté navigateur (composants "use client").
 * La session est partagée avec le serveur via les cookies (@supabase/ssr).
 *
 * `cookieOptions` ne fixe QUE les drapeaux (secure, sameSite, httpOnly) ; le
 * nom, le chemin, le domaine et l'encodage du cookie restent ceux par défaut
 * — voir lib/supabase/cookies.ts pour le détail.
 */
export function creerClientNavigateur() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: optionsCookieSession() }
  );
}
