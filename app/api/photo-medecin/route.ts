import { NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";
import { creerClientServeur } from "@/lib/supabase/server";

/*
 * Photo de profil du médecin — téléversement et suppression.
 *
 * L'upload passe par le serveur (et non en direct depuis le navigateur)
 * pour deux raisons : le secret Cloudinary ne doit jamais être exposé, et
 * c'est ici qu'on vérifie que l'appelant est bien le médecin concerné.
 * L'ancienne image est détruite après chaque remplacement, sinon chaque
 * changement de photo laisserait un fichier facturé derrière lui.
 */

const TAILLE_MAX = 5 * 1024 * 1024; // 5 Mo
const TYPES_ACCEPTES = new Set(["image/jpeg", "image/png", "image/webp"]);
const DOSSIER = "docteur224/medecins";

/** Le médecin connecté, ou null si la session n'en est pas un. */
async function medecinConnecte() {
  const supabase = await creerClientServeur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase
    .from("utilisateurs")
    .select("role")
    .eq("id", auth.user.id)
    .single();
  return data?.role === "medecin" ? { supabase, id: auth.user.id } : null;
}

export async function POST(request: Request) {
  const session = await medecinConnecte();
  if (!session) {
    return NextResponse.json({ erreur: "Connectez-vous en tant que médecin." }, { status: 401 });
  }

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
  const { data: avant } = await session.supabase
    .from("medecins")
    .select("photo_id")
    .eq("id", session.id)
    .single();

  const octets = Buffer.from(await fichier.arrayBuffer());
  let envoi;
  try {
    envoi = await new Promise<{ secure_url: string; public_id: string }>((resoudre, rejeter) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: DOSSIER,
            resource_type: "image",
            // Cadrage centré sur le visage : les photos de profil arrivent
            // dans tous les formats, la fiche les affiche en rond.
            transformation: [
              { width: 400, height: 400, crop: "fill", gravity: "face" },
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
    return NextResponse.json(
      { erreur: "L'envoi de l'image a échoué. Réessayez." },
      { status: 502 }
    );
  }

  const { error } = await session.supabase
    .from("medecins")
    .update({ photo_url: envoi.secure_url, photo_id: envoi.public_id })
    .eq("id", session.id);

  if (error) {
    // La base n'a pas retenu la photo : on retire celle qu'on vient
    // d'envoyer pour ne pas laisser d'orphelin sur Cloudinary.
    await cloudinary.uploader.destroy(envoi.public_id).catch(() => {});
    return NextResponse.json({ erreur: error.message }, { status: 500 });
  }

  // Suppression de l'ancienne image seulement une fois la nouvelle
  // enregistrée : en cas d'échec ci-dessus, le médecin garde sa photo.
  if (avant?.photo_id && avant.photo_id !== envoi.public_id) {
    await cloudinary.uploader.destroy(avant.photo_id).catch(() => {});
  }

  return NextResponse.json({ photoUrl: envoi.secure_url });
}

export async function DELETE() {
  const session = await medecinConnecte();
  if (!session) {
    return NextResponse.json({ erreur: "Connectez-vous en tant que médecin." }, { status: 401 });
  }

  const { data: avant } = await session.supabase
    .from("medecins")
    .select("photo_id")
    .eq("id", session.id)
    .single();

  const { error } = await session.supabase
    .from("medecins")
    .update({ photo_url: null, photo_id: null })
    .eq("id", session.id);
  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  if (avant?.photo_id) {
    await cloudinary.uploader.destroy(avant.photo_id).catch(() => {});
  }
  return NextResponse.json({ photoUrl: null });
}
