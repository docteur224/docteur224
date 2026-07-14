"use client";

import { useEffect, useState } from "react";
import { creerClientNavigateur } from "@/lib/supabase/client";
import {
  chargerMedecinParId,
  HEURES_JOURNEE,
  statutCreneau,
  type EtatCreneau,
  type MedecinAvecPlages,
} from "@/lib/donnees";
import { versISO } from "@/lib/dates";

/*
 * Couche de données de l'espace professionnel (médecin ET assistant) :
 * agenda réel, gestion des créneaux (exceptions en base), patients du
 * cabinet, équipe/permissions, abonnement, réservation déléguée.
 * Toutes les écritures passent par Supabase ; la RLS garantit le
 * cloisonnement (un assistant n'agit que selon ses permissions).
 */

export interface PermissionsAssistante {
  voirAgenda: boolean;
  confirmerAnnuler: boolean;
  reprogrammer: boolean;
  creerRdv: boolean;
  messagerie: boolean;
  gererCreneaux: boolean;
}

export interface ContextePro {
  chargement: boolean;
  /** Rôle réel du compte connecté */
  role: "medecin" | "assistant" | null;
  /** Médecin concerné (lui-même, ou celui auquel l'assistant est rattaché) */
  medecin: MedecinAvecPlages | null;
  /** Permissions (toutes vraies pour un médecin) */
  permissions: PermissionsAssistante;
  /** Nom/prénom du compte connecté (pour l'en-tête) */
  utilisateur: { nom: string; prenom: string } | null;
}

const TOUTES_PERMISSIONS: PermissionsAssistante = {
  voirAgenda: true,
  confirmerAnnuler: true,
  reprogrammer: true,
  creerRdv: true,
  messagerie: true,
  gererCreneaux: true,
};

const AUCUNE_PERMISSION: PermissionsAssistante = {
  voirAgenda: false,
  confirmerAnnuler: false,
  reprogrammer: false,
  creerRdv: false,
  messagerie: false,
  gererCreneaux: false,
};

export function useContextePro(): ContextePro {
  const [ctx, setCtx] = useState<ContextePro>({
    chargement: true,
    role: null,
    medecin: null,
    permissions: AUCUNE_PERMISSION,
    utilisateur: null,
  });

  useEffect(() => {
    let actif = true;
    (async () => {
      const supabase = creerClientNavigateur();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        if (actif) setCtx((c) => ({ ...c, chargement: false }));
        return;
      }
      const { data: u } = await supabase
        .from("utilisateurs")
        .select("role, nom, prenom")
        .eq("id", auth.user.id)
        .single();
      if (!u || (u.role !== "medecin" && u.role !== "assistant")) {
        if (actif) setCtx((c) => ({ ...c, chargement: false }));
        return;
      }
      let medecinId = auth.user.id;
      let permissions = TOUTES_PERMISSIONS;
      if (u.role === "assistant") {
        const { data: a } = await supabase
          .from("assistants")
          .select("medecin_id, peut_voir_agenda, peut_confirmer_annuler, peut_reprogrammer, peut_creer_rdv, peut_messagerie, peut_gerer_creneaux")
          .eq("id", auth.user.id)
          .single();
        if (!a) {
          if (actif) setCtx((c) => ({ ...c, chargement: false }));
          return;
        }
        medecinId = a.medecin_id;
        permissions = {
          voirAgenda: a.peut_voir_agenda,
          confirmerAnnuler: a.peut_confirmer_annuler,
          reprogrammer: a.peut_reprogrammer,
          creerRdv: a.peut_creer_rdv,
          messagerie: a.peut_messagerie,
          gererCreneaux: a.peut_gerer_creneaux,
        };
      }
      const medecin = (await chargerMedecinParId(medecinId)) ?? null;
      if (actif) {
        setCtx({
          chargement: false,
          role: u.role,
          medecin,
          permissions,
          utilisateur: { nom: u.nom ?? "", prenom: u.prenom ?? "" },
        });
      }
    })();
    return () => {
      actif = false;
    };
  }, []);

  return ctx;
}

/* ===== Agenda du médecin (créneaux + rendez-vous réels) ===== */

