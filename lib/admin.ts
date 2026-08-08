"use client";

import { useEffect, useState } from "react";
import { creerClientNavigateur } from "@/lib/supabase/client";
import {
  devinerEmojiSpecialite,
  emojiDeSecours,
  emojiSpecialite,
} from "@/lib/icones-specialites";

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

export interface PieceDossier {
  id: string;
  type: string;
  statut: string;
  fichierPath: string;
}

export interface DossierValidation {
  id: string;
  nom: string;
  detail: string;
  initiales: string;
  etablissement: boolean;
  /** Dépôt du dossier — pour afficher l'ancienneté réelle, pas une date écrite en dur. */
  depotLe: string | null;
  /** Documents réellement fournis (médecins) */
  documents: PieceDossier[];
}

/** Libellés des `type_document` de la base. */
export const LIBELLE_PIECE: Record<string, string> = {
  diplome: "Diplôme",
  carte_ordre: "Carte de l’ordre",
  autorisation_exercice: "Autorisation",
  identite: "Identité",
};

/** « il y a 3 jours » à partir d'une date de dépôt. */
export function ancienneteDossier(depotLe: string | null): string {
  if (!depotLe) return "date de dépôt inconnue";
  const jours = Math.floor((Date.now() - new Date(depotLe).getTime()) / 86_400_000);
  if (jours <= 0) return "déposé aujourd’hui";
  if (jours === 1) return "en attente depuis 1 jour";
  return `en attente depuis ${jours} jours`;
}

export function useMedecinsEnAttente(): { dossiers: DossierValidation[]; recharger: () => void } {
  const { donnees, recharger } = utiliserRequete<DossierValidation[]>([], async () => {
    const supabase = creerClientNavigateur();
    const { data } = await supabase
      .from("medecins")
      .select(
        "id, civilite, etape_inscription, utilisateurs ( nom, prenom, cree_le ), specialites ( nom ), villes ( nom )"
      )
      .eq("statut", "en_attente")
      // Un parcours d'inscription inachevé n'est pas un dossier à examiner :
      // le professionnel n'a pas fini de le déposer (ni profil ni pièces).
      .is("etape_inscription", null);
    type L = {
      id: string;
      civilite: string;
      utilisateurs: { nom: string | null; prenom: string | null; cree_le: string } | null;
      specialites: { nom: string } | null;
      villes: { nom: string } | null;
    };
    const medecins = (data ?? []) as unknown as L[];
    if (medecins.length === 0) return [];
    const { data: docs } = await supabase
      .from("documents_validation")
      .select("id, professionnel_id, type, statut, fichier_path")
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
        depotLe: m.utilisateurs?.cree_le ?? null,
        documents: (docs ?? [])
          .filter((d) => d.professionnel_id === m.id)
          .map((d) => ({ id: d.id, type: d.type, statut: d.statut, fichierPath: d.fichier_path })),
      };
    });
  });
  return { dossiers: donnees, recharger };
}

export interface EtablissementInscrit {
  id: string;
  nom: string;
  type: string;
  ville: string | null;
  statut: string;
  /** Médecins réellement rattachés à la structure. */
  medecins: number;
  /** Palier facturé aujourd'hui, `null` si aucun abonnement ouvert. */
  formule: string | null;
  /**
   * Palier suggéré, renseigné UNIQUEMENT quand l'effectif sort des bornes du
   * palier courant. Nul veut dire « rien à requalifier », pas « inconnu ».
   */
  requalifierVers: string | null;
}

/**
 * Toutes les structures inscrites, avec de quoi repérer celles à requalifier.
 *
 * Le palier est fixé au type déclaré à l'inscription, quand la structure n'a
 * encore aucun médecin — il ne bouge jamais ensuite. On confronte donc
 * l'effectif réel aux bornes saisies dans /espace-admin/abonnements : une
 * clinique passée à 18 médecins doit relever du palier hôpital, et c'est à
 * l'admin de la basculer.
 */
