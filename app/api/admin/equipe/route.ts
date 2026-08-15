import { NextResponse } from "next/server";
import { tracerAuditServeur, verifierAdmin } from "@/lib/gardes-serveur";
import { PERMISSIONS, libelleRole, type Permission } from "@/lib/permissions-admin";

/*
 * Création d'un compte administrateur (/espace-admin/equipe).
 *
 * Côté serveur parce qu'ouvrir un compte d'authentification exige la clé
 * service_role : la RLS seule ne suffit pas, aucun administrateur ne peut
 * créer un compte depuis le navigateur.
 *
 * Le compte est créé CONFIRMÉ, avec un mot de passe provisoire communiqué
 * de vive voix : il n'y a pas de service d'envoi d'e-mails transactionnels
 * sur la plateforme, un lien d'invitation n'arriverait donc nulle part.
 */

const MOT_DE_PASSE_MINIMUM = 8;

export async function POST(request: Request) {
  const garde = await verifierAdmin("equipe");
  if ("refus" in garde) return garde.refus;
  const { admin, appelantId } = garde.acces;

  const corps = await request.json().catch(() => null);
  if (!corps) return NextResponse.json({ erreur: "Requête illisible." }, { status: 400 });

  const nomComplet = String(corps.nomComplet ?? "").trim();
  const email = String(corps.email ?? "").trim().toLowerCase();
  const motDePasse = String(corps.motDePasse ?? "");
  const permissions: string[] = Array.isArray(corps.permissions) ? corps.permissions : [];

  if (nomComplet.length < 2) {
    return NextResponse.json({ erreur: "Indiquez le nom complet de la personne." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ erreur: "Adresse e-mail invalide." }, { status: 400 });
  }
  if (motDePasse.length < MOT_DE_PASSE_MINIMUM) {
    return NextResponse.json(
      { erreur: `Le mot de passe doit contenir au moins ${MOT_DE_PASSE_MINIMUM} caractères.` },
      { status: 400 }
    );
  }
  // Liste blanche : la base refuserait de toute façon une clé inconnue
  // (trigger `bloquer_escalade_role`), mais le message serait celui de
  // PostgreSQL et l'appel aurait déjà créé le compte d'authentification.
  const inconnues = permissions.filter((p) => !(PERMISSIONS as readonly string[]).includes(p));
  if (inconnues.length) {
    return NextResponse.json(
      { erreur: `Permissions inconnues : ${inconnues.join(", ")}.` },
      { status: 400 }
    );
  }

  /*
   * Un compte membre (patient, médecin…) ne devient pas administrateur par
   * réutilisation de son adresse : les deux espaces ne se mélangent pas, et
   * `auth.users` refuserait le doublon avec un message technique.
   */
  const { data: existant } = await admin
    .from("utilisateurs")
    .select("id, role")
    .eq("email", email)
    .maybeSingle();
  if (existant) {
    return NextResponse.json(
      { erreur: "Cette adresse est déjà utilisée par un compte de la plateforme." },
      { status: 409 }
    );
  }

  const { data: cree, error } = await admin.auth.admin.createUser({
    email,
    password: motDePasse,
    email_confirm: true,
  });
  if (error || !cree?.user) {
    const message = error?.message.includes("already been registered")
      ? "Cette adresse est déjà utilisée par un compte de la plateforme."
      : (error?.message ?? "Création du compte impossible.");
    return NextResponse.json({ erreur: message }, { status: 400 });
  }
  const id = cree.user.id;

  // Le nom complet est saisi d'un bloc : le premier mot est le prénom, le
  // reste le nom — c'est ainsi que la liste des comptes l'affichera.
  const morceaux = nomComplet.split(/\s+/);
  const prenom = morceaux[0];
  const nom = morceaux.slice(1).join(" ") || null;

  const { error: eProfil } = await admin.from("utilisateurs").insert({
    id,
    role: "admin",
    email,
    nom,
    prenom,
    statut: "actif",
    sous_roles_admin: permissions as Permission[],
  });
  if (eProfil) {
    // Sans profil, le compte d'authentification serait orphelin : il ne
    // pourrait ni se connecter (le rôle est lu dans `utilisateurs`) ni être
    // recréé, son adresse restant prise.
    await admin.auth.admin.deleteUser(id);
    return NextResponse.json({ erreur: eProfil.message }, { status: 400 });
  }

  await tracerAuditServeur(
    admin,
    appelantId,
    "A créé un compte administrateur",
    `${nomComplet} · ${email} · ${libelleRole(permissions)}`,
    id
  );

  return NextResponse.json({ ok: true, id });
}