export interface CreneauAgenda {
  heure: string;
  statut: EtatCreneau;
  rdvId?: string;
  patient?: string;
  motif?: string;
  statutRdv?: "en_attente" | "confirme" | "annule" | "honore";
}

interface LigneRdvPro {
  id: string;
  date: string;
  heure: string;
  motif: string | null;
  statut: "en_attente" | "confirme" | "annule" | "honore";
  patient_id: string | null;
  proche_id: string | null;
  patient_sans_compte_id: string | null;
  patients: { utilisateurs: { nom: string | null; prenom: string | null } | null } | null;
  proches: { nom: string; prenom: string } | null;
  patients_sans_compte: { nom: string; prenom: string } | null;
}

const SELECTION_RDV_PRO = `
  id, date, heure, motif, statut, patient_id, proche_id, patient_sans_compte_id,
  patients ( utilisateurs ( nom, prenom ) ),
  proches ( nom, prenom ),
  patients_sans_compte ( nom, prenom )
`;

function nomBeneficiaire(l: LigneRdvPro): string {
  if (l.proches) return `${l.proches.prenom} ${l.proches.nom}`;
  if (l.patients_sans_compte) return `${l.patients_sans_compte.prenom} ${l.patients_sans_compte.nom}`;
  const u = l.patients?.utilisateurs;
  if (u) return `${u.prenom ?? ""} ${u.nom ?? ""}`.trim();
  return "Patient";
}

export function useAgenda(medecinId: string | undefined, joursAvance = 30): {
  chargement: boolean;
  creneauxJour: (dateISO: string) => CreneauAgenda[];
  rdvs: (LigneRdvPro & { beneficiaire: string })[];
  recharger: () => void;
} {
  const [chargement, setChargement] = useState(true);
  const [plages, setPlages] = useState<{ jour_semaine: number; heure_debut: string; heure_fin: string }[]>([]);
  const [exceptions, setExceptions] = useState<Map<string, EtatCreneau>>(new Map());
  const [rdvs, setRdvs] = useState<(LigneRdvPro & { beneficiaire: string })[]>([]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!medecinId) return;
    let actif = true;
    setChargement(true);
    const supabase = creerClientNavigateur();
    const debut = versISO(new Date(Date.now() - 90 * 86400000));
    const fin = versISO(new Date(Date.now() + joursAvance * 86400000));
    Promise.all([
      supabase.from("horaires_types").select("jour_semaine, heure_debut, heure_fin").eq("medecin_id", medecinId),
      supabase.from("creneaux_exceptions").select("date, heure, etat").eq("medecin_id", medecinId).gte("date", debut).lte("date", fin),
      supabase.from("rendez_vous").select(SELECTION_RDV_PRO).eq("medecin_id", medecinId).gte("date", debut).lte("date", fin).order("date").order("heure"),
    ]).then(([p, e, r]) => {
      if (!actif) return;
      setPlages(p.data ?? []);
      const map = new Map<string, EtatCreneau>();
      for (const x of e.data ?? []) map.set(`${x.date}|${x.heure.slice(0, 5)}`, x.etat as EtatCreneau);
      setExceptions(map);
      setRdvs(((r.data ?? []) as unknown as LigneRdvPro[]).map((l) => ({ ...l, heure: l.heure.slice(0, 5), beneficiaire: nomBeneficiaire(l) })));
      setChargement(false);
    });
    return () => {
      actif = false;
    };
  }, [medecinId, joursAvance, version]);

  const creneauxJour = (dateISO: string): CreneauAgenda[] =>
    HEURES_JOURNEE.map((heure) => {
      const rdv = rdvs.find((r) => r.date === dateISO && r.heure === heure && r.statut !== "annule");
      if (rdv) {
        return {
          heure,
          statut: "reserve" as EtatCreneau,
          rdvId: rdv.id,
          patient: rdv.beneficiaire,
          motif: rdv.motif ?? "Consultation",
          statutRdv: rdv.statut,
        };
      }
      return { heure, statut: statutCreneau(plages, exceptions, dateISO, heure) };
    });

  return { chargement, creneauxJour, rdvs, recharger: () => setVersion((v) => v + 1) };
}

