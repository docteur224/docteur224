import { NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";
import { proprietaireConnecte } from "@/lib/proprietaire-pro";

/*
 * Galerie de photos d'un professionnel — ajout et retrait.
 *
 * Comme pour la photo de profil, l'envoi passe par le serveur : le secret
 * Cloudinary n'a rien à faire dans le navigateur, et c'est ici qu'on vérifie
 * que l'appelant est bien le propriétaire de la galerie. Les écritures se
 * font avec la session de l'utilisateur, donc la RLS s'applique aussi.
 *
 * Le plafond de 10 est vérifié ici pour un message clair, ET en base par un
 * trigger — cette route n'est pas la seule porte vers la table.
 */

const TAILLE_MAX = 1024 * 1024; // 1 Mo
const TYPES_ACCEPTES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_PHOTOS = 10;

export async function POST(request: Request) {
  const pro = await proprietaireConnecte();
  if (!pro) {
    return NextResponse.json(
      { erreur: "Connectez-vous avec un compte médecin ou établissement." },
      { status: 401 }
    );
  }

  const formulaire = await request.formData();
  const fichier = formulaire.get("photo");
  const legende = (formulaire.get("legende") as string | null)?.trim().slice(0, 120) || null;

  if (!(fichier instanceof File)) {
    return NextResponse.json({ erreur: "Aucun fichier reçu." }, { status: 400 });
  }
  if (!TYPES_ACCEPTES.has(fichier.type)) {
    return NextResponse.json(
      { erreur: "Format non accepté. Utilisez un JPG, PNG, WEBP ou GIF." },
      { status: 400 }
    );
  }
  if (fichier.size > TAILLE_MAX) {
    return NextResponse.json({ erreur: "Image trop lourde (1 Mo maximum)." }, { status: 400 });
  }

  const { count } = await pro.supabase
    .from("photos_pro")
    .select("id", { count: "exact", head: true })
    .eq(pro.colonneGalerie, pro.id);
  if ((count ?? 0) >= MAX_PHOTOS) {
    return NextResponse.json(
      { erreur: `Galerie complète : ${MAX_PHOTOS} photos au maximum.` },
      { status: 400 }
    );
  }

  const octets = Buffer.from(await fichier.arrayBuffer());
  let envoi;
  try {
    envoi = await new Promise<{ secure_url: string; public_id: string }>((resoudre, rejeter) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: `docteur224/galeries/${pro.type}`,
            resource_type: "image",
            // Les photos de lieux s'affichent en vignette large : on borne
            // la taille sans recadrer sur un visage, contrairement au portrait.
            transformation: [
              { width: 1200, height: 900, crop: "limit" },
              { quality: "auto", fetch_format: "auto" },
            ],
          },
          (erreur, resultat) => {
            if (erreur || !resultat) return rejeter(erreur ?? new Error("Envoi échoué"));
            resoudre({ secure_url: resultat.secure_url, public_id: resultat.public_id });
          }
        )
        .end(octets);
    });
  } catch {
    return NextResponse.json({ erreur: "L'envoi de l'image a échoué. Réessayez." }, { status: 502 });
  }

  const { data, error } = await pro.supabase
    .from("photos_pro")
    .insert({
      [pro.colonneGalerie]: pro.id,
      url: envoi.secure_url,
      public_id: envoi.public_id,
      legende,
      position: count ?? 0,
    })
    .select("id, url, legende, position")
    .maybeSingle();

  if (error || !data) {
    // Rien en base : on retire l'image pour ne pas laisser d'orphelin.
    await cloudinary.uploader.destroy(envoi.public_id).catch(() => {});
    return NextResponse.json(
      { erreur: error?.message ?? "Enregistrement refusé." },
      { status: 500 }
    );
  }

  return NextResponse.json({ photo: data });
}

export async function DELETE(request: Request) {
  const pro = await proprietaireConnecte();
  if (!pro) {
    return NextResponse.json(
      { erreur: "Connectez-vous avec un compte médecin ou établissement." },
      { status: 401 }
    );
  }
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ erreur: "Photo non précisée." }, { status: 400 });

  // Le public_id est lu AVANT la suppression : après, il est perdu et le
  // fichier resterait facturé sur Cloudinary.
  const { data: avant } = await pro.supabase
    .from("photos_pro")
    .select("public_id")
    .eq("id", id)
    .eq(pro.colonneGalerie, pro.id)
    .maybeSingle();
  if (!avant) {
    return NextResponse.json({ erreur: "Photo introuvable." }, { status: 404 });
  }

  const { data: supprimees, error } = await pro.supabase
    .from("photos_pro")
    .delete()
    .eq("id", id)
    .eq(pro.colonneGalerie, pro.id)
    .select("id");
  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });
  if (!supprimees?.length) {
    return NextResponse.json({ erreur: "Suppression refusée." }, { status: 403 });
  }

  await cloudinary.uploader.destroy(avant.public_id).catch(() => {});
  return NextResponse.json({ ok: true });
}
