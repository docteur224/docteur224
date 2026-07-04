"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { initialesPatient, usePatientLocal } from "@/lib/mock-patient";

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
  const patient = usePatientLocal();

  return (
    <div className="grid min-h-screen bg-bg lg:grid-cols-[236px_1fr]">
      <aside className="border-b border-line bg-white px-4 py-[22px] lg:border-b-0 lg:border-r">
        <div className="mb-[14px] flex items-center gap-[11px] border-b border-line px-1.5 pb-[18px]">
          <span
            aria-hidden
            className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl text-[15px] font-extrabold text-white"
            style={{ background: "linear-gradient(135deg,#2E9CCA,#15506B)" }}
          >
            {initialesPatient(patient)}
          </span>
          <div>
            <b className="block text-[13.5px] font-extrabold">
              {patient.prenom} {patient.nom}
            </b>
            <small className="text-[11.5px] text-muted">
              {patient.sexe === "Masculin" ? "Patient" : "Patiente"}
            </small>
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
