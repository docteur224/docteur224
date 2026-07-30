"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import TabBarMobile from "@/components/mobile/TabBarMobile";
import { seDeconnecter } from "@/lib/auth";
import { useProfilConnecte } from "@/lib/patient";
import ClocheNotifications from "@/components/site/ClocheNotifications";

/**
 * Coquille de l'espace patient — reproduit la structure .dash / .side / .snav
 * de la maquette web (menu latéral avec avatar, liens et déconnexion).
 * Le menu suit la spec C.3 : Tableau de bord · Mes rendez-vous · Mes proches ·
 * Mon profil · Paramètres · Déconnexion.
 */
const LIENS = [
  { href: "/patient", icone: "📊", label: "Tableau de bord" },
  { href: "/mes-rendez-vous", icone: "📅", label: "Mes rendez-vous" },
  { href: "/patient/proches", icone: "👨‍👩‍👧", label: "Mes proches" },
  { href: "/patient/profil", icone: "👤", label: "Mon profil" },
  { href: "/patient/parametres", icone: "⚙️", label: "Paramètres" },
];

export default function PatientShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profil } = useProfilConnecte();
  const patient = {
    prenom: profil?.prenom ?? "",
    nom: profil?.nom ?? "",
    sexe: profil?.genre === "M" ? "Masculin" : "Féminin",
  };
  const initiales =
    `${patient.prenom.charAt(0)}${patient.nom.charAt(0)}`.toUpperCase() || "?";

  return (
    <div className="grid min-h-screen bg-bg lg:grid-cols-[236px_1fr]">
      <aside className="hidden border-b border-line bg-white px-4 py-[22px] md:block lg:border-b-0 lg:border-r">
        <div className="mb-[14px] flex items-center gap-[11px] border-b border-line px-1.5 pb-[18px]">
          <span
            aria-hidden
            className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl text-[15px] font-extrabold text-white"
            style={{ background: "linear-gradient(135deg,#2E9CCA,#15506B)" }}
          >
            {initiales}
          </span>
          <div>
            <b className="block text-[13.5px] font-extrabold">
              {patient.prenom} {patient.nom}
            </b>
            <small className="text-[11.5px] text-muted">
              {patient.sexe === "Masculin" ? "Patient" : "Patiente"}
            </small>
          </div>
          {/* La cloche vit ici sur web : la sidebar est le seul en-tête
              permanent des espaces. */}
          <div className="ml-auto">
            <ClocheNotifications />
          </div>
        </div>
        <nav className="flex flex-col gap-[3px]">
          {LIENS.map((lien) => {
            // Surligné aussi sur les sous-routes (ex. /mes-rendez-vous/[id]).
            const actif = pathname === lien.href || pathname.startsWith(`${lien.href}/`);
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
      <TabBarMobile role="public" />
    </div>
  );
}
