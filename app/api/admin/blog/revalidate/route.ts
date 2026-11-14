import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { verifierAdmin } from "@/lib/gardes-serveur";

/*
 * Revalidation à la demande des pages publiques du blog.
 *
 * Les pages du blog sont servies en ISR (pré-rendues puis revalidées à
 * intervalle). Après une écriture dans l'administration, on appelle cette route
 * pour que le changement paraisse TOUT DE SUITE, sans attendre l'expiration du
 * cache ni un redéploiement.
 *
 * Réservée à la permission « Paramètres » (comme toute la gestion du blog) :
 * revalider, c'est purger un cache public, ce n'est pas une action anodine.
 */
export async function POST() {
  const garde = await verifierAdmin("parametres");
  if ("refus" in garde) return garde.refus;

  // La liste du blog et le flux RSS, toujours ; la fiche et les archives de
  // catégorie par motif de route (tous les slugs d'un coup).
  revalidatePath("/blog");
  revalidatePath("/blog/[slug]", "page");
  revalidatePath("/blog/categorie/[slug]", "page");
  revalidatePath("/blog/rss.xml");
  revalidatePath("/sitemap.xml");

  return NextResponse.json({ ok: true });
}
