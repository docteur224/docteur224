/*
 * Permissions d'un(e) assistant(e) (spec C.4.4) et profils qui les
 * regroupent.
 *
 * Le catalogue vivait dans /espace-medecin/equipe, donc hors de portée des
 * routes serveur : celles-ci ne pouvaient pas vérifier ce qu'on leur
 * envoyait. Il est ici, sans "use client", pour être la même liste des deux
 * côtés — écran et serveur.
 *
 * CE QUI N'EST PAS DANS CETTE LISTE ne s'accorde pas : les dossiers
 * médicaux et les données financières ne sont jamais accessibles à un(e)
 * assistant(e), quelles que soient les cases cochées. La barrière est
 * posée par la RLS, pas par cet écran.
 */

export const PERMISSIONS_ASSISTANT = [
  "voirAgenda",
  "confirmerAnnuler",
  "reprogrammer",
  "creerRdv",
  "messagerie",
  "gererCreneaux",
] as const;

export type PermissionAssistant = (typeof PERMISSIONS_ASSISTANT)[number];

/** Colonne `assistants` derrière chaque permission. */
export const COLONNE_PERMISSION: Record<PermissionAssistant, string> = {
  voirAgenda: "peut_voir_agenda",
  confirmerAnnuler: "peut_confirmer_annuler",
  reprogrammer: "peut_reprogrammer",
  creerRdv: "peut_creer_rdv",
  messagerie: "peut_messagerie",
  gererCreneaux: "peut_gerer_creneaux",
};

export const CATALOGUE_ASSISTANT: {
  cle: PermissionAssistant;
  titre: string;
  detail: string;
  icone: string;
}[] = [
  {
    cle: "voirAgenda",
    titre: "Voir l’agenda",
    detail: "Consulter les rendez-vous du médecin",
    icone: "📅",
  },
  {
    cle: "confirmerAnnuler",
    titre: "Confirmer / annuler les rendez-vous",
    detail: "Traiter les demandes des patients",
    icone: "✅",
  },
  {
    cle: "reprogrammer",
    titre: "Reprogrammer un rendez-vous",
    detail: "Déplacer un RDV vers un autre créneau",
    icone: "🔁",
  },
  {
    cle: "creerRdv",
    titre: "Créer un rendez-vous pour un patient",
    detail: "Réservation déléguée au nom d’un patient",
    icone: "➕",
  },
  {
    cle: "messagerie",
    titre: "Messagerie patients",
    detail: "Répondre aux messages (WhatsApp, chat)",
    icone: "💬",
  },
  {
    cle: "gererCreneaux",
    titre: "Ouvrir / fermer des créneaux",
    detail: "Activer ou désactiver les disponibilités",
    icone: "🕐",
  },
];

/*
 * Profils : des raccourcis pour ouvrir un compte en un geste. Comme pour les
 * administrateurs, rien d'autre que les permissions n'est stocké — le profil
 * affiché est déduit d'elles, sinon les deux finiraient par se contredire.
 */
export type CleProfil = "secretariat" | "agenda" | "accueil" | "lecture";

export const PROFILS: {
  cle: CleProfil;
  libelle: string;
  detail: string;
  permissions: PermissionAssistant[];
}[] = [
  {
    cle: "secretariat",
    libelle: "secrétariat complet",
    detail: "Agenda, rendez-vous, créneaux et messagerie",
    permissions: [...PERMISSIONS_ASSISTANT],
  },
  {
    cle: "agenda",
    libelle: "agenda",
    detail: "Consulter et traiter les rendez-vous, sans messagerie",
    permissions: ["voirAgenda", "confirmerAnnuler", "reprogrammer"],
  },
  {
    cle: "accueil",
    libelle: "accueil",
    detail: "Prendre les rendez-vous et répondre aux patients",
    permissions: ["voirAgenda", "creerRdv", "messagerie"],
  },
  {
    cle: "lecture",
    libelle: "lecture seule",
    detail: "Voir l’agenda, sans rien modifier",
    permissions: ["voirAgenda"],
  },
];

export function libelleProfil(permissions: string[]): string {
  const cle = [...permissions].sort().join("|");
  const profil = PROFILS.find((p) => [...p.permissions].sort().join("|") === cle);
  if (profil) return profil.libelle;
  return permissions.length === 0 ? "aucune permission" : "personnalisé";
}

export const permissionsDuProfil = (cle: CleProfil): PermissionAssistant[] => [
  ...(PROFILS.find((p) => p.cle === cle)?.permissions ?? []),
];

/** Les six colonnes `assistants`, prêtes pour un insert. */
export function colonnesPermissions(permissions: string[]): Record<string, boolean> {
  return Object.fromEntries(
    PERMISSIONS_ASSISTANT.map((cle) => [COLONNE_PERMISSION[cle], permissions.includes(cle)])
  );
}
