"use client";

import { useEffect, useState } from "react";
import { creerClientNavigateur } from "@/lib/supabase/client";

/*
 * Couche de données de l'espace administrateur : validations, modération,
 * journal d'audit (alimenté par la fonction serveur ecrire_audit), réglages,
 * référentiels, vedettes, annonces, configuration des abonnements.
 * Remplace lib/mock-admin.ts. Chaque décision sensible est tracée en base.
 */

function utiliserRequete<T>(defaut: T, requete: () => Promise<T>, deps: unknown[] = []) {
  const [donnees, setDonnees] = useState<T>(defaut);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let actif = true;
    requete().then((d) => {
      if (actif) setDonnees(d);
    });
    return () => {
      actif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ...deps]);
  return { donnees, recharger: () => setVersion((v) => v + 1) };
}

/** Trace une action sensible dans journal_audit (fonction SECURITY DEFINER). */
export async function tracerAudit(action: string, cible: string): Promise<void> {
  await creerClientNavigateur().rpc("ecrire_audit", {
    p_action: action,
    p_cible_type: null,
    p_cible_id: null,
    p_details: { cible },
  });
}

/* ===== Journal d'audit ===== */

export interface EntreeAudit {
  id: string;
  date: string;
  acteur: string;
  action: string;
  cible: string;
}

export function useJournalAudit(): EntreeAudit[] {
  const { donnees } = utiliserRequete<EntreeAudit[]>([], async () => {
    const { data } = await creerClientNavigateur()
      .from("journal_audit")
      .select("id, action, details, cree_le, utilisateurs ( prenom, nom )")
      .order("cree_le", { ascending: false })
      .limit(100);
    type L = {
      id: string;
      action: string;
      details: { cible?: string } | null;
      cree_le: string;
      utilisateurs: { prenom: string | null; nom: string | null } | null;
    };
    return ((data ?? []) as unknown as L[]).map((l) => ({
      id: l.id,
      date: new Date(l.cree_le).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }),
      acteur: l.utilisateurs ? `Admin · ${l.utilisateurs.prenom ?? l.utilisateurs.nom ?? ""}` : "Système",
      action: l.action,
      cible: l.details?.cible ?? "",
    }));
  });
  return donnees;
}

/* ===== Validations ===== */

export interface DossierValidation {
  id: string;
  nom: string;
  detail: string;
  initiales: string;
  etablissement: boolean;
  /** Documents fournis (médecins) */
  documents?: { id: string; type: string; statut: string }[];
}

export function useMedecinsEnAttente(): { dossiers: DossierValidation[]; recharger: () => void } {
  const { donnees, recharger } = utiliserRequete<DossierValidation[]>([], async () => {
    const supabase = creerClientNavigateur();
    const { data } = await supabase
      .from("medecins")
      .select("id, civilite, utilisateurs ( nom, prenom ), specialites ( nom ), villes ( nom )")
      .eq("statut", "en_attente");
    type L = {
      id: string;
      civilite: string;
      utilisateurs: { nom: string | null; prenom: string | null } | null;
      specialites: { nom: string } | null;
      villes: { nom: string } | null;
    };
    const medecins = (data ?? []) as unknown as L[];
    const { data: docs } = await supabase
      .from("documents_validation")
      .select("id, professionnel_id, type, statut")
      .in("professionnel_id", medecins.map((m) => m.id));
    return medecins.map((m) => {
      const prenom = m.utilisateurs?.prenom ?? "";
      const nom = m.utilisateurs?.nom ?? "";
      return {
        id: m.id,
        nom: `${m.civilite === "Pr" ? "Pr" : "Dr"} ${prenom} ${nom}`.trim(),
        detail: [m.specialites?.nom, m.villes?.nom].filter(Boolean).join(" · "),
        initiales: `${prenom.charAt(0)}${nom.charAt(0)}`.toUpperCase() || "DR",
        etablissement: false,
        documents: (docs ?? []).filter((d) => d.professionnel_id === m.id),
      };
    });
  });
  return { dossiers: donnees, recharger };
}

