import { NextResponse } from "next/server";
import { tracerAuditServeur, verifierMedecin } from "@/lib/gardes-serveur";
import {
  colonnesPermissions,
  libelleProfil,
  PERMISSIONS_ASSISTANT,
} from "@/lib/permissions-assistant";

/*
 * Ouverture d'un compte assistant(e) par son médecin (/espace-medecin/equipe).
 *
 * Côté serveur parce que créer un compte d'authentification exige la clé
 * service_role : aucun médecin ne peut le faire depuis son navigateur.
 *
 * Le compte est créé CONFIRMÉ, avec un mot de passe provisoire que le
 * médecin communique de vive voix — la plateforme n'envoie pas d'e-mails
 * transactionnels, un lien d'invitation n'arriverait nulle part.
 */

const MOT_DE_PASSE_MINIMUM = 8;

export async function POST(request: Request) {
  const garde = await verifierMedecin();
  if ("refus" in garde) return garde.refus;
  const { admin, medecinId } = garde.acces;

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
  const inconnues = permissions.filter(
    (p) => !(PERMISSIONS_ASSISTANT as readonly string[]).includes(p)
  );
  if (inconnues.length) {
    return NextResponse.json(
      { erreur: `Permissions inconnues : ${inconnues.join(", ")}.` },
      { status: 400 }
    );
  }

  /*
   * Le plafond de la formule, vérifié AVANT de créer quoi que ce soit.
   *
   * Le trigger `trg_quota_assistants` refuserait de toute façon l'insert —
   * c'est lui le verrou — mais le compte d'authentification serait déjà
   * créé, et son adresse prise. Ici on ne touche à rien, et le message dit
   * ce qu'il faut faire.
   */
  const { data: quota } = await admin.rpc("assistants_inclus_du_medecin", {
    p_medecin: medecinId,
  });
  const { data: occupees } = await admin.rpc("assistants_utilises_du_medecin", {
    p_medecin: medecinId,
  });
  const places = Number(quota) || 0;
  if ((Number(occupees) || 0) >= places) {
    const { data: formule } = await admin.rpc("formule_du_medecin", { p_medecin: medecinId });
    return NextResponse.json(
      {
        erreur: formule
          ? `Votre formule ${formule} ouvre ${places} place${places > 1 ? "s" : ""} d’assistant(e). Fermez un compte, ou changez de formule depuis « Mon abonnement ».`
          : "Aucun abonnement actif : les places d’assistant(e) sont ouvertes par la formule. Activez un abonnement depuis « Mon abonnement ».",
      },
      { status: 409 }
    );
  }

  // Une adresse ne sert qu'à un seul compte : `auth.users` refuserait le
  // doublon avec un message technique, et l'assistant(e) d'un confrère ne
  // doit pas se retrouver rattaché(e) à deux médecins.
  const { data: existant } = await admin
    .from("utilisateurs")
    .select("id")
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

  // Sans profil ni rattachement, le compte serait orphelin : il ne pourrait
  // ni se connecter (le rôle est lu dans `utilisateurs`) ni être recréé, son
  // adresse restant prise. D'où le retour arrière à chaque étape.
  const annuler = async (message: string, statut = 400) => {
    await admin.from("assistants").delete().eq("id", id);
    await admin.from("utilisateurs").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id);
    return NextResponse.json({ erreur: message }, { status: statut });
  };

  const morceaux = nomComplet.split(/\s+/);
  const { error: eProfil } = await admin.from("utilisateurs").insert({
    id,
    role: "assistant",
    email,
    prenom: morceaux[0],
    nom: morceaux.slice(1).join(" ") || null,
    statut: "actif",
  });
  if (eProfil) return annuler(eProfil.message);

  const { error: eRattachement } = await admin.from("assistants").insert({
    id,
    medecin_id: medecinId,
    ...colonnesPermissions(permissions),
  });
  // Le trigger de quota parle ici : entre la vérification ci-dessus et cet
  // insert, une autre fenêtre a pu prendre la dernière place.
  if (eRattachement) {
    return annuler(
      eRattachement.message.includes("place")
        ? eRattachement.message
        : `Rattachement impossible : ${eRattachement.message}`,
      409
    );
  }

  await tracerAuditServeur(
    admin,
    medecinId,
    "A ouvert un compte assistant(e)",
    `${nomComplet} · ${email} · ${libelleProfil(permissions)}`,
    id
  );

  return NextResponse.json({ ok: true, id });
}
