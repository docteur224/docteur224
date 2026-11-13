/**
 * Menus du tiroir mobile — la NAVIGATION mobile de chaque espace (le tiroir
 * ouvert par l'avatar de la barre haute).
 *
 * Règle de répartition (mobile uniquement) :
 *   - Tiroir latéral  = navigation : aller vers un écran de travail / consulter.
 *   - Page « Profil »  = gestion du compte et de la pratique (configurer,
 *                        administratif) → voir app/espace-*\/compte/page.tsx.
 *   - Barre du bas     = inchangée.
 *
 * Les cinq rôles ont désormais un tiroir découpé en sections (GROUPES_NAV),
 * miroir de la barre latérale web. Pour médecin / assistant / établissement,
 * seules les entrées de navigation y figurent : les entrées de compte/pratique
 * ont migré vers la Page Profil. Pour patient / admin, le tiroir conserve
 * toutes les entrées (compte compris) : ils n'ont pas de Page Profil dédiée.
 */
import type { PermissionsAssistante } from "@/lib/pro";

export type EntreeMenu = {
  href: string;
  icone: string;
  label: string;
  /**
   * Assistant(e) seulement : l'entrée n'est montrée que si le médecin a
   * accordé cette permission. Les pages concernées se protègent déjà
   * elles-mêmes ; on évite en plus de proposer un lien qui mène à un refus.
   */
  permission?: keyof PermissionsAssistante;
};

/** Un bloc de navigation, avec un titre de section optionnel. */
export type GroupeMenu = { titre?: string; entrees: EntreeMenu[] };

export type RoleMenu = "patient" | "medecin" | "assistant" | "etablissement" | "admin";

/** Libellé affiché sous le nom, dans l'en-tête du tiroir. */
export const LIBELLE_ROLE: Record<RoleMenu, string> = {
  patient: "Patient",
  medecin: "Médecin",
  assistant: "Assistant(e)",
  etablissement: "Établissement",
  admin: "Administrateur",
};

/**
 * Navigation en sections — médecin et assistant.
 *
 * NB : « Messages » (et non « Correspondance » / « Messagerie ») partout, et
 * le même href que la barre du bas (/espace-*\/messages), pour un libellé et
 * une destination uniques. La section « Suivi & retours » n'existe que pour le
 * médecin : l'assistant(e) n'a ni page avis/statistiques ni permission dédiée.
 */
