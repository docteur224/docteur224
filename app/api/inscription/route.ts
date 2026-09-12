import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  MESSAGE_TELEPHONE_GN,
  telephoneGuineenValide,
  versTelephoneInternational,
} from "@/lib/telephone";
import { normaliserTypeEtablissement } from "@/lib/types-etablissement";

/*
 * Inscription (patient ou professionnel) côté serveur.
 * Utilise la clé service_role pour créer le compte confirmé et les lignes
 * de profil de façon atomique ; le client se connecte ensuite normalement.
 * Seuls les rôles publics sont autorisés ici (jamais admin ni assistant —
 * les assistants sont créés par leur médecin, l'admin n'est pas self-service).
 */

const ROLES_AUTORISES = new Set(["patient", "medecin", "etablissement"]);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const corps = await request.json().catch(() => null);
  if (!corps) return NextResponse.json({ erreur: "Requête illisible." }, { status: 400 });
  const { role, motDePasse, nom, prenom, telephone } = corps;

  /*
   * L'adresse est ramenée en minuscules AVANT tout le reste.
   *
   * Supabase Auth le fait de son côté : sans cette normalisation,
   * `utilisateurs.email` gardait la casse saisie et divergeait de
   * `auth.users`. Toutes les recherches par adresse — ouverture d'un compte
   * administrateur, d'un compte assistant(e) — passaient alors à côté du
   * compte existant et n'échouaient qu'au bout de la chaîne, sur un message
   * technique d'`auth.users`.
   */
  const email = String(corps.email ?? "").trim().toLowerCase();

  if (!ROLES_AUTORISES.has(role)) {
    return NextResponse.json({ erreur: "Rôle non autorisé." }, { status: 400 });
  }
  if (!EMAIL.test(email)) {
    return NextResponse.json({ erreur: "Adresse e-mail invalide." }, { status: 400 });
  }
  if (typeof motDePasse !== "string" || motDePasse.length < 8) {
    return NextResponse.json(
      { erreur: "Le mot de passe doit contenir au moins 8 caractères." },
      { status: 400 }
    );
  }
  // Le contrôle du formulaire ne protège de rien : un POST direct passerait
  // à côté. Réservé aux comptes professionnels — la fiche publique affiche
  // ce numéro et le secrétariat doit être joignable.
  if (role !== "patient" && !telephoneGuineenValide(String(telephone ?? ""))) {
    return NextResponse.json({ erreur: MESSAGE_TELEPHONE_GN }, { status: 400 });
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
    telephone: telephone
      ? versTelephoneInternational(String(telephone)) ||
        `+224${String(telephone).replace(/\D/g, "").replace(/^224/, "")}`
      : null,
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
      commune: corps.commune || null,
      // Liste blanche : la civilité vient du client, elle ne peut pas être
      // un titre inventé.
      civilite: corps.civilite === "Pr" ? "Pr" : "Dr",
      statut: "en_attente",
      etape_inscription: "profil",
    });
    if (e2) return annuler(e2.message);
  } else {
    const { error: e2 } = await admin.from("etablissements").insert({
      gestionnaire_id: id,
      nom: corps.nomEtablissement || nom || "Établissement",
      // Le type détermine le palier facturé : une chaîne libre laisserait un
      // hôpital se déclarer d'un type inventé et payer le palier le plus bas.
      type: normaliserTypeEtablissement(corps.typeEtablissement as string | undefined),
      ville_id: corps.villeId || null,
      commune: corps.commune || null,
      statut: "en_attente",
      etape_inscription: "fiche",
    });
    if (e2) return annuler(e2.message);
  }

  return NextResponse.json({ ok: true });
}