export function useEtablissementsEnAttente(): { dossiers: DossierValidation[]; recharger: () => void } {
  const { donnees, recharger } = utiliserRequete<DossierValidation[]>([], async () => {
    const { data } = await creerClientNavigateur()
      .from("etablissements")
      .select("id, nom, type, villes ( nom )")
      .eq("statut", "en_attente");
    type L = { id: string; nom: string; type: string; villes: { nom: string } | null };
    return ((data ?? []) as unknown as L[]).map((e) => ({
      id: e.id,
      nom: e.nom,
      detail: [e.type, e.villes?.nom].filter(Boolean).join(" · "),
      initiales: "🏥",
      etablissement: true,
    }));
  });
  return { dossiers: donnees, recharger };
}

export async function deciderDossier(
  dossier: DossierValidation,
  decision: "valide" | "refuse",
  motif?: string
): Promise<{ erreur?: string }> {
  const supabase = creerClientNavigateur();
  const table = dossier.etablissement ? "etablissements" : "medecins";
  const { error } = await supabase.from(table).update({ statut: decision }).eq("id", dossier.id);
  if (error) return { erreur: error.message };
  if (!dossier.etablissement) {
    // La décision couvre aussi les documents fournis
    await supabase
      .from("documents_validation")
      .update({ statut: decision, decide_le: new Date().toISOString() })
      .eq("professionnel_id", dossier.id)
      .eq("statut", "en_attente");
  }
  await tracerAudit(
    decision === "valide"
      ? dossier.etablissement ? "A approuvé un établissement" : "A approuvé un médecin"
      : dossier.etablissement ? "A rejeté un établissement" : "A rejeté un médecin",
    motif ? `${dossier.nom} · ${motif}` : dossier.nom
  );
  return {};
}

export async function demanderComplement(dossier: DossierValidation): Promise<void> {
  await tracerAudit("A demandé un complément de dossier", dossier.nom);
}

/* ===== Modération ===== */

export interface Signalement {
  id: string;
  titre: string;
  detail: string;
  sanction: "Suspendre" | "Avertir";
}

export function useSignalements(): { signalements: Signalement[]; recharger: () => void } {
  const { donnees, recharger } = utiliserRequete<Signalement[]>([], async () => {
    const { data } = await creerClientNavigateur()
      .from("signalements")
      .select("id, motif, cible_type, cree_le, statut")
      .in("statut", ["nouveau", "en_cours"])
      .order("cree_le", { ascending: false });
    return (data ?? []).map((s) => ({
      id: s.id,
      titre: s.motif,
      detail: `${s.cible_type} · signalé le ${new Date(s.cree_le).toLocaleDateString("fr-FR")}`,
      sanction: "Avertir" as const,
    }));
  });
  return { signalements: donnees, recharger };
}

export async function traiterSignalement(
  signalement: Signalement,
  decision: "examiné" | "suspendu" | "averti"
): Promise<void> {
  await creerClientNavigateur()
    .from("signalements")
    .update({ statut: "traite", decision })
    .eq("id", signalement.id);
  const actions = {
    examiné: "A classé un signalement après examen",
    suspendu: "A suspendu un compte",
    averti: "A averti un utilisateur",
  } as const;
  await tracerAudit(actions[decision], signalement.titre);
}

export interface AvisAModerer {
  id: string;
  titre: string;
  etiquette: "Signalé" | "Suspect";
  extrait: string;
}

/**
 * File de modération des avis.
 *
 * Les avis sont publiés dès leur dépôt (modération a posteriori) : la file
 * n'est donc pas alimentée par le statut `en_attente` seul, mais surtout par
 * les avis **signalés**. On remonte les deux, avec une étiquette distincte
 * pour que l'admin sache pourquoi la ligne est là.
 */
export function useAvisAModerer(): { avis: AvisAModerer[]; recharger: () => void } {
  const { donnees, recharger } = utiliserRequete<AvisAModerer[]>([], async () => {
    const supabase = creerClientNavigateur();

    // Avis visés par un signalement encore ouvert.
    const { data: signales } = await supabase
      .from("signalements")
      .select("cible_id")
      .eq("cible_type", "avis")
      .in("statut", ["nouveau", "en_cours"]);
    const idsSignales = new Set(((signales ?? []) as { cible_id: string }[]).map((s) => s.cible_id));

    const { data } = await supabase
      .from("avis")
      .select("id, note, commentaire, statut, medecins ( civilite, utilisateurs ( nom, prenom ) )")
      .or(
        idsSignales.size
          ? `statut.eq.en_attente,id.in.(${[...idsSignales].join(",")})`
          : "statut.eq.en_attente"
      );
    type L = {
      id: string;
      note: number;
      commentaire: string | null;
      statut: string;
      medecins: { civilite: string; utilisateurs: { nom: string | null; prenom: string | null } | null } | null;
    };
    return ((data ?? []) as unknown as L[]).map((a) => {
      const m = a.medecins;
      const nomMedecin = m
        ? `${m.civilite === "Pr" ? "Pr" : "Dr"} ${(m.utilisateurs?.prenom ?? "").charAt(0)}. ${m.utilisateurs?.nom ?? ""}`
        : "";
      return {
        id: a.id,
        titre: `${"★".repeat(a.note)}${"☆".repeat(5 - a.note)} — sur ${nomMedecin}`,
        etiquette: idsSignales.has(a.id) ? ("Signalé" as const) : ("Suspect" as const),
        extrait: a.commentaire ? `« ${a.commentaire} »` : "(sans commentaire)",
      };
    });
  });
  return { avis: donnees, recharger };
}

