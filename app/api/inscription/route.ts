import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/*
 * Inscription (patient ou professionnel) côté serveur.
 * Utilise la clé service_role pour créer le compte confirmé et les lignes
 * de profil de façon atomique ; le client se connecte ensuite normalement.
 * Seuls les rôles publics sont autorisés ici (jamais admin ni assistant —
 * les assistants sont créés par leur médecin, l'admin n'est pas self-service).
 */

const ROLES_AUTORISES = new Set(["patient", "medecin", "etablissement"]);

export async function POST(request: Request) {
  const corps = await request.json();
  const { role, email, motDePasse, nom, prenom, telephone } = corps;

  if (!ROLES_AUTORISES.has(role)) {
    return NextResponse.json({ erreur: "Rôle non autorisé." }, { status: 400 });
  }
  if (!email || !motDePasse || motDePasse.length < 8) {
    return NextResponse.json({ erreur: "E-mail ou mot de passe invalide." }, { status: 400 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: motDePasse,
    email_confirm: true,
  });
  if (error) {
    const message = error.message.includes("already been registered")
      ? "Un compte existe déjà avec cet e-mail."
      : error.message;
    return NextResponse.json({ erreur: message }, { status: 400 });
  }
  const id = data.user.id;

  const annuler = async (message: string) => {
    await admin.auth.admin.deleteUser(id);
    return NextResponse.json({ erreur: message }, { status: 400 });
  };

  const { error: e1 } = await admin.from("utilisateurs").insert({
    id,
    role,
    email,
    nom: nom ?? null,
    prenom: prenom ?? null,
    telephone: telephone ? `+224${String(telephone).replace(/\D/g, "").replace(/^224/, "")}` : null,
  });
  if (e1) return annuler(e1.message);

  if (role === "patient") {
    const { error: e2 } = await admin.from("patients").insert({ id, genre: corps.genre ?? null });
    if (e2) return annuler(e2.message);
  } else if (role === "medecin") {
    const { error: e2 } = await admin.from("medecins").insert({
      id,
      specialite_id: corps.specialiteId || null,
      ville_id: corps.villeId || null,
      statut: "en_attente",
      etape_inscription: "profil",
    });
    if (e2) return annuler(e2.message);
  } else {
    const { error: e2 } = await admin.from("etablissements").insert({
      gestionnaire_id: id,
      nom: corps.nomEtablissement || nom || "Établissement",
      type: corps.typeEtablissement || "Clinique privée",
      ville_id: corps.villeId || null,
      statut: "en_attente",
      etape_inscription: "fiche",
    });
    if (e2) return annuler(e2.message);
  }

  return NextResponse.json({ ok: true });
}
