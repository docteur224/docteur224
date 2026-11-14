import { NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";
import { verifierAdmin } from "@/lib/gardes-serveur";

/*
 * Couverture d'un article de blog — téléversement et suppression.
 *
 * Même principe que l'illustration d'un conseil santé : l'envoi passe par le
 * serveur (le secret Cloudinary n'a rien à faire dans le navigateur), et c'est
 * ici qu'on vérifie que l'appelant est un administrateur habilité aux
 * « Paramètres ». La route ne touche PAS la table `blog_articles` : elle ne
 * fait que poser (ou retirer) un fichier et rendre son URL ; c'est l'écran qui
 * range ensuite l'URL dans l'article, par la session de l'administrateur (RLS).
 */

const TAILLE_MAX = 5 * 1024 * 1024; // 5 Mo
const TYPES_ACCEPTES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  const garde = await verifierAdmin("parametres");
  if ("refus" in garde) return garde.refus;

  const formulaire = await request.formData();
  const fichier = formulaire.get("image");
  if (!(fichier instanceof File)) {
    return NextResponse.json({ erreur: "Aucun fichier reçu." }, { status: 400 });
  }
  if (!TYPES_ACCEPTES.has(fichier.type)) {
    return NextResponse.json(
      { erreur: "Format non accepté. Utilisez un JPEG, un PNG ou un WebP." },
      { status: 400 }
    );
  }
  if (fichier.size > TAILLE_MAX) {
    return NextResponse.json({ erreur: "Image trop lourde (5 Mo maximum)." }, { status: 400 });
  }

  const octets = Buffer.from(await fichier.arrayBuffer());
  try {
    const envoi = await new Promise<{ secure_url: string; public_id: string }>(
      (resoudre, rejeter) => {
        cloudinary.uploader
          .upload_stream(
            {
              folder: "docteur224/blog",
              resource_type: "image",
              // Couverture large : on borne la taille sans recadrer (le cadrage
              // se décide à l'affichage, en object-cover).
              transformation: [
                { width: 1600, height: 900, crop: "limit" },
                { quality: "auto", fetch_format: "auto" },
              ],
            },
            (erreur, resultat) => {
              if (erreur || !resultat) return rejeter(erreur ?? new Error("Envoi échoué"));
              resoudre({ secure_url: resultat.secure_url, public_id: resultat.public_id });
            }
          )
          .end(octets);
      }
    );
    return NextResponse.json({ url: envoi.secure_url, public_id: envoi.public_id });
  } catch {
    return NextResponse.json({ erreur: "L'envoi de l'image a échoué. Réessayez." }, { status: 502 });
  }
}

export async function DELETE(request: Request) {
  const garde = await verifierAdmin("parametres");
  if ("refus" in garde) return garde.refus;

  const publicId = new URL(request.url).searchParams.get("public_id");
  if (!publicId) {
    return NextResponse.json({ erreur: "Image non précisée." }, { status: 400 });
  }
  await cloudinary.uploader.destroy(publicId).catch(() => {});
  return NextResponse.json({ ok: true });
}