/** Bascule ouvert ↔ fermé d'un créneau (règle C.4.3 : un réservé est verrouillé). */
export async function basculerCreneau(
  medecinId: string,
  dateISO: string,
  heure: string,
  statutActuel: EtatCreneau
): Promise<{ erreur?: string }> {
  if (statutActuel === "reserve") return { erreur: "Créneau réservé — annulez d'abord le rendez-vous." };
  const nouveau = statutActuel === "ouvert" ? "ferme" : "ouvert";
  const { error } = await creerClientNavigateur()
    .from("creneaux_exceptions")
    .upsert(
      { medecin_id: medecinId, date: dateISO, heure, etat: nouveau },
      { onConflict: "medecin_id,date,heure" }
    );
  return error ? { erreur: error.message } : {};
}

export async function majStatutRdv(
  rdvId: string,
  statut: "confirme" | "annule" | "honore" | "en_attente"
): Promise<{ erreur?: string }> {
  const { error } = await creerClientNavigateur().from("rendez_vous").update({ statut }).eq("id", rdvId);
  return error ? { erreur: error.message } : {};
}

export async function reprogrammerRdv(rdvId: string, date: string, heure: string): Promise<{ erreur?: string }> {
  const { error } = await creerClientNavigateur().from("rendez_vous").update({ date, heure }).eq("id", rdvId);
  return error ? { erreur: error.message } : {};
}

/* ===== Patients du cabinet ===== */

export interface PatientCabinet {
  id: string;
  type: "compte" | "proche" | "sans_compte";
  prenom: string;
  nom: string;
  telephone: string;
  derniereVisite: string;
  gradient: string;
}

const GRADIENTS = [
  "linear-gradient(135deg,#2E9CCA,#15506B)",
  "linear-gradient(135deg,#E08E45,#C0392B)",
  "linear-gradient(135deg,#1E7B45,#15506B)",
  "linear-gradient(135deg,#7A5BB5,#15506B)",
  "linear-gradient(135deg,#16A085,#0E6655)",
];

const gradientPour = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return GRADIENTS[Math.abs(h) % GRADIENTS.length];
};

export function usePatientsCabinet(medecinId: string | undefined): { patients: PatientCabinet[]; recharger: () => void } {
  const [patients, setPatients] = useState<PatientCabinet[]>([]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!medecinId) return;
    let actif = true;
    (async () => {
      const supabase = creerClientNavigateur();
      const [{ data: rdvs }, { data: sansCompte }] = await Promise.all([
        supabase
          .from("rendez_vous")
          .select(`date, patient_id, proche_id, patient_sans_compte_id,
                   patients ( id, utilisateurs ( nom, prenom, telephone ) ),
                   proches ( id, nom, prenom )`)
          .eq("medecin_id", medecinId)
          .order("date", { ascending: false }),
        supabase.from("patients_sans_compte").select("id, nom, prenom, telephone, cree_le").eq("medecin_id", medecinId),
      ]);
      if (!actif) return;
      const vus = new Map<string, PatientCabinet>();
      type U = { nom: string | null; prenom: string | null; telephone: string | null };
      type Pa = { id: string; utilisateurs: U | null };
      type P = { id: string; nom: string; prenom: string };
      for (const r of (rdvs ?? []) as unknown as { date: string; patients: Pa | null; proches: P | null }[]) {
        const pa = r.patients;
        const p = r.proches;
        const cle = pa ? `c-${pa.id}` : p ? `p-${p.id}` : null;
        if (!cle || vus.has(cle)) continue;
        vus.set(cle, {
          id: cle,
          type: pa ? "compte" : "proche",
          prenom: (pa ? pa.utilisateurs?.prenom : p?.prenom) ?? "",
          nom: (pa ? pa.utilisateurs?.nom : p?.nom) ?? "",
          telephone: pa?.utilisateurs?.telephone ?? "",
          derniereVisite: r.date,
          gradient: gradientPour(cle),
        });
      }
      for (const s of sansCompte ?? []) {
        vus.set(`s-${s.id}`, {
          id: `s-${s.id}`,
          type: "sans_compte",
          prenom: s.prenom,
          nom: s.nom,
          telephone: s.telephone ?? "",
          derniereVisite: "Fiche cabinet",
          gradient: gradientPour(s.id),
        });
      }
      setPatients([...vus.values()]);
    })();
    return () => {
      actif = false;
    };
  }, [medecinId, version]);

  return { patients, recharger: () => setVersion((v) => v + 1) };
}

