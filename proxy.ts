import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/*
 * Proxy Next 16 (ex-middleware) : rafraîchit la session Supabase à chaque
 * requête pour que les Server Components disposent toujours d'un JWT valide.
 */
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
  await supabase.auth.getUser();

  return reponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
