import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { verifierAdmin } from "@/lib/gardes-serveur";
import { envoyerMessage, lireConfigMessagerie } from "@/lib/messagerie";

/*
 * Configuration des fournisseurs SMS / WhatsApp.
 *
 * `config_messagerie` n'a aucune policy : elle est inaccessible depuis le
 * navigateur, même pour un admin connecté. Tout passe donc par ici, avec la
 * service_role — et cette route ne renvoie JAMAIS un secret. Un jeton qui
 * transite une fois vers un navigateur doit être considéré comme divulgué :
 * il reste dans le cache, dans les journaux du proxy, dans l'onglet réseau
 * laissé ouvert. L'écran affiche « posée » ou « absente », pas la valeur.
 *
 * Réservé à la permission « Messagerie », celle-là même qui ouvre l'écran
 * dans la barre latérale : la configuration engage ce que la plateforme
 * dépense chez son agrégateur, et il n'y a qu'un seul endroit où la régler.
 */

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/*
 * Garde commune aux trois verbes.
 *
 * Elle s'appuie sur `verifierAdmin`, comme le reste des routes
 * d'administration. La version précédente relisait le rôle à la main et
 * s'écartait de la règle sur trois points : elle acceptait un administrateur
 * SUSPENDU (qui n'est plus administrateur depuis la migration 0043), elle
 * ignorait le COMPTE PRINCIPAL — dont les permissions ne sont pas écrites
 * dans sa liste mais détenues par construction, si bien qu'il se voyait
 * refuser son propre écran — et elle exigeait « Finance » là où la barre
 * latérale ouvre la page sur « Messagerie ». L'écran et la route demandent
 * désormais la même chose.
 */
async function verifierAdminMessagerie() {
  const garde = await verifierAdmin("messagerie");
  if ("refus" in garde) return { erreur: garde.refus };
  return { utilisateurId: garde.acces.appelantId };
}

export async function GET() {
  const ctx = await verifierAdminMessagerie();
  if (ctx.erreur) return ctx.erreur;
  // La vue ne porte pas les colonnes de secrets, seulement leur présence :
  // même une faute de frappe ici ne peut pas les faire fuiter.
  const { data } = await admin().from("config_messagerie_publique").select("*").eq("id", 1).maybeSingle();
  return NextResponse.json({ config: data ?? null });
}

/** Champs acceptés, et colonne correspondante. Tout le reste est ignoré. */
const CHAMPS: Record<string, string> = {
  mode: "mode",
  canalDefaut: "canal_defaut",
  smsFournisseur: "sms_fournisseur",
  smsUrl: "sms_url",
  smsIdentifiant: "sms_identifiant",
  smsCle: "sms_cle",
  smsExpediteur: "sms_expediteur",
  coutSmsGnf: "cout_sms_gnf",
  whatsappFournisseur: "whatsapp_fournisseur",
  whatsappUrl: "whatsapp_url",
  whatsappNumeroId: "whatsapp_numero_id",
  whatsappJeton: "whatsapp_jeton",
  coutWhatsappGnf: "cout_whatsapp_gnf",
  emailFournisseur: "email_fournisseur",
  emailUrl: "email_url",
  emailCle: "email_cle",
  emailExpediteur: "email_expediteur",
  coutEmailGnf: "cout_email_gnf",
};

/** Un secret laissé vide n'efface pas celui déjà en base. */
const SECRETS = new Set(["smsCle", "whatsappJeton", "emailCle"]);

