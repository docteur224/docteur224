"use client";

import { useEffect, useState } from "react";
import { creerClientNavigateur } from "@/lib/supabase/client";
import {
  HEURES_JOURNEE,
  statutCreneau,
  type EtatCreneau,
  lieuTarif,
  type MedecinAvecPlages,
} from "@/lib/donnees";
import { versISO } from "@/lib/dates";
import { colonnesPermissions } from "@/lib/permissions-assistant";
import type { Paiement } from "@/lib/paiements";
import { JOURS_NOMS, horairesParJour, resumeHeures, resumeJours } from "@/lib/horaires";

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
      const { data: ligneMedecin, error: errMedecin } = await supabase
        .from("medecins")
        .select(`
          id, civilite, genre, tarif_consultation, presentation, soins_et_actes, diplomes,
          parcours, langues, annees_experience, telephone_secretariat, numero_ordre,
          rccm, visite_domicile, zone_domicile,
          note_moyenne, nb_avis, etablissement_id, commune, quartier, photo_url, localisation,
          utilisateurs ( nom, prenom ),
          specialites ( nom ),
          villes ( nom ),
          medecin_assurances ( assurances ( libelle ) ),
          horaires_types ( jour_semaine, heure_debut, heure_fin ),
          tarifs_medecin ( libelle, montant, position, lieu )
        `)
        .eq("id", medecinId)
        .maybeSingle();

      let medecin: MedecinAvecPlages | null = null;
      if (!errMedecin && ligneMedecin) {
        const ligne = ligneMedecin as unknown as {
          id: string;
          civilite: string;
          genre: string | null;
          tarif_consultation: number | null;
          presentation: string | null;
          soins_et_actes: string[];
          diplomes: { titre: string; lieu: string }[];
          parcours: { lieu: string; duree: string }[];
          langues: string[];
          annees_experience: number | null;
          telephone_secretariat: string | null;
          numero_ordre: string | null;
          rccm: string | null;
          visite_domicile: boolean | null;
          zone_domicile: string | null;
          note_moyenne: number;
          nb_avis: number;
          etablissement_id: string | null;
          commune: string | null;
          quartier: string | null;
          photo_url: string | null;
          localisation: string | null;
          utilisateurs: { nom: string | null; prenom: string | null } | null;
          specialites: { nom: string } | null;
          villes: { nom: string } | null;
          medecin_assurances: { assurances: { libelle: string } | null }[];
          horaires_types: { jour_semaine: number; heure_debut: string; heure_fin: string }[];
          tarifs_medecin: { libelle: string; montant: number; position: number; lieu: string }[];
        };

        const prenom = ligne.utilisateurs?.prenom ?? "";
        const nom = ligne.utilisateurs?.nom ?? "";
        const joursOuverts = new Set(ligne.horaires_types?.map((h) => h.jour_semaine) ?? []);
        const joursFermes = [0, 1, 2, 3, 4, 5, 6].filter((j) => !joursOuverts.has(j));

        const jours = resumeJours(ligne.horaires_types ?? []);
        const detail = resumeHeures(ligne.horaires_types ?? []);

        const GRADIENTS = [
          "linear-gradient(135deg,#E08E45,#C0392B)",
          "linear-gradient(135deg,#2E9CCA,#15506B)",
          "linear-gradient(135deg,#16A085,#0E6655)",
          "linear-gradient(135deg,#6C5CE7,#341F97)",
          "linear-gradient(135deg,#1E7B45,#15506B)",
          "linear-gradient(135deg,#7A5BB5,#15506B)",
        ];

        function empreinte(texte: string): number {
          let h = 0;
          for (let i = 0; i < texte.length; i++) h = (Math.imul(h, 31) + texte.charCodeAt(i)) | 0;
          return Math.abs(h);
        }

        const gradient = GRADIENTS[empreinte(medecinId) % GRADIENTS.length];

        const aujourdHui = new Date().getDay();
        const ouvertAujourdHui = joursOuverts.has(aujourdHui);
        let prochainJour = aujourdHui;
        for (let i = 1; i <= 7 && !joursOuverts.has(prochainJour); i++) prochainJour = (aujourdHui + i) % 7;

        medecin = {
          id: medecinId,
          civilite: (ligne.civilite === "Pr" ? "Pr" : "Dr") as "Dr" | "Pr",
          genre:
            ligne.genre === "femme" || ligne.genre === "homme"
              ? (ligne.genre as "femme" | "homme")
              : null,
          prenom,
          nom,
          initiales: `${prenom.charAt(0)}${nom.charAt(0)}`.toUpperCase() || "DR",
          gradient,
          photoUrl: ligne.photo_url ?? null,
          specialite: ligne.specialites?.nom ?? "Médecine générale",
          etablissementId: ligne.etablissement_id ?? "",
          ville: ligne.villes?.nom ?? "",
          commune: ligne.commune ?? "",
          quartier: ligne.quartier ?? "",
          numeroOrdre: ligne.numero_ordre ?? "",
          rccm: ligne.rccm ?? "",
          visiteDomicile: ligne.visite_domicile ?? false,
          zoneDomicile: ligne.zone_domicile ?? "",
          anneesExperience: ligne.annees_experience ?? 0,
          tarifConsultation: ligne.tarif_consultation ?? 0,
          tarifs: [...(ligne.tarifs_medecin ?? [])]
            .sort((a, b) => a.position - b.position)
            .map((t) => ({ libelle: t.libelle, montant: t.montant, lieu: lieuTarif(t.lieu) })),
          note: Number(ligne.note_moyenne) || 0,
          nbAvis: ligne.nb_avis,
          disponibilite: ouvertAujourdHui
            ? { type: "aujourdhui", label: "Dispo aujourd'hui" }
            : { type: "bientot", label: joursOuverts.size ? JOURS_NOMS[prochainJour] : "Sur demande" },
          telephoneSecretariat: ligne.telephone_secretariat ?? "",
          aPropos: ligne.presentation ?? "",
          soinsEtActes: ligne.soins_et_actes ?? [],
          diplomes: ligne.diplomes ?? [],
          parcours: ligne.parcours ?? [],
          langues: ligne.langues ?? [],
          assurances: ligne.medecin_assurances?.map((a) => a.assurances?.libelle ?? "").filter(Boolean) ?? [],
          horaires: { jours, detail },
          horairesSemaine: horairesParJour(ligne.horaires_types ?? []),
          joursFermes,
          plages: ligne.horaires_types ?? [],
          localisation: ligne.localisation ?? "",
        };
      }

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
  /** « domicile » quand le patient a demandé une visite chez lui. */
  lieu?: "cabinet" | "domicile";
  adresseDomicile?: string;
  /** Le rendez-vous au complet, pour l'écran de détail de l'agenda. */
  rdv?: RdvAgenda;
}

