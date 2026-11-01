import { NextResponse } from "next/server";
import { clientServiceRole } from "@/lib/gardes-serveur";
import { lireTelephoneTest } from "@/lib/auth-telephone-serveur";

/*
 * Le numéro de test, pour les écrans de connexion et d'inscription.
 *
 * Public par construction : quand l'option est cochée dans
 * /espace-admin/messagerie, le numéro et son code sont AFFICHÉS à tous, comme
 * le compte de démonstration d'une maquette. Décochée, la route ne dit rien
 * de plus que `actif: false` — ni le numéro, ni le code.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const test = await lireTelephoneTest(clientServiceRole());
  return NextResponse.json(
    test.actif ? { actif: true, numero: test.numero, code: test.code } : { actif: false },
    // L'option se décoche depuis l'admin : un cache la laisserait affichée.
    { headers: { "Cache-Control": "no-store" } }
  );
}