export async function POST(requete: Request) {
  const ctx = await verifierAdminMessagerie();
  if (ctx.erreur) return ctx.erreur;

  let corps: Record<string, unknown>;
  try {
    corps = await requete.json();
  } catch {
    return NextResponse.json({ erreur: "Requête illisible." }, { status: 400 });
  }

  const maj: Record<string, unknown> = { maj_le: new Date().toISOString(), maj_par: ctx.utilisateurId };
  for (const [champ, colonne] of Object.entries(CHAMPS)) {
    const valeur = corps[champ];
    if (valeur === undefined) continue;
    if (SECRETS.has(champ) && (valeur === "" || valeur === null)) continue;
    maj[colonne] = typeof valeur === "string" ? valeur.trim() || null : valeur;
  }

  /*
   * Passer en « réel » sans configuration complète enverrait chaque message
   * dans le vide en le comptant comme parti. On refuse ici plutôt que de
   * laisser `envoyerMessage` retomber silencieusement en simulé : l'admin qui
   * bascule l'interrupteur doit savoir pourquoi ça ne marche pas.
   */
  if (maj.mode === "reel") {
    const actuel = await lireConfigMessagerie(admin());
    const futur = {
      url: (maj.sms_url ?? actuel.sms.url) as string | null,
      cle: (maj.sms_cle ?? actuel.sms.cle) as string | null,
      expediteur: (maj.sms_expediteur ?? actuel.sms.expediteur) as string | null,
      waUrl: (maj.whatsapp_url ?? actuel.whatsapp.url) as string | null,
      waJeton: (maj.whatsapp_jeton ?? actuel.whatsapp.cle) as string | null,
      waNumero: (maj.whatsapp_numero_id ?? actuel.whatsapp.identifiant) as string | null,
      mailUrl: (maj.email_url ?? actuel.email.url) as string | null,
      mailCle: (maj.email_cle ?? actuel.email.cle) as string | null,
      mailDe: (maj.email_expediteur ?? actuel.email.expediteur) as string | null,
    };
    const smsPret = !!(futur.url && futur.cle && futur.expediteur);
    const waPret = !!(futur.waUrl && futur.waJeton && futur.waNumero);
    const mailPret = !!(futur.mailUrl && futur.mailCle && futur.mailDe);
    if (!smsPret && !waPret && !mailPret) {
      return NextResponse.json(
        { erreur: "Aucun canal n'est complètement configuré : le mode réel n'enverrait rien." },
        { status: 400 }
      );
    }
  }

  const { error } = await admin().from("config_messagerie").update(maj).eq("id", 1);
  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  await admin().rpc("ecrire_audit", {
    p_action: "A modifié la configuration de messagerie",
    p_cible_type: null,
    p_cible_id: null,
    // Les secrets ne sont jamais tracés : on note qu'ils ont changé, pas leur
    // valeur — un journal d'audit se lit à plusieurs.
    p_details: {
      champs: Object.keys(maj)
        .filter((c) => c !== "maj_le" && c !== "maj_par")
        .map((c) =>
          c === "sms_cle" || c === "whatsapp_jeton" || c === "email_cle" ? `${c} (modifié)` : c
        )
        .join(", "),
    },
  });

  return NextResponse.json({ ok: true });
}

/** Envoi d'essai : la seule façon de savoir qu'une configuration fonctionne. */
export async function PUT(requete: Request) {
  const ctx = await verifierAdminMessagerie();
  if (ctx.erreur) return ctx.erreur;

  let corps: { destinataire?: string; canal?: "sms" | "whatsapp" | "email" };
  try {
    corps = await requete.json();
  } catch {
    return NextResponse.json({ erreur: "Requête illisible." }, { status: 400 });
  }
  if (!corps.destinataire) {
    return NextResponse.json(
      { erreur: "Renseignez un destinataire de test." },
      { status: 400 }
    );
  }

  // Le message d'essai est volontairement en GSM-7 pur : il doit mesurer la
  // configuration, pas le surcoût d'un accent.
  const resultat = await envoyerMessage({
    titulaireId: ctx.utilisateurId!,
    destinataire: corps.destinataire,
    motif: "test_configuration",
    texte: "Docteur 224 : message de test de la configuration. Aucune action requise.",
    canal: corps.canal,
    sujet: "Docteur 224 — test de configuration",
  });
  return NextResponse.json({ resultat });
}