/**
 * Un rendez-vous tel que l'agenda du praticien a besoin de le montrer :
 * bénéficiaire nommé, contact déjà résolu (pour un proche, c'est le titulaire
 * du compte qu'on joint) et clé de dossier prête à ouvrir.
 */
export interface RdvAgenda {
  id: string;
  date: string;
  heure: string;
  motif: string;
  statut: "en_attente" | "confirme" | "annule" | "honore";
  lieu: "cabinet" | "domicile";
  adresseDomicile: string;
  beneficiaire: string;
  /** Clé du dossier patient : « c-… » compte, « p-… » proche, « s-… » sans compte. */
  cle: string;
  typeFiche: PatientCabinet["type"];
  telephone: string;
  email: string;
  dateNaissance: string | null;
  /** Titulaire du compte quand le rendez-vous est pris pour un proche. */
  titulaire: string;
  lien: string;
  source: string;
  creeLe: string;
  motifAnnulation: string;
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
  lieu: string | null;
  adresse_domicile: string | null;
  source: string | null;
  cree_le: string;
  motif_annulation: string | null;
  patients: {
    date_naissance: string | null;
    utilisateurs: ContactUtilisateur | null;
  } | null;
  proches: {
    nom: string;
    prenom: string;
    lien: string;
    date_naissance: string | null;
    patients: { utilisateurs: ContactUtilisateur | null } | null;
  } | null;
  patients_sans_compte: { nom: string; prenom: string; telephone: string | null } | null;
}

interface ContactUtilisateur {
  nom: string | null;
  prenom: string | null;
  telephone: string | null;
  email: string | null;
}

const SELECTION_RDV_PRO = `
  id, date, heure, motif, statut, patient_id, proche_id, patient_sans_compte_id, lieu, adresse_domicile,
  source, cree_le, motif_annulation,
  patients ( date_naissance, utilisateurs ( nom, prenom, telephone, email ) ),
  proches ( nom, prenom, lien, date_naissance, patients ( utilisateurs ( nom, prenom, telephone, email ) ) ),
  patients_sans_compte ( nom, prenom, telephone )
`;

function nomBeneficiaire(l: LigneRdvPro): string {
  if (l.proches) return `${l.proches.prenom} ${l.proches.nom}`;
  if (l.patients_sans_compte) return `${l.patients_sans_compte.prenom} ${l.patients_sans_compte.nom}`;
  const u = l.patients?.utilisateurs;
  if (u) return `${u.prenom ?? ""} ${u.nom ?? ""}`.trim();
  return "Patient";
}

/** Ligne Supabase → rendez-vous d'agenda, contacts et clé de dossier résolus. */
function versRdvAgenda(l: LigneRdvPro): RdvAgenda {
  const typeFiche: PatientCabinet["type"] = l.proche_id
    ? "proche"
    : l.patient_sans_compte_id
      ? "sans_compte"
      : "compte";
  // Un proche n'a ni téléphone ni e-mail à lui : c'est le titulaire du compte
  // qu'on appelle, jamais l'enfant.
  const contact =
    typeFiche === "proche"
      ? (l.proches?.patients?.utilisateurs ?? null)
      : (l.patients?.utilisateurs ?? null);
  const titulaire =
    typeFiche === "proche"
      ? `${l.proches?.patients?.utilisateurs?.prenom ?? ""} ${l.proches?.patients?.utilisateurs?.nom ?? ""}`.trim()
      : "";

  return {
    id: l.id,
    date: l.date,
    heure: l.heure,
    motif: l.motif ?? "",
    statut: l.statut,
    lieu: l.lieu === "domicile" ? "domicile" : "cabinet",
    adresseDomicile: l.adresse_domicile ?? "",
    beneficiaire: nomBeneficiaire(l),
    cle:
      typeFiche === "proche"
        ? `p-${l.proche_id}`
        : typeFiche === "sans_compte"
          ? `s-${l.patient_sans_compte_id}`
          : `c-${l.patient_id}`,
    typeFiche,
    telephone: contact?.telephone ?? l.patients_sans_compte?.telephone ?? "",
    email: contact?.email ?? "",
    dateNaissance: l.proches?.date_naissance ?? l.patients?.date_naissance ?? null,
    titulaire,
    lien: l.proches?.lien ?? "",
    source: l.source ?? "en_ligne",
    creeLe: l.cree_le,
    motifAnnulation: l.motif_annulation ?? "",
  };
}

