"use client";

import { useEffect, useState } from "react";
import { creerClientNavigateur } from "@/lib/supabase/client";

/*
 * « Mon compte » — la couche de données commune à TOUS les rôles.
 *
 * Volontairement un seul module, et non un par espace : ce que le compte
 * porte (mot de passe, suspension, fermeture, abonnement) ne dépend pas du
 * rôle. Cinq copies de ces fonctions auraient divergé au premier correctif,
 * et c'est déjà ce qui était arrivé — seul le patient pouvait changer son
 * mot de passe ou fermer son compte.
 */

/* ===== Abonnement ===== */

export interface AbonnementCompte {
  formule: string;
  periode: string;
  statut: string;
  dateDebut: string | null;
  dateFin: string | null;
  /** Quota vendu à la souscription (figé), pas celui de la grille du jour. */
  quotaSms: number;
  prixMensuel: number;
  prixAnnuel: number;
  assistantsInclus: number;
  /** Nul quand l'abonnement n'a pas de terme. */
  joursRestants: number | null;
}

export interface EvenementAbonnement {
  id: string;
  evenement: string;
  formule: string;
  periode: string;
  statut: string;
  detail: string;
  dateFin: string | null;
  creeLe: string;
  /** Vrai quand l'écriture vient du serveur : ni le titulaire ni un admin. */
  parLaPlateforme: boolean;
}

export interface VersementCompte {
  id: string;
  famille: "abonnement" | "recharge";
  objet: string;
  montantGnf: number;
  moyen: string;
  reference: string;
  statut: string;
  date: string;
  motif: string;
}

export interface DossierAbonnement {
  abonnement: AbonnementCompte | null;
  historique: EvenementAbonnement[];
  versements: VersementCompte[];
  chargement: boolean;
}

/** Libellés des événements de `historique_abonnements` (migration 0045). */
export const LIBELLE_EVENEMENT: Record<string, string> = {
  ouverture: "Souscription",
  changement_formule: "Changement de formule",
  changement_periode: "Changement de périodicité",
  activation: "Activation",
  expiration: "Expiration",
  resiliation: "Résiliation",
  renouvellement: "Renouvellement",
  mise_a_jour: "Mise à jour",
};

export const LIBELLE_STATUT_ABONNEMENT: Record<string, string> = {
  essai: "Essai gratuit",
  actif: "Actif",
  expire: "Expiré",
  annule: "Résilié",
};

/**
 * Tout ce que le titulaire doit voir de son abonnement : l'état courant,
 * son histoire, et l'argent versé.
 *
 * L'état vient de la fonction `mon_abonnement()` plutôt que d'un SELECT :
 * elle joint le tarif courant, que la RLS de `tarifs_plateforme` laisse
 * lire, et calcule les jours restants en base — un calcul fait dans le
 * navigateur donnerait un chiffre différent selon le fuseau du téléphone.
 */
const DOSSIER_VIDE: DossierAbonnement = {
  abonnement: null,
  historique: [],
  versements: [],
  chargement: false,
};

export function useDossierAbonnement(actif = true): DossierAbonnement {
  const [dossier, setDossier] = useState<DossierAbonnement | null>(null);

  useEffect(() => {
    // Rien à charger pour un rôle sans abonnement : on ne pose PAS l'état
    // en tête d'effet (le linter React l'interdit, à raison — c'est un
    // rendu en cascade), c'est le retour ci-dessous qui s'en charge.
    if (!actif) return;
    let vivant = true;
    (async () => {
      const supabase = creerClientNavigateur();
      const [{ data: courant }, { data: histo }, { data: paiements }, { data: sms }] =
        await Promise.all([
          supabase.rpc("mon_abonnement"),
          supabase
            .from("historique_abonnements")
            .select("id, evenement, formule, periode, statut, detail, date_fin, cree_le, auteur_id")
            .order("cree_le", { ascending: false })
            .limit(50),
          supabase
            .from("paiements_abonnement")
            .select("id, formule, periode, montant_gnf, moyen, reference, statut, motif_refus, cree_le, decide_le")
            .order("cree_le", { ascending: false })
            .limit(50),
          supabase
            .from("achats_sms")
            .select("id, segments, prix_gnf, moyen_paiement, reference, statut, motif_refus, cree_le, valide_le")
            .order("cree_le", { ascending: false })
            .limit(50),
        ]);
      if (!vivant) return;

      const l = ((courant ?? []) as Record<string, unknown>[])[0];
      const versements: VersementCompte[] = [
        ...((paiements ?? []) as Record<string, unknown>[]).map((p) => ({
          id: String(p.id),
          famille: "abonnement" as const,
          objet: `Abonnement ${p.formule} ${p.periode === "annuel" ? "annuel" : "mensuel"}`,
          montantGnf: Number(p.montant_gnf) || 0,
          moyen: String(p.moyen ?? ""),
          reference: String(p.reference ?? ""),
          statut: String(p.statut),
          date: String(p.decide_le ?? p.cree_le),
          motif: String(p.motif_refus ?? ""),
        })),
        ...((sms ?? []) as Record<string, unknown>[]).map((a) => ({
          id: String(a.id),
          famille: "recharge" as const,
          objet: `Recharge ${Number(a.segments).toLocaleString("fr-FR")} SMS`,
          montantGnf: Number(a.prix_gnf) || 0,
          moyen: String(a.moyen_paiement ?? ""),
          reference: String(a.reference ?? ""),
          // `achats_sms` dit « payé » là où un abonnement dit « confirmé ».
          statut: a.statut === "paye" ? "confirme" : String(a.statut),
          date: String(a.valide_le ?? a.cree_le),
          motif: String(a.motif_refus ?? ""),
        })),
      ].sort((x, y) => y.date.localeCompare(x.date));

      setDossier({
        abonnement: l
          ? {
              formule: String(l.formule),
              periode: String(l.periode),
              statut: String(l.statut),
              dateDebut: (l.date_debut as string) ?? null,
              dateFin: (l.date_fin as string) ?? null,
              quotaSms: Number(l.quota_sms) || 0,
              prixMensuel: Number(l.prix_mensuel) || 0,
              prixAnnuel: Number(l.prix_annuel) || 0,
              assistantsInclus: Number(l.assistants_inclus) || 0,
              joursRestants: l.jours_restants === null ? null : Number(l.jours_restants),
            }
          : null,
        historique: ((histo ?? []) as Record<string, unknown>[]).map((h) => ({
          id: String(h.id),
          evenement: String(h.evenement),
          formule: String(h.formule),
          periode: String(h.periode),
          statut: String(h.statut),
          detail: String(h.detail ?? ""),
          dateFin: (h.date_fin as string) ?? null,
          creeLe: String(h.cree_le),
          parLaPlateforme: h.auteur_id === null,
        })),
        versements,
        chargement: false,
      });
    })();
    return () => {
      vivant = false;
    };
  }, [actif]);

  if (!actif) return DOSSIER_VIDE;
  return dossier ?? { ...DOSSIER_VIDE, chargement: true };
}