export function useEtablissementsInscrits(): {
  etablissements: EtablissementInscrit[];
  recharger: () => void;
} {
  const { donnees, recharger } = utiliserRequete<EtablissementInscrit[]>([], async () => {
    const supabase = creerClientNavigateur();
    const [{ data: etabs }, { data: tarifs }] = await Promise.all([
      supabase
        .from("etablissements")
        .select("id, nom, type, statut, gestionnaire_id, villes ( nom ), medecins ( id )")
        .is("etape_inscription", null)
        .order("nom"),
      supabase
        .from("tarifs_plateforme")
        .select("formule, medecins_min, medecins_max")
        .not("medecins_min", "is", null)
        .order("medecins_min"),
    ]);
    type L = {
      id: string;
      nom: string;
      type: string;
      statut: string;
      gestionnaire_id: string | null;
      villes: { nom: string } | null;
      medecins: { id: string }[] | null;
    };
    const liste = (etabs ?? []) as unknown as L[];
    if (liste.length === 0) return [];

    // L'abonnement est porté par le gestionnaire, pas par la structure.
    const gestionnaires = liste.map((e) => e.gestionnaire_id).filter((g): g is string => !!g);
    const { data: abos } = gestionnaires.length
      ? await supabase.from("abonnements").select("titulaire_id, formule").in("titulaire_id", gestionnaires)
      : { data: [] };

    const bornes = (tarifs ?? []) as { formule: string; medecins_min: number; medecins_max: number | null }[];

    /*
     * Le signal ne se déclenche QUE vers le haut : une structure qui a dépassé
     * le plafond de son palier est sous-facturée, c'est ce qu'il faut voir.
     *
     * Deux cas volontairement muets.
     *
     * En dessous du minimum, il n'y a rien à signaler : une structure fraîchement
     * inscrite a zéro médecin rattaché — c'est l'état NORMAL au départ, et
     * proposer de la déclasser pour ça reviendrait à lui réclamer un palier
     * moins cher le jour de son arrivée.
     *
     * Et on compare aux bornes du palier COURANT plutôt que de chercher un
     * palier « attendu » à comparer par son nom : plusieurs paliers visent la
     * même taille (structure 0–3 et cabinet 1–3 se recouvrent), et le premier
     * trouvé classerait tous les cabinets de deux médecins comme mal placés.
     */
    function requalifierVers(formule: string | null, n: number): string | null {
      if (!formule) return null;
      const actuel = bornes.find((b) => b.formule === formule);
      if (!actuel || actuel.medecins_max === null || n <= actuel.medecins_max) return null;
      return (
        bornes.find((b) => n >= b.medecins_min && (b.medecins_max === null || n <= b.medecins_max))
          ?.formule ?? null
      );
    }

    return liste.map((e) => {
      const medecins = e.medecins?.length ?? 0;
      const formule = (abos ?? []).find((a) => a.titulaire_id === e.gestionnaire_id)?.formule ?? null;
      return {
        id: e.id,
        nom: e.nom,
        type: e.type,
        ville: e.villes?.nom ?? null,
        statut: e.statut,
        medecins,
        formule,
        // Un dossier encore en validation n'a pas à être requalifié : son palier
        // n'est pas acquis, et l'admin le traite dans Validations.
        requalifierVers: e.statut === "valide" ? requalifierVers(formule, medecins) : null,
      };
    });
  });
  return { etablissements: donnees, recharger };
}

export function useEtablissementsEnAttente(): { dossiers: DossierValidation[]; recharger: () => void } {
  const { donnees, recharger } = utiliserRequete<DossierValidation[]>([], async () => {
    const supabase = creerClientNavigateur();
    const { data } = await supabase
      .from("etablissements")
      .select("id, nom, type, cree_le, gestionnaire_id, villes ( nom )")
      .eq("statut", "en_attente")
      .is("etape_inscription", null);
    type L = {
      id: string;
      nom: string;
      type: string;
      cree_le: string;
      gestionnaire_id: string | null;
      villes: { nom: string } | null;
    };
    const etabs = (data ?? []) as unknown as L[];
    if (etabs.length === 0) return [];
    // Les pièces d'un établissement sont déposées par son gestionnaire.
    const gestionnaires = etabs.map((e) => e.gestionnaire_id).filter((g): g is string => !!g);
    const { data: docs } = gestionnaires.length
      ? await supabase
          .from("documents_validation")
          .select("id, professionnel_id, type, statut, fichier_path")
          .in("professionnel_id", gestionnaires)
      : { data: [] };
    return etabs.map((e) => ({
      id: e.id,
      nom: e.nom,
      detail: [e.type, e.villes?.nom].filter(Boolean).join(" · "),
      initiales: "🏥",
      etablissement: true,
      depotLe: e.cree_le,
      documents: (docs ?? [])
        .filter((d) => d.professionnel_id === e.gestionnaire_id)
        .map((d) => ({ id: d.id, type: d.type, statut: d.statut, fichierPath: d.fichier_path })),
    }));
  });
  return { dossiers: donnees, recharger };
}

/* ----- Détail d'un dossier soumis à validation ----- */

export interface DetailDossier {
  /** Identité du professionnel ou du gestionnaire de la structure. */
  contact: { nom: string; prenom: string; email: string; telephone: string };
  /** Couples libellé/valeur du profil, prêts à afficher. */
  champs: { label: string; valeur: string }[];
  /** Blocs de texte long (présentation, description). */
  textes: { label: string; valeur: string }[];
  /** Listes (langues, soins, services). */
  listes: { label: string; valeurs: string[] }[];
  horaires: { jour: number; debut: string; fin: string }[];
}

