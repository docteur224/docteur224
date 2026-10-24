"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import TabBarMobile from "@/components/mobile/TabBarMobile";
import { useContextePro } from "@/lib/pro";
import { useProfilConnecte } from "@/lib/patient";
import CompteSuspendu from "@/components/compte/CompteSuspendu";
import BarreLaterale from "@/components/site/BarreLaterale";

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
  { href: "/espace-assistant/compte", icone: "👤", label: "Mes permissions" },
  { href: "/espace-assistant/mon-compte", icone: "🔐", label: "Mon compte" },
];

export default function AssistantShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { medecin, utilisateur, chargement, role } = useContextePro();
  const { profil } = useProfilConnecte();

  // Garde d'accès : l'espace assistant exige un compte assistant (ou médecin).
  useEffect(() => {
    if (!chargement && role !== "medecin" && role !== "assistant") {
      router.replace("/connexion");
    }
  }, [chargement, role, router]);
  const nomAssistant = utilisateur ? `${utilisateur.prenom} ${utilisateur.nom}`.trim() : "…";
  const nomMedecin = medecin ? `${medecin.civilite} ${medecin.prenom.charAt(0)}. ${medecin.nom}` : "";

  return (
    <div className="grid min-h-screen content-start bg-bg lg:grid-cols-[236px_1fr] lg:content-stretch">
      <BarreLaterale
        avatar="HD"
        fondAvatar="linear-gradient(135deg,#2E9CCA,#15506B)"
        nom={nomAssistant}
        sousTitre={`Assistant(e)${nomMedecin ? ` · ${nomMedecin}` : ""}`}
        liens={LIENS}
      />
      <main className="with-tabbar min-w-0 overflow-x-clip md:px-[30px] md:py-[26px]">
        {/* Compte mis en pause par son titulaire : l'espace se referme sur
            l'écran de réactivation. Laisser l'interface ouverte donnerait des
            boutons que la base refuse (migration 0045). */}
        {profil?.statut === "suspendu" ? <CompteSuspendu role={profil.role} parAdmin={profil.suspenduParAdmin} /> : children}
      </main>
      <TabBarMobile role="assistant" />
    </div>
  );
}