/* ===== Réservation déléguée (spec C.2.3) ===== */

export async function creerRdvDelegue(d: {
  medecinId: string;
  date: string;
  heure: string;
  motif: string;
  source: "cabinet" | "telephone";
  /** Patient existant : id préfixé (c-… compte, p-… proche, s-… sans compte) */
  patientCle?: string;
  /** Fiche minimale à créer (patient sans compte) */
  nouvelleFiche?: { nom: string; prenom: string; telephone: string };
}): Promise<{ erreur?: string }> {
  const supabase = creerClientNavigateur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { erreur: "Session expirée." };
  const { data: u } = await supabase.from("utilisateurs").select("role").eq("id", auth.user.id).single();
  const role = u?.role === "assistant" ? "assistant" : u?.role === "admin" ? "admin" : "medecin";

  let patient_id: string | null = null;
  let proche_id: string | null = null;
  let patient_sans_compte_id: string | null = null;

  if (d.nouvelleFiche) {
    const { data: fiche, error: eFiche } = await supabase
      .from("patients_sans_compte")
      .insert({ medecin_id: d.medecinId, ...d.nouvelleFiche })
      .select("id")
      .single();
    if (eFiche) return { erreur: eFiche.message };
    patient_sans_compte_id = fiche.id;
  } else if (d.patientCle) {
    const [type, ...reste] = d.patientCle.split("-");
    const id = reste.join("-");
    if (type === "c") patient_id = id;
    else if (type === "p") proche_id = id;
    else patient_sans_compte_id = id;
  } else {
    return { erreur: "Choisissez un patient ou créez une fiche." };
  }

  const { error } = await supabase.from("rendez_vous").insert({
    medecin_id: d.medecinId,
    date: d.date,
    heure: d.heure,
    reserve_par: auth.user.id,
    reserve_par_role: role,
    patient_id,
    proche_id,
    patient_sans_compte_id,
    motif: d.motif || null,
    statut: "confirme", // pris directement par le cabinet
    source: d.source,
  });
  if (error) {
    if (error.code === "23505") return { erreur: "Ce créneau vient d'être réservé." };
    return { erreur: error.message };
  }
  return {};
}

/* ===== Équipe (assistants) et permissions ===== */

export interface AssistantEquipe {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  permissions: PermissionsAssistante;
}

const COLONNES_PERMISSION: Record<keyof PermissionsAssistante, string> = {
  voirAgenda: "peut_voir_agenda",
  confirmerAnnuler: "peut_confirmer_annuler",
  reprogrammer: "peut_reprogrammer",
  creerRdv: "peut_creer_rdv",
  messagerie: "peut_messagerie",
  gererCreneaux: "peut_gerer_creneaux",
};

export function useEquipe(medecinId: string | undefined): { assistants: AssistantEquipe[]; recharger: () => void } {
  const [assistants, setAssistants] = useState<AssistantEquipe[]>([]);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!medecinId) return;
    let actif = true;
    creerClientNavigateur()
      .from("assistants")
      .select(`id, peut_voir_agenda, peut_confirmer_annuler, peut_reprogrammer, peut_creer_rdv,
               peut_messagerie, peut_gerer_creneaux, utilisateurs ( nom, prenom, email )`)
      .eq("medecin_id", medecinId)
      .then(({ data }) => {
        if (!actif) return;
        type L = {
          id: string;
          peut_voir_agenda: boolean; peut_confirmer_annuler: boolean; peut_reprogrammer: boolean;
          peut_creer_rdv: boolean; peut_messagerie: boolean; peut_gerer_creneaux: boolean;
          utilisateurs: { nom: string | null; prenom: string | null; email: string } | null;
        };
        setAssistants(((data ?? []) as unknown as L[]).map((a) => ({
          id: a.id,
          nom: a.utilisateurs?.nom ?? "",
          prenom: a.utilisateurs?.prenom ?? "",
          email: a.utilisateurs?.email ?? "",
          permissions: {
            voirAgenda: a.peut_voir_agenda,
            confirmerAnnuler: a.peut_confirmer_annuler,
            reprogrammer: a.peut_reprogrammer,
            creerRdv: a.peut_creer_rdv,
            messagerie: a.peut_messagerie,
            gererCreneaux: a.peut_gerer_creneaux,
          },
        })));
      });
    return () => {
      actif = false;
    };
  }, [medecinId, version]);
  return { assistants, recharger: () => setVersion((v) => v + 1) };
}

