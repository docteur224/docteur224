/**
 * Menus du tiroir mobile — miroir exact des barres latérales web de chaque
 * espace (composants *Shell.tsx). C'est ce qui garantit la règle : rien
 * d'atteignable sur desktop ne doit être inatteignable sur mobile, où la
 * tabbar ne peut porter que 4 destinations.
 *
 * Toute entrée ajoutée à une sidebar doit l'être ici aussi.
 */
export type EntreeMenu = { href: string; icone: string; label: string };

export type RoleMenu = "patient" | "medecin" | "assistant" | "etablissement" | "admin";

/** Libellé affiché sous le nom, dans l'en-tête du tiroir. */
export const LIBELLE_ROLE: Record<RoleMenu, string> = {
  patient: "Patient",
  medecin: "Médecin",
  assistant: "Assistant(e)",
  etablissement: "Établissement",
  admin: "Administrateur",
};

export const MENUS: Record<RoleMenu, EntreeMenu[]> = {
  // components/patient/PatientShell.tsx
  patient: [
    { href: "/patient", icone: "📊", label: "Tableau de bord" },
    { href: "/mes-rendez-vous", icone: "📅", label: "Mes rendez-vous" },
    { href: "/patient/documents", icone: "📄", label: "Mes documents" },
    { href: "/patient/favoris", icone: "♥", label: "Mes favoris" },
    { href: "/patient/proches", icone: "👨‍👩‍👧", label: "Mes proches" },
    { href: "/patient/avis", icone: "⭐", label: "Mes avis" },
    { href: "/patient/notifications", icone: "🔔", label: "Notifications" },
    { href: "/patient/profil", icone: "👤", label: "Mon profil" },
    { href: "/patient/mon-compte", icone: "🔐", label: "Mon compte" },
    { href: "/patient/parametres", icone: "⚙️", label: "Paramètres" },
  ],
  // components/medecin/MedecinShell.tsx
  medecin: [
    { href: "/espace-medecin", icone: "📊", label: "Tableau de bord" },
    { href: "/espace-medecin/agenda", icone: "📅", label: "Mon agenda" },
    { href: "/espace-medecin/patients", icone: "👥", label: "Mes patients" },
    { href: "/espace-medecin/correspondance", icone: "📨", label: "Correspondance" },
    { href: "/espace-medecin/disponibilites", icone: "🕐", label: "Mes disponibilités" },
    { href: "/espace-medecin/avis", icone: "⭐", label: "Avis et notes" },
    { href: "/espace-medecin/statistiques", icone: "📈", label: "Statistiques" },
    { href: "/espace-medecin/equipe", icone: "🧑‍💼", label: "Mes assistant(e)s" },
    { href: "/espace-medecin/abonnement", icone: "💳", label: "Mon abonnement" },
    { href: "/espace-medecin/paiements", icone: "🧾", label: "Mes paiements" },
    { href: "/espace-medecin/profil", icone: "👤", label: "Mon profil" },
    { href: "/espace-medecin/mon-compte", icone: "🔐", label: "Mon compte" },
  ],
  // components/assistant/AssistantShell.tsx
  assistant: [
    { href: "/espace-assistant", icone: "🗓️", label: "Tableau de bord" },
    { href: "/espace-assistant/rendez-vous", icone: "📅", label: "Rendez-vous" },
    { href: "/espace-assistant/creneaux", icone: "🕐", label: "Créneaux & dispos" },
    { href: "/espace-assistant/patients", icone: "👥", label: "Patients" },
    { href: "/espace-assistant/messages", icone: "💬", label: "Messagerie" },
    { href: "/espace-assistant/compte", icone: "👤", label: "Mes permissions" },
    { href: "/espace-assistant/mon-compte", icone: "🔐", label: "Mon compte" },
  ],
  // components/etablissement/EtablissementShell.tsx
  etablissement: [
    { href: "/espace-etablissement", icone: "📊", label: "Tableau de bord" },
    { href: "/espace-etablissement/medecins", icone: "👨‍⚕️", label: "Médecins" },
    { href: "/espace-etablissement/informations", icone: "🏥", label: "Informations" },
    { href: "/espace-etablissement/statistiques", icone: "📈", label: "Statistiques" },
    { href: "/espace-etablissement/abonnement", icone: "💳", label: "Abonnement" },
    { href: "/espace-etablissement/compte", icone: "⚙️", label: "Compte & paramètres" },
    { href: "/espace-etablissement/mon-compte", icone: "🔐", label: "Mon compte" },
  ],
  // components/admin/AdminShell.tsx
  admin: [
    { href: "/espace-admin", icone: "📊", label: "Tableau de bord" },
    { href: "/espace-admin/validations", icone: "✅", label: "Validations" },
    { href: "/espace-admin/moderation", icone: "🚩", label: "Modération" },
    { href: "/espace-admin/utilisateurs", icone: "👥", label: "Utilisateurs" },
    { href: "/espace-admin/etablissements", icone: "🏥", label: "Établissements" },
    { href: "/espace-admin/pilotage", icone: "🧭", label: "Pilotage & croissance" },
    { href: "/espace-admin/annonces", icone: "📢", label: "Annonces" },
    { href: "/espace-admin/finances", icone: "💳", label: "Finances" },
    { href: "/espace-admin/abonnements", icone: "🏷️", label: "Abonnements" },
    { href: "/espace-admin/messagerie", icone: "💬", label: "Messagerie" },
    { href: "/espace-admin/parametres", icone: "⚙️", label: "Paramètres" },
    { href: "/espace-admin/equipe", icone: "🛡️", label: "Équipe admin" },
    { href: "/espace-admin/audit", icone: "📜", label: "Journal d'audit" },
    { href: "/espace-admin/mon-compte", icone: "🔐", label: "Mon compte" },
  ],
};

/** Raccourcis communs, sous le menu du rôle. */
export const RACCOURCIS_PATIENT: EntreeMenu[] = [
  { href: "/resultats", icone: "🔎", label: "Trouver un médecin" },
  { href: "/#comment-ca-marche", icone: "💡", label: "Comment ça marche" },
];

export function menuDuRole(role: string | undefined): { role: RoleMenu; entrees: EntreeMenu[] } {
  const connu = (["patient", "medecin", "assistant", "etablissement", "admin"] as const).find(
    (r) => r === role
  );
  const retenu: RoleMenu = connu ?? "patient";
  return { role: retenu, entrees: MENUS[retenu] };
}
