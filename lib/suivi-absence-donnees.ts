"use client";

import { useCallback, useEffect, useState } from "react";
import { creerClientNavigateur } from "@/lib/supabase/client";
import { MOIS_ABREGES } from "@/lib/dates";
import {
  niveauRisque,
  SEUILS_DEFAUT,
  MODELE_AVERTISSEMENT_DEFAUT,
  type NiveauAbsence,
  type SeuilsAbsence,
} from "@/lib/suivi-absence";

/*
 * Lecture et écriture du suivi d'absence (migration 0085).
 *
 * Les comptes viennent de la base, les NIVEAUX sont posés ici en passant par
 * `lib/suivi-absence.ts` — jamais recalculés dans un écran. Un composant qui
 * reçoit une ligne reçoit déjà son niveau.
 *
 * Séparé de `lib/suivi-absence.ts` pour que la règle des seuils reste
 * testable sans navigateur ni base, comme `charte-couleurs` l'est de
 * `charte-compte`.
 */

export type TypeFiche = "compte" | "proche" | "sans_compte";

export interface LigneSuivi {
  /** Clé de dossier : « c-… » compte, « p-… » proche, « s-… » fiche cabinet. */
  cle: string;
  type: TypeFiche;
  nom: string;
  prenom: string;
  telephone: string;
  email: string;
  absences: number;
  /** Honorés + non honorés. Les annulés n'y sont pas. */
  termines: number;
  derniereAbsence: string | null;
  avertiLe: string | null;
  nbAvertissements: number;
  /** Date de la dernière remise à zéro, s'il y en a eu une. */
  remisAZeroLe: string | null;
  motif: string | null;
  niveau: NiveauAbsence;
}

export interface ResumeSuivi {
  periodeMois: number;
  absences: number;
  termines: number;
  /** Prix de référence d'une consultation, `null` si aucun prix ferme. */
  tarifReference: number | null;
}

export interface MoisRdv {
  /** Premier jour du mois, « AAAA-MM-JJ ». */
  mois: string;
  total: number;
  honores: number;
  absents: number;
  annules: number;
}

/** Les comptes d'un patient, tels que les signaux les affichent. */
export interface SignalAbsence {
  absences: number;
  termines: number;
  derniereAbsence: string | null;
  niveau: NiveauAbsence;
}

export interface ParametresSuivi extends SeuilsAbsence {
  canalDefaut: "whatsapp" | "sms" | "email";
  modele: string;
}

export const PARAMETRES_DEFAUT: ParametresSuivi = {
  ...SEUILS_DEFAUT,
  canalDefaut: "whatsapp",
  modele: MODELE_AVERTISSEMENT_DEFAUT,
};

/* ===== Lecture des réglages ===== */

interface LigneParametres {
  seuil_bas: number;
  seuil_haut: number;
  taux_haut: number;
  mini_rdv: number;
  periode_mois: number;
  canal_defaut: string;
  modele_message: string;
}

const COLONNES_PARAMETRES =
  "seuil_bas, seuil_haut, taux_haut, mini_rdv, periode_mois, canal_defaut, modele_message";

function versParametres(l: LigneParametres | null): ParametresSuivi {
  if (!l) return PARAMETRES_DEFAUT;
  return {
    seuilBas: Number(l.seuil_bas),
    seuilHaut: Number(l.seuil_haut),
    tauxHaut: Number(l.taux_haut),
    miniRdv: Number(l.mini_rdv),
    periodeMois: Number(l.periode_mois),
    canalDefaut: (l.canal_defaut as ParametresSuivi["canalDefaut"]) ?? "whatsapp",
    modele: l.modele_message || MODELE_AVERTISSEMENT_DEFAUT,
  };
}

/**
 * Les réglages du praticien. Pas de ligne en base = les valeurs par défaut :
 * on n'écrit rien tant que rien n'a été changé, et un praticien qui n'ouvre
 * jamais les paramètres n'a pas de ligne à lui.
 *
 * L'assistant les LIT (la RLS le lui accorde) : il voit les mêmes signaux que
 * le médecin, sinon il lirait des pastilles qui ne veulent pas dire la même
 * chose. Il ne les écrit pas — la policy d'UPDATE est réservée au médecin.
 */
