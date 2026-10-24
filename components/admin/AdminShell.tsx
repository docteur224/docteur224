"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import TabBarMobile from "@/components/mobile/TabBarMobile";
import { ESPACE_PAR_ROLE, type Role } from "@/lib/auth";
import { useProfilConnecte } from "@/lib/patient";
import { useDroitsAdmin } from "@/lib/admin";
import {
  aPermission,
  PERMISSION_PAR_ROUTE,
  type Permission,
} from "@/lib/permissions-admin";
import CompteSuspendu from "@/components/compte/CompteSuspendu";
import BarreLaterale from "@/components/site/BarreLaterale";

/**
 * Coquille de l'espace administrateur — reproduit la structure .dash / .side /
 * .snav des scènes admin-* de la maquette web. Menu complet : Tableau de bord,
 * Validations, Modération, Utilisateurs, Établissements, Pilotage & croissance,
 * Annonces, Finances, Abonnements, Paramètres, Équipe admin, Journal d'audit.
 *
 * Depuis la migration 0043, le menu n'affiche que les sections ouvertes à
 * l'administrateur connecté, et `permission` ferme la page elle-même : un
 * lien masqué reste tapable dans la barre d'adresse. C'est une commodité
 * d'affichage, pas la sécurité — celle-ci vit dans la RLS.
 */
const LIENS = [
  { href: "/espace-admin", icone: "📊", label: "Tableau de bord" },
  // Ouvert à tout administrateur, comme le tableau de bord : répondre au
  // téléphone n'est pas une section de la console, c'est le travail de
  // l'équipe entière. Il n'a donc pas d'entrée dans PERMISSION_PAR_ROUTE.
  { href: "/espace-admin/nouveau-rdv", icone: "📞", label: "Prise de RDV" },
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
  { href: "/espace-admin/medicaments", icone: "💊", label: "Médicaments" },
  { href: "/espace-admin/actes", icone: "🔬", label: "Actes et analyses" },
  { href: "/espace-admin/equipe", icone: "🛡️", label: "Équipe admin" },
  { href: "/espace-admin/audit", icone: "📜", label: "Journal d'audit" },
  { href: "/espace-admin/mon-compte", icone: "🔐", label: "Mon compte" },
];

export default function AdminShell({
  children,
  permission,
}: {
  children: React.ReactNode;
  /** Section dont la page relève ; absente, la page est ouverte à tout admin. */
  permission?: Permission;
}) {
  const router = useRouter();
  const { profil, chargement } = useProfilConnecte();
  const { droits, chargement: chargementDroits } = useDroitsAdmin();

  // Garde d'accès : l'espace admin exige un compte admin. Elle manquait — comme
  // elle manquait à PatientShell — et TOUT visiteur, y compris anonyme, ouvrait
  // la console d'administration. La base tenait bon (la RLS refusait les
  // écritures), mais l'écran offrait des boutons qui ne pouvaient qu'échouer.
  useEffect(() => {
    if (chargement) return;
    // Sans session : la porte dédiée, pas /connexion — cet écran-là ne propose
    // aucun onglet « Admin » et ne dit donc rien à un administrateur égaré.
    if (!profil) router.replace("/espace-admin/connexion");
    else if (profil.role !== "admin") {
      router.replace(ESPACE_PAR_ROLE[profil.role as Role] ?? "/espace-admin/connexion");
    }
  }, [chargement, profil, router]);

  // Tant que la redirection n'a pas eu lieu, ne pas monter les écrans : ils
  // interrogeraient les tables d'administration pour n'afficher que du vide.
  if (!chargement && profil?.role !== "admin") {
    return (
      <div className="grid min-h-screen place-items-center bg-bg text-[13.5px] text-muted">
        Redirection…
      </div>
    );
  }

  const liens = LIENS.filter((lien) => {
    const requise = PERMISSION_PAR_ROUTE[lien.href];
    // Tant que les droits ne sont pas lus, on montre le menu complet plutôt
    // qu'un menu qui s'amputerait sous les yeux de l'administrateur.
    return !requise || chargementDroits || aPermission(droits, requise);
  });

  const refuse = permission && !chargementDroits && !aPermission(droits, permission);
  // Compte mis en pause par son titulaire : l'espace se referme sur l'écran
  // de réactivation. Laisser l'interface ouverte donnerait des boutons que
  // la base refuse (migration 0045).
  const contenu =
    profil?.statut === "suspendu" ? (
      <CompteSuspendu role="admin" parAdmin={profil.suspenduParAdmin} />
    ) : refuse ? (
      <SectionFermee />
    ) : (
      children
    );

  return (
    <div className="grid min-h-screen content-start bg-bg lg:grid-cols-[236px_1fr] lg:content-stretch">
      <BarreLaterale
        avatar="🛡️"
        avatarEmoji
        fondAvatar="linear-gradient(135deg,#15506B,#0B2E3D)"
        nom="Administrateur"
        sousTitre="Docteur 224"
        liens={liens}
      />
      <main className="with-tabbar min-w-0 overflow-x-clip md:px-[30px] md:py-[26px]">{contenu}</main>
      <TabBarMobile role="admin" />
    </div>
  );
}

/**
 * Section fermée : on dit ce qui manque et à qui le demander, plutôt que de
 * rediriger vers le tableau de bord — un écran qui se dérobe sans explication
 * passe pour une panne.
 */
function SectionFermee() {
  return (
    <div className="grid place-items-center px-4 py-16 text-center">
      <div className="max-w-[420px]">
        <span aria-hidden className="text-[34px]">
          🔒
        </span>
        <h2 className="mt-3 text-[17px] font-extrabold">Section réservée</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          Votre compte administrateur ne dispose pas de la permission nécessaire pour ouvrir
          cette section. Demandez-la à un administrateur en charge de l’équipe.
        </p>
        <Link
          href="/espace-admin"
          className="mt-4 inline-block rounded-[11px] bg-teal px-[18px] py-2.5 text-[13px] font-bold text-white"
        >
          Retour au tableau de bord
        </Link>
      </div>
    </div>
  );
}
