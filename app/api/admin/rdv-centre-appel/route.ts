import { NextResponse } from "next/server";
import { creerClientServeur } from "@/lib/supabase/server";
import { envoyerMessageRdv } from "@/lib/rdv-messages";

/*
 * Prise de rendez-vous au téléphone : la même opération que la RPC
 * `creer_rdv_centre_appel`, mais suivie de l'envoi de la confirmation au
 * patient (WhatsApp ou SMS, plus l'e-mail si une adresse est connue).
 *
 * Pourquoi une route serveur alors que la RPC suffisait ?
 * L'envoi lit des secrets d'agrégateur et appelle `enregistrer_message`, qui
 * n'est accordée qu'à la service_role : rien de tout cela ne peut vivre dans
 * le navigateur.
 *
 * La CRÉATION, elle, passe par la session de l'appelant et non par la
 * service_role : `auth.uid()` doit rester l'administrateur qui a décroché,
 * sans quoi le journal d'audit perdrait le nom de l'acteur — l'information la
 * plus importante qu'il porte. La garde `est_admin()` de la fonction fait
 * donc tout le travail, ici comme depuis le navigateur.
 *
 * L'envoi n'est jamais bloquant : le rendez-vous est pris, un agrégateur en
 * panne ne doit pas transformer un succès en échec. L'écran reçoit le détail
 * de ce qui est parti pour que l'opérateur sache s'il doit prévenir de vive
 * voix avant de raccrocher.
 */

interface CorpsCreation {
  medecinId?: string;
  date?: string;
  heure?: string;
  motif?: string;
  lieu?: "cabinet" | "domicile";
  adresseDomicile?: string;
  patientCle?: string;
  nouvelleFiche?: { nom?: string; prenom?: string; telephone?: string };
}

export async function POST(requete: Request) {
  let corps: CorpsCreation;
  try {
    corps = await requete.json();
  } catch {
    return NextResponse.json({ erreur: "Requête illisible." }, { status: 400 });
  }
  if (!corps.medecinId || !corps.date || !corps.heure) {
    return NextResponse.json({ erreur: "Praticien, date et heure sont exigés." }, { status: 400 });
  }

  const session = await creerClientServeur();
  const { data: auth } = await session.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ erreur: "Session expirée — reconnectez-vous." }, { status: 401 });
  }

  const { data: id, error } = await session.rpc("creer_rdv_centre_appel", {
    p_medecin_id: corps.medecinId,
    p_date: corps.date,
    p_heure: corps.heure,
    p_motif: corps.motif || null,
    p_lieu: corps.lieu === "domicile" ? "domicile" : "cabinet",
    p_adresse_domicile: corps.lieu === "domicile" ? corps.adresseDomicile || null : null,
    p_patient_cle: corps.patientCle || null,
    p_nouveau_nom: corps.nouvelleFiche?.nom || null,
    p_nouveau_prenom: corps.nouvelleFiche?.prenom || null,
    p_nouveau_telephone: corps.nouvelleFiche?.telephone || null,
  });

  if (error) {
    // 42501 = la garde `est_admin()` a refusé ; tout le reste est un refus
    // métier rédigé en français par la fonction, qu'on rend tel quel.
    const statut = error.code === "42501" ? 403 : 400;
    return NextResponse.json({ erreur: error.message }, { status: statut });
  }

  const envoi = await envoyerMessageRdv(id as unknown as string, "confirmation");
  return NextResponse.json({ id, envoi });
}