export async function modererAvis(
  avis: AvisAModerer,
  decision: "conservé" | "masqué" | "supprimé"
): Promise<void> {
  const supabase = creerClientNavigateur();
  if (decision === "supprimé") {
    await supabase.from("avis").delete().eq("id", avis.id);
  } else {
    await supabase.from("avis").update({ statut: decision === "conservé" ? "publie" : "rejete" }).eq("id", avis.id);
  }
  // La décision clôt aussi le signalement qui avait fait remonter l'avis :
  // sinon la ligne resterait indéfiniment dans la file.
  await supabase
    .from("signalements")
    .update({ statut: "traite", decision })
    .eq("cible_type", "avis")
    .eq("cible_id", avis.id)
    .in("statut", ["nouveau", "en_cours"]);
  const actions = {
    conservé: "A conservé un avis",
    masqué: "A masqué un avis",
    supprimé: "A supprimé un avis",
  } as const;
  await tracerAudit(actions[decision], avis.titre);
}

/* ===== Réglages de la plateforme ===== */

export interface ReglagesPlateforme {
  inscriptionsOuvertes: boolean;
  paiementEnLigne: boolean;
  modeMaintenance: boolean;
}

const CLES_REGLAGES: Record<keyof ReglagesPlateforme, string> = {
  inscriptionsOuvertes: "inscriptions_ouvertes",
  paiementEnLigne: "paiement_en_ligne",
  modeMaintenance: "mode_maintenance",
};

const LIBELLES_REGLAGES: Record<keyof ReglagesPlateforme, string> = {
  inscriptionsOuvertes: "Inscriptions médecins ouvertes",
  paiementEnLigne: "Paiement en ligne",
  modeMaintenance: "Mode maintenance",
};

export function useReglagesPlateforme(): {
  reglages: ReglagesPlateforme;
  basculer: (cle: keyof ReglagesPlateforme, valeur: boolean) => Promise<void>;
} {
  const { donnees, recharger } = utiliserRequete<ReglagesPlateforme>(
    { inscriptionsOuvertes: true, paiementEnLigne: true, modeMaintenance: false },
    async () => {
      const { data } = await creerClientNavigateur().from("parametres_plateforme").select("cle, valeur");
      const map = new Map((data ?? []).map((r) => [r.cle, r.valeur]));
      return {
        inscriptionsOuvertes: map.get("inscriptions_ouvertes") ?? true,
        paiementEnLigne: map.get("paiement_en_ligne") ?? true,
        modeMaintenance: map.get("mode_maintenance") ?? false,
      };
    }
  );

  async function basculer(cle: keyof ReglagesPlateforme, valeur: boolean) {
    await creerClientNavigateur()
      .from("parametres_plateforme")
      .update({ valeur })
      .eq("cle", CLES_REGLAGES[cle]);
    await tracerAudit("A modifié un réglage", `${LIBELLES_REGLAGES[cle]} · ${valeur ? "ON" : "OFF"}`);
    recharger();
  }

  return { reglages: donnees, basculer };
}

/* ===== Référentiels (spécialités, villes, assurances) ===== */

export type CleListeContenu = "specialites" | "villes" | "assurances";

const COLONNE_LIBELLE: Record<CleListeContenu, string> = {
  specialites: "nom",
  villes: "nom",
  assurances: "libelle",
};

