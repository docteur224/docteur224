import { NextResponse } from "next/server";
import { verifierAdmin } from "@/lib/gardes-serveur";
import { COLONNES, ecrireSynonymes } from "@/lib/import-actes";
import { construireClasseur } from "@/lib/xlsx";

/*
 * Export Excel du référentiel d'actes (biologie et imagerie).
 *
 * Le fichier sert AUSSI de modèle d'import : mêmes colonnes, mêmes
 * intitulés. On l'exporte, on le complète dans Excel, on le réimporte.
 * La colonne « Origine » est informative (amorçage ou ajout de
 * l'administration) et ignorée à l'import.
 */
export async function GET() {
  const garde = await verifierAdmin("parametres");
  if ("refus" in garde) return garde.refus;
  const { admin } = garde.acces;

  const { data, error } = await admin
    .from("actes_prescriptibles")
    .select("domaine, libelle, synonymes, code, categorie, actif, origine")
    .order("domaine")
    .order("categorie")
    .order("libelle");
  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  const largeur = (champ: string) =>
    champ === "libelle" ? 46 : champ === "synonymes" ? 40 : champ === "actif" || champ === "domaine" ? 12 : 20;

  const octets = construireClasseur({
    nomFeuille: "Actes",
    colonnes: [...COLONNES.map((c) => ({ titre: c.titre, largeur: largeur(c.champ) })), { titre: "Origine", largeur: 10 }],
    lignes: (data ?? []).map((a) => [
      a.domaine,
      a.libelle,
      ecrireSynonymes((a.synonymes ?? []) as string[]),
      a.code,
      a.categorie,
      a.actif ? "oui" : "non",
      a.origine === "oms" ? "OMS" : "Admin",
    ]),
  });

  const nom = `actes-docteur224-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new NextResponse(octets as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nom}"`,
      "Cache-Control": "no-store",
    },
  });
}
