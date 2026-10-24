import { NextResponse } from "next/server";
import { verifierAdmin } from "@/lib/gardes-serveur";
import { COLONNES } from "@/lib/import-medicaments";
import { construireClasseur } from "@/lib/xlsx";

/*
 * Export Excel de la base de médicaments.
 *
 * Le fichier sert AUSSI de modèle d'import : mêmes colonnes, mêmes
 * intitulés. On l'exporte, on le complète dans Excel, on le réimporte.
 * La colonne « Origine » est informative (OMS ou ajout de l'administration)
 * et ignorée à l'import.
 */
export async function GET() {
  const garde = await verifierAdmin("parametres");
  if ("refus" in garde) return garde.refus;
  const { admin } = garde.acces;

  const { data, error } = await admin
    .from("medicaments")
    .select("dci, nom_commercial, dosage, forme, voie, classe, actif, origine")
    .order("dci")
    .order("dosage");
  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  const octets = construireClasseur({
    nomFeuille: "Médicaments",
    colonnes: [
      ...COLONNES.map((c) => ({ titre: c.titre, largeur: c.champ === "dci" ? 38 : c.champ === "actif" ? 8 : 20 })),
      { titre: "Origine", largeur: 10 },
    ],
    lignes: (data ?? []).map((m) => [
      m.dci,
      m.nom_commercial,
      m.dosage,
      m.forme,
      m.voie,
      m.classe,
      m.actif ? "oui" : "non",
      m.origine === "oms" ? "OMS" : "Admin",
    ]),
  });

  const nom = `medicaments-docteur224-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new NextResponse(octets as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nom}"`,
      "Cache-Control": "no-store",
    },
  });
}