export function useListeContenu(cle: CleListeContenu): { liste: string[]; recharger: () => void } {
  const { donnees, recharger } = utiliserRequete<string[]>([], async () => {
    const colonne = COLONNE_LIBELLE[cle];
    const { data } = await creerClientNavigateur().from(cle).select(colonne).order(colonne);
    return ((data ?? []) as unknown as Record<string, string>[]).map((r) => r[colonne]);
  }, [cle]);
  return { liste: donnees, recharger };
}

export async function ajouterAListeContenu(cle: CleListeContenu, valeur: string): Promise<void> {
  await creerClientNavigateur()
    .from(cle)
    .insert(cle === "assurances" ? { libelle: valeur } : { nom: valeur });
  await tracerAudit("A ajouté une entrée de référentiel", `${cle} · ${valeur}`);
}

/* ===== Vedettes ===== */

export interface Vedette {
  id: string;
  nom: string;
  detail: string;
  actif: boolean;
}

export function useVedettes(): { vedettes: Vedette[]; recharger: () => void } {
  const { donnees, recharger } = utiliserRequete<Vedette[]>([], async () => {
    const { data } = await creerClientNavigateur()
      .from("medecins")
      .select("id, civilite, en_vedette, utilisateurs ( nom, prenom ), specialites ( nom ), villes ( nom )")
      .eq("statut", "valide");
    type L = {
      id: string;
      civilite: string;
      en_vedette: boolean;
      utilisateurs: { nom: string | null; prenom: string | null } | null;
      specialites: { nom: string } | null;
      villes: { nom: string } | null;
    };
    return ((data ?? []) as unknown as L[]).map((m) => ({
      id: m.id,
      nom: `${m.civilite === "Pr" ? "Pr" : "Dr"} ${m.utilisateurs?.prenom ?? ""} ${m.utilisateurs?.nom ?? ""}`.trim(),
      detail: [m.specialites?.nom, m.villes?.nom].filter(Boolean).join(" · "),
      actif: m.en_vedette,
    }));
  });
  return { vedettes: donnees, recharger };
}

export async function basculerVedette(id: string, actif: boolean): Promise<void> {
  await creerClientNavigateur().from("medecins").update({ en_vedette: actif }).eq("id", id);
  await tracerAudit(actif ? "A mis un médecin en vedette" : "A retiré un médecin des vedettes", id);
}

/* ===== Annonces ===== */

export interface Annonce {
  id: string;
  message: string;
  detail: string;
}

export function useAnnonces(): { annonces: Annonce[]; recharger: () => void } {
  const { donnees, recharger } = utiliserRequete<Annonce[]>([], async () => {
    const { data } = await creerClientNavigateur()
      .from("annonces")
      .select("id, message, segment, canaux, date_envoi, statut")
      .order("cree_le", { ascending: false });
    return (data ?? []).map((a) => ({
      id: a.id,
      message: a.message,
      detail: `${a.segment} · ${a.date_envoi ? new Date(a.date_envoi).toLocaleDateString("fr-FR") : a.statut} · ${(a.canaux ?? []).join(" + ")}`,
    }));
  });
  return { annonces: donnees, recharger };
}

export async function envoyerAnnonce(message: string, segment: string, canaux: string[]): Promise<{ erreur?: string }> {
  const { error } = await creerClientNavigateur().from("annonces").insert({
    message,
    segment,
    canaux,
    statut: "envoyee",
    date_envoi: new Date().toISOString(),
  });
  if (error) return { erreur: error.message };
  await tracerAudit("A envoyé une annonce", `${segment} · ${canaux.join(" + ")}`);
  return {};
}

/* ===== Équipe admin (sous-rôles, spec C.7.10) ===== */

export interface AdminEquipe {
  id: string;
  nom: string;
  email: string;
  sousRoles: string[];
}

export function useEquipeAdmin(): { admins: AdminEquipe[]; recharger: () => void } {
  const { donnees, recharger } = utiliserRequete<AdminEquipe[]>([], async () => {
    const { data } = await creerClientNavigateur()
      .from("utilisateurs")
      .select("id, nom, prenom, email, sous_roles_admin")
      .eq("role", "admin");
    return (data ?? []).map((u) => ({
      id: u.id,
      nom: `${u.prenom ?? ""} ${u.nom ?? ""}`.trim() || u.email,
      email: u.email,
      sousRoles: u.sous_roles_admin ?? [],
    }));
  });
  return { admins: donnees, recharger };
}