const JOURS_SEMAINE = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
export const nomJour = (jour: number) => JOURS_SEMAINE[jour] ?? "";

const gnfOuVide = (n: number | null) =>
  n ? `${n.toLocaleString("fr-FR").replace(/ | /g, " ")} GNF` : "";

/**
 * Profil complet du dossier examiné. L'écran ne montrait que les pièces :
 * on ne peut pas valider un professionnel sans voir qui il est, ce qu'il
 * déclare exercer et où.
 */
export function useDetailDossier(dossier: DossierValidation | null): {
  detail: DetailDossier | null;
  chargement: boolean;
} {
  const { donnees } = utiliserRequete<{ cle: string; detail: DetailDossier | null }>(
    { cle: "", detail: null },
    async () => {
      const cle = dossier ? `${dossier.etablissement ? "e" : "m"}:${dossier.id}` : "";
      if (!dossier) return { cle, detail: null };
      const supabase = creerClientNavigateur();

      if (!dossier.etablissement) {
        const { data } = await supabase
          .from("medecins")
          .select(
            "civilite, quartier, tarif_consultation, presentation, soins_et_actes, diplomes, parcours, langues, annees_experience, telephone_secretariat, localisation, utilisateurs ( nom, prenom, email, telephone ), specialites ( nom ), villes ( nom ), horaires_types ( jour_semaine, heure_debut, heure_fin )"
          )
          .eq("id", dossier.id)
          .maybeSingle();
        if (!data) return { cle, detail: null };
        type M = {
          civilite: string;
          quartier: string | null;
          tarif_consultation: number | null;
          presentation: string | null;
          soins_et_actes: string[] | null;
          diplomes: { titre?: string; lieu?: string }[] | null;
          parcours: { lieu?: string; duree?: string }[] | null;
          langues: string[] | null;
          annees_experience: number | null;
          telephone_secretariat: string | null;
          localisation: string | null;
          utilisateurs: { nom: string | null; prenom: string | null; email: string; telephone: string | null } | null;
          specialites: { nom: string } | null;
          villes: { nom: string } | null;
          horaires_types: { jour_semaine: number; heure_debut: string; heure_fin: string }[] | null;
        };
        const m = data as unknown as M;
        return {
          cle,
          detail: {
            contact: {
              nom: m.utilisateurs?.nom ?? "",
              prenom: m.utilisateurs?.prenom ?? "",
              email: m.utilisateurs?.email ?? "",
              telephone: m.utilisateurs?.telephone ?? "",
            },
            champs: [
              { label: "Civilité", valeur: m.civilite ?? "" },
              { label: "Spécialité", valeur: m.specialites?.nom ?? "" },
              { label: "Ville", valeur: m.villes?.nom ?? "" },
              { label: "Quartier", valeur: m.quartier ?? "" },
              { label: "Tarif consultation", valeur: gnfOuVide(m.tarif_consultation) },
              {
                label: "Expérience",
                valeur: m.annees_experience ? `${m.annees_experience} ans` : "",
              },
              { label: "Tél. secrétariat", valeur: m.telephone_secretariat ?? "" },
              { label: "Localisation", valeur: m.localisation ?? "" },
              {
                label: "Diplômes",
                valeur: (m.diplomes ?? [])
                  .map((d) => [d.titre, d.lieu].filter(Boolean).join(" — "))
                  .filter(Boolean)
                  .join(" · "),
              },
              {
                label: "Parcours",
                valeur: (m.parcours ?? [])
                  .map((p) => [p.lieu, p.duree].filter(Boolean).join(" — "))
                  .filter(Boolean)
                  .join(" · "),
              },
            ],
            textes: [{ label: "Présentation", valeur: m.presentation ?? "" }],
            listes: [
              { label: "Langues", valeurs: m.langues ?? [] },
              { label: "Soins et actes", valeurs: m.soins_et_actes ?? [] },
            ],
            horaires: (m.horaires_types ?? [])
              .map((h) => ({
                jour: h.jour_semaine,
                debut: h.heure_debut.slice(0, 5),
                fin: h.heure_fin.slice(0, 5),
              }))
              .sort((a, b) => (a.jour || 7) - (b.jour || 7)),
          },
        };
      }

      const { data } = await supabase
        .from("etablissements")
        .select(
          "nom, type, description, adresse, quartier, telephone, email, services, horaires, villes ( nom ), utilisateurs!etablissements_gestionnaire_id_fkey ( nom, prenom, email, telephone )"
        )
        .eq("id", dossier.id)
        .maybeSingle();
      if (!data) return { cle, detail: null };
      type E = {
        nom: string;
        type: string;
        description: string | null;
        adresse: string | null;
        quartier: string | null;
        telephone: string | null;
        email: string | null;
        services: string[] | null;
        horaires: Record<string, { debut?: string; fin?: string }> | null;
        villes: { nom: string } | null;
        utilisateurs: { nom: string | null; prenom: string | null; email: string; telephone: string | null } | null;
      };
      const e = data as unknown as E;
      return {
        cle,
        detail: {
          contact: {
            nom: e.utilisateurs?.nom ?? "",
            prenom: e.utilisateurs?.prenom ?? "",
            email: e.utilisateurs?.email ?? "",
            telephone: e.utilisateurs?.telephone ?? "",
          },
          champs: [
            { label: "Type", valeur: e.type ?? "" },
            { label: "Ville", valeur: e.villes?.nom ?? "" },
            { label: "Quartier", valeur: e.quartier ?? "" },
            { label: "Adresse", valeur: e.adresse ?? "" },
            { label: "Téléphone", valeur: e.telephone ?? "" },
            { label: "E-mail", valeur: e.email ?? "" },
          ],
          textes: [{ label: "Description", valeur: e.description ?? "" }],
          listes: [{ label: "Services", valeurs: e.services ?? [] }],
          horaires: [],
        },
      };
    },
    [dossier?.id, dossier?.etablissement]
  );

  const cleAttendue = dossier ? `${dossier.etablissement ? "e" : "m"}:${dossier.id}` : "";
  // Clé portée dans l'état plutôt qu'un setChargement en tête d'effet, que le
  // linter interdit (react-hooks/set-state-in-effect).
  return { detail: donnees.cle === cleAttendue ? donnees.detail : null, chargement: donnees.cle !== cleAttendue };
}

