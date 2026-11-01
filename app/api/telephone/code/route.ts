import { NextResponse } from "next/server";
import { clientServiceRole } from "@/lib/gardes-serveur";
import { configComplete, envoyerMessage, lireConfigMessagerie } from "@/lib/messagerie";
import { MESSAGE_TELEPHONE_GN, versTelephoneInternational } from "@/lib/telephone";
import {
  DELAI_RENVOI_SECONDES,
  VALIDITE_CODE_MINUTES,
  type CanalCode,
  type ObjetCode,
} from "@/lib/pin";
import {
  adresseIp,
  empreinteCode,
  tirerCode,
  titulairePlateforme,
} from "@/lib/auth-telephone-serveur";

/*
 * Envoi d'un code à 6 chiffres par WhatsApp ou SMS.
 *
 * Deux objets : `inscription` (prouver la ligne avant de créer le compte) et
 * `pin_oublie` (prouver la ligne avant de remplacer le PIN).
 *
 * LE CODE PART PAR LE MODULE DE MESSAGERIE DE LA PLATEFORME (`envoyerMessage`),
 * celui des rappels de rendez-vous : même configuration, même journal, même
 * bascule simulé / réel depuis /espace-admin/messagerie.
 *
 * Tant qu'aucun agrégateur n'est branché, aucun code ne peut atteindre un
 * téléphone. On le dit (503) plutôt que de promettre un SMS qui ne viendra
 * pas — sauf si `OTP_CODE_VISIBLE=1` est posé dans l'environnement du serveur :
 * le code revient alors dans la réponse et l'écran l'affiche, pour exercer le
 * parcours en local. Cette variable ne doit JAMAIS être posée sur Vercel :
 * elle ferait du code une formalité que n'importe qui franchit.
 *
 * `pin_oublie` répond de la même façon que le numéro soit inscrit ou non :
 * l'écran ne doit pas servir à vérifier qui a un compte chez nous.
 */

/** Au plus 3 codes par numéro et par objet en un quart d'heure. */
const FENETRE_MINUTES = 15;
const CODES_PAR_NUMERO = 3;
/** Au plus 10 codes par adresse IP et par heure, tous numéros confondus. */
const CODES_PAR_IP = 10;

const CANAUX = new Set<CanalCode>(["whatsapp", "sms"]);
const OBJETS = new Set<ObjetCode>(["inscription", "pin_oublie"]);

/*
 * Sans accent ni caractère hors de l'alphabet GSM : un seul é ferait passer
 * le SMS en Unicode, limité à 70 caractères par segment — le même message
 * coûterait deux fois.
 */
function texteDuCode(objet: ObjetCode, code: string): string {
  return objet === "inscription"
    ? `Docteur 224 : votre code de verification est ${code}. Valable ${VALIDITE_CODE_MINUTES} min. Ne le communiquez a personne.`
    : `Docteur 224 : code de reinitialisation de votre code PIN : ${code}. Valable ${VALIDITE_CODE_MINUTES} min. Si vous n'avez rien demande, ignorez ce message.`;
}

