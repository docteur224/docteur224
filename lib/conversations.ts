"use client";

import { useEffect, useState } from "react";
import { creerClientNavigateur } from "@/lib/supabase/client";

/*
 * Messagerie patient ↔ médecin et rappels SMS/WhatsApp (migration 0066).
 *
 * Une conversation = un patient (titulaire du compte) et un médecin. Un
 * message peut citer un proche (« pour mon fils »). Lectures sous la RLS :
 * chacun ne voit que ses conversations ; écrire exige une relation de soins
 * (un rendez-vous), règle posée en base.
 */

export const BUCKET_MESSAGES = "messages";
const TAILLE_MAX = 8 * 1024 * 1024;
const EXTENSIONS = /\.(pdf|jpe?g|png|webp)$/i;

export interface Message {
  id: string;
  expediteurId: string;
  contenu: string | null;
  pieceNom: string | null;
  piecePath: string | null;
  procheId: string | null;
  creeLe: string;
  lu: boolean;
  luLe: string | null;
}

interface LigneMessage {
  id: string;
  expediteur_id: string;
  contenu: string | null;
  piece_nom: string | null;
  piece_path: string | null;
  proche_id: string | null;
  cree_le: string;
  lu: boolean;
  lu_le: string | null;
}

const versMessage = (l: LigneMessage): Message => ({
  id: l.id,
  expediteurId: l.expediteur_id,
  contenu: l.contenu,
  pieceNom: l.piece_nom,
  piecePath: l.piece_path,
  procheId: l.proche_id,
  creeLe: l.cree_le,
  lu: l.lu,
  luLe: l.lu_le,
});

/** Traduit les refus de la base en phrases utilisables à l'écran. */
function messageErreur(message: string): string {
  if (message.includes("row-level security") || message.includes("ins_messages")) {
    return "Envoi refusé : la messagerie est réservée aux patients et médecins ayant déjà eu un rendez-vous ensemble.";
  }
  if (message.includes("messages_non_vide")) return "Écrivez un message ou joignez un fichier.";
  if (message.includes("messages_longueur")) return "Message trop long (4 000 caractères au maximum).";
  return message;
}

/**
 * Fil d'une conversation, du plus ancien au plus récent. Relu toutes les
 * 15 s tant que l'onglet est visible : assez pour une conversation qui
 * attend une réponse, sans tenir une connexion ouverte en permanence.
 */
export function useConversation(patientId: string | null, medecinId: string | null, revision: number) {
  const cle = `${patientId}|${medecinId}|${revision}`;
  const [resultat, setResultat] = useState<{ cle: string; messages: Message[]; erreur?: string } | null>(null);
  const [battement, setBattement] = useState(0);

  useEffect(() => {
    const minuteur = setInterval(() => {
      if (document.visibilityState === "visible") setBattement((b) => b + 1);
    }, 15_000);
    return () => clearInterval(minuteur);
  }, []);

  useEffect(() => {
    const [p, m] = cle.split("|");
    if (p === "null" || m === "null") return;
    let actif = true;
    creerClientNavigateur()
      .from("messages")
      .select("id, expediteur_id, contenu, piece_nom, piece_path, proche_id, cree_le, lu, lu_le")
      .eq("patient_id", p)
      .eq("medecin_id", m)
      .order("cree_le", { ascending: true })
      .limit(300)
      .then(({ data, error }) => {
        if (actif) setResultat({ cle, messages: ((data ?? []) as LigneMessage[]).map(versMessage), erreur: error?.message });
      });
    return () => {
      actif = false;
    };
  }, [cle, battement]);

  return {
    messages: resultat?.messages ?? [],
    chargement: resultat === null || (resultat.cle !== cle && resultat.messages.length === 0),
    erreur: resultat?.erreur,
  };
}

/** Marque lus les messages reçus de cette conversation (jamais les siens : la base le refuse). */
export async function marquerLus(patientId: string, medecinId: string): Promise<void> {
  const supabase = creerClientNavigateur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  await supabase
    .from("messages")
    .update({ lu: true })
    .eq("patient_id", patientId)
    .eq("medecin_id", medecinId)
    .neq("expediteur_id", auth.user.id)
    .eq("lu", false);
}