/** URL signée (5 min) vers une pièce du bucket privé `validation`. */
export async function urlPieceValidation(fichierPath: string): Promise<string | null> {
  const { data } = await creerClientNavigateur()
    .storage.from("validation")
    .createSignedUrl(fichierPath, 300);
  return data?.signedUrl ?? null;
}

export async function deciderDossier(
  dossier: DossierValidation,
  decision: "valide" | "refuse",
  motif?: string
): Promise<{ erreur?: string }> {
  const supabase = creerClientNavigateur();
  const table = dossier.etablissement ? "etablissements" : "medecins";
  const { data: lignes, error } = await supabase
    .from(table)
    .update({ statut: decision })
    .eq("id", dossier.id)
    .select("id");
  if (error) return { erreur: error.message };
  // Un update refusé par la RLS ne lève pas d'erreur : il ne touche aucune
  // ligne. Sans ce contrôle, la file se rechargeait à l'identique et l'écran
  // laissait croire que la décision était prise.
  if (!lignes?.length) {
    return { erreur: "Décision non enregistrée : droits insuffisants sur ce dossier." };
  }
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

/**
 * Prévient le professionnel qu'il manque une pièce. Le dossier reste en
 * attente : c'est une relance, pas une décision. Avant, cette fonction
 * n'écrivait qu'une ligne d'audit — l'intéressé n'était prévenu de rien.
 */
export async function demanderComplement(
  dossier: DossierValidation,
  motif?: string
): Promise<{ erreur?: string }> {
  const supabase = creerClientNavigateur();
  // Pour un établissement, le destinataire est son gestionnaire.
  let destinataire = dossier.id;
  if (dossier.etablissement) {
    const { data } = await supabase
      .from("etablissements")
      .select("gestionnaire_id")
      .eq("id", dossier.id)
      .single();
    if (!data?.gestionnaire_id) {
      return { erreur: "Cet établissement n’a pas de gestionnaire à prévenir." };
    }
    destinataire = data.gestionnaire_id;
  }
  const { error } = await supabase.rpc("demander_complement_dossier", {
    p_professionnel_id: destinataire,
    p_motif: motif ?? null,
  });
  if (error) return { erreur: error.message };
  await tracerAudit(
    "A demandé un complément de dossier",
    motif ? `${dossier.nom} · ${motif}` : dossier.nom
  );
  return {};
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

/* ===== Indicateurs d'avis (migration 0012) ===== */

/**
 * Baromètre des avis. Tout est agrégé par la fonction SQL
 * `avis_stats_globales` : rapatrier les avis pour en faire la moyenne côté
 * navigateur ne tiendrait pas la charge et donnerait des chiffres faux dès
 * qu'un avis est masqué.
 */
export interface StatsAvis {
  avisPublies: number;
  avisMasques: number;
  avisCeMois: number;
  avisMoisPrecedent: number;
  noteMoyenne: number;
  nbPositifs: number;
  nbNeutres: number;
  nbNegatifs: number;
  nbAvecReponse: number;
  nbSansReponse7j: number;
  medecinsValides: number;
  medecinsNotes: number;
  signalementsOuverts: number;
}

const STATS_VIDES: StatsAvis = {
  avisPublies: 0,
  avisMasques: 0,
  avisCeMois: 0,
  avisMoisPrecedent: 0,
  noteMoyenne: 0,
  nbPositifs: 0,
  nbNeutres: 0,
  nbNegatifs: 0,
  nbAvecReponse: 0,
  nbSansReponse7j: 0,
  medecinsValides: 0,
  medecinsNotes: 0,
  signalementsOuverts: 0,
};

export function useStatsAvis(): { stats: StatsAvis; recharger: () => void } {
  const { donnees, recharger } = utiliserRequete<StatsAvis>(STATS_VIDES, async () => {
    const { data } = await creerClientNavigateur().rpc("avis_stats_globales");
    const l = (data ?? [])[0];
    if (!l) return STATS_VIDES;
    return {
      avisPublies: Number(l.avis_publies) || 0,
      avisMasques: Number(l.avis_masques) || 0,
      avisCeMois: Number(l.avis_ce_mois) || 0,
      avisMoisPrecedent: Number(l.avis_mois_precedent) || 0,
      noteMoyenne: Number(l.note_moyenne) || 0,
      nbPositifs: Number(l.nb_positifs) || 0,
      nbNeutres: Number(l.nb_neutres) || 0,
      nbNegatifs: Number(l.nb_negatifs) || 0,
      nbAvecReponse: Number(l.nb_avec_reponse) || 0,
      nbSansReponse7j: Number(l.nb_sans_reponse_7j) || 0,
      medecinsValides: Number(l.medecins_valides) || 0,
      medecinsNotes: Number(l.medecins_notes) || 0,
      signalementsOuverts: Number(l.signalements_ouverts) || 0,
    };
  });
  return { stats: donnees, recharger };
}

/** Répartition 5★ → 1★ des avis publiés. */
export function useRepartitionAvis(): { etoiles: number; nb: number }[] {
  const { donnees } = utiliserRequete<{ etoiles: number; nb: number }[]>([], async () => {
    const { data } = await creerClientNavigateur().rpc("avis_repartition");
    return ((data ?? []) as { etoiles: number; nb: number }[]).map((l) => ({
      etoiles: Number(l.etoiles),
      nb: Number(l.nb),
    }));
  });
  return donnees;
}

export type OrdreClassement = "meilleurs" | "moins_bons" | "plus_avis" | "sans_avis";

export interface LigneClassement {
  medecinId: string;
  nomComplet: string;
  specialite: string;
  ville: string;
  noteMoyenne: number;
  nbAvis: number;
  /** Moyenne bayésienne : c'est elle qui ordonne, pas la moyenne brute. */
  scorePondere: number;
  /** Assez d'avis pour que le classement soit défendable (seuil en base). */
  eligibleRecompense: boolean;
  nbSansReponse: number;
}

/**
 * Classement des médecins. Le tri « meilleurs »/« moins_bons » s'appuie sur
 * une moyenne bayésienne calculée en base : sans elle, un médecin noté 5,0
 * par un seul patient devancerait un médecin noté 4,8 par quarante — et on
 * récompenserait du bruit statistique.
 */
export function useClassementMedecins(
  ordre: OrdreClassement,
  limite: number
): { lignes: LigneClassement[]; chargement: boolean } {
  // La clé de la requête vit dans l'état : tant que le résultat stocké ne
  // correspond pas à la demande courante, on est en chargement. Changer
  // d'onglet repasse donc bien en chargement, sans setState en tête d'effet
  // (que le linter React interdit).
  const [resultat, setResultat] = useState<{ cle: string; lignes: LigneClassement[] } | null>(null);
  const cle = `${ordre}#${limite}`;

  useEffect(() => {
    let actif = true;
    creerClientNavigateur()
      .rpc("avis_classement_medecins", { p_ordre: ordre, p_limite: limite })
      .then(({ data }) => {
        if (!actif) return;
        setResultat({
          cle,
          lignes: ((data ?? []) as Record<string, unknown>[]).map((l) => ({
            medecinId: String(l.medecin_id),
            nomComplet: String(l.nom_complet ?? ""),
            specialite: String(l.specialite ?? ""),
            ville: String(l.ville ?? ""),
            noteMoyenne: Number(l.note_moyenne) || 0,
            nbAvis: Number(l.nb_avis) || 0,
            scorePondere: Number(l.score_pondere) || 0,
            eligibleRecompense: Boolean(l.eligible_recompense),
            nbSansReponse: Number(l.nb_sans_reponse) || 0,
          })),
        });
      });
    return () => {
      actif = false;
    };
  }, [ordre, limite, cle]);

  const aJour = resultat?.cle === cle;
  return { lignes: aJour ? resultat.lignes : [], chargement: !aJour };
}

/** Seuil d'avis à partir duquel une moyenne est jugée représentative. */
export function useSeuilFiabilite(): number {
  const { donnees } = utiliserRequete<number>(3, async () => {
    const { data } = await creerClientNavigateur().rpc("avis_seuil_fiabilite");
    return Number(data) || 3;
  });
  return donnees;
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

/**
 * Ajoute une entrée à un référentiel.
 *
 * `emoji` ne concerne que les spécialités : la colonne existe sur cette seule
 * table, et la laisser vide revenait à afficher le même stéthoscope pour
 * toutes les spécialités ajoutées après le seed.
 */
export async function ajouterAListeContenu(
  cle: CleListeContenu,
  valeur: string,
  emoji?: string
): Promise<{ erreur?: string }> {
  // Un insert par branche plutôt qu'une ligne construite à l'avance : les
  // colonnes diffèrent d'une table à l'autre, et le client Supabase type
  // chaque appel à partir de la table visée.
  const client = creerClientNavigateur();
  const { error } =
    cle === "assurances"
      ? await client.from(cle).insert({ libelle: valeur })
      : cle === "specialites"
        ? await client.from(cle).insert({ nom: valeur, emoji: emoji ?? emojiSpecialite(valeur) })
        : await client.from(cle).insert({ nom: valeur });
  if (error) {
    return {
      erreur:
        error.code === "23505"
          ? "Cette entrée existe déjà."
          : "Ajout refusé : le référentiel est réservé aux administrateurs.",
    };
  }
  await tracerAudit("A ajouté une entrée de référentiel", `${cle} · ${valeur}`);
  return {};
}

/**
 * Icône suggérée pour une spécialité en cours de saisie.
 *
 * Le dictionnaire répond seul dans la quasi-totalité des cas, sans réseau ni
 * latence. La route serveur — donc l'IA, donc un appel facturé — n'est
 * sollicitée que pour un nom qu'il ne reconnaît pas.
 */
export async function suggererEmojiSpecialite(nom: string): Promise<string> {
  const connu = devinerEmojiSpecialite(nom);
  if (connu) return connu;
  try {
    const reponse = await fetch("/api/admin/emoji-specialite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nom }),
    });
    const { emoji } = (await reponse.json()) as { emoji?: string };
    if (reponse.ok && emoji) return emoji;
  } catch {
    // Hors ligne ou route indisponible : la pastille de secours suffit,
    // l'admin peut de toute façon corriger l'icône à la main.
  }
  return emojiDeSecours(nom);
}

/* ===== Spécialités (liste plate, mais porteuse d'une icône) ===== */

export interface SpecialiteAdmin {
  id: string;
  nom: string;
  emoji: string;
}

/**
 * Comme `useListeContenu("specialites")`, mais en conservant l'icône : l'écran
 * d'administration affiche la vignette telle que les patients la verront sur
 * l'accueil, ce qu'une simple liste de noms ne permettait pas.
 */
export function useSpecialitesAdmin(): {
  specialites: SpecialiteAdmin[];
  recharger: () => void;
} {
  const { donnees, recharger } = utiliserRequete<SpecialiteAdmin[]>([], async () => {
    const { data } = await creerClientNavigateur()
      .from("specialites")
      .select("id, nom, emoji")
      .order("nom");
    return ((data ?? []) as { id: string; nom: string; emoji: string | null }[]).map((s) => ({
      ...s,
      emoji: s.emoji ?? emojiSpecialite(s.nom),
    }));
  });
  return { specialites: donnees, recharger };
}

/**
 * Retire une spécialité du référentiel.
 *
 * `medecins.specialite_id` la référence sans `on delete` : Postgres refuse
 * donc la suppression tant qu'un praticien y est rattaché. C'est le bon
 * comportement — effacer la spécialité viderait sa fiche — mais le code
 * d'erreur brut n'apprendrait rien à l'admin, d'où le message explicite.
 */
export async function retirerSpecialite(id: string, nom: string): Promise<{ erreur?: string }> {
  const { data, error } = await creerClientNavigateur()
    .from("specialites")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) {
    return {
      erreur:
        error.code === "23503"
          ? `« ${nom} » ne peut pas être retirée : des professionnels y sont rattachés.`
          : "Suppression refusée : le référentiel est réservé aux administrateurs.",
    };
  }
  // Un DELETE bloqué par la RLS ne lève rien : il touche zéro ligne.
  if (!data || data.length === 0) return { erreur: "Suppression refusée." };
  await tracerAudit("A retiré une spécialité du référentiel", nom);
  return {};
}

/** Corrige l'icône d'une spécialité déjà référencée. */
export async function changerEmojiSpecialite(
  id: string,
  nom: string,
  emoji: string
): Promise<{ erreur?: string }> {
  const { data, error } = await creerClientNavigateur()
    .from("specialites")
    .update({ emoji })
    .eq("id", id)
    .select("id");
  if (error) return { erreur: "Modification refusée : le référentiel est réservé aux administrateurs." };
  // Un UPDATE bloqué par la RLS ne lève rien : il touche zéro ligne.
  if (!data || data.length === 0) return { erreur: "Modification refusée." };
  await tracerAudit("A modifié l'icône d'une spécialité", `${nom} · ${emoji}`);
  return {};
}

/* ===== Communes (référentiel rattaché à une ville, migration 0023) ===== */

export interface CommuneAdmin {
  id: string;
  nom: string;
}

export function useCommunesAdmin(villeId: string | undefined): {
  communes: CommuneAdmin[];
  recharger: () => void;
} {
  const { donnees, recharger } = utiliserRequete<CommuneAdmin[]>(
    [],
    async () => {
      if (!villeId) return [];
      const { data } = await creerClientNavigateur()
        .from("communes")
        .select("id, nom")
        .eq("ville_id", villeId)
        .order("nom");
      return data ?? [];
    },
    [villeId]
  );
  return { communes: donnees, recharger };
}

export async function ajouterCommune(
  villeId: string,
  nom: string
): Promise<{ erreur?: string }> {
  const { error } = await creerClientNavigateur()
    .from("communes")
    .insert({ ville_id: villeId, nom });
  if (error) {
    // La contrainte unique (ville, nom) est le cas courant : l'admin
    // retape une commune déjà présente. Le message brut de Postgres ne lui
    // apprendrait rien.
    return {
      erreur:
        error.code === "23505"
          ? "Cette commune existe déjà."
          : "Ajout refusé : le référentiel est réservé aux administrateurs.",
    };
  }
  await tracerAudit("A ajouté une commune au référentiel", nom);
  return {};
}

export async function retirerCommune(id: string, nom: string): Promise<{ erreur?: string }> {
  const { data, error } = await creerClientNavigateur()
    .from("communes")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return { erreur: "Suppression refusée : le référentiel est réservé aux administrateurs." };
  // Un DELETE bloqué par la RLS ne lève rien : il touche zéro ligne.
  if (!data || data.length === 0) return { erreur: "Suppression refusée." };
  await tracerAudit("A retiré une commune du référentiel", nom);
  return {};
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

/** Message rendu à l'écran quand la RLS refuse l'écriture sans lever d'erreur. */
export const ERREUR_DROIT_FINANCE =
  "Tarifs non enregistrés : leur modification est réservée aux administrateurs disposant du sous-rôle « Finance ».";

/**
 * Explique un refus de la RLS en français. Sans ça, un visiteur qui n'est pas
 * administrateur lisait « réservé au sous-rôle Finance » (faux : il lui manque
 * le rôle admin tout court) suivi du message brut de PostgreSQL.
 * Appelée seulement sur le chemin d'erreur : deux allers-retours de plus, mais
 * uniquement quand l'enregistrement a déjà échoué.
 */
async function messageRefus(): Promise<string> {
  const supabase = creerClientNavigateur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return "Session expirée — reconnectez-vous pour enregistrer.";
  const { data: admin } = await supabase.rpc("est_admin");
  if (!admin) {
    return "Enregistrement refusé : ce compte n'est pas un compte administrateur.";
  }
  return ERREUR_DROIT_FINANCE;
}

export interface ConsommationSmsFormule {
  formule: string;
  abonnes: number;
  quotaTotal: number;
  consommes: number;
  coutGnf: number;
}

/**
 * Consommation SMS du mois en cours, agrégée par formule.
 *
 * Ce que l'admin doit voir : ce qu'il devra à l'agrégateur ce mois-ci, et
 * quelles formules approchent de leur quota — c'est le signe d'un palier mal
 * calibré, à corriger avant qu'il ne coûte plus qu'il ne rapporte.
 *
 * La vue `consommation_sms_mois` applique la RLS de l'appelant : un admin sans
 * le sous-rôle Finance ne verra rien, ce qui est voulu (spec C.7.10).
 */
export function useConsommationSms(): { formules: ConsommationSmsFormule[]; total: ConsommationSmsFormule } {
  const { donnees } = utiliserRequete<ConsommationSmsFormule[]>([], async () => {
    const { data } = await creerClientNavigateur()
      .from("consommation_sms_mois")
      .select("formule, quota_sms, consommes, cout_gnf");
    const lignes = (data ?? []) as { formule: string; quota_sms: number; consommes: number; cout_gnf: number }[];
    const parFormule = new Map<string, ConsommationSmsFormule>();
    for (const l of lignes) {
      const acc = parFormule.get(l.formule) ?? { formule: l.formule, abonnes: 0, quotaTotal: 0, consommes: 0, coutGnf: 0 };
      acc.abonnes += 1;
      acc.quotaTotal += l.quota_sms;
      acc.consommes += l.consommes;
      acc.coutGnf += l.cout_gnf;
      parFormule.set(l.formule, acc);
    }
    return [...parFormule.values()].sort((a, b) => b.coutGnf - a.coutGnf);
  });

  const total = donnees.reduce(
    (t, f) => ({
      formule: "Total",
      abonnes: t.abonnes + f.abonnes,
      quotaTotal: t.quotaTotal + f.quotaTotal,
      consommes: t.consommes + f.consommes,
      coutGnf: t.coutGnf + f.coutGnf,
    }),
    { formule: "Total", abonnes: 0, quotaTotal: 0, consommes: 0, coutGnf: 0 }
  );
  return { formules: donnees, total };
}

export interface LigneTarif {
  formule: string;
  prixMensuel: number;
  prixAnnuel: number;
  essaiJours: number;
  /** SMS inclus dans la formule, par période facturée. */
  quotaSms: number;
  /** Taille visée par un palier établissement ; nul pour une formule médecin. */
  medecinsMin: number | null;
  /** Nul = pas de plafond (le « + » de « 16+ »). */
  medecinsMax: number | null;
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
      quotaSms: t.quota_sms,
      medecinsMin: t.medecins_min,
      medecinsMax: t.medecins_max,
    }));
  });

  async function enregistrer(formule: string, d: Partial<LigneTarif>): Promise<{ erreur?: string }> {
    const maj: Record<string, unknown> = {};
    if (d.prixMensuel !== undefined) maj.prix_mensuel = d.prixMensuel;
    if (d.prixAnnuel !== undefined) maj.prix_annuel = d.prixAnnuel;
    if (d.essaiJours !== undefined) maj.essai_jours = d.essaiJours;
    if (d.quotaSms !== undefined) maj.quota_sms = d.quotaSms;
    // `null` est une valeur voulue (pas de plafond) : tester `!== undefined`
    // et non la véracité, sinon vider le champ n'effacerait jamais la borne.
    if (d.medecinsMin !== undefined) maj.medecins_min = d.medecinsMin;
    if (d.medecinsMax !== undefined) maj.medecins_max = d.medecinsMax;
    const { data, error } = await creerClientNavigateur()
      .from("tarifs_plateforme")
      .update(maj)
      .eq("formule", formule)
      .select("formule");
    if (error) return { erreur: error.message };
    // La policy `mod_tarifs` exige le sous-rôle Finance : pour un admin qui ne
    // l'a pas, l'UPDATE touche 0 ligne SANS remonter d'erreur. Sans ce
    // contrôle l'écran annonçait « ✓ Enregistré » alors que rien n'était écrit.
    if (!data?.length) return { erreur: await messageRefus() };
    recharger();
    return {};
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

export async function ecrireReglageBool(cle: string, valeur: boolean): Promise<{ erreur?: string }> {
  const { data, error } = await creerClientNavigateur()
    .from("parametres_plateforme")
    .upsert({ cle, valeur })
    .select("cle");
  // Un refus de la RLS remonte ici en clair (code 42501, « new row violates
  // row-level security policy ») : on le traduit plutôt que de l'afficher brut.
  if (error) {
    const refus = error.code === "42501" || /row-level security/i.test(error.message);
    return { erreur: refus ? await messageRefus() : error.message };
  }
  // Même piège que les tarifs : un upsert qui retombe sur l'UPDATE et se fait
  // refuser par la RLS ne renvoie ni erreur ni ligne.
  if (!data?.length) return { erreur: await messageRefus() };
  return {};
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

/**
 * Ferme définitivement un compte. Passe par le serveur : l'opération
 * bannit le compte d'authentification, ce qu'aucune clé navigateur ne
 * permet. Les refus (son propre compte, un autre administrateur) sont
 * décidés là-bas, la vérification ne pouvant pas vivre dans le client.
 */
export async function supprimerCompteUtilisateur(id: string): Promise<{ erreur?: string }> {
  try {
    const reponse = await fetch("/api/admin/utilisateurs/supprimer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const corps = await reponse.json().catch(() => ({}));
    return reponse.ok ? {} : { erreur: corps.erreur ?? "La suppression a échoué." };
  } catch {
    return { erreur: "Connexion impossible. Vérifiez votre réseau, puis réessayez." };
  }
}
