"use client";

import { useEffect, useState } from "react";
import { creerClientNavigateur } from "@/lib/supabase/client";

/*
 * Avis et notes — écritures et lectures authentifiées.
 *
 * Deux publics :
 *  - le patient dépose (ou retire) un avis sur une consultation honorée ;
 *  - le médecin lit les avis qui le concernent et y répond.
 *
 * Les lectures publiques (fiche médecin vue par un visiteur) passent par
 * `chargerAvisMedecin` dans lib/donnees.ts : c'est la seule qui fonctionne
 * sans session. Ici tout suppose un utilisateur connecté.
 */

export interface AvisMedecin {
  id: string;
  note: number;
  commentaire: string;
  auteur: string;
  creeLe: string;
  /** 'publie' | 'en_attente' | 'rejete' — un avis masqué reste visible du médecin. */
  statut: string;
  reponseMedecin: string;
  reponseLe: string;
  rendezVousId: string;
  dateConsultation: string;
}

interface LigneAvis {
  id: string;
  note: number;
  commentaire: string | null;
  cree_le: string;
  statut: string;
  reponse_medecin: string | null;
  reponse_le: string | null;
  rendez_vous_id: string;
  patients: { utilisateurs: { nom: string | null; prenom: string | null } | null } | null;
  rendez_vous: { date: string } | null;
}

// `avis.patient_id` pointe sur `patients`, pas sur `utilisateurs` : le nom se
// lit en deux sauts. Écrire `utilisateurs:patient_id` résoudrait vers
// `patients` et échouerait sur « column patients_1.nom does not exist ».
// La date de consultation n'est jointe que si la RLS laisse voir le
// rendez-vous (c'est le cas du patient auteur, pas du médecin).
const SELECTION_AVIS = `
  id, note, commentaire, cree_le, statut, reponse_medecin, reponse_le, rendez_vous_id,
  patients ( utilisateurs ( nom, prenom ) ),
  rendez_vous ( date )
`;

function versAvis(l: LigneAvis): AvisMedecin {
  const prenom = l.patients?.utilisateurs?.prenom ?? "";
  const nom = l.patients?.utilisateurs?.nom ?? "";
  return {
    id: l.id,
    note: l.note,
    commentaire: l.commentaire ?? "",
    auteur: `${prenom} ${nom ? `${nom.charAt(0)}.` : ""}`.trim() || "Patient",
    creeLe: l.cree_le,
    statut: l.statut,
    reponseMedecin: l.reponse_medecin ?? "",
    reponseLe: l.reponse_le ?? "",
    rendezVousId: l.rendez_vous_id,
    dateConsultation: l.rendez_vous?.date ?? "",
  };
}

/**
 * Avis reçus par le médecin connecté.
 *
 * Le filtre `medecin_id` est indispensable : les policies RLS se combinent en
 * OR, et `sel_avis_publies` rend tout avis publié lisible par n'importe quel
 * utilisateur connecté. Sans ce `.eq()`, l'écran listerait aussi les avis des
 * confrères — publics, mais qui n'ont rien à faire là.
 */
export function useAvisRecus(): {
  avis: AvisMedecin[];
  chargement: boolean;
  recharger: () => void;
} {
  const [avis, setAvis] = useState<AvisMedecin[]>([]);
  const [chargement, setChargement] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let actif = true;
    (async () => {
      const supabase = creerClientNavigateur();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        if (actif) setChargement(false);
        return;
      }
      const { data } = await supabase
        .from("avis")
        .select(SELECTION_AVIS)
        .eq("medecin_id", auth.user.id)
        .order("cree_le", { ascending: false });
      if (!actif) return;
      setAvis(((data ?? []) as unknown as LigneAvis[]).map(versAvis));
      setChargement(false);
    })();
    return () => {
      actif = false;
    };
  }, [version]);

  return { avis, chargement, recharger: () => setVersion((v) => v + 1) };
}

/** Répond (ou corrige la réponse) à un avis reçu. Une réponse vide l'efface. */
export async function repondreAvis(avisId: string, reponse: string): Promise<{ erreur?: string }> {
  const texte = reponse.trim();
  const { error } = await creerClientNavigateur()
    .from("avis")
    // `reponse_le` est posé par le trigger `avis_reponse_seule` : l'écrire ici
    // serait écrasé, et le médecin n'a pas le droit d'antidater sa réponse.
    .update({ reponse_medecin: texte || null })
    .eq("id", avisId);
  return error ? { erreur: error.message } : {};
}

/* ===== Côté patient ===== */

/**
 * L'avis déjà déposé par le patient connecté sur cette consultation, s'il
 * existe. `null` = consultation pas encore notée.
 */
export function useMonAvis(rendezVousId: string): {
  avis: AvisMedecin | null;
  chargement: boolean;
  recharger: () => void;
} {
  // Même garde-fou que `useRendezVous` : la clé de requête vit dans l'état,
  // pour ne pas repasser en chargement par un setState en tête d'effet.
  const [resultat, setResultat] = useState<{ cle: string; avis: AvisMedecin | null } | null>(null);
  const [version, setVersion] = useState(0);
  const cle = `${rendezVousId}#${version}`;

  useEffect(() => {
    let actif = true;
    (async () => {
      const supabase = creerClientNavigateur();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        if (actif) setResultat({ cle, avis: null });
        return;
      }
      // `patient_id` explicite : les policies étant en OR, un avis publié reste
      // lisible par n'importe qui — on ne veut ici que celui de l'utilisateur.
      const { data } = await supabase
        .from("avis")
        .select(SELECTION_AVIS)
        .eq("rendez_vous_id", rendezVousId)
        .eq("patient_id", auth.user.id)
        .maybeSingle();
      if (!actif) return;
      const l = data as unknown as LigneAvis | null;
      setResultat({ cle, avis: l ? versAvis(l) : null });
    })();
    return () => {
      actif = false;
    };
  }, [rendezVousId, cle]);

  const aJour = resultat?.cle === cle;
  return {
    avis: aJour ? resultat.avis : null,
    chargement: !aJour,
    recharger: () => setVersion((v) => v + 1),
  };
}

