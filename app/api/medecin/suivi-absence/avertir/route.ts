import { NextResponse } from "next/server";
import { creerClientServeur } from "@/lib/supabase/server";
import { envoyerAvecRepli, envoyerMessage } from "@/lib/messagerie";
import { versGsm7 } from "@/lib/messagerie/cout";

/*
 * Rappel de ponctualité envoyé à un patient qui a manqué des rendez-vous.
 *
 * Un AVERTISSEMENT au sens propre : on informe et on sensibilise. Rien ici ne
 * bloque, ne suspend ni ne restreint quoi que ce soit — le patient peut
 * reprendre rendez-vous dans la minute qui suit.
 *
 * Côté serveur, et pas depuis le navigateur, pour la même raison que
 * /api/medecin/rdv/[id]/absent : `lib/messagerie` lit les secrets de
 * l'agrégateur et débite un quota, et n'est accordée qu'à la service_role.
 *
 * Trois règles reprises telles quelles de la route `absent` :
 *   • l'envoi ne lève jamais : un agrégateur en panne ou un quota épuisé
 *     sont des situations courantes, pas des incidents ;
 *   • le quota est débité AU PRATICIEN : c'est son rendez-vous manqué, et
 *     c'est ce que son abonnement lui vend ;
 *   • on ne trace « averti » que si quelque chose est effectivement parti —
 *     un journal qui dit « prévenu » sur un message resté en route ferait
 *     croire au praticien que le patient sait.
 *
 * L'appartenance du patient n'est pas vérifiée ici à la main : on le cherche
 * dans `suivi_absence_liste`, qui ne rend que les patients du praticien
 * connecté (médecin ou assistant). Un patient qui n'est pas le sien n'y est
 * pas, et la route s'arrête.
 */

const LONGUEUR_MAX = 1000;

interface LigneListe {
  cle: string;
  nom: string;
  prenom: string;
  telephone: string;
  email: string;
}

export async function POST(requete: Request) {
  const supabase = await creerClientServeur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ erreur: "Session expirée — reconnectez-vous." }, { status: 401 });
  }

  const corps = await requete.json().catch(() => null);
  const cle = typeof corps?.cle === "string" ? corps.cle : "";
  const texte = typeof corps?.texte === "string" ? corps.texte.trim() : "";
  const canal = corps?.canal === "sms" || corps?.canal === "email" ? corps.canal : "whatsapp";

  if (!/^[cps]-[0-9a-fA-F-]{36}$/.test(cle)) {
    return NextResponse.json({ erreur: "Référence de patient invalide." }, { status: 400 });
  }
  if (texte.length < 20 || texte.length > LONGUEUR_MAX) {
    return NextResponse.json(
      { erreur: `Le message doit faire entre 20 et ${LONGUEUR_MAX} caractères.` },
      { status: 400 }
    );
  }

  // Le praticien concerné (lui-même, ou celui de l'assistant connecté).
  const { data: medecinId } = await supabase.rpc("suivi_absence_medecin");
  if (!medecinId) {
    return NextResponse.json(
      { erreur: "Réservé au praticien et à son secrétariat." },
      { status: 403 }
    );
  }

  // Le patient, lu avec la session de l'appelant : la RPC ne rend que les
  // siens, c'est donc elle qui porte le contrôle d'accès.
  const { data: liste, error: erreurListe } = await supabase.rpc("suivi_absence_liste", {
    p_mois: null,
  });
  if (erreurListe) {
    return NextResponse.json({ erreur: erreurListe.message }, { status: 400 });
  }
  const patient = ((liste ?? []) as LigneListe[]).find((l) => l.cle === cle);
  if (!patient) {
    return NextResponse.json(
      { erreur: "Ce patient ne figure pas dans votre suivi d’absence." },
      { status: 404 }
    );
  }

  const destinataire = canal === "email" ? patient.email : patient.telephone;
  if (!destinataire) {
    return NextResponse.json(
      {
        erreur:
          canal === "email"
            ? "Ce patient n’a pas d’adresse e-mail connue."
            : "Ce patient n’a pas de numéro de téléphone connu.",
      },
      { status: 400 }
    );
  }

  const erreurs: string[] = [];
  let previenu = false;
  let canalRetenu: string | null = null;
  let simule = true;

  if (canal === "email") {
    const envoi = await envoyerMessage({
      titulaireId: medecinId as unknown as string,
      destinataire,
      motif: "suivi_absence_avertissement",
      texte,
      canal: "email",
      sujet: "À propos de vos rendez-vous",
    });
    previenu = !envoi.erreur;
    canalRetenu = envoi.erreur ? null : "email";
    simule = envoi.simule;
    if (envoi.erreur) erreurs.push(`E-mail : ${envoi.erreur}`);
  } else {
    const envoi = await envoyerAvecRepli({
      titulaireId: medecinId as unknown as string,
      destinataire,
      motif: "suivi_absence_avertissement",
      // Les accents font passer un SMS de 160 à 70 caractères par segment :
      // sur le canal facturé au segment, on reste en GSM-7.
      texte: canal === "sms" ? versGsm7(texte) : texte,
      canal,
    });
    const retenu = envoi.repli && !envoi.repli.erreur ? envoi.repli : envoi.principal;
    previenu = !retenu.erreur;
    canalRetenu = retenu.erreur ? null : retenu.canal;
    simule = retenu.simule;
    if (retenu.erreur) erreurs.push(`Téléphone : ${retenu.erreur}`);
  }

  // La trace suit l'envoi, et jamais l'inverse. Elle passe par la fonction
  // (et non par un UPDATE) pour que le journal d'audit soit écrit dans la
  // même transaction que l'état.
  if (previenu) {
    const { error } = await supabase.rpc("suivi_absence_marquer_averti", {
      p_cle: cle,
      p_canal: canalRetenu,
    });
    if (error) erreurs.push(`Suivi : ${error.message}`);
  }

  return NextResponse.json({ previenu, canal: canalRetenu, simule, erreurs });
}
