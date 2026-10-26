"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useProfilConnecte } from "@/lib/patient";
import { useNotifications } from "@/lib/notifications";
import Icone, { type NomIcone } from "@/components/site/Icone";

/**
 * Barre d'onglets basse mobile.
 *
 * Trois destinations dans un bloc blanc flottant, la quatrième dans un bouton
 * rond détaché à sa droite (le hub « Profil » / « Compte » / « Plus » du
 * rôle). Rendue uniquement sous md ; au-delà, chaque espace garde sa barre
 * latérale.
 *
 * Les icônes sont au trait (`components/site/Icone`, donc `currentColor`) et
 * non des emoji : un emoji ne prend pas la couleur du texte et resterait
 * identique quelle que soit la charte choisie par l'utilisateur. Ici l'onglet
 * actif — et son pictogramme — prend la couleur de l'espace.
 *
 * La pastille rouge signale qu'une notification non lue mène à l'un des
 * écrans que porte l'onglet : on rapproche le lien de chaque notification des
 * préfixes de l'onglet, exactement comme pour l'onglet actif. Elle s'éteint
 * dès que tout est lu — c'est la même source que la cloche.
 */
type Onglet = {
  href: string;
  icone: NomIcone;
  label: string;
  prefixes: string[];
  /**
   * Faux pour un onglet de simple navigation : on y va chercher, on n'y
   * reçoit rien. Sans ce garde, une notification « laissez un avis » (lien
   * /medecin/<id>) allumerait la pastille de « Recherche », qui ne porte ce
   * préfixe que pour rester en surbrillance pendant la consultation d'une
   * fiche. La pastille signale du nouveau à lire, pas un endroit où aller.
   */
  pastille?: boolean;
};

