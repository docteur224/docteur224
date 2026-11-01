import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { clientServiceRole } from "@/lib/gardes-serveur";
import { MESSAGE_TELEPHONE_GN, versTelephoneInternational } from "@/lib/telephone";
import { MESSAGE_PIN, pinValide } from "@/lib/pin";
import {
  emailTechnique,
  hacherPin,
  lireJeton,
  marquerJetonUtilise,
  ouvrirSession,
} from "@/lib/auth-telephone-serveur";

/*
 * Création d'un compte PATIENT par téléphone, dernière étape du parcours :
 * le numéro a été prouvé par le code (jeton), le PIN choisi et confirmé.
 *
 * Mêmes lignes que l'inscription par e-mail (`/api/inscription`) —
 * `utilisateurs` puis `patients` — plus l'identifiant téléphone qui porte le
 * PIN. Toute erreur en route supprime le compte Auth, et la cascade emporte
 * le reste : pas de compte à moitié créé.
 *
 * L'e-mail est facultatif. Donné, il devient aussi l'adresse de connexion
 * Supabase : le patient pourra se connecter par e-mail une fois un mot de
 * passe choisi via « Mot de passe oublié ». Omis, le compte Auth reçoit une
 * adresse technique (voir `emailTechnique`) et `utilisateurs.email` reste vide.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(requete: Request) {
  const corps = await requete.json().catch(() => null);
  if (!corps) return NextResponse.json({ erreur: "Requête illisible." }, { status: 400 });

  const telephone = versTelephoneInternational(String(corps.telephone ?? ""));
  const pin = String(corps.pin ?? "");
  const nom = String(corps.nom ?? "").trim();
  const prenom = String(corps.prenom ?? "").trim();
  const genre = corps.genre === "M" ? "M" : "F";
  const dateNaissance = String(corps.dateNaissance ?? "");
  const email = String(corps.email ?? "").trim().toLowerCase();

  if (!telephone) return NextResponse.json({ erreur: MESSAGE_TELEPHONE_GN }, { status: 400 });
  if (!pinValide(pin)) return NextResponse.json({ erreur: MESSAGE_PIN }, { status: 400 });
  if (!nom || !prenom) {
    return NextResponse.json({ erreur: "Renseignez votre nom et votre prénom." }, { status: 400 });
  }
  const naissance = /^\d{4}-\d{2}-\d{2}$/.test(dateNaissance) ? new Date(dateNaissance) : null;
  if (!naissance || isNaN(naissance.getTime()) || naissance > new Date() || naissance.getFullYear() < 1900) {
    return NextResponse.json({ erreur: "Date de naissance invalide." }, { status: 400 });
  }
  if (email && !EMAIL.test(email)) {
    return NextResponse.json({ erreur: "Adresse e-mail invalide." }, { status: 400 });
  }

  const admin = clientServiceRole();
  const ligneJeton = await lireJeton(admin, corps.jeton, telephone, "inscription");
  if (!ligneJeton) {
    return NextResponse.json(
      { erreur: "La vérification du numéro a expiré. Recommencez l’inscription.", jetonExpire: true },
      { status: 400 }
    );
  }

  const { data: existant } = await admin
    .from("identifiants_telephone")
    .select("utilisateur_id")
    .eq("telephone", telephone)
    .maybeSingle();
  if (existant) {
    return NextResponse.json(
      { erreur: "Ce numéro possède déjà un compte. Connectez-vous avec votre code PIN.", compteExistant: true },
      { status: 409 }
    );
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: email || emailTechnique(telephone),
    // Jamais communiqué, jamais stocké : la connexion passe par le PIN.
    password: randomBytes(32).toString("base64url"),
    email_confirm: true,
    user_metadata: { inscription: "telephone" },
  });
  if (error) {
    const message = error.message.includes("already been registered")
      ? email
        ? "Un compte existe déjà avec cet e-mail."
        : "Ce numéro possède déjà un compte."
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
    role: "patient",
    email: email || null,
    nom,
    prenom,
    telephone,
  });
  if (e1) {
    return annuler(
      e1.code === "23505" ? "Un compte existe déjà avec cet e-mail." : e1.message
    );
  }
  const { error: e2 } = await admin
    .from("patients")
    .insert({ id, genre, date_naissance: dateNaissance });
  if (e2) return annuler(e2.message);

  const { error: e3 } = await admin
    .from("identifiants_telephone")
    .insert({ utilisateur_id: id, telephone, pin_hash: await hacherPin(pin) });
  if (e3) {
    return annuler(
      e3.code === "23505" ? "Ce numéro possède déjà un compte." : e3.message
    );
  }

  await marquerJetonUtilise(admin, ligneJeton);

  const session = await ouvrirSession(admin, id);
  // Le compte existe : si la session n'a pas pu s'ouvrir, le patient se
  // connecte simplement avec son numéro et son PIN.
  if (session.erreur) return NextResponse.json({ ok: true, cible: "/connexion" });
  return NextResponse.json({ ok: true, cible: "/patient" });
}
