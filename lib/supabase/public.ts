import { createClient } from "@supabase/supabase-js";

/*
 * Client Supabase PUBLIC — anonyme, SANS cookie.
 *
 * Les pages publiques du blog sont servies en ISR (pré-rendues puis
 * revalidées) : elles ne doivent donc PAS lire les cookies de la requête, car
 * `cookies()` force un rendu dynamique à chaque visite et interdit le cache.
 *
 * Ce client se connecte avec la clé anonyme et ne persiste aucune session : il
 * agit comme le rôle `anon`, donc la RLS s'applique pleinement (seules les
 * lignes publiées / ouvertes sont lisibles). Il est réservé à la LECTURE de
 * contenu éditorial public — jamais à des données de compte.
 */
export function creerClientPublic() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
