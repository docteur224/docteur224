import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fournisseur } from "./fournisseurs";
import { mesurerSms } from "./cout";
import { configComplete, type Canal, type ConfigMessagerie } from "./types";

export * from "./types";
export * from "./cout";
export { FOURNISSEURS_PAR_CANAL } from "./catalogue";

/*
 * Envoi d'un message sortant : choix du canal, envoi, décompte.
 *
 * SERVEUR UNIQUEMENT — `enregistrer_message` n'est accordée qu'au service_role
 * (migrations 0035 à 0037), et la configuration porte des secrets.
 *
 * L'ordre des opérations est délibéré : on décompte APRÈS l'envoi, avec le
 * statut réel. Décompter avant ferait payer les pannes de l'agrégateur au
 * professionnel ; ne rien écrire en cas d'échec effacerait la trace de ce qui
 * n'est pas parti, ce qu'un patient qui ne s'est pas présenté viendra
 * réclamer.
 */

function clientAdmin(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const CONFIG_DEFAUT: ConfigMessagerie = {
  mode: "simule",
  canalDefaut: "whatsapp",
  sms: { fournisseur: null, url: null, identifiant: null, cle: null, expediteur: null, coutGnf: 150 },
  whatsapp: { fournisseur: null, url: null, identifiant: null, cle: null, expediteur: null, coutGnf: 20 },
};

export async function lireConfigMessagerie(admin = clientAdmin()): Promise<ConfigMessagerie> {
  const { data } = await admin.from("config_messagerie").select("*").eq("id", 1).maybeSingle();
  if (!data) return CONFIG_DEFAUT;
  return {
    mode: data.mode,
    canalDefaut: data.canal_defaut,
    sms: {
      fournisseur: data.sms_fournisseur,
      url: data.sms_url,
      identifiant: data.sms_identifiant,
      cle: data.sms_cle,
      expediteur: data.sms_expediteur,
      coutGnf: data.cout_sms_gnf ?? 150,
    },
    whatsapp: {
      fournisseur: data.whatsapp_fournisseur,
      url: data.whatsapp_url,
      identifiant: data.whatsapp_numero_id,
      cle: data.whatsapp_jeton,
      expediteur: data.whatsapp_numero_id,
      coutGnf: data.cout_whatsapp_gnf ?? 20,
    },
  };
}

export interface DemandeEnvoi {
  /** Professionnel dont le quota est débité. */
  titulaireId: string;
  destinataire: string;
  motif: string;
  texte: string;
  /** Omis : le canal par défaut de la plateforme. */
  canal?: Canal;
}

export interface ResultatEnvoi {
  canal: Canal;
  segments: number;
  coutGnf: number;
  simule: boolean;
  reference?: string;
  erreur?: string;
}

/**
 * Envoie et journalise. Rend une erreur plutôt que de lever : un quota épuisé
 * ou un agrégateur en panne sont des situations courantes, pas des incidents
 * qui doivent faire échouer la réservation qui les a déclenchés.
 */
export async function envoyerMessage(demande: DemandeEnvoi): Promise<ResultatEnvoi> {
  const admin = clientAdmin();
  const config = await lireConfigMessagerie(admin);
  const canal = demande.canal ?? config.canalDefaut;
  const canalConfig = canal === "sms" ? config.sms : config.whatsapp;

  // Un message WhatsApp est facturé à la conversation, pas au segment : le
  // découpage à 160 caractères n'a pas de sens pour lui.
  const segments = canal === "sms" ? mesurerSms(demande.texte).segments : 1;

  /*
   * Le mode réel exige une configuration complète. Sans ce garde-fou, passer
   * l'interrupteur en « réel » avec un champ oublié enverrait chaque message
   * dans le vide en le comptant comme parti : le professionnel paierait des
   * messages que personne ne reçoit, et rien ne le signalerait.
   */
  const reel = config.mode === "reel" && configComplete(canal, config);
  const resultat = reel
    ? await fournisseur(canalConfig.fournisseur).envoyer(demande.destinataire, demande.texte, canalConfig)
    : { reference: `simule-${Date.now()}` };

  const statut = resultat.erreur ? "echec" : reel ? "envoye" : "simule";
  const { data, error } = await admin.rpc("enregistrer_message", {
    p_titulaire: demande.titulaireId,
    p_destinataire: demande.destinataire,
    p_motif: demande.motif,
    p_canal: canal,
    p_segments: segments,
    p_cout_unitaire: canalConfig.coutGnf,
    p_statut: statut,
    p_reference: resultat.reference ?? null,
    p_erreur: resultat.erreur ?? null,
  });

  return {
    canal,
    segments,
    coutGnf: segments * canalConfig.coutGnf,
    simule: !reel,
    reference: resultat.reference,
    // L'erreur de quota vient de la base et prime : elle explique pourquoi
    // rien ne partira, là où l'erreur du fournisseur explique pourquoi un
    // envoi tenté a échoué.
    erreur: error?.message ?? resultat.erreur,
    ...(data ? {} : {}),
  };
}

/**
 * Envoie sur le canal demandé, et retombe sur l'autre en cas d'échec.
 *
 * C'est la promesse du modèle : WhatsApp d'abord parce qu'il coûte une
 * fraction du SMS, le SMS en repli pour le patient qui n'a pas WhatsApp. Le
 * repli n'est tenté que si le premier canal a ÉCHOUÉ — pas s'il a été refusé
 * faute de quota, sinon on contournerait le plafond qu'on vient de poser.
 */
export async function envoyerAvecRepli(
  demande: DemandeEnvoi,
  repli: Canal = "sms"
): Promise<{ principal: ResultatEnvoi; repli?: ResultatEnvoi }> {
  const principal = await envoyerMessage(demande);
  if (!principal.erreur || principal.canal === repli) return { principal };
  const quotaEpuise = principal.erreur.toLowerCase().includes("quota");
  if (quotaEpuise) return { principal };
  return { principal, repli: await envoyerMessage({ ...demande, canal: repli }) };
}
