import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { configComplete, envoyerMessage, lireConfigMessagerie } from "../messagerie";
import { composer, type LigneFile } from "./contenu";

/*
 * Vidange de la file d'e-mails (migration 0057).
 *
 * SERVEUR UNIQUEMENT — `reserver_emails` et `marquer_email` ne sont accordées
 * qu'à la service_role, et `lib/messagerie` lit des secrets.
 *
 * Le principe tient en trois temps : on RÉSERVE un lot (l'opération est
 * atomique en base, deux drains simultanés obtiennent des lots disjoints), on
 * envoie, on inscrit le verdict. Réserver avant d'envoyer plutôt que lire puis
 * envoyer est ce qui empêche un même message de partir deux fois — c'est la
 * seule garantie qui tienne quand le cron et la poussée du navigateur tombent
 * en même temps.
 */

/*
 * Un lot volontairement petit. Chaque e-mail ouvre sa propre connexion SMTP et
 * coûte une à deux secondes ; dix tiennent sans peine dans le temps accordé à
 * une fonction Vercel, cent ne tiendraient pas. Quand il en reste, `encore` le
 * dit et le planificateur repasse dans la minute — une file qui s'écoule par
 * petits lots réguliers vaut mieux qu'un gros lot interrompu en son milieu.
 */
const LOT = 10;

export interface ResultatDrain {
  traites: number;
  envoyes: number;
  echecs: number;
  /** Vrai si la file en contenait autant que le lot : il en reste sûrement. */
  encore: boolean;
  /** La file n'a pas été touchée : le canal e-mail n'est pas en service. */
  inactif?: string;
  erreurs: string[];
}

function clientAdmin(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Vide un lot de la file. Ne lève jamais : cette fonction est appelée depuis
 * une route que le cron rappellera de toute façon, et depuis le navigateur
 * d'un patient qui vient de réserver — dans les deux cas, une exception ne
 * servirait qu'à perdre l'information.
 */
export async function drainerEmails(): Promise<ResultatDrain> {
  const resultat: ResultatDrain = { traites: 0, envoyes: 0, echecs: 0, encore: false, erreurs: [] };
  const admin = clientAdmin();

  /*
   * Tant que le canal n'est pas en service, on ne TOUCHE PAS à la file.
   *
   * Réserver puis constater qu'on est en mode simulé compterait une tentative
   * à chaque passage du cron, et au troisième la ligne serait abandonnée : la
   * file se viderait toute seule de messages que personne n'a reçus, et le
   * jour de la mise en service il n'y aurait plus rien à envoyer. S'abstenir
   * laisse la file intacte et prête.
   */
  const config = await lireConfigMessagerie(admin);
  if (config.mode !== "reel") {
    resultat.inactif = "Mode simulé : la file est conservée, rien n'est envoyé.";
    return resultat;
  }
  if (!configComplete("email", config)) {
    resultat.inactif = "Canal e-mail incomplètement configuré : la file est conservée.";
    return resultat;
  }

  const { data, error } = await admin.rpc("reserver_emails", { p_limite: LOT });
  if (error) {
    resultat.erreurs.push(error.message);
    return resultat;
  }
  const lot = (data ?? []) as LigneFile[];
  resultat.traites = lot.length;
  resultat.encore = lot.length === LOT;

  /*
   * En série et non en parallèle. Un serveur SMTP ouvre une connexion par
   * message et ferme la porte au-delà d'un certain nombre de connexions
   * simultanées : vingt envois d'un coup se feraient refuser par le serveur
   * lui-même, et les vingt seraient comptés en échec.
   */
  for (const ligne of lot) {
    const { sujet, texte, extras } = await composer(ligne, admin);
    const envoi = await envoyerMessage({
      /*
       * Le quota est débité au DESTINATAIRE de la notification, et non à un
       * professionnel : un e-mail ne coûte rien (`cout_email_gnf` vaut 0) et
       * n'entre pas dans le quota SMS. La colonne `titulaire_id` du journal
       * reste renseignée pour que chaque envoi ait un compte à qui se
       * rattacher.
       */
      titulaireId: ligne.destinataire_id,
      destinataire: ligne.adresse,
      motif: ligne.type,
      texte,
      canal: "email",
      sujet,
      extras,
    });

    /*
     * `simule` ne devrait plus pouvoir être vrai ici — la garde du dessus s'en
     * assure — mais on le traite quand même comme un échec plutôt que comme un
     * succès : le jour où la configuration change entre la garde et l'envoi,
     * mieux vaut une ligne qui reste en file qu'un message porté disparu.
     */
    const parti = !envoi.erreur && !envoi.simule;
    await admin.rpc("marquer_email", {
      p_id: ligne.id,
      p_succes: parti,
      p_erreur: envoi.erreur ?? (envoi.simule ? "Bascule en mode simulé pendant l'envoi." : null),
    });

    if (parti) resultat.envoyes++;
    else {
      resultat.echecs++;
      if (envoi.erreur) resultat.erreurs.push(`${ligne.adresse} : ${envoi.erreur}`);
    }
  }

  return resultat;
}
