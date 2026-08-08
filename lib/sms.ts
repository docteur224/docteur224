import { createClient } from "@supabase/supabase-js";

/*
 * Comptage et enregistrement des SMS.
 *
 * Rien n'envoie encore de SMS : aucun agrégateur n'est branché. Ce module pose
 * le compteur AVANT, parce qu'un envoi branché sans décompte donne une facture
 * sans plafond — à 150 GNF le segment, un rappel automatique parti en boucle
 * coûte plus cher que l'abonnement annuel qu'il sert.
 *
 * Le contrôle de quota lui-même vit en base (`enregistrer_sms`, migration
 * 0034) : un garde-fou côté application s'oublie au premier chemin de code
 * nouveau, une fonction que rien d'autre ne peut contourner, non.
 */

/** Tarif agrégateur guinéen, par segment. */
export const COUT_SEGMENT_GNF = 150;

/*
 * Alphabet GSM 03.38. Un message qui en sort bascule en UCS-2, et le segment
 * passe de 160 à 70 caractères — un rappel de 150 caractères coûte alors 3
 * segments au lieu d'1, soit le triple.
 *
 * Piège français : « é è ù à ç… » ne sont PAS tous logés à la même enseigne.
 * é, è, ù, ì, ò, à, ä, ö, ñ, ü, Ä, Ö, Ñ, Ü, Å, å, Æ, æ, ß, É et Ç MAJUSCULE
 * sont dans l'alphabet ; ê, â, î, ô, û, ë, ï, œ, le ç MINUSCULE, les guillemets
 * « » et l'apostrophe typographique ’ n'y sont pas. Un « ç » ou un « ’ » suffit
 * donc à tripler le coût d'un message — d'où `alerteCout`.
 */
const GSM7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

/** Caractères GSM-7 codés sur DEUX emplacements (table d'extension). */
const GSM7_ETENDU = "^{}\\[~]|€";

function estGsm7(texte: string): boolean {
  return [...texte].every((c) => GSM7.includes(c) || GSM7_ETENDU.includes(c));
}

/** Emplacements occupés en GSM-7, les caractères étendus comptant double. */
function emplacementsGsm7(texte: string): number {
  return [...texte].reduce((n, c) => n + (GSM7_ETENDU.includes(c) ? 2 : 1), 0);
}

export interface MesureSms {
  segments: number;
  /** `false` quand un seul caractère hors alphabet fait basculer en UCS-2. */
  gsm7: boolean;
  coutGnf: number;
}

/**
 * Nombre de segments facturés pour un message.
 *
 * Les seuils ne sont pas les mêmes seul et concaténé : l'en-tête de
 * concaténation mange des caractères, d'où 153 (GSM-7) et 67 (UCS-2) par
 * partie au lieu de 160 et 70. Compter au seuil simple sous-estime la facture
 * de 5 % dès qu'un message dépasse une partie.
 */
export function mesurerSms(texte: string, coutSegment = COUT_SEGMENT_GNF): MesureSms {
  const gsm7 = estGsm7(texte);
  const longueur = gsm7 ? emplacementsGsm7(texte) : [...texte].length;
  const [simple, concatene] = gsm7 ? [160, 153] : [70, 67];
  const segments = longueur === 0 ? 1 : longueur <= simple ? 1 : Math.ceil(longueur / concatene);
  return { segments, gsm7, coutGnf: segments * coutSegment };
}

/**
 * Message plus cher qu'il n'en a l'air : il tiendrait en un segment de moins
 * s'il restait dans l'alphabet GSM-7. Sert à alerter à la rédaction d'un
 * gabarit, pas à bloquer.
 */
export function alerteCout(texte: string): string | null {
  const mesure = mesurerSms(texte);
  if (mesure.gsm7) return null;
  const sansAccents = texte.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’‘]/g, "'").replace(/[«»]/g, '"');
  const alternatif = mesurerSms(sansAccents);
  if (!alternatif.gsm7 || alternatif.segments >= mesure.segments) return null;
  return `Ce message part en UCS-2 (${mesure.segments} segments). Sans les caractères hors alphabet GSM il en ferait ${alternatif.segments}, soit ${(mesure.coutGnf - alternatif.coutGnf).toLocaleString("fr-FR")} GNF de moins par envoi.`;
}

function clientAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface ResultatEnvoi {
  id?: string;
  segments: number;
  erreur?: string;
}

/**
 * Journalise un envoi et débite le quota. À appeler côté SERVEUR uniquement —
 * `enregistrer_sms` n'est accordée qu'au service_role (migration 0035).
 *
 * Rend une erreur plutôt que de lever : un quota épuisé est un cas de
 * fonctionnement normal en fin de mois, pas un incident.
 */
export async function enregistrerEnvoiSms(params: {
  titulaireId: string;
  destinataire: string;
  motif: string;
  texte: string;
  statut?: "envoye" | "echec" | "simule";
  reference?: string;
  erreur?: string;
}): Promise<ResultatEnvoi> {
  const { segments } = mesurerSms(params.texte);
  const { data, error } = await clientAdmin().rpc("enregistrer_sms", {
    p_titulaire: params.titulaireId,
    p_destinataire: params.destinataire,
    p_motif: params.motif,
    p_segments: segments,
    p_cout_unitaire: COUT_SEGMENT_GNF,
    p_statut: params.statut ?? "envoye",
    p_reference: params.reference ?? null,
    p_erreur: params.erreur ?? null,
  });
  if (error) return { segments, erreur: error.message };
  return { id: data as string, segments };
}
