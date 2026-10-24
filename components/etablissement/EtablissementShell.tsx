"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import TabBarMobile from "@/components/mobile/TabBarMobile";
import { ETABLISSEMENT_VIDE, useEtablissementConnecte } from "@/lib/etablissement";
import { useProfilConnecte } from "@/lib/patient";
import CompteSuspendu from "@/components/compte/CompteSuspendu";
import { useParcoursInscription } from "@/lib/inscription-pro";
import BarreLaterale from "@/components/site/BarreLaterale";

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
  const ETABLISSEMENT_CONNECTE = etablissement ?? ETABLISSEMENT_VIDE;

  return (
    <div className="grid min-h-screen content-start bg-bg lg:grid-cols-[236px_1fr] lg:content-stretch">
      <BarreLaterale
        avatar="🏥"
        avatarEmoji
        fondAvatar={ETABLISSEMENT_CONNECTE.gradient}
        nom={ETABLISSEMENT_CONNECTE.nomCourt}
        sousTitre="Établissement"
        liens={LIENS}
      />
      <main className="with-tabbar min-w-0 overflow-x-clip md:px-[30px] md:py-[26px]">
        {enParcours ? (
          <p className="py-16 text-center text-[13px] text-muted">Redirection…</p>
        ) : profil?.statut === "suspendu" ? (
          <CompteSuspendu role={profil.role} parAdmin={profil.suspenduParAdmin} />
        ) : (
          children
        )}
      </main>
      <TabBarMobile role="etablissement" />
    </div>
  );
}
