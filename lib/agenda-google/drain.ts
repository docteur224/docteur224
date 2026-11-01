import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { dechiffrer } from "./chiffrement";
import { oauthConfigure } from "./oauth";
import {
  accesRevoque,
  creerEvenement,
  evenementIntrouvable,
  jetonAcces,
  majEvenement,
  supprimerEvenement,
  type Evenement,
} from "./calendrier";

/*
 * Vidange de la file de synchronisation Google Agenda (migration 0084).
 *
 * SERVEUR UNIQUEMENT — `reserver_agenda_sync` et `marquer_agenda_sync` ne sont
 * accordées qu'à la service_role, et la clé de chiffrement des jetons n'existe
 * que côté serveur.
 *
 * Même principe que la file d'e-mails et celle des rappels : on RÉSERVE un lot
 * (deux passages simultanés obtiennent des lots disjoints), on appelle Google,
 * on inscrit le verdict. L'action est décidée par la base à la réservation :
 * un rendez-vous annulé entre-temps est retiré de l'agenda au lieu d'y être
 * ajouté.
 *
 * MODE SIMULÉ tant que les identifiants Google manquent (`oauthConfigure()`
 * faux) : la file se vide, chaque tâche est marquée « simulé » avec le geste
 * qu'elle aurait fait, et RIEN ne part vers Google. Le circuit complet tourne
 * donc avant le premier projet Google Cloud — exactement comme lib/messagerie
 * simule les SMS.
 *
 * Un jeton de rafraîchissement ne sort jamais d'ici : il est déchiffré,
 * échangé contre un jeton d'accès, et aucun des deux n'est journalisé ni
 * renvoyé dans le résultat.
 */

const LOT = 20;

export interface ResultatAgendaGoogle {
  traites: number;
  crees: number;
  majs: number;
  supprimes: number;
  simules: number;
  ignores: number;
  echecs: number;
  encore: boolean;
  erreurs: string[];
}

interface Reserve {
  id: string;
  rendez_vous_id: string;
  utilisateur_id: string;
  action_reelle: "creer" | "mettre_a_jour" | "supprimer";
  tentatives: number;
  refresh_token_chiffre: string | null;
  calendar_id: string;
  google_event_id: string | null;
  statut_rdv: string;
  date_rdv: string;
  heure_rdv: string;
  medecin: string;
  specialite: string | null;
  lieu: string | null;
  pour_qui: string | null;
}

function clientAdmin(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function evenement(r: Reserve): Evenement {
  return {
    rendezVousId: r.rendez_vous_id,
    date: r.date_rdv,
    heure: r.heure_rdv,
    medecin: r.medecin,
    specialite: r.specialite,
    lieu: r.lieu,
    pourQui: r.pour_qui,
    statut: r.statut_rdv,
  };
}

/** Vide un lot de la file Google Agenda. Ne lève jamais. */
export async function drainerAgendaGoogle(): Promise<ResultatAgendaGoogle> {
  const resultat: ResultatAgendaGoogle = {
    traites: 0, crees: 0, majs: 0, supprimes: 0,
    simules: 0, ignores: 0, echecs: 0, encore: false, erreurs: [],
  };
  const admin = clientAdmin();
  const configure = oauthConfigure();

  try {
    const { data, error } = await admin.rpc("reserver_agenda_sync", { p_limite: LOT });
    if (error) {
      resultat.erreurs.push(error.message);
      return resultat;
    }
    const lot = (data ?? []) as Reserve[];
    resultat.encore = lot.length === LOT;

    for (const r of lot) {
      resultat.traites++;
      const marquer = (
        etat: string,
        opts: { erreur?: string; eventId?: string; supprime?: boolean } = {},
      ) =>
        admin.rpc("marquer_agenda_sync", {
          p_id: r.id,
          p_etat: etat,
          p_erreur: opts.erreur ?? null,
          p_event_id: opts.eventId ?? null,
          p_supprime: opts.supprime ?? false,
        });

      // Le patient s'est déconnecté entre la programmation et le passage.
      if (!r.refresh_token_chiffre) {
        await marquer("ignore", { erreur: "Compte Google plus relié" });
        resultat.ignores++;
        continue;
      }
      // Suppression d'un événement qui n'a jamais été posé : rien à faire.
      if (r.action_reelle === "supprimer" && !r.google_event_id) {
        await marquer("ignore", { erreur: "Aucun événement à retirer" });
        resultat.ignores++;
        continue;
      }

      if (!configure) {
        await marquer("simule", {
          erreur: `Mode test : « ${r.action_reelle} » non envoyé (identifiants Google absents)`,
        });
        resultat.simules++;
        continue;
      }

      try {
        const jeton = await jetonAcces(dechiffrer(r.refresh_token_chiffre));

        if (r.action_reelle === "supprimer") {
          try {
            await supprimerEvenement(jeton, r.calendar_id, r.google_event_id!);
          } catch (e) {
            // Déjà retiré à la main par le patient : le but est atteint.
            if (!evenementIntrouvable(e)) throw e;
          }
          await marquer("fait", { supprime: true });
          resultat.supprimes++;
        } else if (r.action_reelle === "mettre_a_jour") {
          try {
            await majEvenement(jeton, r.calendar_id, r.google_event_id!, evenement(r));
            await marquer("fait", { eventId: r.google_event_id! });
            resultat.majs++;
          } catch (e) {
            // L'événement a disparu de l'agenda : on le repose.
            if (!evenementIntrouvable(e)) throw e;
            const idEvent = await creerEvenement(jeton, r.calendar_id, evenement(r));
            await marquer("fait", { eventId: idEvent, erreur: "Événement absent de l'agenda : recréé" });
            resultat.crees++;
          }
        } else {
          const idEvent = await creerEvenement(jeton, r.calendar_id, evenement(r));
          await marquer("fait", { eventId: idEvent });
          resultat.crees++;
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        /*
         * Un accès révoqué ou un consentement incomplet ne se règle pas en
         * réessayant dans une minute : on abandonne la tâche. Tout le reste
         * (réseau, 5xx, quota momentané) repart en file.
         */
        await marquer(accesRevoque(e) ? "abandonne" : "echec", { erreur: message.slice(0, 300) });
        resultat.echecs++;
        resultat.erreurs.push(message);
      }
    }
  } catch (e) {
    resultat.erreurs.push(e instanceof Error ? e.message : String(e));
  }
  return resultat;
}