/**
 * Créneaux et rendez-vous du praticien sur une fenêtre glissante.
 *
 * `joursAvance` et `joursRecul` bornent la lecture : un agenda tenu depuis
 * deux ans ne se charge pas d'un bloc. L'écran qui laisse naviguer loin (Mon
 * agenda) élargit sa fenêtre à mesure — sans quoi une journée hors fenêtre
 * s'afficherait entièrement libre, ce qui est faux et non « vide ».
 */
export function useAgenda(
  medecinId: string | undefined,
  joursAvance = 30,
  joursRecul = 90
): {
  chargement: boolean;
  creneauxJour: (dateISO: string) => CreneauAgenda[];
  rdvs: RdvAgenda[];
  recharger: () => void;
} {
  const [chargement, setChargement] = useState(true);
  const [plages, setPlages] = useState<{ jour_semaine: number; heure_debut: string; heure_fin: string }[]>([]);
  const [exceptions, setExceptions] = useState<Map<string, EtatCreneau>>(new Map());
  const [rdvs, setRdvs] = useState<RdvAgenda[]>([]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!medecinId) return;
    let actif = true;
    setChargement(true);
    const supabase = creerClientNavigateur();
    const debut = versISO(new Date(Date.now() - joursRecul * 86400000));
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
      setRdvs(
        ((r.data ?? []) as unknown as LigneRdvPro[]).map((l) =>
          versRdvAgenda({ ...l, heure: l.heure.slice(0, 5) })
        )
      );
      setChargement(false);
    });
    return () => {
      actif = false;
    };
  }, [medecinId, joursAvance, joursRecul, version]);

  const creneauxJour = (dateISO: string): CreneauAgenda[] =>
    HEURES_JOURNEE.map((heure) => {
      const rdv = rdvs.find((r) => r.date === dateISO && r.heure === heure && r.statut !== "annule");
      if (rdv) {
        return {
          heure,
          statut: "reserve" as EtatCreneau,
          rdvId: rdv.id,
          patient: rdv.beneficiaire,
          motif: rdv.motif || "Consultation",
          statutRdv: rdv.statut,
          lieu: rdv.lieu,
          adresseDomicile: rdv.adresseDomicile,
          rdv,
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

/**
 * Annulation par le praticien (ou son assistant), avec le motif.
 *
 * Le motif n'est pas décoratif : c'est la première chose que demandera celui
 * qui reprendra le dossier — patient décommandé, praticien absent ou erreur de
 * saisie ne se traitent pas pareil. Le trigger `rdv_notifie` (migration 0013)
 * prévient le patient ; rien n'est effacé, la ligne reste au dossier.
 */
export async function annulerRdvMedecin(rdvId: string, motif: string): Promise<{ erreur?: string }> {
  const propre = motif.trim();
  if (!propre) return { erreur: "Indiquez le motif de l’annulation." };
  const { error } = await creerClientNavigateur()
    .from("rendez_vous")
    .update({ statut: "annule", motif_annulation: propre })
    .eq("id", rdvId);
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

/* ===== Recherche paginée des patients (RPC patients_du_medecin) ===== */

export interface PatientListe {
  /** Clé préfixée : « c-… » compte, « p-… » proche, « s-… » sans compte. */
  cle: string;
  type: PatientCabinet["type"];
  nom: string;
  prenom: string;
  telephone: string;
  dateNaissance: string | null;
  derniereVisite: string | null;
  prochaineVisite: string | null;
  nbRdv: number;
  gradient: string;
}

interface LignePatientRpc {
  cle: string;
  type_fiche: PatientCabinet["type"];
  nom: string;
  prenom: string;
  telephone: string;
  date_naissance: string | null;
  derniere_visite: string | null;
  prochaine_visite: string | null;
  nb_rdv: number;
  total: number;
}

export const PAR_PAGE = 20;

/**
 * Patients du médecin connecté : filtre, tri et pagination côté SQL.
 *
 * `usePatientsCabinet` ramenait TOUS les rendez-vous pour reconstruire la
 * liste dans le navigateur ; au-delà de quelques dizaines de patients, la
 * requête devient lourde et la recherche impossible à faire porter sur la
 * date de naissance. La RPC répond avec le total sur chaque ligne, une seule
 * requête suffit donc pour la page et le compteur.
 */
export function useRecherchePatients(
  recherche: string,
  page: number
): { patients: PatientListe[]; total: number; chargement: boolean; recharger: () => void } {
  // La clé de requête vit dans l'état : `chargement` s'en déduit, sans
  // setState en tête d'effet (interdit par le linter React).
  const [resultat, setResultat] = useState<{
    cle: string;
    patients: PatientListe[];
    total: number;
  } | null>(null);
  const [version, setVersion] = useState(0);
  const cle = `${recherche}#${page}#${version}`;

  useEffect(() => {
    let actif = true;
    creerClientNavigateur()
      .rpc("patients_du_medecin", {
        p_recherche: recherche,
        p_limite: PAR_PAGE,
        p_decalage: page * PAR_PAGE,
      })
      .then(({ data }) => {
        if (!actif) return;
        const lignes = (data ?? []) as LignePatientRpc[];
        setResultat({
          cle,
          total: lignes[0]?.total ?? 0,
          patients: lignes.map((l) => ({
            cle: l.cle,
            type: l.type_fiche,
            nom: l.nom,
            prenom: l.prenom,
            telephone: l.telephone,
            dateNaissance: l.date_naissance,
            derniereVisite: l.derniere_visite,
            prochaineVisite: l.prochaine_visite,
            nbRdv: Number(l.nb_rdv),
            gradient: gradientPour(l.cle),
          })),
        });
      });
    return () => {
      actif = false;
    };
  }, [cle, recherche, page]);

  const aJour = resultat?.cle === cle;
  return {
    patients: aJour ? resultat.patients : [],
    total: aJour ? resultat.total : 0,
    chargement: !aJour,
    recharger: () => setVersion((v) => v + 1),
  };
}

/* ===== Dossier d'un patient ===== */

export interface RdvDossier {
  id: string;
  date: string;
  heure: string;
  motif: string;
  statut: string;
}

export interface DossierPatient {
  cle: string;
  type: PatientCabinet["type"];
  nom: string;
  prenom: string;
  telephone: string;
  email: string;
  dateNaissance: string | null;
  genre: string | null;
  ville: string;
  /** Titulaire du compte, quand la fiche est celle d'un proche. */
  titulaire: string;
  lien: string;
  gradient: string;
  rdvs: RdvDossier[];
}

/** Découpe une clé « c-<uuid> » en son type et son identifiant. */
export function lirePatientCle(cle: string): {
  type: PatientCabinet["type"];
  id: string;
} {
  const prefixe = cle.slice(0, 1);
  return {
    type: prefixe === "c" ? "compte" : prefixe === "p" ? "proche" : "sans_compte",
    id: cle.slice(2),
  };
}

export function useDossierPatient(
  cle: string,
  medecinId: string | undefined
): { dossier: DossierPatient | null; chargement: boolean; recharger: () => void } {
  const [resultat, setResultat] = useState<{ cle: string; dossier: DossierPatient | null } | null>(
    null
  );
  const [version, setVersion] = useState(0);
  const cleRequete = `${cle}#${medecinId}#${version}`;

  useEffect(() => {
    if (!medecinId) return;
    let actif = true;
    (async () => {
      const supabase = creerClientNavigateur();
      const { type, id } = lirePatientCle(cle);

      let base: Omit<DossierPatient, "rdvs"> | null = null;
      if (type === "compte") {
        const { data } = await supabase
          .from("patients")
          .select("id, date_naissance, genre, quartier, utilisateurs ( nom, prenom, telephone, email ), villes ( nom )")
          .eq("id", id)
          .maybeSingle();
        const u = data?.utilisateurs as unknown as
          | { nom: string | null; prenom: string | null; telephone: string | null; email: string }
          | null;
        if (data) {
          base = {
            cle, type, nom: u?.nom ?? "", prenom: u?.prenom ?? "",
            telephone: u?.telephone ?? "", email: u?.email ?? "",
            dateNaissance: data.date_naissance, genre: data.genre,
            ville: (data.villes as unknown as { nom: string } | null)?.nom ?? "",
            titulaire: "", lien: "", gradient: gradientPour(cle),
          };
        }
      } else if (type === "proche") {
        const { data } = await supabase
          .from("proches")
          .select("id, nom, prenom, lien, date_naissance, genre, patients ( utilisateurs ( nom, prenom, telephone, email ) )")
          .eq("id", id)
          .maybeSingle();
        const t = (data?.patients as unknown as { utilisateurs: { nom: string | null; prenom: string | null; telephone: string | null; email: string } | null } | null)?.utilisateurs;
        if (data) {
          base = {
            cle, type, nom: data.nom, prenom: data.prenom,
            telephone: t?.telephone ?? "", email: t?.email ?? "",
            dateNaissance: data.date_naissance, genre: data.genre, ville: "",
            titulaire: `${t?.prenom ?? ""} ${t?.nom ?? ""}`.trim(),
            lien: data.lien, gradient: gradientPour(cle),
          };
        }
      } else {
        const { data } = await supabase
          .from("patients_sans_compte")
          .select("id, nom, prenom, telephone")
          .eq("id", id)
          .maybeSingle();
        if (data) {
          base = {
            cle, type, nom: data.nom, prenom: data.prenom,
            telephone: data.telephone ?? "", email: "", dateNaissance: null,
            genre: null, ville: "", titulaire: "", lien: "", gradient: gradientPour(cle),
          };
        }
      }

      const colonne =
        type === "compte" ? "patient_id" : type === "proche" ? "proche_id" : "patient_sans_compte_id";
      const { data: rdvs } = await supabase
        .from("rendez_vous")
        .select("id, date, heure, motif, statut")
        .eq("medecin_id", medecinId)
        .eq(colonne, id)
        .order("date", { ascending: false })
        .order("heure", { ascending: false });

      if (!actif) return;
      setResultat({
        cle: cleRequete,
        dossier: base
          ? {
              ...base,
              rdvs: (rdvs ?? []).map((r) => ({
                id: r.id,
                date: r.date,
                heure: String(r.heure).slice(0, 5),
                motif: r.motif ?? "",
                statut: r.statut,
              })),
            }
          : null,
      });
    })();
    return () => {
      actif = false;
    };
  }, [cle, cleRequete, medecinId]);

  const aJour = resultat?.cle === cleRequete;
  return {
    dossier: aJour ? resultat.dossier : null,
    chargement: !aJour,
    recharger: () => setVersion((v) => v + 1),
  };
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
  nomComplet: string;
  email: string;
  /** actif | suspendu */
  statut: string;
  actif: boolean;
  permissions: PermissionsAssistante;
  /** Les mêmes, sous forme de clés — c'est ce que le serveur attend. */
  cles: string[];
}

export function useEquipe(medecinId: string | undefined): {
  assistants: AssistantEquipe[];
  chargement: boolean;
  recharger: () => void;
} {
  const [assistants, setAssistants] = useState<AssistantEquipe[] | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!medecinId) return;
    let actif = true;
    creerClientNavigateur()
      .from("assistants")
      .select(`id, peut_voir_agenda, peut_confirmer_annuler, peut_reprogrammer, peut_creer_rdv,
               peut_messagerie, peut_gerer_creneaux, utilisateurs ( nom, prenom, email, statut )`)
      .eq("medecin_id", medecinId)
      .then(({ data }) => {
        if (!actif) return;
        type L = {
          id: string;
          peut_voir_agenda: boolean; peut_confirmer_annuler: boolean; peut_reprogrammer: boolean;
          peut_creer_rdv: boolean; peut_messagerie: boolean; peut_gerer_creneaux: boolean;
          utilisateurs: { nom: string | null; prenom: string | null; email: string; statut: string } | null;
        };
        setAssistants(
          ((data ?? []) as unknown as L[])
            // Un compte fermé garde sa ligne `utilisateurs` (l'historique des
            // rendez-vous la référence) mais plus son rattachement : s'il
            // apparaît encore ici, c'est une anomalie à ne pas afficher.
            .filter((a) => a.utilisateurs && a.utilisateurs.statut !== "supprime")
            .map((a) => {
              const permissions: PermissionsAssistante = {
                voirAgenda: a.peut_voir_agenda,
                confirmerAnnuler: a.peut_confirmer_annuler,
                reprogrammer: a.peut_reprogrammer,
                creerRdv: a.peut_creer_rdv,
                messagerie: a.peut_messagerie,
                gererCreneaux: a.peut_gerer_creneaux,
              };
              const prenom = a.utilisateurs?.prenom ?? "";
              const nom = a.utilisateurs?.nom ?? "";
              return {
                id: a.id,
                nom,
                prenom,
                nomComplet: `${prenom} ${nom}`.trim() || (a.utilisateurs?.email ?? ""),
                email: a.utilisateurs?.email ?? "",
                statut: a.utilisateurs?.statut ?? "actif",
                actif: (a.utilisateurs?.statut ?? "actif") === "actif",
                permissions,
                cles: (Object.keys(permissions) as (keyof PermissionsAssistante)[]).filter(
                  (c) => permissions[c]
                ),
              };
            })
        );
      });
    return () => {
      actif = false;
    };
  }, [medecinId, version]);
  return {
    assistants: assistants ?? [],
    chargement: assistants === null,
    recharger: () => setVersion((v) => v + 1),
  };
}

/**
 * Places d'assistant(e) ouvertes par la formule du médecin (migration 0044).
 *
 * Lu en base et non déduit ici : c'est la MÊME fonction que celle appliquée
 * par le trigger qui refuse un compte en trop. Un plafond affiché qui ne
 * serait pas celui appliqué serait pire que pas de plafond du tout.
 */
export interface QuotaAssistants {
  /** Formule en cours, `null` si aucun abonnement vivant. */
  formule: string | null;
  places: number;
  occupees: number;
  restantes: number;
  complet: boolean;
}

export function useQuotaAssistants(version: number): QuotaAssistants | null {
  const [quota, setQuota] = useState<QuotaAssistants | null>(null);
  useEffect(() => {
    let actif = true;
    creerClientNavigateur()
      .rpc("quota_assistants")
      .then(({ data }) => {
        if (!actif) return;
        const l = (data ?? [])[0] as
          | { formule: string | null; places: number; occupees: number }
          | undefined;
        const places = Number(l?.places) || 0;
        const occupees = Number(l?.occupees) || 0;
        setQuota({
          formule: l?.formule ?? null,
          places,
          occupees,
          restantes: Math.max(0, places - occupees),
          complet: occupees >= places,
        });
      });
    return () => {
      actif = false;
    };
  }, [version]);
  return quota;
}

/**
 * Donne ou retire des permissions. Écrit directement dans `assistants` : la
 * RLS (`mod_assistants_medecin`) porte la règle — seul le médecin titulaire
 * touche à son équipe, et un(e) assistant(e) ne s'accorde rien.
 */
export async function majPermissionsAssistant(
  assistantId: string,
  permissions: string[]
): Promise<{ erreur?: string }> {
  const { data, error } = await creerClientNavigateur()
    .from("assistants")
    .update(colonnesPermissions(permissions))
    .eq("id", assistantId)
    .select("id");
  if (error) return { erreur: error.message };
  // Un UPDATE bloqué par la RLS ne lève rien : il touche zéro ligne.
  if (!data?.length) {
    return { erreur: "Modification refusée : cet(te) assistant(e) n’est pas rattaché(e) à votre compte." };
  }
  return {};
}

async function appelEquipeMedecin(
  url: string,
  init: RequestInit,
  echec: string
): Promise<{ erreur?: string }> {
  try {
    const reponse = await fetch(url, init);
    const corps = await reponse.json().catch(() => ({}));
    return reponse.ok ? {} : { erreur: corps.erreur ?? echec };
  } catch {
    return { erreur: "Connexion impossible. Vérifiez votre réseau, puis réessayez." };
  }
}

export interface NouvelAssistant {
  nomComplet: string;
  email: string;
  motDePasse: string;
  permissions: string[];
}

/**
 * Ouvre un compte assistant(e). Passe par le serveur : créer un compte
 * d'authentification exige la clé service_role, et le plafond de la formule
 * s'y vérifie avant que quoi que ce soit ne soit écrit.
 */
export async function creerAssistant(assistant: NouvelAssistant): Promise<{ erreur?: string }> {
  return appelEquipeMedecin(
    "/api/medecin/assistants",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(assistant),
    },
    "La création du compte a échoué."
  );
}

/** Désactive (ou réactive) un compte : le bannissement ferme sa session. */
export async function majStatutAssistant(id: string, actif: boolean): Promise<{ erreur?: string }> {
  return appelEquipeMedecin(
    `/api/medecin/assistants/${id}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actif }),
    },
    "Le changement d’état a échoué."
  );
}

/** Ferme le compte et libère la place de la formule. */
export async function supprimerAssistant(id: string): Promise<{ erreur?: string }> {
  return appelEquipeMedecin(
    `/api/medecin/assistants/${id}`,
    { method: "DELETE" },
    "La fermeture du compte a échoué."
  );
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

  /*
   * Le changement de formule passe par le serveur, et non plus par une
   * écriture directe.
   *
   * L'ancienne version faisait un UPDATE client sur `abonnements` en s'y
   * attribuant `statut: "actif"` et une `date_fin` calculée dans le
   * navigateur. La migration 0019 a retiré les policies d'écriture client
   * précisément pour ça — sinon n'importe qui s'offrait un abonnement actif
   * jusqu'en 2099 depuis sa console. Depuis, l'UPDATE ne touchait plus aucune
   * ligne : Postgres ne renvoie pas d'erreur quand la RLS filtre tout, donc
   * l'écran annonçait « ✓ Abonnement mis à jour » sans que rien ne change.
   *
   * On réutilise la route de l'étape « Abonnement » du parcours : elle fait
   * déjà exactement ce qu'il faut — liste blanche des formules, palier imposé
   * pour un établissement, et surtout `statut` et `date_fin` calculés côté
   * serveur d'après les réglages de gratuité. Ce qui s'achète ne se déclare
   * pas depuis le client.
   */
  async function changerFormule(formule: string, periode: string): Promise<{ erreur?: string }> {
    const reponse = await fetch("/api/inscription/abonnement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ formule, periode }),
    });
    const corps = await reponse.json().catch(() => ({ erreur: "Réponse illisible." }));
    if (!reponse.ok) return { erreur: corps.erreur ?? "Changement impossible." };
    setVersion((v) => v + 1);
    return {};
  }

  return { abonnement, tarifs, changerFormule, recharger: () => setVersion((v) => v + 1) };
}

/* ===== Profil enrichi du médecin ===== */

/**
 * Ni `tarif_consultation` (0023) ni `soins_et_actes` (0027) ne figurent
 * ici : ce sont des valeurs DÉRIVÉES de `tarifs_medecin`, maintenues par
 * trigger. Les écrire à la main ferait diverger la fiche publique de ce
 * que le patient peut réellement réserver — le bug que la 0027 corrige.
 */
export async function enregistrerProfilMedecin(d: {
  presentation?: string;
  langues?: string[];
  /** « femme » | « homme » | "" pour ne pas préciser. */
  genre?: string;
  lienMaps?: string;
  telephoneSecretariat?: string;
  diplomes?: { titre: string; lieu: string }[];
  parcours?: { lieu: string; duree: string }[];
  specialiteId?: string;
  villeId?: string;
  commune?: string;
  quartier?: string;
  numeroOrdre?: string;
  rccm?: string;
  visiteDomicile?: boolean;
  zoneDomicile?: string;
  anneesExperience?: number | null;
}): Promise<{ erreur?: string }> {
  const supabase = creerClientNavigateur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { erreur: "Session expirée." };
  const maj: Record<string, unknown> = {};
  if (d.presentation !== undefined) maj.presentation = d.presentation;
  if (d.langues !== undefined) maj.langues = d.langues;
  // Chaîne vide = « non précisé » : la colonne accepte uniquement
  // 'femme'/'homme' ou NULL (contrainte check en base).
  if (d.genre !== undefined) maj.genre = d.genre === "" ? null : d.genre;
  if (d.lienMaps !== undefined) maj.localisation = d.lienMaps;
  if (d.telephoneSecretariat !== undefined) maj.telephone_secretariat = d.telephoneSecretariat;
  if (d.diplomes !== undefined) maj.diplomes = d.diplomes;
  if (d.parcours !== undefined) maj.parcours = d.parcours;
  if (d.specialiteId !== undefined) maj.specialite_id = d.specialiteId || null;
  if (d.villeId !== undefined) maj.ville_id = d.villeId || null;
  if (d.commune !== undefined) maj.commune = d.commune;
  if (d.quartier !== undefined) maj.quartier = d.quartier;
  if (d.numeroOrdre !== undefined) maj.numero_ordre = d.numeroOrdre || null;
  if (d.rccm !== undefined) maj.rccm = d.rccm || null;
  if (d.visiteDomicile !== undefined) maj.visite_domicile = d.visiteDomicile;
  if (d.zoneDomicile !== undefined) maj.zone_domicile = d.zoneDomicile || null;
  if (d.anneesExperience !== undefined) maj.annees_experience = d.anneesExperience;
  // Un update refusé par la RLS ne lève pas d'erreur : il touche zéro
  // ligne. Sans ce `.select()` l'écran annoncerait « enregistré » sur une
  // modification jamais partie.
  const { data, error } = await supabase
    .from("medecins")
    .update(maj)
    .eq("id", auth.user.id)
    .select("id");
  if (error) return { erreur: error.message };
  if (!data || data.length === 0) return { erreur: "Enregistrement refusé." };
  return {};
}

/**
 * Identité du praticien : elle vit dans `utilisateurs`, pas dans
 * `medecins`. Sans cette fonction, le nom saisi à l'inscription n'était
 * modifiable nulle part.
 */
export async function enregistrerIdentiteMedecin(d: {
  nom?: string;
  prenom?: string;
  /** Numéro personnel, au format +224XXXXXXXXX. */
  telephone?: string;
  civilite?: string;
}): Promise<{ erreur?: string }> {
  const supabase = creerClientNavigateur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { erreur: "Session expirée." };

  if (d.nom !== undefined || d.prenom !== undefined || d.telephone !== undefined) {
    const maj: Record<string, unknown> = {};
    if (d.nom !== undefined) maj.nom = d.nom;
    if (d.prenom !== undefined) maj.prenom = d.prenom;
    if (d.telephone !== undefined) maj.telephone = d.telephone || null;
    const { data, error } = await supabase
      .from("utilisateurs")
      .update(maj)
      .eq("id", auth.user.id)
      .select("id");
    if (error) return { erreur: error.message };
    if (!data || data.length === 0) return { erreur: "Enregistrement refusé." };
  }

  if (d.civilite !== undefined) {
    const { error } = await supabase
      .from("medecins")
      .update({ civilite: d.civilite })
      .eq("id", auth.user.id);
    if (error) return { erreur: error.message };
  }
  return {};
}

/** Assurances acceptées par le médecin connecté (liaison medecin_assurances). */
export function useAssurancesMedecin(medecinId: string | undefined): {
  referentiel: { id: string; libelle: string }[];
  actives: Set<string>;
  basculer: (assuranceId: string, active: boolean) => Promise<{ erreur?: string }>;
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

  /*
   * L'état local ne suit l'écriture que si elle a réussi : une case cochée
   * alors que l'insertion a échoué laisserait le médecin croire qu'il
   * accepte une assurance que sa fiche n'affichera jamais.
   */
  async function basculer(assuranceId: string, active: boolean): Promise<{ erreur?: string }> {
    if (!medecinId) return { erreur: "Session expirée." };
    const supabase = creerClientNavigateur();
    if (active) {
      const { error } = await supabase
        .from("medecin_assurances")
        .insert({ medecin_id: medecinId, assurance_id: assuranceId });
      if (error) return { erreur: error.message };
      setActives((s) => new Set([...s, assuranceId]));
    } else {
      const { error } = await supabase
        .from("medecin_assurances")
        .delete()
        .eq("medecin_id", medecinId)
        .eq("assurance_id", assuranceId);
      if (error) return { erreur: error.message };
      setActives((s) => {
        const n = new Set(s);
        n.delete(assuranceId);
        return n;
      });
    }
    return {};
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

/* ===== Rappels et crédits SMS ===== */

export interface PreferencesRappels {
  rappelsActifs: boolean;
  smsAutorise: boolean;
  whatsappAutorise: boolean;
  delaiHeures: number;
}

export interface PackSms {
  id: string;
  nom: string;
  segments: number;
  prixGnf: number;
}

export interface EtatSms {
  quota: number;
  consommes: number;
  restants: number;
  credits: number;
  coutGnf: number;
  whatsapp: number;
}

/**
 * Rappels et consommation du professionnel connecté.
 *
 * Le SMS est refusé par défaut (migration 0036) : c'est son quota qui est
 * débité, il doit l'avoir demandé. WhatsApp est autorisé d'emblée — il coûte
 * une fraction du prix et reste soumis au choix du patient.
 */
export function useRappelsEtSms(): {
  preferences: PreferencesRappels;
  etat: EtatSms | null;
  packs: PackSms[];
  /** Recharge dont le versement n'est pas encore rapproché. Il n'y en a jamais deux. */
  achatEnAttente: (Paiement & { segments: number }) | null;
  /** Demandes closes, pour que le professionnel retrouve ce qu'il a réglé. */
  historiqueAchats: (Paiement & { segments: number })[];
  enregistrerPreferences: (p: PreferencesRappels) => Promise<{ erreur?: string }>;
  recharger: () => void;
} {
  const DEFAUT: PreferencesRappels = {
    rappelsActifs: true,
    smsAutorise: false,
    whatsappAutorise: true,
    delaiHeures: 24,
  };
  const [preferences, setPreferences] = useState<PreferencesRappels>(DEFAUT);
  const [etat, setEtat] = useState<EtatSms | null>(null);
  const [packs, setPacks] = useState<PackSms[]>([]);
  const [achats, setAchats] = useState<(Paiement & { segments: number })[]>([]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let actif = true;
    (async () => {
      const supabase = creerClientNavigateur();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user || !actif) return;
      /*
       * `limit(1)` et non `maybeSingle()` : celui-ci lève dès qu'il trouve
       * plus d'une ligne, et un titulaire peut en avoir plusieurs — la base
       * porte des abonnements en double, hérités d'amorçages répétés. Une
       * anomalie de données ne doit pas éteindre l'écran du professionnel.
       */
      const [{ data: pref }, { data: consos }, { data: cat }, { data: lignesAchats }] =
        await Promise.all([
          supabase.from("preferences_rappels").select("*").eq("titulaire_id", auth.user.id).maybeSingle(),
          supabase.from("consommation_sms_mois").select("*").eq("titulaire_id", auth.user.id).limit(1),
          supabase.from("packs_sms").select("id, nom, segments, prix_gnf").eq("actif", true).order("ordre"),
          supabase
            .from("achats_sms")
            .select("*")
            .eq("titulaire_id", auth.user.id)
            .order("cree_le", { ascending: false })
            .limit(20),
        ]);
      if (!actif) return;
      if (pref) {
        setPreferences({
          rappelsActifs: pref.rappels_actifs,
          smsAutorise: pref.sms_autorise,
          whatsappAutorise: pref.whatsapp_autorise,
          delaiHeures: pref.delai_heures,
        });
      }
      const conso = consos?.[0];
      setEtat(
        conso
          ? {
              quota: conso.quota_sms,
              consommes: conso.consommes,
              restants: conso.restants,
              credits: conso.credits,
              coutGnf: conso.cout_gnf,
              whatsapp: conso.whatsapp,
            }
          : null
      );
      setPacks((cat ?? []).map((p) => ({ id: p.id, nom: p.nom, segments: p.segments, prixGnf: p.prix_gnf })));
      /*
       * Une recharge se règle exactement comme un abonnement : on la remonte
       * sous la même forme, pour que le dialogue de paiement puisse la
       * reprendre sans connaître la table dont elle vient.
       */
      setAchats(
        (lignesAchats ?? []).map((a) => ({
          id: a.id,
          formule: `${a.segments.toLocaleString("fr-FR")} SMS`,
          periode: "",
          montantGnf: a.prix_gnf,
          moyen: (a.moyen_paiement ?? "orange_money") as Paiement["moyen"],
          numeroPayeur: a.numero_payeur ?? "",
          reference: a.reference ?? "",
          referenceOperateur: a.reference_paiement ?? "",
          // `achats_sms` dit « payé » là où un abonnement dit « confirmé ».
          statut: (a.statut === "paye" ? "confirme" : a.statut) as Paiement["statut"],
          motifRefus: a.motif_refus ?? "",
          creeLe: a.cree_le,
          segments: a.segments,
        }))
      );
    })();
    return () => {
      actif = false;
    };
  }, [version]);

  async function enregistrerPreferences(p: PreferencesRappels): Promise<{ erreur?: string }> {
    const supabase = creerClientNavigateur();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { erreur: "Session expirée." };
    const { error } = await supabase.from("preferences_rappels").upsert({
      titulaire_id: auth.user.id,
      rappels_actifs: p.rappelsActifs,
      sms_autorise: p.smsAutorise,
      whatsapp_autorise: p.whatsappAutorise,
      delai_heures: p.delaiHeures,
      maj_le: new Date().toISOString(),
    });
    if (error) return { erreur: error.message };
    setPreferences(p);
    return {};
  }

  /*
   * La commande d'une recharge ne vit plus ici : elle passe par
   * `demanderRecharge()` (lib/paiements), qui relit segments et prix en base.
   * `achats_sms` n'a plus de policy INSERT — un client qui déclarait son
   * propre prix était la faille que la 0040 avait déjà fermée ailleurs.
   */
  return {
    preferences,
    etat,
    packs,
    achatEnAttente: achats.find((a) => a.statut === "en_attente") ?? null,
    historiqueAchats: achats.filter((a) => a.statut !== "en_attente").slice(0, 5),
    enregistrerPreferences,
    recharger: () => setVersion((v) => v + 1),
  };
}
