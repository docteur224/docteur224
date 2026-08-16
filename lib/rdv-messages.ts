import { createClient } from "@supabase/supabase-js";
import { envoyerAvecRepli, envoyerMessage, lireConfigMessagerie } from "@/lib/messagerie";
import { versGsm7 } from "@/lib/messagerie/cout";
import type { Canal } from "@/lib/messagerie/types";

/*
 * Messages sortants liés à un rendez-vous : confirmation, déplacement,
 * annulation.
 *
 * SERVEUR UNIQUEMENT. `lib/messagerie` lit des secrets et appelle
 * `enregistrer_message`, qui n'est accordée qu'à la service_role.
 *
 * Pourquoi ici et pas dans un trigger : l'envoi sort de la base (appel HTTP
 * chez un agrégateur), et un trigger qui attend un réseau bloque la
 * transaction qui l'a déclenché. La notification IN-APP, elle, reste au
 * trigger `rdv_notifie` (migration 0013) — elle ne sort de nulle part.
 *
 * Le quota est débité au PRATICIEN : c'est son rendez-vous, et c'est ce que
 * son abonnement lui vend. Un rendez-vous posé par le centre d'appel ne fait
 * pas exception, sans quoi le canal téléphonique deviendrait un moyen de
 * contourner les plafonds vendus.
 */

export type GenreMessageRdv = "confirmation" | "deplacement" | "annulation";

export interface EnvoiRdv {
  /** Canal téléphonique réellement emprunté, `null` si aucun numéro connu. */
  canalTelephone: string | null;
  telephone: string | null;
  emailEnvoye: boolean;
  email: string | null;
  simule: boolean;
  erreurs: string[];
}

function clientAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** « 17 août 2026 à 08:00 » — sans dépendre de la locale du serveur. */
function quand(dateISO: string, heure: string): string {
  const [a, m, j] = dateISO.split("-").map(Number);
  return `${j} ${MOIS[m - 1]} ${a} à ${heure.slice(0, 5)}`;
}

interface LigneRdv {
  id: string;
  date: string;
  heure: string;
  motif: string | null;
  lieu: string | null;
  adresse_domicile: string | null;
  motif_annulation: string | null;
  medecin_id: string;
  patient_id: string | null;
  proche_id: string | null;
  patient_sans_compte_id: string | null;
}

/** À qui l'on écrit, et sous quel nom. Pour un proche, c'est le titulaire. */
async function destinataire(rdv: LigneRdv, admin: ReturnType<typeof clientAdmin>) {
  if (rdv.patient_id) {
    const { data } = await admin
      .from("utilisateurs")
      .select("nom, prenom, telephone, email")
      .eq("id", rdv.patient_id)
      .maybeSingle();
    return {
      nom: `${data?.prenom ?? ""} ${data?.nom ?? ""}`.trim() || "Patient",
      pour: "",
      telephone: data?.telephone ?? null,
      email: data?.email ?? null,
    };
  }
  if (rdv.proche_id) {
    const { data } = await admin
      .from("proches")
      .select("nom, prenom, patients ( utilisateurs ( nom, prenom, telephone, email ) )")
      .eq("id", rdv.proche_id)
      .maybeSingle();
    const t = (
      data?.patients as unknown as {
        utilisateurs: { nom: string | null; prenom: string | null; telephone: string | null; email: string } | null;
      } | null
    )?.utilisateurs;
    return {
      nom: `${t?.prenom ?? ""} ${t?.nom ?? ""}`.trim() || "Patient",
      // Le message part au titulaire : il doit savoir de qui on lui parle.
      pour: `${data?.prenom ?? ""} ${data?.nom ?? ""}`.trim(),
      telephone: t?.telephone ?? null,
      email: t?.email ?? null,
    };
  }
  const { data } = await admin
    .from("patients_sans_compte")
    .select("nom, prenom, telephone")
    .eq("id", rdv.patient_sans_compte_id!)
    .maybeSingle();
  return {
    nom: `${data?.prenom ?? ""} ${data?.nom ?? ""}`.trim() || "Patient",
    pour: "",
    telephone: data?.telephone ?? null,
    // Une fiche minimale n'a pas d'adresse : c'est le sens même de « sans compte ».
    email: null,
  };
}

/** Le canal téléphonique retenu — jamais l'e-mail, qui part en plus, pas à la place. */
function canalTelephone(defaut: Canal): Canal {
  return defaut === "email" ? "sms" : defaut;
}