export const GROUPES_NAV: Partial<Record<RoleMenu, GroupeMenu[]>> = {
  // Mêmes sections que la barre latérale web (components/patient/PatientShell).
  // Le patient garde toutes ses entrées, compte inclus : pas de Page Profil
  // dédiée comme chez le médecin.
  patient: [
    {
      titre: "Au quotidien",
      entrees: [
        { href: "/patient", icone: "📊", label: "Tableau de bord" },
        { href: "/resultats", icone: "🩺", label: "Prendre rendez-vous" },
        { href: "/mes-rendez-vous", icone: "📅", label: "Mes rendez-vous" },
      ],
    },
    {
      titre: "Mon suivi",
      entrees: [
        { href: "/patient/documents", icone: "📄", label: "Mes documents" },
        { href: "/patient/proches", icone: "👨‍👩‍👧", label: "Mes proches" },
        { href: "/patient/favoris", icone: "♥", label: "Mes favoris" },
        { href: "/patient/avis", icone: "⭐", label: "Mes avis" },
      ],
    },
    {
      titre: "Échanges",
      entrees: [
        { href: "/patient/messages", icone: "💬", label: "Messages" },
        { href: "/patient/notifications", icone: "🔔", label: "Notifications" },
      ],
    },
    {
      titre: "Compte",
      entrees: [
        { href: "/patient/profil", icone: "👤", label: "Mon profil" },
        { href: "/patient/mon-compte", icone: "🔐", label: "Mon compte" },
        { href: "/patient/parametres", icone: "⚙️", label: "Paramètres" },
      ],
    },
  ],
  medecin: [
    {
      titre: "Mon activité",
      entrees: [
        { href: "/espace-medecin", icone: "📊", label: "Tableau de bord" },
        { href: "/espace-medecin/agenda", icone: "📅", label: "Mon agenda" },
        { href: "/espace-medecin/patients", icone: "👥", label: "Mes patients" },
        { href: "/espace-medecin/messages", icone: "📨", label: "Messages" },
        { href: "/espace-medecin/suivi-absence", icone: "📉", label: "Suivi d’absence" },
      ],
    },
    {
      titre: "Suivi & retours",
      entrees: [
        { href: "/espace-medecin/avis", icone: "⭐", label: "Avis et notes" },
        { href: "/espace-medecin/statistiques", icone: "📈", label: "Statistiques" },
      ],
    },
  ],
  assistant: [
    {
      titre: "Mon activité",
      entrees: [
        { href: "/espace-assistant", icone: "🗓️", label: "Tableau de bord" },
        { href: "/espace-assistant/rendez-vous", icone: "📅", label: "Agenda", permission: "voirAgenda" },
        { href: "/espace-assistant/creneaux", icone: "🕐", label: "Créneaux & dispos", permission: "gererCreneaux" },
        { href: "/espace-assistant/patients", icone: "👥", label: "Patients" },
        { href: "/espace-assistant/messages", icone: "💬", label: "Messages", permission: "messagerie" },
        { href: "/espace-assistant/suivi-absence", icone: "📉", label: "Suivi d’absence" },
      ],
    },
  ],
  etablissement: [
    {
      titre: "Pilotage",
      entrees: [
        { href: "/espace-etablissement", icone: "📊", label: "Tableau de bord" },
        { href: "/espace-etablissement/medecins", icone: "👨‍⚕️", label: "Médecins" },
        { href: "/espace-etablissement/statistiques", icone: "📈", label: "Statistiques" },
      ],
    },
  ],
  // Mêmes sections que la barre latérale web (components/admin/AdminShell).
  // Comme le patient, l'admin garde toutes ses entrées dans le tiroir (compte
  // compris) : pas de Page Profil dédiée. La visibilité par permission est
  // appliquée par TiroirMobile (PERMISSION_PAR_ROUTE) ; une section dont tout
  // est filtré disparaît.
  admin: [
    {
      titre: "Général",
      entrees: [
        { href: "/espace-admin", icone: "📊", label: "Tableau de bord" },
        { href: "/espace-admin/nouveau-rdv", icone: "📞", label: "Prise de RDV" },
      ],
    },
    {
      titre: "Supervision",
      entrees: [
        { href: "/espace-admin/validations", icone: "✅", label: "Validations" },
        { href: "/espace-admin/moderation", icone: "🚩", label: "Modération" },
        { href: "/espace-admin/utilisateurs", icone: "👥", label: "Utilisateurs" },
        { href: "/espace-admin/etablissements", icone: "🏥", label: "Établissements" },
      ],
    },
    {
      titre: "Croissance",
      entrees: [
        { href: "/espace-admin/pilotage", icone: "🧭", label: "Pilotage & croissance" },
        { href: "/espace-admin/annonces", icone: "📢", label: "Annonces" },
      ],
    },
    {
      titre: "Finances",
      entrees: [
        { href: "/espace-admin/finances", icone: "💳", label: "Finances" },
        { href: "/espace-admin/abonnements", icone: "🏷️", label: "Abonnements" },
      ],
    },
    {
      titre: "Plateforme",
      entrees: [
        { href: "/espace-admin/messagerie", icone: "💬", label: "Messagerie" },
        { href: "/espace-admin/parametres", icone: "⚙️", label: "Paramètres" },
        { href: "/espace-admin/medicaments", icone: "💊", label: "Médicaments" },
        { href: "/espace-admin/actes", icone: "🔬", label: "Analyses et imagerie" },
      ],
    },
    {
      titre: "Console admin",
      entrees: [
        { href: "/espace-admin/equipe", icone: "🛡️", label: "Équipe admin" },
        { href: "/espace-admin/audit", icone: "📜", label: "Journal d'audit" },
        { href: "/espace-admin/mon-compte", icone: "🔐", label: "Mon compte" },
      ],
    },
  ],
};

export const MENUS: Record<RoleMenu, EntreeMenu[]> = {
  // Navigation mobile = GROUPES_NAV ; version plate conservée comme repli.
  patient: GROUPES_NAV.patient!.flatMap((g) => g.entrees),
  medecin: GROUPES_NAV.medecin!.flatMap((g) => g.entrees),
  assistant: GROUPES_NAV.assistant!.flatMap((g) => g.entrees),
  etablissement: GROUPES_NAV.etablissement!.flatMap((g) => g.entrees),
  admin: GROUPES_NAV.admin!.flatMap((g) => g.entrees),
};

/** Raccourcis communs, sous le menu du rôle. */
export const RACCOURCIS_PATIENT: EntreeMenu[] = [
  { href: "/resultats", icone: "🔎", label: "Trouver un médecin" },
  { href: "/#comment-ca-marche", icone: "💡", label: "Comment ça marche" },
];

/**
 * Le menu du rôle, toujours sous forme de sections. Les cinq rôles ont leur
 * entrée dans GROUPES_NAV ; le repli (un unique groupe sans titre tiré de
 * MENUS) ne sert plus que de filet pour un rôle qui n'y figurerait pas.
 */
export function menuDuRole(role: string | undefined): { role: RoleMenu; groupes: GroupeMenu[] } {
  const connu = (["patient", "medecin", "assistant", "etablissement", "admin"] as const).find(
    (r) => r === role
  );
  const retenu: RoleMenu = connu ?? "patient";
  const groupes = GROUPES_NAV[retenu] ?? [{ entrees: MENUS[retenu] }];
  return { role: retenu, groupes };
}
