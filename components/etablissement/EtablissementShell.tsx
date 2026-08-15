"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import TabBarMobile from "@/components/mobile/TabBarMobile";
import { seDeconnecter } from "@/lib/auth";
import { useEtablissementConnecte } from "@/lib/etablissement";
import { useProfilConnecte } from "@/lib/patient";
import CompteSuspendu from "@/components/compte/CompteSuspendu";
import { useParcoursInscription } from "@/lib/inscription-pro";
import ClocheNotifications from "@/components/site/ClocheNotifications";

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
  { href: "/espace-etablissement/mon-compte", icone: "🔐", label: "Mon compte" },
];

export default function EtablissementShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { etablissement } = useEtablissementConnecte();
  const { profil } = useProfilConnecte();

  // Parcours d'inscription inachevé → retour à l'étape courante du wizard.
  const parcours = useParcoursInscription();
  const enParcours = parcours.role === "etablissement" && parcours.etape !== null;
  useEffect(() => {
    if (!parcours.chargement && enParcours) {
      router.replace(`/inscription/professionnel/etapes/${parcours.etape}`);
    }
  }, [parcours.chargement, enParcours, parcours.etape, router]);
  const ETABLISSEMENT_CONNECTE = etablissement ?? { id: "", nom: "…", nomCourt: "…", type: "", description: "", adresse: "", telephone: "", email: "", siteWeb: "", gradient: "linear-gradient(135deg,#16A085,#0E6655)", statut: "", parametres: {}, gestionnaire: { nom: "", role: "", email: "", telephone: "" } };

  return (
    <div className="grid min-h-screen bg-bg lg:grid-cols-[236px_1fr]">
      <aside className="hidden border-b border-line bg-white px-4 py-[22px] md:block lg:border-b-0 lg:border-r">
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
      <main className="with-tabbar overflow-auto md:px-[30px] md:py-[26px]">
        {enParcours ? (
          <p className="py-16 text-center text-[13px] text-muted">Redirection…</p>
        ) : profil?.statut === "suspendu" ? (
          <CompteSuspendu role={profil.role} />
        ) : (
          children
        )}
      </main>
      <TabBarMobile role="etablissement" />
    </div>
  );
}