/**
 * Rédige et envoie. Ne lève jamais : un agrégateur en panne ou un quota
 * épuisé ne doit pas faire échouer la réservation qui vient d'aboutir — le
 * rendez-vous, lui, est bien pris. Les erreurs remontent dans le résultat
 * pour que l'opérateur sache s'il doit prévenir l'appelant de vive voix.
 */
export async function envoyerMessageRdv(
  rdvId: string,
  genre: GenreMessageRdv
): Promise<EnvoiRdv> {
  const resultat: EnvoiRdv = {
    canalTelephone: null,
    telephone: null,
    emailEnvoye: false,
    email: null,
    simule: true,
    erreurs: [],
  };

  try {
    const admin = clientAdmin();
    const { data: rdv } = await admin
      .from("rendez_vous")
      .select(
        "id, date, heure, motif, lieu, adresse_domicile, motif_annulation, medecin_id, patient_id, proche_id, patient_sans_compte_id"
      )
      .eq("id", rdvId)
      .maybeSingle<LigneRdv>();
    if (!rdv) {
      resultat.erreurs.push("Rendez-vous introuvable.");
      return resultat;
    }

    const [{ data: nomMedecin }, cible, config] = await Promise.all([
      admin.rpc("nom_medecin", { p_medecin_id: rdv.medecin_id }),
      destinataire(rdv, admin),
      lireConfigMessagerie(admin),
    ]);

    const praticien = (nomMedecin as unknown as string) ?? "votre praticien";
    const moment = quand(rdv.date, rdv.heure);
    const pour = cible.pour ? ` pour ${cible.pour}` : "";
    const lieu =
      rdv.lieu === "domicile"
        ? `à domicile${rdv.adresse_domicile ? ` (${rdv.adresse_domicile})` : ""}`
        : "au cabinet";

    const corps =
      genre === "confirmation"
        ? `Docteur 224 : rendez-vous confirmé${pour} avec ${praticien}, le ${moment}, ${lieu}.` +
          `${rdv.motif ? ` Motif : ${rdv.motif}.` : ""}` +
          ` Réservation gratuite, consultation réglée sur place.`
        : genre === "deplacement"
          ? `Docteur 224 : votre rendez-vous${pour} avec ${praticien} est déplacé au ${moment}, ${lieu}.`
          : `Docteur 224 : votre rendez-vous${pour} avec ${praticien} du ${moment} est annulé.` +
            `${rdv.motif_annulation ? ` Motif : ${rdv.motif_annulation}.` : ""}` +
            ` Rappelez-nous pour en reprendre un.`;

    const sujet =
      genre === "confirmation"
        ? `Votre rendez-vous du ${moment}`
        : genre === "deplacement"
          ? `Votre rendez-vous est déplacé au ${moment}`
          : `Votre rendez-vous du ${moment} est annulé`;

    resultat.telephone = cible.telephone;
    resultat.email = cible.email;

    if (cible.telephone) {
      const canal = canalTelephone(config.canalDefaut);
      const envoi = await envoyerAvecRepli({
        titulaireId: rdv.medecin_id,
        destinataire: cible.telephone,
        motif: `rdv_${genre}`,
        // Les accents font passer un SMS de 160 à 70 caractères par segment :
        // sur le canal facturé au segment, on reste en GSM-7.
        texte: canal === "sms" ? versGsm7(corps) : corps,
        canal,
      });
      const retenu = envoi.repli && !envoi.repli.erreur ? envoi.repli : envoi.principal;
      resultat.canalTelephone = retenu.erreur ? null : retenu.canal;
      resultat.simule = retenu.simule;
      if (retenu.erreur) resultat.erreurs.push(`Téléphone : ${retenu.erreur}`);
    } else {
      resultat.erreurs.push("Aucun numéro connu pour ce patient.");
    }

    if (cible.email) {
      const envoi = await envoyerMessage({
        titulaireId: rdv.medecin_id,
        destinataire: cible.email,
        motif: `rdv_${genre}`,
        texte: corps,
        canal: "email",
        sujet,
      });
      resultat.emailEnvoye = !envoi.erreur;
      if (envoi.erreur) resultat.erreurs.push(`E-mail : ${envoi.erreur}`);
    }
  } catch (e) {
    resultat.erreurs.push(e instanceof Error ? e.message : String(e));
  }

  return resultat;
}
