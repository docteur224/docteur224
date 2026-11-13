"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import TabBarMobile from "@/components/mobile/TabBarMobile";
import CompteSuspendu from "@/components/compte/CompteSuspendu";
import { ESPACE_PAR_ROLE, type Role } from "@/lib/auth";
import { useProfilConnecte } from "@/lib/patient";
import BarreLaterale from "@/components/site/BarreLaterale";

/**
 * Coquille de l'espace patient — reproduit la structure .dash / .side / .snav
 * de la maquette web (menu latéral avec avatar, liens et déconnexion).
 * Le menu suit la spec C.3 : Tableau de bord · Mes rendez-vous · Mes proches ·
 * Mon profil · Paramètres · Déconnexion.
 *
 * Menu rangé en sections nommées, comme les espaces médecin / assistant (champ
 * `section`, rendu par BarreLaterale). Les liens d'une même section sont
 * contigus : du plus quotidien (prise de rendez-vous) au compte. Le libellé de
 * section ne s'affiche qu'une fois, avant son premier lien.
 */
const LIENS = [
  // Au quotidien — le socle de l'usage : consulter et prendre rendez-vous.
  { href: "/patient", icone: "📊", label: "Tableau de bord", section: "Au quotidien" },
  // Même cible que « + Nouveau rendez-vous » du tableau de bord : on prend
  // rendez-vous en cherchant le médecin.
  { href: "/resultats", icone: "🩺", label: "Prendre rendez-vous", section: "Au quotidien" },
  { href: "/mes-rendez-vous", icone: "📅", label: "Mes rendez-vous", section: "Au quotidien" },
  // Mon suivi — ce que le patient garde et gère dans la durée.
  { href: "/patient/documents", icone: "📄", label: "Mes documents", section: "Mon suivi" },
  { href: "/patient/proches", icone: "👨‍👩‍👧", label: "Mes proches", section: "Mon suivi" },
  { href: "/patient/favoris", icone: "♥", label: "Mes favoris", section: "Mon suivi" },
  { href: "/patient/avis", icone: "⭐", label: "Mes avis", section: "Mon suivi" },
  // Échanges — Messages porte la pastille de non-lus.
  { href: "/patient/messages", icone: "💬", label: "Messages", section: "Échanges" },
  { href: "/patient/notifications", icone: "🔔", label: "Notifications", section: "Échanges" },
  // Compte.
  { href: "/patient/profil", icone: "👤", label: "Mon profil", section: "Compte" },
  { href: "/patient/mon-compte", icone: "🔐", label: "Mon compte", section: "Compte" },
  { href: "/patient/parametres", icone: "⚙️", label: "Paramètres", section: "Compte" },
];

export default function PatientShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { profil, chargement } = useProfilConnecte();

  // Garde d'accès : l'espace patient exige un compte patient. Sans ça, un
  // médecin (ou un établissement) pouvait ouvrir /patient/* et se voir refuser
  // l'écriture par la base : « violates foreign key constraint
  // proches_patient_id_fkey », parce qu'il n'a pas de fiche dans `patients`.
  useEffect(() => {
    if (chargement) return;
    if (!profil) router.replace("/connexion");
    else if (profil.role !== "patient") {
      router.replace(ESPACE_PAR_ROLE[profil.role as Role] ?? "/connexion");
    }
  }, [chargement, profil, router]);

  const patient = {
    prenom: profil?.prenom ?? "",
    nom: profil?.nom ?? "",
    sexe: profil?.genre === "M" ? "Masculin" : "Féminin",
  };
  const initiales =
    `${patient.prenom.charAt(0)}${patient.nom.charAt(0)}`.toUpperCase() || "?";

  // Tant que la redirection n'a pas eu lieu, ne pas monter les écrans : leurs
  // formulaires écriraient dans des tables où l'intrus n'a pas de fiche.
  if (!chargement && profil?.role !== "patient") {
    return (
      <div className="grid min-h-screen place-items-center bg-bg text-[13.5px] text-muted">
        Redirection…
      </div>
    );
  }

  return (
    <div className="cadre-espace grid min-h-screen content-start bg-bg lg:content-stretch">
      <BarreLaterale
        avatar={initiales}
        fondAvatar="var(--avatar-bleu)"
        nom={`${patient.prenom} ${patient.nom}`}
        sousTitre={patient.sexe === "Masculin" ? "Patient" : "Patiente"}
        liens={LIENS}
        sousRoutes
      />
      <main className="ui-contenu-page with-tabbar min-w-0 overflow-x-clip md:px-[30px] md:py-[26px]">
        {profil?.statut === "suspendu" ? <CompteSuspendu role={profil.role} parAdmin={profil.suspenduParAdmin} /> : children}
      </main>
      <TabBarMobile role="public" />
    </div>
  );
}
