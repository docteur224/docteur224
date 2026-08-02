import { NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";
import { proprietaireConnecte } from "@/lib/proprietaire-pro";

/*
 * Photo de profil d'un professionnel — téléversement et suppression.
 *
 * Le chemin reste /api/photo-medecin (déjà appelé par PhotoProfil), mais la
 * route sert désormais les DEUX rôles : un établissement n'avait aucune
 * photo, alors que sa fiche en montrait l'emplacement.
 *
 * L'upload passe par le serveur (et non en direct depuis le navigateur)
 * pour deux raisons : le secret Cloudinary ne doit jamais être exposé, et
 * c'est ici qu'on vérifie que l'appelant est bien le professionnel concerné.
 * L'ancienne image est détruite après chaque remplacement, sinon chaque
 * changement de photo laisserait un fichier facturé derrière lui.
 */

const TAILLE_MAX = 5 * 1024 * 1024; // 5 Mo
const TYPES_ACCEPTES = new Set(["image/jpeg", "image/png", "image/webp"]);

const refus = () =>
  NextResponse.json(
    { erreur: "Connectez-vous avec un compte médecin ou établissement." },
    { status: 401 }
  );

export async function POST(request: Request) {
  const pro = await proprietaireConnecte();
  if (!pro) return refus();

  const formulaire = await request.formData();
  const fichier = formulaire.get("photo");
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

  // On lit l'ancienne photo avant d'écrire la nouvelle : c'est le seul
  // moment où l'on connaît encore son public_id.
  const { data: avant } = await pro.supabase
    .from(pro.table)
    .select("photo_id")
    .eq("id", pro.id)
    .maybeSingle();

  const octets = Buffer.from(await fichier.arrayBuffer());
  let envoi;
  try {
    envoi = await new Promise<{ secure_url: string; public_id: string }>((resoudre, rejeter) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: `docteur224/${pro.type === "medecin" ? "medecins" : "etablissements"}`,
            resource_type: "image",
            // Un portrait se recadre sur le visage ; la façade d'une clinique
            // n'en a pas, on se contente d'un carré centré.
            transformation: [
              pro.type === "medecin"
                ? { width: 400, height: 400, crop: "fill", gravity: "face" }
                : { width: 400, height: 400, crop: "fill" },
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

  const { data: majees, error } = await pro.supabase
    .from(pro.table)
    .update({ photo_url: envoi.secure_url, photo_id: envoi.public_id })
    .eq("id", pro.id)
    .select("id");

  if (error || !majees?.length) {
    // La base n'a pas retenu la photo : on retire celle qu'on vient
    // d'envoyer pour ne pas laisser d'orphelin sur Cloudinary.
    await cloudinary.uploader.destroy(envoi.public_id).catch(() => {});
    return NextResponse.json({ erreur: error?.message ?? "Enregistrement refusé." }, { status: 500 });
  }

  // Suppression de l'ancienne image seulement une fois la nouvelle
  // enregistrée : en cas d'échec ci-dessus, le professionnel garde sa photo.
  if (avant?.photo_id && avant.photo_id !== envoi.public_id) {
    await cloudinary.uploader.destroy(avant.photo_id).catch(() => {});
  }

  return NextResponse.json({ photoUrl: envoi.secure_url });
}

export async function DELETE() {
  const pro = await proprietaireConnecte();
  if (!pro) return refus();

  const { data: avant } = await pro.supabase
    .from(pro.table)
    .select("photo_id")
    .eq("id", pro.id)
    .maybeSingle();

  const { error } = await pro.supabase
    .from(pro.table)
    .update({ photo_url: null, photo_id: null })
    .eq("id", pro.id);
  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  if (avant?.photo_id) {
    await cloudinary.uploader.destroy(avant.photo_id).catch(() => {});
  }
  return NextResponse.json({ photoUrl: null });
}
