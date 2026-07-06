"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ETABLISSEMENT_CONNECTE } from "@/lib/mock-etablissement";

/**
 * Coquille de l'espace établissement — reproduit la structure .dash / .side /
 * .snav de la maquette web. Menu conforme à la spec C.6 : Tableau de bord ·
 * Médecins · Informations · Statistiques · Abonnement · Compte & paramètres ·
 * Déconnexion.
 */
const LIENS = [
  { href: "/espace-etablissement", icone: "📊", label: "Tableau de bord" },
  { href: "/espace-etablissement/medecins", icone: "👨‍⚕️", label: "Médecins" },
  { href: "/espace-etablissement/informations", icone: "🏥", label: "Informations" },
  { href: "/espace-etablissement/statistiques", icone: "📈", label: "Statistiques" },
  { href: "/espace-etablissement/abonnement", icone: "💳", label: "Abonnement" },
  { href: "/espace-etablissement/compte", icone: "⚙️", label: "Compte & paramètres" },
];

export default function EtablissementShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="grid min-h-screen bg-bg lg:grid-cols-[236px_1fr]">
      <aside className="border-b border-line bg-white px-4 py-[22px] lg:border-b-0 lg:border-r">
        <div className="mb-[14px] flex items-center gap-[11px] border-b border-line px-1.5 pb-[18px]">
          <span
            aria-hidden
            className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl text-lg text-white"
            style={{ background: ETABLISSEMENT_CONNECTE.gradient }}
          >
            🏥
          </span>
          <div>
            <b className="block text-[13.5px] font-extrabold">
              {ETABLISSEMENT_CONNECTE.nomCourt}
            </b>
            <small className="text-[11.5px] text-muted">Établissement</small>
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
          <Link
            href="/"
            className="flex items-center gap-[11px] rounded-[11px] px-3 py-[11px] text-[13.5px] font-semibold text-muted hover:bg-bg"
          >
            <span className="text-base" aria-hidden>
              ↩️
            </span>
            Déconnexion
          </Link>
        </nav>
      </aside>
      <main className="overflow-auto px-4 py-[26px] md:px-[30px]">{children}</main>
    </div>
  );
}
