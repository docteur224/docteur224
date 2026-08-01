"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import TabBarMobile from "@/components/mobile/TabBarMobile";
import { ESPACE_PAR_ROLE, seDeconnecter, type Role } from "@/lib/auth";
import { useProfilConnecte } from "@/lib/patient";
import ClocheNotifications from "@/components/site/ClocheNotifications";

/**
 * Coquille de l'espace administrateur — reproduit la structure .dash / .side /
 * .snav des scènes admin-* de la maquette web. Menu complet : Tableau de bord,
 * Validations, Modération, Utilisateurs, Établissements, Pilotage & croissance,
 * Annonces, Finances, Abonnements, Paramètres, Équipe admin, Journal d'audit.
 */
const LIENS = [
  { href: "/espace-admin", icone: "📊", label: "Tableau de bord" },
  { href: "/espace-admin/validations", icone: "✅", label: "Validations" },
  { href: "/espace-admin/moderation", icone: "🚩", label: "Modération" },
  { href: "/espace-admin/utilisateurs", icone: "👥", label: "Utilisateurs" },
  { href: "/espace-admin/etablissements", icone: "🏥", label: "Établissements" },
  { href: "/espace-admin/pilotage", icone: "🧭", label: "Pilotage & croissance" },
  { href: "/espace-admin/annonces", icone: "📢", label: "Annonces" },
  { href: "/espace-admin/finances", icone: "💳", label: "Finances" },
  { href: "/espace-admin/abonnements", icone: "🏷️", label: "Abonnements" },
  { href: "/espace-admin/parametres", icone: "⚙️", label: "Paramètres" },
  { href: "/espace-admin/equipe", icone: "🛡️", label: "Équipe admin" },
  { href: "/espace-admin/audit", icone: "📜", label: "Journal d'audit" },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profil, chargement } = useProfilConnecte();

  // Garde d'accès : l'espace admin exige un compte admin. Elle manquait — comme
  // elle manquait à PatientShell — et TOUT visiteur, y compris anonyme, ouvrait
  // la console d'administration. La base tenait bon (la RLS refusait les
  // écritures), mais l'écran offrait des boutons qui ne pouvaient qu'échouer.
  useEffect(() => {
    if (chargement) return;
    if (!profil) router.replace("/connexion");
    else if (profil.role !== "admin") {
      router.replace(ESPACE_PAR_ROLE[profil.role as Role] ?? "/connexion");
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

  return (
    <div className="grid min-h-screen bg-bg lg:grid-cols-[236px_1fr]">
      <aside className="hidden border-b border-line bg-white px-4 py-[22px] md:block lg:border-b-0 lg:border-r">
        <div className="mb-[14px] flex items-center gap-[11px] border-b border-line px-1.5 pb-[18px]">
          <span
            aria-hidden
            className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl text-lg text-white"
            style={{ background: "linear-gradient(135deg,#15506B,#0B2E3D)" }}
          >
            🛡️
          </span>
          <div>
            <b className="block text-[13.5px] font-extrabold">Administrateur</b>
            <small className="text-[11.5px] text-muted">Docteur 224</small>
          </div>
          {/* La cloche vit ici sur web : la sidebar est le seul en-tête
              permanent des espaces. */}
          <div className="ml-auto">
            <ClocheNotifications />
          </div>
        </div>
        <nav className="flex flex-col gap-[3px]">
          {LIENS.map((lien) => {
            const actif = pathname === lien.href;
            return (
              <Link
                key={lien.href}
                href={lien.href}
                className={`flex items-center gap-[11px] rounded-[11px] px-3 py-[11px] text-[13.5px] ${
                  actif
                    ? "bg-teal-soft font-bold text-blue"
                    : "font-semibold text-muted hover:bg-bg"
                }`}
              >
                <span className="text-base" aria-hidden>
                  {lien.icone}
                </span>
                {lien.label}
              </Link>
            );
          })}
          {/* Vraie déconnexion : c'était un simple lien vers l'accueil, qui
              laissait la session ouverte (comme PatientShell/MedecinShell le
              faisaient déjà correctement). */}
          <button
            type="button"
            onClick={async () => {
              await seDeconnecter();
              router.push("/");
            }}
            className="flex items-center gap-[11px] rounded-[11px] px-3 py-[11px] text-left text-[13.5px] font-semibold text-muted hover:bg-bg"
          >
            <span className="text-base" aria-hidden>
              ↩️
            </span>
            Déconnexion
          </button>
        </nav>
      </aside>
      <main className="with-tabbar overflow-auto md:px-[30px] md:py-[26px]">{children}</main>
      <TabBarMobile role="admin" />
    </div>
  );
}