export async function majSousRoles(adminId: string, sousRoles: string[]): Promise<{ erreur?: string }> {
  const { error } = await creerClientNavigateur()
    .from("utilisateurs")
    .update({ sous_roles_admin: sousRoles })
    .eq("id", adminId);
  if (!error) await tracerAudit("A modifié les sous-rôles d'un admin", sousRoles.join(", ") || "aucun");
  return error ? { erreur: error.message } : {};
}

/* ===== Configuration des abonnements (tarifs_plateforme) ===== */

export interface LigneTarif {
  formule: string;
  prixMensuel: number;
  prixAnnuel: number;
  essaiJours: number;
}

export function useConfigAbonnements(): {
  tarifs: LigneTarif[];
  enregistrer: (formule: string, d: Partial<LigneTarif>) => Promise<{ erreur?: string }>;
  recharger: () => void;
} {
  const { donnees, recharger } = utiliserRequete<LigneTarif[]>([], async () => {
    const { data } = await creerClientNavigateur().from("tarifs_plateforme").select("*").order("prix_mensuel");
    return (data ?? []).map((t) => ({
      formule: t.formule,
      prixMensuel: t.prix_mensuel,
      prixAnnuel: t.prix_annuel,
      essaiJours: t.essai_jours,
    }));
  });

  async function enregistrer(formule: string, d: Partial<LigneTarif>): Promise<{ erreur?: string }> {
    const maj: Record<string, unknown> = {};
    if (d.prixMensuel !== undefined) maj.prix_mensuel = d.prixMensuel;
    if (d.prixAnnuel !== undefined) maj.prix_annuel = d.prixAnnuel;
    if (d.essaiJours !== undefined) maj.essai_jours = d.essaiJours;
    const { error } = await creerClientNavigateur().from("tarifs_plateforme").update(maj).eq("formule", formule);
    if (!error) {
      await tracerAudit("A modifié la configuration des abonnements", `Formule ${formule}`);
      recharger();
    }
    return error ? { erreur: error.message } : {};
  }

  return { tarifs: donnees, enregistrer, recharger };
}

/** Compteurs financiers réels — pas de paiement en ligne actif pour l'instant,
 * donc seuls les abonnements (payés hors-ligne, suivis manuellement) sont réels. */
export interface CompteursFinances {
  abonnementsActifs: number;
}

export function useCompteursFinances(): CompteursFinances {
  const { donnees } = utiliserRequete<CompteursFinances>({ abonnementsActifs: 0 }, async () => {
    const { count } = await creerClientNavigateur()
      .from("abonnements")
      .select("id", { count: "exact", head: true })
      .eq("statut", "actif");
    return { abonnementsActifs: count ?? 0 };
  });
  return donnees;
}

/* ===== Remboursements & litiges =====
 * Le paiement en ligne n'est pas encore actif (consultations réglées sur
 * place) : il n'existe donc pas encore de transactions à rembourser en base.
 * La liste reste vide jusqu'au branchement du paiement (Orange Money / MoMo).
 */

export interface Remboursement {
  id: string;
  titre: string;
  detail: string;
  initiales: string;
  gradient: string;
}

export function useRemboursements(): Remboursement[] {
  return [];
}

export async function validerRemboursement(remboursement: Remboursement): Promise<void> {
  await tracerAudit("A validé un remboursement", remboursement.titre);
}

/** Lecture/écriture de réglages booléens arbitraires (parametres_plateforme). */
export async function lireReglagesBool(cles: string[]): Promise<Record<string, boolean>> {
  const { data } = await creerClientNavigateur()
    .from("parametres_plateforme")
    .select("cle, valeur")
    .in("cle", cles);
  return Object.fromEntries((data ?? []).map((r) => [r.cle, r.valeur]));
}

export async function ecrireReglageBool(cle: string, valeur: boolean): Promise<void> {
  await creerClientNavigateur().from("parametres_plateforme").upsert({ cle, valeur });
}

/* ===== Compteurs du tableau de bord ===== */

export interface CompteursAdmin {
  medecinsEnAttente: number;
  etablissementsEnAttente: number;
  signalements: number;
  avisAModerer: number;
  utilisateurs: number;
  medecinsValides: number;
  rdvCeMois: number;
}