const ONGLETS: Record<string, Onglet[]> = {
  public: [
    { href: "/", icone: "maison", label: "Accueil", prefixes: ["/"] },
    { href: "/mes-rendez-vous", icone: "calendrier", label: "Mes RDV", prefixes: ["/mes-rendez-vous"] },
    { href: "/patient/messages", icone: "message", label: "Messages", prefixes: ["/patient/messages"] },
    { href: "/resultats", icone: "loupe", label: "Recherche", prefixes: ["/resultats", "/medecin", "/patient"], pastille: false },
  ],
  medecin: [
    { href: "/espace-medecin", icone: "graphique", label: "Tableau", prefixes: ["/espace-medecin"] },
    {
      href: "/espace-medecin/agenda",
      icone: "calendrier",
      label: "Agenda",
      prefixes: ["/espace-medecin/agenda", "/espace-medecin/nouveau-rdv"],
    },
    { href: "/espace-medecin/messages", icone: "message", label: "Messages", prefixes: ["/espace-medecin/messages"] },
    {
      href: "/espace-medecin/compte",
      icone: "utilisateur",
      label: "Profil",
      prefixes: [
        "/espace-medecin/compte",
        "/espace-medecin/profil",
        "/espace-medecin/patients",
        "/espace-medecin/correspondance",
        "/espace-medecin/disponibilites",
        "/espace-medecin/statistiques",
        "/espace-medecin/equipe",
        "/espace-medecin/abonnement",
        /*
         * Manquaient à l'appel : ces écrans s'ouvrent depuis le hub
         * « Profil », mais aucun onglet ne s'allumait une fois dedans. Le
         * cas devient visible avec `mon-compte`, où la notification
         * d'invitation dépose maintenant le praticien (migration 0055).
         */
        "/espace-medecin/mon-compte",
        "/espace-medecin/avis",
        "/espace-medecin/paiements",
      ],
    },
  ],
  assistant: [
    { href: "/espace-assistant", icone: "maison", label: "Accueil", prefixes: ["/espace-assistant"] },
    {
      href: "/espace-assistant/rendez-vous",
      icone: "calendrier",
      label: "RDV",
      prefixes: ["/espace-assistant/rendez-vous", "/espace-assistant/nouveau-rdv"],
    },
    { href: "/espace-assistant/messages", icone: "message", label: "Messages", prefixes: ["/espace-assistant/messages"] },
    {
      href: "/espace-assistant/compte",
      icone: "utilisateur",
      label: "Compte",
      prefixes: ["/espace-assistant/compte", "/espace-assistant/creneaux", "/espace-assistant/patients"],
    },
  ],
  etablissement: [
    { href: "/espace-etablissement", icone: "maison", label: "Accueil", prefixes: ["/espace-etablissement"] },
    {
      href: "/espace-etablissement/medecins",
      icone: "groupe",
      label: "Médecins",
      prefixes: ["/espace-etablissement/medecins"],
    },
    {
      href: "/espace-etablissement/informations",
      icone: "hopital",
      label: "Infos",
      prefixes: ["/espace-etablissement/informations"],
    },
    {
      href: "/espace-etablissement/compte",
      icone: "utilisateur",
      label: "Compte",
      prefixes: [
        "/espace-etablissement/compte",
        "/espace-etablissement/statistiques",
        "/espace-etablissement/abonnement",
        // Manquait : sur « Mon compte » aucun onglet ne s'allumait, et la
        // barre laissait croire qu'on avait quitté l'espace.
        "/espace-etablissement/mon-compte",
      ],
    },
  ],
  admin: [
    { href: "/espace-admin", icone: "maison", label: "Accueil", prefixes: ["/espace-admin"] },
    { href: "/espace-admin/validations", icone: "coche", label: "Valid.", prefixes: ["/espace-admin/validations"] },
    { href: "/espace-admin/utilisateurs", icone: "groupe", label: "Users", prefixes: ["/espace-admin/utilisateurs"] },
    {
      href: "/espace-admin/plus",
      icone: "points",
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

/**
 * L'onglet dont un préfixe correspond le mieux à ce chemin — le plus long
 * l'emporte. Sert à la fois à l'onglet actif et à l'affectation des pastilles.
 */
function ongletPour(onglets: Onglet[], chemin: string): string | null {
  let meilleur: { href: string; longueur: number } | null = null;
  for (const o of onglets) {
    for (const p of o.prefixes) {
      const exact = chemin === p;
      const prefixe = p !== "/" && chemin.startsWith(p + "/");
      if ((exact || prefixe || (p === "/" && chemin === "/")) && (!meilleur || p.length > meilleur.longueur)) {
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
  const { profil, chargement } = useProfilConnecte();
  const { notifications } = useNotifications();
  const onglets = ONGLETS[role];
  const actif = ongletPour(onglets, pathname);
  const affichee = !chargement && profil !== null;

  // Les hrefs d'onglet porteurs d'au moins une notification non lue — hors
  // onglets de simple navigation, qui ne reçoivent rien.
  const sansPastille = new Set(onglets.filter((o) => o.pastille === false).map((o) => o.href));
  const avecPastille = new Set<string>();
  for (const n of notifications) {
    if (n.lu || !n.lien) continue;
    const href = ongletPour(onglets, n.lien.split("?")[0]);
    if (href && !sansPastille.has(href)) avecPastille.add(href);
  }

  // La tabbar est la navigation d'un compte : un visiteur n'a ni rendez-vous
  // ni profil à consulter. La classe posée sur <html> retire au passage les
  // pixels que `.with-tabbar` réservait pour elle.
  useEffect(() => {
    document.documentElement.classList.toggle("sans-tabbar", !affichee);
    return () => document.documentElement.classList.remove("sans-tabbar");
  }, [affichee]);

  if (!affichee) return null;

  const trois = onglets.slice(0, 3);
  const dernier = onglets[onglets.length - 1];

  const glyphe = (o: Onglet) => (
    <span className="g">
      <Icone nom={o.icone} taille={22} />
      {avecPastille.has(o.href) && <i className="tb-point" aria-label="nouveau" />}
    </span>
  );

  return (
    <nav className="tabbar md:hidden" aria-label="Navigation principale">
      <div className="tb-bloc">
        {trois.map((o) => (
          <Link key={o.href} href={o.href} className={actif === o.href ? "on" : undefined}>
            <span className="i">{glyphe(o)}</span>
            {o.label}
          </Link>
        ))}
      </div>
      <Link href={dernier.href} className={`tb-rond${actif === dernier.href ? " on" : ""}`}>
        <span className="cercle">{glyphe(dernier)}</span>
        {dernier.label}
      </Link>
    </nav>
  );
}
