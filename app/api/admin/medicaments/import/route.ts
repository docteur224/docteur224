import { NextResponse } from "next/server";
import { verifierAdmin } from "@/lib/gardes-serveur";
import { analyserImport, type MedicamentExistant } from "@/lib/import-medicaments";
import { lireClasseur, lireCsv } from "@/lib/xlsx-lecture";

/*
 * Import de la base de médicaments depuis un fichier Excel (.xlsx) ou CSV.
 *
 * Deux temps, comme tout geste qui écrit en masse :
 *   1. `?mode=analyse` : rien n'est écrit. On rend ce que l'import FERAIT —
 *      créations, modifications champ par champ, lignes en erreur avec leur
 *      numéro — pour que l'administrateur le relise ;
 *   2. `?mode=appliquer` : même fichier, l'analyse est REFAITE sur l'état
 *      courant de la base (elle a pu changer entre-temps), puis appliquée.
 *      Les lignes en erreur sont écartées, jamais « devinées ».
 *
 * Un import ne supprime rien (voir lib/import-medicaments.ts).
 * Réservé à la permission « Paramètres ».
 */

const TAILLE_MAX = 2 * 1024 * 1024; // 2 Mo : ~20 000 lignes, bien au-delà du besoin

export async function POST(requete: Request) {
  const garde = await verifierAdmin("parametres");
  if ("refus" in garde) return garde.refus;
  const { admin, appelantId } = garde.acces;
  const appliquer = new URL(requete.url).searchParams.get("mode") === "appliquer";

  const formulaire = await requete.formData().catch(() => null);
  const fichier = formulaire?.get("fichier");
  if (!(fichier instanceof File)) {
    return NextResponse.json({ erreur: "Joignez un fichier Excel (.xlsx) ou CSV." }, { status: 400 });
  }
  if (fichier.size > TAILLE_MAX) {
    return NextResponse.json({ erreur: "Fichier trop lourd (2 Mo au maximum)." }, { status: 400 });
  }

  const octets = Buffer.from(await fichier.arrayBuffer());
  let lignes: string[][];
  try {
    // Un .xlsx est une archive ZIP : il commence par « PK ».
    lignes =
      octets[0] === 0x50 && octets[1] === 0x4b
        ? lireClasseur(octets)
        : /\.(csv|txt)$/i.test(fichier.name)
          ? lireCsv(octets.toString("utf8"))
          : (() => {
              throw new Error("Format non reconnu : enregistrez le fichier au format Excel (.xlsx) ou CSV.");
            })();
  } catch (e) {
    return NextResponse.json({ erreur: e instanceof Error ? e.message : "Fichier illisible." }, { status: 400 });
  }
  if (lignes.length > 5001) {
    return NextResponse.json({ erreur: "Plus de 5 000 lignes : découpez le fichier." }, { status: 400 });
  }

  const { data: existants, error } = await admin
    .from("medicaments")
    .select("id, dci, nom_commercial, dosage, forme, voie, classe, actif");
  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  const analyse = analyserImport(lignes, (existants ?? []) as MedicamentExistant[]);

  if (!appliquer) {
    return NextResponse.json({
      colonnes: analyse.colonnesReconnues,
      erreurs: analyse.erreurs.slice(0, 200),
      nbErreurs: analyse.erreurs.length,
      creations: analyse.creations.slice(0, 50),
      nbCreations: analyse.creations.length,
      // Les valeurs complètes ne servent qu'à l'application : l'aperçu montre
      // les champs qui changent.
      modifications: analyse.modifications.slice(0, 50).map((m) => ({ id: m.id, ligne: m.ligne, libelle: m.libelle, champs: m.champs })),
      nbModifications: analyse.modifications.length,
      inchanges: analyse.inchanges,
    });
  }

  // ---- Application ----
  for (let i = 0; i < analyse.creations.length; i += 200) {
    const lot = analyse.creations.slice(i, i + 200).map((m) => ({
      dci: m.dci,
      nom_commercial: m.nom_commercial,
      dosage: m.dosage,
      forme: m.forme,
      voie: m.voie,
      classe: m.classe,
      actif: m.actif,
      origine: "admin",
      maj_par: appelantId,
    }));
    const { error: e } = await admin.from("medicaments").insert(lot);
    if (e) return NextResponse.json({ erreur: `Création interrompue : ${e.message}` }, { status: 500 });
  }
  for (let i = 0; i < analyse.modifications.length; i += 25) {
    const resultats = await Promise.all(
      analyse.modifications
        .slice(i, i + 25)
        .map((m) => admin.from("medicaments").update({ ...m.valeurs, maj_par: appelantId }).eq("id", m.id))
    );
    const echec = resultats.find((r) => r.error);
    if (echec?.error) {
      return NextResponse.json({ erreur: `Mise à jour interrompue : ${echec.error.message}` }, { status: 500 });
    }
  }

  // Journal : l'acteur est noté explicitement — appelé avec la clé de
  // service, `ecrire_audit` ne connaîtrait pas l'administrateur (auth.uid()
  // y est nul).
  await admin.from("journal_audit").insert({
    action: "A importé la base de médicaments",
    acteur_id: appelantId,
    cible_type: "medicaments",
    details: {
      fichier: fichier.name,
      cible: `${analyse.creations.length} ajout(s), ${analyse.modifications.length} modification(s), ${analyse.erreurs.length} ligne(s) écartée(s)`,
    },
  });

  return NextResponse.json({
    nbCreations: analyse.creations.length,
    nbModifications: analyse.modifications.length,
    nbErreurs: analyse.erreurs.length,
    inchanges: analyse.inchanges,
  });
}