export function useParametresSuivi(medecinId: string | undefined): {
  parametres: ParametresSuivi;
  chargement: boolean;
  recharger: () => void;
} {
  const [etat, setEtat] = useState<{ cle: string; parametres: ParametresSuivi } | null>(null);
  const [version, setVersion] = useState(0);
  const cle = medecinId ? `${medecinId}:${version}` : "";

  useEffect(() => {
    if (!medecinId) return;
    let actif = true;
    (async () => {
      const { data } = await creerClientNavigateur()
        .from("suivi_absence_parametres")
        .select(COLONNES_PARAMETRES)
        .eq("medecin_id", medecinId)
        .maybeSingle<LigneParametres>();
      if (!actif) return;
      setEtat({ cle, parametres: versParametres(data ?? null) });
    })();
    return () => {
      actif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medecinId, version]);

  return {
    parametres: etat?.cle === cle ? etat.parametres : PARAMETRES_DEFAUT,
    chargement: !!medecinId && etat?.cle !== cle,
    recharger: useCallback(() => setVersion((v) => v + 1), []),
  };
}

/**
 * Enregistre les réglages. `upsert` plutôt qu'un insert puis un update : la
 * première modification crée la ligne, les suivantes la remplacent, et
 * l'écran n'a pas à savoir laquelle des deux il fait.
 *
 * Le `.select()` de retour n'est pas décoratif : un UPDATE refusé par la RLS
 * ne lève aucune erreur, il touche zéro ligne. Sans ce contrôle, un
 * assistant verrait « enregistré » sur un réglage jamais parti.
 */
export async function enregistrerParametresSuivi(
  medecinId: string,
  p: ParametresSuivi
): Promise<{ erreur?: string }> {
  const { data, error } = await creerClientNavigateur()
    .from("suivi_absence_parametres")
    .upsert(
      {
        medecin_id: medecinId,
        seuil_bas: p.seuilBas,
        seuil_haut: p.seuilHaut,
        taux_haut: p.tauxHaut,
        mini_rdv: p.miniRdv,
        periode_mois: p.periodeMois,
        canal_defaut: p.canalDefaut,
        modele_message: p.modele,
        maj_le: new Date().toISOString(),
      },
      { onConflict: "medecin_id" }
    )
    .select("medecin_id");
  if (error) return { erreur: error.message };
  if (!data || data.length === 0) {
    return { erreur: "Modification refusée : les seuils relèvent du compte du médecin." };
  }
  return {};
}

/* ===== Les signaux (tableau de bord, fiche patient) ===== */

interface LigneSignal {
  cle: string;
  absences: number;
  termines: number;
  derniere_absence: string | null;
}

/**
 * Les patients signalés du praticien, par clé de dossier.
 *
 * Un seul appel par écran, et une Map : le tableau de bord affiche une
 * dizaine de demandes, la fiche patient en cherche une — ni l'un ni l'autre
 * ne doit interroger la base par patient. Seuls les patients ayant au moins
 * une absence remontent, donc l'absence d'entrée VAUT « aucun signal ».
 *
 * Les réglages sont chargés en même temps : sans eux, le niveau serait celui
 * des valeurs par défaut et la pastille du tableau de bord contredirait
 * celle du menu.
 */
export function useSignauxAbsence(medecinId: string | undefined): {
  signaux: Map<string, SignalAbsence>;
  chargement: boolean;
} {
  const [etat, setEtat] = useState<{ cle: string; signaux: Map<string, SignalAbsence> } | null>(
    null
  );
  const cle = medecinId ?? "";

  useEffect(() => {
    if (!medecinId) return;
    let actif = true;
    (async () => {
      const supabase = creerClientNavigateur();
      const [{ data: lignes }, { data: parametres }] = await Promise.all([
        supabase.rpc("suivi_absence_signaux"),
        supabase
          .from("suivi_absence_parametres")
          .select(COLONNES_PARAMETRES)
          .eq("medecin_id", medecinId)
          .maybeSingle<LigneParametres>(),
      ]);
      if (!actif) return;
      const seuils = versParametres(parametres ?? null);
      const signaux = new Map<string, SignalAbsence>();
      for (const l of (lignes ?? []) as LigneSignal[]) {
        const comptes = { absences: Number(l.absences), termines: Number(l.termines) };
        signaux.set(l.cle, {
          ...comptes,
          derniereAbsence: l.derniere_absence,
          niveau: niveauRisque(comptes, seuils),
        });
      }
      setEtat({ cle, signaux });
    })();
    return () => {
      actif = false;
    };
  }, [medecinId, cle]);

  return {
    signaux: etat?.cle === cle && etat ? etat.signaux : AUCUN_SIGNAL,
    chargement: !!medecinId && etat?.cle !== cle,
  };
}

/** Référence stable : une Map neuve à chaque rendu relancerait les effets. */
const AUCUN_SIGNAL = new Map<string, SignalAbsence>();

/* ===== La liste du menu ===== */

interface LigneListe {
  cle: string;
  type_fiche: TypeFiche;
  nom: string;
  prenom: string;
  telephone: string;
  email: string;
  absences: number;
  termines: number;
  derniere_absence: string | null;
  averti_le: string | null;
  nb_avertissements: number;
  remis_a_zero_le: string | null;
  motif: string | null;
}

interface LigneResume {
  periode_mois: number;
  absences: number;
  termines: number;
  tarif_reference: number | null;
}

interface LigneMois {
  mois: string;
  total: number;
  honores: number;
  absents: number;
  annules: number;
}

/**
 * Tout ce que le menu affiche, en un seul aller-retour groupé : les
 * réglages, la liste des patients concernés, le cumul de la période et la
 * série des six derniers mois.
 *
 * `periodeMois` à `null` laisse la base prendre la période du praticien ;
 * l'écran ne la passe que quand le filtre de période la change, ce qui
 * évite qu'un filtre non touché fige la valeur par défaut d'hier.
 */
export function useSuiviAbsence(
  medecinId: string | undefined,
  periodeMois: number | null = null
): {
  lignes: LigneSuivi[];
  resume: ResumeSuivi | null;
  mois: MoisRdv[];
  parametres: ParametresSuivi;
  chargement: boolean;
  recharger: () => void;
} {
  const [etat, setEtat] = useState<{
    cle: string;
    lignes: LigneSuivi[];
    resume: ResumeSuivi | null;
    mois: MoisRdv[];
    parametres: ParametresSuivi;
  } | null>(null);
  const [version, setVersion] = useState(0);
  const cle = medecinId ? `${medecinId}:${periodeMois ?? "defaut"}:${version}` : "";

  useEffect(() => {
    if (!medecinId) return;
    let actif = true;
    (async () => {
      const supabase = creerClientNavigateur();
      const [{ data: liste }, { data: resume }, { data: serie }, { data: parametres }] =
        await Promise.all([
          supabase.rpc("suivi_absence_liste", { p_mois: periodeMois }),
          supabase.rpc("suivi_absence_resume", { p_mois: periodeMois }),
          supabase.rpc("rdv_mensuel_medecin", { p_mois: 6 }),
          supabase
            .from("suivi_absence_parametres")
            .select(COLONNES_PARAMETRES)
            .eq("medecin_id", medecinId)
            .maybeSingle<LigneParametres>(),
        ]);
      if (!actif) return;

      const seuils = versParametres(parametres ?? null);
      const lignes = ((liste ?? []) as LigneListe[]).map<LigneSuivi>((l) => {
        const comptes = { absences: Number(l.absences), termines: Number(l.termines) };
        return {
          cle: l.cle,
          type: l.type_fiche,
          nom: l.nom,
          prenom: l.prenom,
          telephone: l.telephone,
          email: l.email,
          ...comptes,
          derniereAbsence: l.derniere_absence,
          avertiLe: l.averti_le,
          nbAvertissements: Number(l.nb_avertissements ?? 0),
          remisAZeroLe: l.remis_a_zero_le,
          motif: l.motif,
          niveau: niveauRisque(comptes, seuils),
        };
      });

      const r = (resume ?? [])[0] as LigneResume | undefined;
      setEtat({
        cle,
        lignes,
        resume: r
          ? {
              periodeMois: Number(r.periode_mois),
              absences: Number(r.absences),
              termines: Number(r.termines),
              tarifReference: r.tarif_reference === null ? null : Number(r.tarif_reference),
            }
          : null,
        mois: ((serie ?? []) as LigneMois[]).map((m) => ({
          mois: m.mois,
          total: Number(m.total),
          honores: Number(m.honores),
          absents: Number(m.absents),
          annules: Number(m.annules),
        })),
        parametres: seuils,
      });
    })();
    return () => {
      actif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medecinId, periodeMois, version]);

  const aJour = etat?.cle === cle;
  return {
    lignes: aJour ? etat.lignes : AUCUNE_LIGNE,
    resume: aJour ? etat.resume : null,
    mois: aJour ? etat.mois : AUCUN_MOIS,
    parametres: aJour ? etat.parametres : PARAMETRES_DEFAUT,
    chargement: !!medecinId && !aJour,
    recharger: useCallback(() => setVersion((v) => v + 1), []),
  };
}

const AUCUNE_LIGNE: LigneSuivi[] = [];
const AUCUN_MOIS: MoisRdv[] = [];

/** « 2026-11-01 » → « Nov. » — l'étiquette d'une barre ou d'une comparaison. */
export function moisAbrege(iso: string): string {
  return MOIS_ABREGES[Number(iso.slice(5, 7)) - 1] ?? "";
}

/* ===== La série mensuelle seule (tableau de bord, statistiques) ===== */

/**
 * Les rendez-vous mois par mois. Le tableau de bord et la page Statistiques
 * n'ont pas besoin de la liste des patients — juste des chiffres réels, là
 * où ils affichaient « 96 % » et « 142 RDV » écrits en dur dans le JSX.
 */
export function useRdvMensuels(
  medecinId: string | undefined,
  nbMois = 6
): { mois: MoisRdv[]; chargement: boolean } {
  const [etat, setEtat] = useState<{ cle: string; mois: MoisRdv[] } | null>(null);
  const cle = medecinId ? `${medecinId}:${nbMois}` : "";

  useEffect(() => {
    if (!medecinId) return;
    let actif = true;
    (async () => {
      const { data } = await creerClientNavigateur().rpc("rdv_mensuel_medecin", {
        p_mois: nbMois,
      });
      if (!actif) return;
      setEtat({
        cle,
        mois: ((data ?? []) as LigneMois[]).map((m) => ({
          mois: m.mois,
          total: Number(m.total),
          honores: Number(m.honores),
          absents: Number(m.absents),
          annules: Number(m.annules),
        })),
      });
    })();
    return () => {
      actif = false;
    };
  }, [medecinId, nbMois, cle]);

  return { mois: etat?.cle === cle && etat ? etat.mois : AUCUN_MOIS, chargement: etat?.cle !== cle };
}

/* ===== Les deux gestes ===== */

/**
 * Remise à zéro du compteur — un geste de clémence, pas un effacement.
 *
 * Rien n'est supprimé : la fonction pose une date à partir de laquelle le
 * compteur du patient repart. Ses rendez-vous restent au dossier tels qu'ils
 * ont eu lieu, et le journal d'audit garde qui a fait le geste, quand, et
 * pourquoi si un motif a été donné.
 */
export async function reinitialiserCompteur(
  cle: string,
  motif: string
): Promise<{ erreur?: string }> {
  const { error } = await creerClientNavigateur().rpc("suivi_absence_reinitialiser", {
    p_cle: cle,
    p_motif: motif.trim() || null,
  });
  return error ? { erreur: error.message } : {};
}

export interface ResultatAvertissement {
  previenu: boolean;
  canal: string | null;
  simule: boolean;
  erreurs: string[];
}

/**
 * Envoi d'un rappel de ponctualité.
 *
 * Passe par une route serveur, et pas par le navigateur : l'envoi lit des
 * secrets d'agrégateur et débite le quota du praticien — `lib/messagerie`
 * n'est accessible qu'à la service_role. Même découpage que la route
 * `/api/medecin/rdv/[id]/absent`.
 */
export async function avertirPatient(d: {
  cle: string;
  texte: string;
  canal: "whatsapp" | "sms" | "email";
}): Promise<{ erreur?: string; resultat?: ResultatAvertissement }> {
  const reponse = await fetch("/api/medecin/suivi-absence/avertir", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(d),
  });
  const corps = await reponse.json().catch(() => null);
  if (!reponse.ok) {
    return { erreur: corps?.erreur ?? "L’envoi n’a pas abouti." };
  }
  return { resultat: corps as ResultatAvertissement };
}