/** Envoie un message, avec une pièce jointe facultative. */
export async function envoyerMessagePatient(d: {
  patientId: string;
  medecinId: string;
  contenu: string;
  fichier?: File | null;
  procheId?: string | null;
}): Promise<{ erreur?: string }> {
  const texte = d.contenu.trim();
  if (!texte && !d.fichier) return { erreur: "Écrivez un message ou joignez un fichier." };
  if (texte.length > 4000) return { erreur: "Message trop long (4 000 caractères au maximum)." };
  const supabase = creerClientNavigateur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { erreur: "Session expirée — reconnectez-vous." };

  let piecePath: string | null = null;
  if (d.fichier) {
    if (d.fichier.size > TAILLE_MAX) return { erreur: "Le fichier dépasse 8 Mo." };
    if (!EXTENSIONS.test(d.fichier.name)) return { erreur: "Formats acceptés : PDF, JPG, PNG, WEBP." };
    // Premier dossier = l'expéditeur : c'est ce que vérifie la policy Storage.
    piecePath = `${auth.user.id}/${crypto.randomUUID()}-${d.fichier.name.replace(/[^\w.\-]+/g, "-")}`;
    const { error } = await supabase.storage
      .from(BUCKET_MESSAGES)
      .upload(piecePath, d.fichier, { contentType: d.fichier.type || undefined });
    if (error) return { erreur: error.message };
  }

  const { error } = await supabase.from("messages").insert({
    patient_id: d.patientId,
    medecin_id: d.medecinId,
    expediteur_id: auth.user.id,
    contenu: texte || null,
    piece_path: piecePath,
    piece_nom: d.fichier?.name ?? null,
    proche_id: d.procheId ?? null,
  });
  if (error) {
    // Message refusé : le fichier déposé n'est rattaché à rien, on le retire.
    if (piecePath) await supabase.storage.from(BUCKET_MESSAGES).remove([piecePath]);
    return { erreur: messageErreur(error.message) };
  }
  return {};
}

/** URL temporaire (5 min) d'une pièce jointe, demandée au clic. */
export async function urlPieceJointe(path: string): Promise<{ url?: string; erreur?: string }> {
  const { data, error } = await creerClientNavigateur().storage.from(BUCKET_MESSAGES).createSignedUrl(path, 300);
  return error ? { erreur: error.message } : { url: data.signedUrl };
}

/* ===================== Côté patient ===================== */

export interface Conversation {
  medecinId: string;
  medecin: string;
  specialite: string | null;
  dernierMessage: string;
  dernierLe: string;
  dernierDeMoi: boolean;
  nonLus: number;
}

export function useConversationsPatient(revision: number) {
  const [resultat, setResultat] = useState<{ revision: number; liste: Conversation[] } | null>(null);
  useEffect(() => {
    let actif = true;
    creerClientNavigateur()
      .rpc("conversations_patient")
      .then(({ data }) => {
        if (!actif) return;
        setResultat({
          revision,
          liste: (
            (data ?? []) as {
              medecin_id: string;
              medecin: string;
              specialite: string | null;
              dernier_message: string;
              dernier_le: string;
              dernier_de_moi: boolean;
              non_lus: number;
            }[]
          ).map((c) => ({
            medecinId: c.medecin_id,
            medecin: c.medecin,
            specialite: c.specialite,
            dernierMessage: c.dernier_message,
            dernierLe: c.dernier_le,
            dernierDeMoi: c.dernier_de_moi,
            nonLus: Number(c.non_lus),
          })),
        });
      });
    return () => {
      actif = false;
    };
  }, [revision]);
  return { conversations: resultat?.liste ?? [], chargement: resultat === null };
}

/* ===================== Côté médecin ===================== */

/** Messages non lus d'un patient (pastille de l'onglet Relation patient). */
export function useNonLus(patientId: string | null, medecinId: string | null, revision: number): number | null {
  const cle = `${patientId}|${medecinId}|${revision}`;
  const [resultat, setResultat] = useState<{ cle: string; n: number } | null>(null);
  useEffect(() => {
    const [p, m] = cle.split("|");
    if (p === "null" || m === "null") return;
    let actif = true;
    creerClientNavigateur()
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("patient_id", p)
      .eq("medecin_id", m)
      .eq("lu", false)
      .eq("expediteur_id", p)
      .then(({ count }) => {
        if (actif) setResultat({ cle, n: count ?? 0 });
      });
    return () => {
      actif = false;
    };
  }, [cle]);
  return resultat?.cle === cle ? resultat.n : null;
}

