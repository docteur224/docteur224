import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { envoyerMessage } from "../messagerie";
import { versGsm7 } from "../messagerie/cout";

/*
 * Envoi des rappels de rendez-vous par SMS ou WhatsApp (migration 0066).
 *
 * SERVEUR UNIQUEMENT — `reserver_rappels` et `marquer_rappel` ne sont
 * accordées qu'à la service_role, et lib/messagerie lit des secrets.
 *
 * Même principe que la file d'e-mails : on RÉSERVE un lot (deux passages
 * simultanés obtiennent des lots disjoints), on envoie, on inscrit le
 * verdict. Le canal est décidé par la base au moment de la réservation :
 * un patient qui a retiré son consentement depuis la programmation n'est
 * pas relancé, et le motif reste en file.
 *
 * Sans fournisseur configuré, lib/messagerie SIMULE l'envoi : rien ne part,
 * mais le message est journalisé et décompté comme s'il était parti — le
 * circuit complet tourne avant le premier contrat d'agrégateur.
 */

const LOT = 20;

export interface ResultatRappels {
  traites: number;
  envoyes: number;
  simules: number;
  ignores: number;
  echecs: number;
  encore: boolean;
  erreurs: string[];
}

interface Reserve {
  id: string;
  rendez_vous_id: string;
  delai_heures: number;
  canal: "sms" | "whatsapp" | null;
  motif: string | null;
  telephone: string | null;
  titulaire: string | null;
  statut_rdv: string;
  date_rdv: string;
  heure_rdv: string;
  medecin: string;
  pour_qui: string | null;
}

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/**
 * Le texte du rappel : court (un seul segment SMS en GSM-7), sans contenu
 * médical — un SMS se lit par-dessus l'épaule. Le motif de consultation n'y
 * figure donc pas.
 */
export function texteRappel(r: Pick<Reserve, "date_rdv" | "heure_rdv" | "medecin" | "pour_qui" | "delai_heures">): string {
  const [, m, j] = r.date_rdv.split("-").map(Number);
  const heure = r.heure_rdv.slice(0, 5);
  const quand = r.delai_heures >= 24 ? `le ${j} ${MOIS[m - 1]} à ${heure}` : `aujourd’hui à ${heure}`;
  const pour = r.pour_qui ? ` pour ${r.pour_qui}` : "";
  return `Docteur 224 : rappel de votre RDV${pour} avec ${r.medecin} ${quand}. Empêché ? Annulez sur docteur224-gn.vercel.app/mes-rendez-vous`;
}

function clientAdmin(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Vide un lot de rappels dus. Ne lève jamais. */
export async function drainerRappels(): Promise<ResultatRappels> {
  const resultat: ResultatRappels = { traites: 0, envoyes: 0, simules: 0, ignores: 0, echecs: 0, encore: false, erreurs: [] };
  const admin = clientAdmin();
  try {
    const { data, error } = await admin.rpc("reserver_rappels", { p_limite: LOT });
    if (error) {
      resultat.erreurs.push(error.message);
      return resultat;
    }
    const lot = (data ?? []) as Reserve[];
    resultat.encore = lot.length === LOT;

    for (const r of lot) {
      resultat.traites++;
      const marquer = (etat: string, erreur?: string) =>
        admin.rpc("marquer_rappel", { p_id: r.id, p_etat: etat, p_erreur: erreur ?? null });

      // Le rendez-vous a pu être annulé entre la programmation et l'échéance.
      if (!["en_attente", "confirme"].includes(r.statut_rdv)) {
        await marquer("annule", "Rendez-vous annulé ou passé entre-temps");
        resultat.ignores++;
        continue;
      }
      if (!r.canal || !r.telephone || !r.titulaire) {
        await marquer("ignore", r.motif ?? "Aucun canal disponible");
        resultat.ignores++;
        continue;
      }

      const texte = texteRappel(r);
      const envoi = await envoyerMessage({
        titulaireId: r.titulaire,
        destinataire: r.telephone,
        motif: "rappel",
        canal: r.canal,
        texte: r.canal === "sms" ? versGsm7(texte) : texte,
      });
      if (envoi.erreur) {
        // Un quota épuisé ne se règle pas en réessayant dans une minute.
        await marquer(/quota/i.test(envoi.erreur) ? "abandonne" : "echec", envoi.erreur.slice(0, 300));
        resultat.echecs++;
        resultat.erreurs.push(envoi.erreur);
      } else if (envoi.simule) {
        await marquer("simule", "Mode test : aucun fournisseur configuré pour ce canal");
        resultat.simules++;
      } else {
        await marquer("envoye");
        resultat.envoyes++;
      }
    }
  } catch (e) {
    resultat.erreurs.push(e instanceof Error ? e.message : String(e));
  }
  return resultat;
}
