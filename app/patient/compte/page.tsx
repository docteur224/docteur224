"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import PatientShell from "@/components/patient/PatientShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import { seDeconnecter } from "@/lib/auth";
import { useProfilConnecte } from "@/lib/patient";

const initialesPatient = (p: { prenom: string; nom: string }) =>
  `${p.prenom.charAt(0)}${p.nom.charAt(0)}`.toUpperCase() || "?";

/*
 * Mon compte (hub mobile) — reproduit l'écran « m-pat-compte » de la maquette
 * mobile : avatar, menu vers profil / rendez-vous / proches / paramètres /
 * déconnexion. Les entrées suivent la logique de l'application (pas d'écran
 * « Paiements » ni de raccourcis admin : ils n'existent pas dans l'app).
 * Sur web (≥ md), la même liste est présentée en carte, la navigation
 * principale restant la sidebar.
 */

const ENTREES = [
  { href: "/patient", icone: "📊", titre: "Tableau de bord", sous: "Aperçu de vos rendez-vous" },
  { href: "/patient/profil", icone: "👤", titre: "Mon profil", sous: "Informations personnelles" },
  { href: "/mes-rendez-vous", icone: "📅", titre: "Mes rendez-vous", sous: "À venir et passés" },
  { href: "/patient/documents", icone: "📄", titre: "Mes documents", sous: "Ordonnances et comptes rendus" },
  { href: "/patient/favoris", icone: "♥", titre: "Mes favoris", sous: "Vos médecins mis de côté" },
  { href: "/patient/proches", icone: "👨‍👩‍👧", titre: "Mes proches", sous: "Enfants, conjoint… sans compte" },
  { href: "/patient/avis", icone: "⭐", titre: "Mes avis", sous: "Relire ou corriger vos notes" },
  { href: "/patient/notifications", icone: "🔔", titre: "Notifications", sous: "Tout votre historique" },
  { href: "/patient/parametres", icone: "⚙️", titre: "Paramètres", sous: "Notifications, mot de passe, compte" },
];

export default function ComptePatient() {
  const router = useRouter();
  const { profil } = useProfilConnecte();
  const patient = { prenom: profil?.prenom ?? "", nom: profil?.nom ?? "", sexe: profil?.genre === "M" ? "Masculin" : "Féminin", telephone: profil?.telephone ?? "" };

  return (
    <PatientShell>
      {/* ===== Version mobile ===== */}
      <div className="md:hidden">
        {/* Écran racine de l'onglet Profil : variante « marque », sans retour
            (la tabbar est la sortie) et sans avatar dupliqué juste dessous. */}
        <EnTeteMobile variante="marque" actions={false} recherche bandeauRdv />
        <div className="pad">
          <div className="acctop">
            <span
              className="av"
              aria-hidden
              style={{ background: "linear-gradient(135deg,#2E9CCA,#15506B)" }}
            >
              {initialesPatient(patient)}
            </span>
            <div>
              <b>
                {patient.prenom} {patient.nom}
              </b>
              <small>
                {patient.sexe === "Masculin" ? "Patient" : "Patiente"} · {patient.telephone}
              </small>
            </div>
          </div>
          <div className="menu">
            {ENTREES.map((e) => (
              <Link key={e.titre} href={e.href} className="mrow">
                <span className="mi" aria-hidden>
                  {e.icone}
                </span>
                <span>
                  <b>{e.titre}</b>
                  {e.sous && <small>{e.sous}</small>}
                </span>
                <span className="ch" aria-hidden>
                  ›
                </span>
              </Link>
            ))}
            {/* Bouton et non lien : un href="/" laissait la session ouverte. */}
            <button
              type="button"
              className="mrow"
              style={{ width: "100%", textAlign: "left" }}
              onClick={async () => {
                await seDeconnecter();
                router.push("/");
              }}
            >
              <span className="mi" aria-hidden>
                ↩️
              </span>
              <span>
                <b>Déconnexion</b>
              </span>
              <span className="ch" aria-hidden>
                ›
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* ===== Version web (carte équivalente, la sidebar reste la navigation) ===== */}
      <div className="hidden md:block">
        <h2 className="mb-5 text-[21px] font-extrabold tracking-[-0.3px]">Mon compte</h2>
        <div className="max-w-[520px] overflow-hidden rounded-2xl border border-line bg-white">
          {ENTREES.map((e) => (
            <Link
              key={e.titre}
              href={e.href}
              className="flex items-center gap-3 border-b border-line px-4 py-[14px] last:border-b-0 hover:bg-bg"
            >
              <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[10px] bg-teal-soft text-[15px]" aria-hidden>
                {e.icone}
              </span>
              <span>
                <b className="block text-sm font-bold">{e.titre}</b>
                {e.sous && <small className="text-[11.5px] text-muted">{e.sous}</small>}
              </span>
              <span className="ml-auto text-lg text-[#B9C7D0]" aria-hidden>
                ›
              </span>
            </Link>
          ))}
          <button
            type="button"
            onClick={async () => {
              await seDeconnecter();
              router.push("/");
            }}
            className="flex w-full items-center gap-3 px-4 py-[14px] text-left hover:bg-bg"
          >
            <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[10px] bg-teal-soft text-[15px]" aria-hidden>
              ↩️
            </span>
            <b className="text-sm font-bold">Déconnexion</b>
            <span className="ml-auto text-lg text-[#B9C7D0]" aria-hidden>
              ›
            </span>
          </button>
        </div>
      </div>
    </PatientShell>
  );
}
