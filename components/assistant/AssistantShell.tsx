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
  // Le même écran que côté médecin, avec les seuils en lecture seule.
  { href: "/espace-assistant/suivi-absence", icone: "📉", label: "Suivi d’absence" },
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

  // Tant que la redirection n'a pas eu lieu, ne pas monter les écrans : un
  // patient ou un établissement voyait sinon les rendez-vous et la patientèle
  // du cabinet se dessiner le temps d'une navigation. Même règle que les
  // quatre autres coquilles.
  if (!chargement && role !== "medecin" && role !== "assistant") {
    return (
      <div className="grid min-h-screen place-items-center bg-bg text-[13.5px] text-muted">
        Redirection…
      </div>
    );
  }

  const nomAssistant = utilisateur ? `${utilisateur.prenom} ${utilisateur.nom}`.trim() : "…";
  // Les initiales de la maquette (« HD ») restaient affichées pour toutes les
  // assistantes.
  const initialesAssistant = utilisateur
    ? `${utilisateur.prenom.charAt(0)}${utilisateur.nom.charAt(0)}`.toUpperCase() || "?"
    : "…";
  const nomMedecin = medecin ? `${medecin.civilite} ${medecin.prenom.charAt(0)}. ${medecin.nom}` : "";

  return (
    <div className="cadre-espace grid min-h-screen content-start bg-bg lg:content-stretch">
      <BarreLaterale
        avatar={initialesAssistant}
        fondAvatar="var(--avatar-bleu)"
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