export function useCompteursAdmin(): CompteursAdmin {
  const { donnees } = utiliserRequete<CompteursAdmin>(
    { medecinsEnAttente: 0, etablissementsEnAttente: 0, signalements: 0, avisAModerer: 0, utilisateurs: 0, medecinsValides: 0, rdvCeMois: 0 },
    async () => {
      const supabase = creerClientNavigateur();
      const debutMois = new Date();
      debutMois.setDate(1);
      const debutMoisISO = debutMois.toISOString().slice(0, 10);
      const [m, e, s, a, avisSignales, u, mv, rdv] = await Promise.all([
        supabase.from("medecins").select("id", { count: "exact", head: true }).eq("statut", "en_attente"),
        supabase.from("etablissements").select("id", { count: "exact", head: true }).eq("statut", "en_attente"),
        supabase.from("signalements").select("id", { count: "exact", head: true }).in("statut", ["nouveau", "en_cours"]),
        supabase.from("avis").select("id", { count: "exact", head: true }).eq("statut", "en_attente"),
        // Même règle que `useAvisAModerer` : les avis étant publiés d'emblée,
        // la file se compose surtout des avis signalés. `signalements` n'a pas
        // de FK vers `avis` (cible polymorphe) : pas de jointure possible, on
        // compte les signalements ouverts qui visent un avis.
        supabase
          .from("signalements")
          .select("id", { count: "exact", head: true })
          .eq("cible_type", "avis")
          .in("statut", ["nouveau", "en_cours"]),
        supabase.from("utilisateurs").select("id", { count: "exact", head: true }),
        supabase.from("medecins").select("id", { count: "exact", head: true }).eq("statut", "valide"),
        supabase.from("rendez_vous").select("id", { count: "exact", head: true }).gte("date", debutMoisISO),
      ]);
      return {
        medecinsEnAttente: m.count ?? 0,
        etablissementsEnAttente: e.count ?? 0,
        signalements: s.count ?? 0,
        avisAModerer: (a.count ?? 0) + (avisSignales.count ?? 0),
        utilisateurs: u.count ?? 0,
        medecinsValides: mv.count ?? 0,
        rdvCeMois: rdv.count ?? 0,
      };
    }
  );
  return donnees;
}

/** Nombre d'inscriptions par mois sur les 6 derniers mois (croissance). */
export interface MoisCroissance {
  mois: string;
  total: number;
}

export function useCroissanceInscriptions(): MoisCroissance[] {
  const { donnees } = utiliserRequete<MoisCroissance[]>([], async () => {
    const debut = new Date();
    debut.setMonth(debut.getMonth() - 5, 1);
    debut.setHours(0, 0, 0, 0);
    const { data } = await creerClientNavigateur()
      .from("utilisateurs")
      .select("cree_le")
      .gte("cree_le", debut.toISOString());
    const noms = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];
    const mois: MoisCroissance[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i, 1);
      mois.push({ mois: noms[d.getMonth()], total: 0 });
    }
    for (const u of data ?? []) {
      const d = new Date(u.cree_le);
      const idx = mois.findIndex((m, i) => {
        const ref = new Date();
        ref.setMonth(ref.getMonth() - (5 - i), 1);
        return d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear();
      });
      if (idx >= 0) mois[idx].total++;
    }
    return mois;
  });
  return donnees;
}

/* ===== Utilisateurs (liste) ===== */

export interface UtilisateurAdmin {
  id: string;
  nom: string;
  email: string;
  role: string;
  statut: string;
  creeLe: string;
}

export function useUtilisateurs(): { utilisateurs: UtilisateurAdmin[]; recharger: () => void } {
  const { donnees, recharger } = utiliserRequete<UtilisateurAdmin[]>([], async () => {
    const { data } = await creerClientNavigateur()
      .from("utilisateurs")
      .select("id, nom, prenom, email, role, statut, cree_le")
      .order("cree_le", { ascending: false })
      .limit(200);
    return (data ?? []).map((u) => ({
      id: u.id,
      nom: `${u.prenom ?? ""} ${u.nom ?? ""}`.trim() || u.email,
      email: u.email,
      role: u.role,
      statut: u.statut,
      creeLe: new Date(u.cree_le).toLocaleDateString("fr-FR"),
    }));
  });
  return { utilisateurs: donnees, recharger };
}

export async function majStatutUtilisateur(id: string, statut: "actif" | "suspendu"): Promise<{ erreur?: string }> {
  const { error } = await creerClientNavigateur().from("utilisateurs").update({ statut }).eq("id", id);
  if (!error) await tracerAudit(statut === "suspendu" ? "A suspendu un compte" : "A réactivé un compte", id);
  return error ? { erreur: error.message } : {};
}
