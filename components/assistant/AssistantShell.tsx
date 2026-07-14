"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import TabBarMobile from "@/components/mobile/TabBarMobile";
import { useContextePro } from "@/lib/pro";

/**
 * Coquille de l'espace assistant(e) — reproduit la structure .dash / .side /
 * .snav de la maquette web. Menu conforme à la spec C.5 : Tableau de bord ·
 * Rendez-vous · Créneaux & disponibilités · Patients · Messagerie ·
 * Mon compte · Déconnexion.
 * L'assistante fictive « connectée » est Hawa Diallo (Dr A. Barry), comme
 * dans les maquettes, en attendant l'authentification.
 */
const LIENS = [
  { href: "/espace-assistant", icone: "🗓️", label: "Tableau de bord" },
  { href: "/espace-assistant/rendez-vous", icone: "📅", label: "Rendez-vous" },
  { href: "/espace-assistant/creneaux", icone: "🕐", label: "Créneaux & dispos" },
  { href: "/espace-assistant/patients", icone: "👥", label: "Patients" },
  { href: "/espace-assistant/messages", icone: "💬", label: "Messagerie" },
  { href: "/espace-assistant/compte", icone: "👤", label: "Mon compte" },
];

export default function AssistantShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { medecin, utilisateur } = useContextePro();
  const nomAssistant = utilisateur ? `${utilisateur.prenom} ${utilisateur.nom}`.trim() : "…";
  const nomMedecin = medecin ? `${medecin.civilite} ${medecin.prenom.charAt(0)}. ${medecin.nom}` : "";

  return (
    <div className="grid min-h-screen bg-bg lg:grid-cols-[236px_1fr]">
      <aside className="hidden border-b border-line bg-white px-4 py-[22px] md:block lg:border-b-0 lg:border-r">
        <div className="mb-[14px] flex items-center gap-[11px] border-b border-line px-1.5 pb-[18px]">
          <span
            aria-hidden
            className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl text-[15px] font-extrabold text-white"
            style={{ background: "linear-gradient(135deg,#2E9CCA,#15506B)" }}
          >
            HD
          </span>
          <div>
            <b className="block text-[13.5px] font-extrabold">{nomAssistant}</b>
            <small className="text-[11.5px] text-muted">Assistant(e){nomMedecin ? ` · ${nomMedecin}` : ""}</small>
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
      <main className="with-tabbar overflow-auto md:px-[30px] md:py-[26px]">{children}</main>
      <TabBarMobile role="assistant" />
    </div>
  );
}
