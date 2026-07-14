"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import TabBarMobile from "@/components/mobile/TabBarMobile";
import { seDeconnecter } from "@/lib/auth";
import { useContextePro } from "@/lib/pro";

/**
 * Coquille de l'espace médecin — reproduit la structure .dash / .side / .snav
 * de la maquette web. Menu conforme à la spec C.4 : Tableau de bord · Mon
 * agenda · Mes patients · Mes disponibilités · Statistiques · Mes
 * assistant(e)s · Mon abonnement · Mon profil · Déconnexion.
 */
const LIENS = [
  { href: "/espace-medecin", icone: "📊", label: "Tableau de bord" },
  { href: "/espace-medecin/agenda", icone: "📅", label: "Mon agenda" },
  { href: "/espace-medecin/patients", icone: "👥", label: "Mes patients" },
  { href: "/espace-medecin/disponibilites", icone: "🕐", label: "Mes disponibilités" },
  { href: "/espace-medecin/statistiques", icone: "📈", label: "Statistiques" },
  { href: "/espace-medecin/equipe", icone: "🧑‍💼", label: "Mes assistant(e)s" },
  { href: "/espace-medecin/abonnement", icone: "💳", label: "Mon abonnement" },
  { href: "/espace-medecin/profil", icone: "👤", label: "Mon profil" },
];

export default function MedecinShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { medecin } = useContextePro();
  const medecinConnecte = medecin ?? {
    gradient: "linear-gradient(135deg,#2E9CCA,#15506B)",
    initiales: "…",
    civilite: "Dr",
    prenom: "",
    nom: "",
    specialite: "",
  };

  return (
    <div className="grid min-h-screen bg-bg lg:grid-cols-[236px_1fr]">
      <aside className="hidden border-b border-line bg-white px-4 py-[22px] md:block lg:border-b-0 lg:border-r">
        <div className="mb-[14px] flex items-center gap-[11px] border-b border-line px-1.5 pb-[18px]">
          <span
            aria-hidden
            className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl text-[15px] font-extrabold text-white"
            style={{ background: medecinConnecte.gradient }}
          >
            {medecinConnecte.initiales}
          </span>
          <div>
            <b className="block text-[13.5px] font-extrabold">
              {medecinConnecte.civilite} {medecinConnecte.prenom.charAt(0)}. {medecinConnecte.nom}
            </b>
            <small className="text-[11.5px] text-muted">{medecinConnecte.specialite}</small>
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
      <TabBarMobile role="medecin" />
    </div>
  );
}