/**
 * Dépose un avis sur une consultation honorée. La base refuse tout le reste :
 * la policy `ins_avis` vérifie via `peut_noter_rdv` que le rendez-vous est
 * honoré et appartient bien au patient connecté.
 */
export async function deposerAvis(d: {
  rendezVousId: string;
  medecinId: string;
  note: number;
  commentaire: string;
}): Promise<{ erreur?: string }> {
  if (d.note < 1 || d.note > 5) return { erreur: "Choisissez une note entre 1 et 5 étoiles." };
  const supabase = creerClientNavigateur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { erreur: "Connectez-vous pour laisser un avis." };

  const { error } = await supabase.from("avis").insert({
    patient_id: auth.user.id,
    medecin_id: d.medecinId,
    rendez_vous_id: d.rendezVousId,
    note: d.note,
    commentaire: d.commentaire.trim() || null,
  });
  if (error) {
    if (error.code === "23505") return { erreur: "Vous avez déjà donné votre avis sur cette consultation." };
    // Violation de la policy d'insertion : la consultation n'est pas honorée
    // (ou pas celle du patient). Le message brut de Postgres n'aiderait pas.
    if (error.code === "42501") {
      return { erreur: "Vous ne pouvez donner un avis qu'après une consultation honorée." };
    }
    return { erreur: error.message };
  }
  return {};
}

/** Un avis déposé par le patient, augmenté du médecin concerné. */
export interface MonAvis extends AvisMedecin {
  medecinId: string;
  medecinNom: string;
  specialite: string;
}

interface LigneMonAvis extends LigneAvis {
  medecin_id: string;
  medecins: {
    civilite: string | null;
    utilisateurs: { nom: string | null; prenom: string | null } | null;
    specialites: { nom: string } | null;
  } | null;
}

/**
 * Tous les avis déposés par le patient connecté.
 *
 * Le filtre `patient_id` est indispensable et non décoratif : les policies se
 * combinent en OR et `sel_avis_publies` rend tout avis publié lisible par
 * n'importe quel connecté — sans lui, le patient verrait ceux des autres.
 */
export function useMesAvis(): {
  avis: MonAvis[];
  chargement: boolean;
  recharger: () => void;
} {
  const [avis, setAvis] = useState<MonAvis[]>([]);
  const [chargement, setChargement] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let actif = true;
    (async () => {
      const supabase = creerClientNavigateur();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        if (actif) setChargement(false);
        return;
      }
      const { data } = await supabase
        .from("avis")
        .select(
          `${SELECTION_AVIS}, medecin_id,
           medecins ( civilite, utilisateurs ( nom, prenom ), specialites ( nom ) )`
        )
        .eq("patient_id", auth.user.id)
        .order("cree_le", { ascending: false });
      if (!actif) return;
      setAvis(
        ((data ?? []) as unknown as LigneMonAvis[]).map((l) => ({
          ...versAvis(l),
          medecinId: l.medecin_id,
          medecinNom: `${l.medecins?.civilite === "Pr" ? "Pr" : "Dr"} ${
            l.medecins?.utilisateurs?.prenom ?? ""
          } ${l.medecins?.utilisateurs?.nom ?? ""}`.trim(),
          specialite: l.medecins?.specialites?.nom ?? "",
        }))
      );
      setChargement(false);
    })();
    return () => {
      actif = false;
    };
  }, [version]);

  return { avis, chargement, recharger: () => setVersion((v) => v + 1) };
}

/** Modifie son propre avis (note et commentaire). */
export async function modifierMonAvis(
  avisId: string,
  d: { note: number; commentaire: string }
): Promise<{ erreur?: string }> {
  if (d.note < 1 || d.note > 5) return { erreur: "Choisissez une note entre 1 et 5 étoiles." };
  const { error } = await creerClientNavigateur()
    .from("avis")
    .update({ note: d.note, commentaire: d.commentaire.trim() || null })
    .eq("id", avisId);
  return error ? { erreur: error.message } : {};
}

/** Retire son avis (la note du médecin est recalculée par trigger). */
export async function supprimerMonAvis(avisId: string): Promise<{ erreur?: string }> {
  const { error } = await creerClientNavigateur().from("avis").delete().eq("id", avisId);
  return error ? { erreur: error.message } : {};
}

/* ===== Signalement (alimente la file de modération admin) ===== */

/**
 * Signale un avis abusif. Les avis étant publiés dès leur dépôt, c'est ce
 * signalement — et non un statut « en attente » — qui déclenche la revue par
 * l'admin (écran /espace-admin/moderation).
 */
export async function signalerAvis(avisId: string, motif: string): Promise<{ erreur?: string }> {
  const supabase = creerClientNavigateur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { erreur: "Connectez-vous pour signaler un avis." };

  // Un même utilisateur ne signale qu'une fois : au-delà, on renvoie un
  // succès silencieux plutôt qu'une erreur qui n'apprendrait rien.
  const { data: existant } = await supabase
    .from("signalements")
    .select("id")
    .eq("auteur_id", auth.user.id)
    .eq("cible_type", "avis")
    .eq("cible_id", avisId)
    .maybeSingle();
  if (existant) return {};

  const { error } = await supabase.from("signalements").insert({
    auteur_id: auth.user.id,
    cible_type: "avis",
    cible_id: avisId,
    motif,
  });
  return error ? { erreur: error.message } : {};
}
