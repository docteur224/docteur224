/*
 * Catalogue des permissions administrateur (migration 0043).
 *
 * Une permission par section de la console : c'est la seule granularité qui
 * se tienne à l'écran comme dans la RLS, où une policy porte sur une table
 * entière et non sur une colonne. Le tableau de bord n'y figure pas — il est
 * ouvert à tout administrateur.
 *
 * La liste des clés est la copie EXACTE de la fonction SQL
 * `permissions_admin()` : la base refuse toute clé qu'elle ne connaît pas,
 * une divergence se verrait donc immédiatement à l'enregistrement.
 *
 * Aucune directive "use client" : ce fichier est lu par les écrans comme par
 * les routes serveur qui vérifient les droits de l'appelant.
 */

export const PERMISSIONS = [
  "validations",
  "moderation",
  "utilisateurs",
  "etablissements",
  "pilotage",
  "finance",
  "messagerie",
  "parametres",
  "equipe",
  "audit",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export interface DefinitionPermission {
  cle: Permission;
  titre: string;
  detail: string;
  icone: string;
}

export const CATALOGUE_PERMISSIONS: DefinitionPermission[] = [
  {
    cle: "validations",
    titre: "Validations",
    detail: "Approuver ou rejeter les dossiers des professionnels",
    icone: "✅",
  },
  {
    cle: "moderation",
    titre: "Modération",
    detail: "Signalements et avis des patients",
    icone: "🚩",
  },
  {
    cle: "utilisateurs",
    titre: "Utilisateurs",
    detail: "Suspendre, réactiver ou fermer un compte",
    icone: "👥",
  },
  {
    cle: "etablissements",
    titre: "Établissements",
    detail: "Structures inscrites et requalification de palier",
    icone: "🏥",
  },
  {
    cle: "pilotage",
    titre: "Pilotage & annonces",
    detail: "Couverture, mises en vedette, diffusion d’annonces",
    icone: "🧭",
  },
  {
    cle: "finance",
    titre: "Finances & abonnements",
    detail: "Revenus, paiements, remboursements, grille tarifaire",
    icone: "💳",
  },
  {
    cle: "messagerie",
    titre: "Messagerie",
    detail: "Configuration des envois SMS et e-mail",
    icone: "💬",
  },
  {
    cle: "parametres",
    titre: "Paramètres & référentiels",
    detail: "Réglages de la plateforme, spécialités, villes, communes",
    icone: "⚙️",
  },
  {
    cle: "equipe",
    titre: "Équipe admin",
    detail: "Créer des comptes administrateurs et régler leurs permissions",
    icone: "🛡️",
  },
  {
    cle: "audit",
    titre: "Journal d’audit",
    detail: "Consulter la trace des décisions prises",
    icone: "📜",
  },
];

/*
 * Rôles : des raccourcis, pas une seconde source de vérité. Ce qui est
 * stocké en base reste la liste des permissions ; le rôle affiché est
 * DÉDUIT d'elle. Deux modèles superposés (un rôle en colonne + des
 * permissions à côté) finissent toujours par se contredire.
 */
export type CleRole = "super-admin" | "moderation" | "support" | "finance" | "pilotage";

export interface DefinitionRole {
  cle: CleRole;
  libelle: string;
  detail: string;
  permissions: Permission[];
}

export const ROLES: DefinitionRole[] = [
  {
    cle: "super-admin",
    libelle: "super-admin",
    detail: "Accès complet, y compris la gestion de l’équipe",
    permissions: [...PERMISSIONS],
  },
  {
    cle: "moderation",
    libelle: "modération",
    detail: "Validations, signalements et avis",
    permissions: ["validations", "moderation", "etablissements"],
  },
  {
    cle: "support",
    libelle: "support",
    detail: "Comptes utilisateurs et messagerie",
    permissions: ["utilisateurs", "messagerie"],
  },
  {
    cle: "finance",
    libelle: "finance",
    detail: "Revenus, abonnements et envois facturés",
    permissions: ["finance", "messagerie"],
  },
  {
    cle: "pilotage",
    libelle: "pilotage",
    detail: "Croissance, annonces, référentiels",
    permissions: ["pilotage", "parametres", "audit"],
  },
];

/** Libellé du rôle correspondant à un jeu de permissions, sinon « personnalisé ». */
export function libelleRole(permissions: string[]): string {
  const cle = [...permissions].sort().join("|");
  const role = ROLES.find((r) => [...r.permissions].sort().join("|") === cle);
  if (role) return role.libelle;
  return permissions.length === 0 ? "aucune permission" : "personnalisé";
}

export const permissionsDuRole = (cle: CleRole): Permission[] =>
  [...(ROLES.find((r) => r.cle === cle)?.permissions ?? [])];

/*
 * Quelle permission ouvre quel écran. Sert à la barre latérale (ne montrer
 * que ce qui est atteignable) ET à la garde de page dans AdminShell : un
 * lien masqué reste tapable dans la barre d'adresse.
 *
 * Les écrans absents de cette table sont ouverts à tout administrateur :
 * tableau de bord et hub mobile « Plus ».
 */
export const PERMISSION_PAR_ROUTE: Record<string, Permission> = {
  "/espace-admin/validations": "validations",
  "/espace-admin/moderation": "moderation",
  "/espace-admin/utilisateurs": "utilisateurs",
  "/espace-admin/etablissements": "etablissements",
  "/espace-admin/pilotage": "pilotage",
  "/espace-admin/annonces": "pilotage",
  "/espace-admin/finances": "finance",
  "/espace-admin/abonnements": "finance",
  "/espace-admin/messagerie": "messagerie",
  "/espace-admin/parametres": "parametres",
  "/espace-admin/equipe": "equipe",
  "/espace-admin/audit": "audit",
};

/** Le compte principal détient tout, sans que rien ne soit écrit dans sa liste. */
export function aPermission(
  droits: { permissions: string[]; principal: boolean } | null,
  permission: Permission
): boolean {
  if (!droits) return false;
  return droits.principal || droits.permissions.includes(permission);
}

/**
 * Mot de passe provisoire proposé à la création d'un compte : lisible à voix
 * haute (il se communique de vive voix), sans caractère ambigu — I, l, 1, O
 * et 0 se ressemblent trop pour être dictés.
 */
export function motDePasseProvisoire(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const tirage = new Uint32Array(14);
  crypto.getRandomValues(tirage);
  return [...tirage].map((n) => alphabet[n % alphabet.length]).join("");
}