/* ===== Suspension et fermeture ===== */

/**
 * Met le compte en pause, ou le remet en service.
 *
 * Un seul appel, en base (`basculer_suspension_compte`), parce que le geste
 * touche deux tables : le compte et la fiche publique du professionnel.
 * Enchaîner deux écritures depuis le navigateur laisserait, au premier
 * échec, un médecin « suspendu » toujours visible dans la recherche.
 */
export async function basculerSuspension(suspendre: boolean): Promise<{ erreur?: string }> {
  const { error } = await creerClientNavigateur().rpc("basculer_suspension_compte", {
    p_suspendre: suspendre,
  });
  // Les refus de la base sont écrits en français : les afficher tels quels
  // vaut mieux qu'un message générique qui masquerait la raison.
  return error ? { erreur: error.message } : {};
}

/**
 * Ferme définitivement le compte, quel que soit le rôle. Passe par le
 * serveur : l'opération bannit le compte d'authentification, ce qu'aucune
 * clé navigateur ne permet.
 */
export async function fermerMonCompte(): Promise<{ erreur?: string }> {
  try {
    const reponse = await fetch("/api/compte/supprimer", { method: "POST" });
    const corps = await reponse.json().catch(() => ({}));
    if (!reponse.ok) return { erreur: corps.erreur ?? "La fermeture a échoué. Réessayez." };
    await creerClientNavigateur().auth.signOut();
    return {};
  } catch {
    return { erreur: "Connexion impossible. Vérifiez votre réseau, puis réessayez." };
  }
}

/* ===== Ce que le compte a le droit de faire ===== */

export interface DroitsCompte {
  /** Un super-administrateur ne se suspend ni ne se ferme lui-même. */
  peutSuspendre: boolean;
  peutFermer: boolean;
  /** Seuls les professionnels ont un abonnement à consulter. */
  aUnAbonnement: boolean;
  motifBlocage: string | null;
}

const SANS_ABONNEMENT =
  "Votre compte est gratuit : la plateforme ne facture que les professionnels de santé.";

const SUPER_ADMIN_PROTEGE =
  "Un super-administrateur ne peut ni suspendre ni fermer son propre compte : c'est le recours de la plateforme si plus personne ne peut rendre la main. Demandez-le à un administrateur en charge de l'équipe.";

/**
 * Ce que l'écran doit proposer, d'après le rôle et — pour un administrateur —
 * l'étendue de ses permissions. La base applique les mêmes règles ; l'écran
 * ne fait que ne pas promettre ce qui serait refusé.
 */
export function droitsDuCompte(
  role: string | undefined,
  droitsAdmin: { permissions: string[]; principal: boolean } | null,
  nombreTotalPermissions: number
): DroitsCompte {
  const superAdmin =
    role === "admin" &&
    (droitsAdmin?.principal === true ||
      (droitsAdmin?.permissions.length ?? 0) >= nombreTotalPermissions);
  const aUnAbonnement = role === "medecin" || role === "etablissement";
  return {
    peutSuspendre: !superAdmin,
    peutFermer: !superAdmin,
    aUnAbonnement,
    motifBlocage: superAdmin ? SUPER_ADMIN_PROTEGE : null,
  };
}

export const MESSAGE_SANS_ABONNEMENT = SANS_ABONNEMENT;