/** Le titulaire du compte d'un proche : c'est avec lui que l'on correspond. */
export function useTitulaireDuProche(procheId: string | null) {
  const [resultat, setResultat] = useState<{ procheId: string; patientId: string | null } | null>(null);
  useEffect(() => {
    if (!procheId) return;
    let actif = true;
    creerClientNavigateur()
      .from("proches")
      .select("patient_id")
      .eq("id", procheId)
      .maybeSingle()
      .then(({ data }) => {
        if (actif) setResultat({ procheId, patientId: data?.patient_id ?? null });
      });
    return () => {
      actif = false;
    };
  }, [procheId]);
  if (!procheId) return { patientId: null, chargement: false };
  return { patientId: resultat?.procheId === procheId ? resultat.patientId : null, chargement: resultat?.procheId !== procheId };
}

/* ===================== Rappels ===================== */

export interface Consentement {
  whatsapp: boolean;
  sms: boolean;
  telephone: boolean;
  rappelsActifs: boolean;
  whatsappAutorise: boolean;
  smsAutorise: boolean;
  delais: number[];
}

export function useConsentementRappels(patientId: string | null) {
  const [resultat, setResultat] = useState<{ patientId: string; c: Consentement | null; erreur?: string } | null>(null);
  useEffect(() => {
    if (!patientId) return;
    let actif = true;
    creerClientNavigateur()
      .rpc("consentement_rappels", { p_patient: patientId })
      .then(({ data, error }) => {
        if (!actif) return;
        const l = (data as Record<string, unknown>[] | null)?.[0];
        setResultat({
          patientId,
          erreur: error?.message,
          c: l
            ? {
                whatsapp: !!l.whatsapp,
                sms: !!l.sms,
                telephone: !!l.telephone,
                rappelsActifs: !!l.rappels_actifs,
                whatsappAutorise: !!l.whatsapp_autorise,
                smsAutorise: !!l.sms_autorise,
                delais: (l.delais as number[]) ?? [24, 2],
              }
            : null,
        });
      });
    return () => {
      actif = false;
    };
  }, [patientId]);
  return { consentement: resultat?.c ?? null, chargement: !!patientId && resultat?.patientId !== patientId };
}

export interface Rappel {
  id: string;
  delaiHeures: number;
  programmePour: string;
  canal: "sms" | "whatsapp" | null;
  etat: "programme" | "en_cours" | "envoye" | "simule" | "echec" | "abandonne" | "annule" | "ignore";
  erreur: string | null;
  envoyeLe: string | null;
  rdvDate: string;
  rdvHeure: string;
}

/** Rappels des rendez-vous de ce patient avec le médecin connecté (la RLS limite au médecin). */
export function useRappelsPatient(colonne: "patient_id" | "proche_id" | "patient_sans_compte_id", id: string, revision: number) {
  const cle = `${colonne}|${id}|${revision}`;
  const [resultat, setResultat] = useState<{ cle: string; rappels: Rappel[] } | null>(null);
  useEffect(() => {
    const [col, val] = cle.split("|");
    let actif = true;
    creerClientNavigateur()
      .from("rappels_programmes")
      .select("id, delai_heures, programme_pour, canal, etat, derniere_erreur, envoye_le, rendez_vous!inner ( date, heure, patient_id, proche_id, patient_sans_compte_id )")
      .eq(`rendez_vous.${col}`, val)
      .order("programme_pour", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (!actif) return;
        setResultat({
          cle,
          rappels: (
            (data ?? []) as unknown as {
              id: string;
              delai_heures: number;
              programme_pour: string;
              canal: Rappel["canal"];
              etat: Rappel["etat"];
              derniere_erreur: string | null;
              envoye_le: string | null;
              rendez_vous: { date: string; heure: string };
            }[]
          ).map((r) => ({
            id: r.id,
            delaiHeures: r.delai_heures,
            programmePour: r.programme_pour,
            canal: r.canal,
            etat: r.etat,
            erreur: r.derniere_erreur,
            envoyeLe: r.envoye_le,
            rdvDate: r.rendez_vous.date,
            rdvHeure: r.rendez_vous.heure,
          })),
        });
      });
    return () => {
      actif = false;
    };
  }, [cle]);
  return { rappels: resultat?.rappels ?? [], chargement: resultat?.cle !== cle };
}