export async function majPermissionAssistant(
  assistantId: string,
  cle: keyof PermissionsAssistante,
  valeur: boolean
): Promise<{ erreur?: string }> {
  const { error } = await creerClientNavigateur()
    .from("assistants")
    .update({ [COLONNES_PERMISSION[cle]]: valeur })
    .eq("id", assistantId);
  return error ? { erreur: error.message } : {};
}

/* ===== Abonnement ===== */

export interface AbonnementCourant {
  formule: string;
  periode: string;
  statut: string;
  dateFin: string | null;
  quotaSms: number;
}

export interface TarifFormule {
  formule: string;
  prixMensuel: number;
  prixAnnuel: number;
  quotaSms: number;
  essaiJours: number;
}

export function useAbonnement(): {
  abonnement: AbonnementCourant | null;
  tarifs: TarifFormule[];
  changerFormule: (formule: string, periode: string) => Promise<{ erreur?: string }>;
  recharger: () => void;
} {
  const [abonnement, setAbonnement] = useState<AbonnementCourant | null>(null);
  const [tarifs, setTarifs] = useState<TarifFormule[]>([]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let actif = true;
    (async () => {
      const supabase = creerClientNavigateur();
      const [{ data: abos }, { data: t }] = await Promise.all([
        supabase.from("abonnements").select("*").order("date_debut", { ascending: false }).limit(1),
        supabase.from("tarifs_plateforme").select("*"),
      ]);
      if (!actif) return;
      const a = abos?.[0];
      setAbonnement(
        a
          ? { formule: a.formule, periode: a.periode, statut: a.statut, dateFin: a.date_fin, quotaSms: a.quota_sms }
          : null
      );
      setTarifs((t ?? []).map((x) => ({
        formule: x.formule,
        prixMensuel: x.prix_mensuel,
        prixAnnuel: x.prix_annuel,
        quotaSms: x.quota_sms,
        essaiJours: x.essai_jours,
      })));
    })();
    return () => {
      actif = false;
    };
  }, [version]);

  async function changerFormule(formule: string, periode: string): Promise<{ erreur?: string }> {
    const supabase = creerClientNavigateur();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { erreur: "Session expirée." };
    const { data: u } = await supabase.from("utilisateurs").select("role").eq("id", auth.user.id).single();
    const tarif = tarifs.find((t) => t.formule === formule);
    const dateFin = new Date(Date.now() + (periode === "annuel" ? 365 : 30) * 86400000);
    // Remplace l'abonnement courant (pas d'historique de facturation pour l'instant)
    const { data: existants } = await supabase.from("abonnements").select("id").eq("titulaire_id", auth.user.id);
    let error;
    if (existants && existants.length > 0) {
      ({ error } = await supabase
        .from("abonnements")
        .update({ formule, periode, statut: "actif", date_fin: versISO(dateFin), quota_sms: tarif?.quotaSms ?? 0 })
        .eq("id", existants[0].id));
    } else {
      ({ error } = await supabase.from("abonnements").insert({
        titulaire_id: auth.user.id,
        type_titulaire: u?.role === "etablissement" ? "etablissement" : "medecin",
        formule,
        periode,
        statut: "actif",
        date_fin: versISO(dateFin),
        quota_sms: tarif?.quotaSms ?? 0,
      }));
    }
    if (error) return { erreur: error.message };
    setVersion((v) => v + 1);
    return {};
  }

  return { abonnement, tarifs, changerFormule, recharger: () => setVersion((v) => v + 1) };
}