export async function POST(requete: Request) {
  const corps = await requete.json().catch(() => null);
  const telephone = versTelephoneInternational(String(corps?.telephone ?? ""));
  const canal = corps?.canal as CanalCode;
  const objet = corps?.objet as ObjetCode;

  if (!telephone) return NextResponse.json({ erreur: MESSAGE_TELEPHONE_GN }, { status: 400 });
  if (!CANAUX.has(canal) || !OBJETS.has(objet)) {
    return NextResponse.json({ erreur: "Requête invalide." }, { status: 400 });
  }

  const admin = clientServiceRole();
  const config = await lireConfigMessagerie(admin);
  const reel = config.mode === "reel" && configComplete(canal, config);
  const demonstration = process.env.OTP_CODE_VISIBLE === "1";
  if (!reel && !demonstration) {
    return NextResponse.json(
      {
        erreur:
          "L’envoi de codes par WhatsApp et SMS n’est pas encore disponible. Utilisez l’e-mail en attendant.",
      },
      { status: 503 }
    );
  }

  const { data: identifiant } = await admin
    .from("identifiants_telephone")
    .select("utilisateur_id")
    .eq("telephone", telephone)
    .maybeSingle();

  if (objet === "inscription" && identifiant) {
    return NextResponse.json(
      { erreur: "Ce numéro possède déjà un compte. Connectez-vous avec votre code PIN.", compteExistant: true },
      { status: 409 }
    );
  }

  // Plafonds : avant tout envoi, pour que celui qui martèle le bouton
  // n'obtienne rien de plus — ni SMS, ni indice.
  const depuis = new Date(Date.now() - FENETRE_MINUTES * 60_000).toISOString();
  const { data: recents } = await admin
    .from("codes_telephone")
    .select("cree_le")
    .eq("telephone", telephone)
    .eq("objet", objet)
    .gt("cree_le", depuis)
    .order("cree_le", { ascending: false });
  const dernier = recents?.[0]?.cree_le ? new Date(recents[0].cree_le).getTime() : 0;
  const attente = Math.ceil((dernier + DELAI_RENVOI_SECONDES * 1000 - Date.now()) / 1000);
  if (attente > 0) {
    return NextResponse.json(
      { erreur: `Patientez ${attente} s avant de redemander un code.`, renvoiDans: attente },
      { status: 429 }
    );
  }
  if ((recents?.length ?? 0) >= CODES_PAR_NUMERO) {
    return NextResponse.json(
      { erreur: "Trop de codes demandés pour ce numéro. Réessayez dans un quart d’heure." },
      { status: 429 }
    );
  }
  const ip = adresseIp(requete);
  if (ip) {
    const { count } = await admin
      .from("codes_telephone")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gt("cree_le", new Date(Date.now() - 3_600_000).toISOString());
    if ((count ?? 0) >= CODES_PAR_IP) {
      return NextResponse.json(
        { erreur: "Trop de codes demandés depuis cette connexion. Réessayez plus tard." },
        { status: 429 }
      );
    }
  }

  // PIN oublié pour un numéro inconnu, ou pour un compte qui n'a plus le
  // droit d'entrer : la réponse habituelle, rien de déposé ni d'envoyé.
  if (objet === "pin_oublie") {
    if (!identifiant) return NextResponse.json({ ok: true, renvoiDans: DELAI_RENVOI_SECONDES });
    const { data: profil } = await admin
      .from("utilisateurs")
      .select("statut, suspendu_par_admin")
      .eq("id", identifiant.utilisateur_id)
      .maybeSingle();
    if (!profil || profil.statut === "supprime" || profil.suspendu_par_admin) {
      return NextResponse.json({ ok: true, renvoiDans: DELAI_RENVOI_SECONDES });
    }
  }

  const titulaire = await titulairePlateforme(admin);
  if (!titulaire) {
    console.error("[telephone/code] aucun compte administrateur principal");
    return NextResponse.json({ erreur: "Envoi impossible pour le moment." }, { status: 500 });
  }

  const id = crypto.randomUUID();
  const code = tirerCode();
  const { error: eDepot } = await admin.from("codes_telephone").insert({
    id,
    telephone,
    objet,
    canal,
    code_hash: empreinteCode(id, code),
    expire_le: new Date(Date.now() + VALIDITE_CODE_MINUTES * 60_000).toISOString(),
    ip,
  });
  if (eDepot) {
    console.error("[telephone/code]", eDepot.message);
    return NextResponse.json({ erreur: "Envoi impossible pour le moment." }, { status: 500 });
  }

  const envoi = await envoyerMessage({
    titulaireId: titulaire,
    destinataire: telephone,
    motif: objet === "inscription" ? "code_inscription" : "code_pin_oublie",
    texte: texteDuCode(objet, code),
    canal,
  });
  if (envoi.erreur) {
    // Un code que personne n'a reçu ne doit pas rester le « dernier » : il
    // rendrait caduc le précédent, peut-être bien arrivé, lui.
    await admin.from("codes_telephone").delete().eq("id", id);
    console.error("[telephone/code] envoi", envoi.erreur);
    return NextResponse.json(
      {
        erreur: `Le code n’a pas pu partir par ${canal === "whatsapp" ? "WhatsApp" : "SMS"}. Essayez l’autre canal.`,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    renvoiDans: DELAI_RENVOI_SECONDES,
    ...(envoi.simule && demonstration ? { codeDemonstration: code } : {}),
  });
}
