"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Barre d'onglets basse mobile — reproduit la .tabbar de la maquette mobile.
 * Une variante par rôle (mêmes 4 onglets que dans la maquette). Rendue
 * uniquement sous md (la version web ≥ md garde sa navigation actuelle).
 */
type Onglet = { href: string; icone: string; label: string; prefixes: string[] };

const ONGLETS: Record<string, Onglet[]> = {
  public: [
    { href: "/", icone: "🏠", label: "Accueil", prefixes: ["/"] },
    { href: "/resultats", icone: "🔎", label: "Recherche", prefixes: ["/resultats", "/medecin"] },
    { href: "/mes-rendez-vous", icone: "📅", label: "Mes RDV", prefixes: ["/mes-rendez-vous"] },
    { href: "/patient/compte", icone: "👤", label: "Profil", prefixes: ["/patient"] },
  ],
  medecin: [
    { href: "/espace-medecin", icone: "📊", label: "Tableau", prefixes: ["/espace-medecin"] },
    {
      href: "/espace-medecin/agenda",
      icone: "📅",
      label: "Agenda",
      prefixes: ["/espace-medecin/agenda", "/espace-medecin/nouveau-rdv"],
    },
    { href: "/espace-medecin/patients", icone: "👥", label: "Patients", prefixes: ["/espace-medecin/patients"] },
    {
      href: "/espace-medecin/compte",
      icone: "👤",
      label: "Profil",
      prefixes: [
        "/espace-medecin/compte",
        "/espace-medecin/profil",
        "/espace-medecin/disponibilites",
        "/espace-medecin/statistiques",
        "/espace-medecin/equipe",
        "/espace-medecin/abonnement",
      ],
    },
  ],
  assistant: [
    { href: "/espace-assistant", icone: "🗓️", label: "Accueil", prefixes: ["/espace-assistant"] },
    {
      href: "/espace-assistant/rendez-vous",
      icone: "📅",
      label: "RDV",
      prefixes: ["/espace-assistant/rendez-vous", "/espace-assistant/nouveau-rdv"],
    },
    { href: "/espace-assistant/messages", icone: "💬", label: "Messages", prefixes: ["/espace-assistant/messages"] },
    {
      href: "/espace-assistant/compte",
      icone: "👤",
      label: "Compte",
      prefixes: ["/espace-assistant/compte", "/espace-assistant/creneaux", "/espace-assistant/patients"],
    },
  ],
  etablissement: [
    { href: "/espace-etablissement", icone: "🏠", label: "Accueil", prefixes: ["/espace-etablissement"] },
    {
      href: "/espace-etablissement/medecins",
      icone: "👨‍⚕️",
      label: "Médecins",
      prefixes: ["/espace-etablissement/medecins"],
    },
    {
      href: "/espace-etablissement/informations",
      icone: "🏥",
      label: "Infos",
      prefixes: ["/espace-etablissement/informations"],
    },
    {
      href: "/espace-etablissement/compte",
      icone: "⚙️",
      label: "Compte",
      prefixes: [
        "/espace-etablissement/compte",
        "/espace-etablissement/statistiques",
        "/espace-etablissement/abonnement",
      ],
    },
  ],
  admin: [
    { href: "/espace-admin", icone: "🏠", label: "Accueil", prefixes: ["/espace-admin"] },
    { href: "/espace-admin/validations", icone: "✅", label: "Valid.", prefixes: ["/espace-admin/validations"] },
    { href: "/espace-admin/utilisateurs", icone: "👥", label: "Users", prefixes: ["/espace-admin/utilisateurs"] },
    {
      href: "/espace-admin/plus",
      icone: "⚙️",
      label: "Plus",
      prefixes: [
        "/espace-admin/plus",
        "/espace-admin/moderation",
        "/espace-admin/pilotage",
        "/espace-admin/annonces",
        "/espace-admin/etablissements",
        "/espace-admin/finances",
        "/espace-admin/abonnements",
        "/espace-admin/parametres",
        "/espace-admin/equipe",
        "/espace-admin/audit",
      ],
    },
  ],
};

/** Onglet actif : le préfixe correspondant le plus long l'emporte. */
function ongletActif(onglets: Onglet[], pathname: string): string | null {
  let meilleur: { href: string; longueur: number } | null = null;
  for (const o of onglets) {
    for (const p of o.prefixes) {
      const exact = pathname === p;
      const prefixe = p !== "/" && pathname.startsWith(p + "/");
      if ((exact || prefixe || (p === "/" && pathname === "/")) && (!meilleur || p.length > meilleur.longueur)) {
        meilleur = { href: o.href, longueur: p.length };
      }
    }
  }
  return meilleur?.href ?? null;
}

export default function TabBarMobile({
  role,
}: {
  role: "public" | "medecin" | "assistant" | "etablissement" | "admin";
}) {
  const pathname = usePathname();
  const onglets = ONGLETS[role];
  const actif = ongletActif(onglets, pathname);

  return (
    <nav className="tabbar md:hidden" aria-label="Navigation principale">
      {onglets.map((o) => (
        <Link key={o.href} href={o.href} className={actif === o.href ? "on" : undefined}>
          <span className="i" aria-hidden>
            {o.icone}
          </span>
          {o.label}
        </Link>
      ))}
    </nav>
  );
}