/* ===== Profil enrichi du médecin ===== */

export async function enregistrerProfilMedecin(d: {
  presentation?: string;
  tarifConsultation?: number;
  soins?: string[];
  langues?: string[];
  lienMaps?: string;
  telephoneSecretariat?: string;
}): Promise<{ erreur?: string }> {
  const supabase = creerClientNavigateur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { erreur: "Session expirée." };
  const maj: Record<string, unknown> = {};
  if (d.presentation !== undefined) maj.presentation = d.presentation;
  if (d.tarifConsultation !== undefined) maj.tarif_consultation = d.tarifConsultation;
  if (d.soins !== undefined) maj.soins_et_actes = d.soins;
  if (d.langues !== undefined) maj.langues = d.langues;
  if (d.lienMaps !== undefined) maj.localisation = d.lienMaps;
  if (d.telephoneSecretariat !== undefined) maj.telephone_secretariat = d.telephoneSecretariat;
  const { error } = await supabase.from("medecins").update(maj).eq("id", auth.user.id);
  return error ? { erreur: error.message } : {};
}

/** Assurances acceptées par le médecin connecté (liaison medecin_assurances). */
export function useAssurancesMedecin(medecinId: string | undefined): {
  referentiel: { id: string; libelle: string }[];
  actives: Set<string>;
  basculer: (assuranceId: string, active: boolean) => Promise<void>;
} {
  const [referentiel, setReferentiel] = useState<{ id: string; libelle: string }[]>([]);
  const [actives, setActives] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!medecinId) return;
    let actif = true;
    const supabase = creerClientNavigateur();
    Promise.all([
      supabase.from("assurances").select("id, libelle").order("libelle"),
      supabase.from("medecin_assurances").select("assurance_id").eq("medecin_id", medecinId),
    ]).then(([r, a]) => {
      if (!actif) return;
      setReferentiel(r.data ?? []);
      setActives(new Set((a.data ?? []).map((x) => x.assurance_id)));
    });
    return () => {
      actif = false;
    };
  }, [medecinId]);

  async function basculer(assuranceId: string, active: boolean) {
    const supabase = creerClientNavigateur();
    if (active) {
      await supabase.from("medecin_assurances").insert({ medecin_id: medecinId, assurance_id: assuranceId });
      setActives((s) => new Set([...s, assuranceId]));
    } else {
      await supabase.from("medecin_assurances").delete().eq("medecin_id", medecinId!).eq("assurance_id", assuranceId);
      setActives((s) => {
        const n = new Set(s);
        n.delete(assuranceId);
        return n;
      });
    }
  }

  return { referentiel, actives, basculer };
}

/** Téléverse un document de validation (Storage privé + ligne en base). */
export async function televerserDocumentValidation(
  fichier: File,
  type: "diplome" | "carte_ordre" | "autorisation_exercice" | "identite" = "diplome"
): Promise<{ erreur?: string }> {
  const supabase = creerClientNavigateur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { erreur: "Session expirée." };
  const chemin = `${auth.user.id}/${Date.now()}-${fichier.name}`;
  const { error: eUpload } = await supabase.storage.from("validation").upload(chemin, fichier);
  if (eUpload) return { erreur: eUpload.message };
  const { error } = await supabase.from("documents_validation").insert({
    professionnel_id: auth.user.id,
    type,
    fichier_path: chemin,
  });
  return error ? { erreur: error.message } : {};
}

/** Documents de validation du professionnel connecté (lecture seule ici). */
export function useDocumentsValidation(): { documents: { id: string; type: string; statut: string; fichier: string }[]; recharger: () => void } {
  const [documents, setDocuments] = useState<{ id: string; type: string; statut: string; fichier: string }[]>([]);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let actif = true;
    creerClientNavigateur()
      .from("documents_validation")
      .select("id, type, statut, fichier_path")
      .then(({ data }) => {
        if (actif) setDocuments((data ?? []).map((d) => ({ id: d.id, type: d.type, statut: d.statut, fichier: d.fichier_path })));
      });
    return () => {
      actif = false;
    };
  }, [version]);
  return { documents, recharger: () => setVersion((v) => v + 1) };
}
