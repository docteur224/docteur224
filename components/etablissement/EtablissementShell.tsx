"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import TabBarMobile from "@/components/mobile/TabBarMobile";
import { ETABLISSEMENT_VIDE, useEtablissementConnecte } from "@/lib/etablissement";
import { ESPACE_PAR_ROLE, type Role } from "@/lib/auth";
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
  const { profil, chargement } = useProfilConnecte();

  /*
   * Garde d'accès : l'espace établissement exige un compte établissement.
   *
   * Elle manquait — c'était la seule des cinq coquilles sans garde de rôle.
   * Le proxy exige bien une session, mais pas un rôle : un patient, un
   * praticien ou un(e) assistant(e) déjà identifié(e) ouvrait donc la
   * console d'un établissement, menu et libellés compris, et pouvait y
   * arriver par un simple `/connexion?retour=/espace-etablissement`. La
   * base tenait (la RLS ne rendait aucune ligne, l'écran restait vide),
   * mais un écran vide n'est pas un refus : il laisse croire à une panne,
   * et il offre des boutons qui ne peuvent qu'échouer.
   */
  useEffect(() => {
    if (chargement) return;
    if (!profil) router.replace("/connexion");
    else if (profil.role !== "etablissement") {
      router.replace(ESPACE_PAR_ROLE[profil.role as Role] ?? "/connexion");
    }
  }, [chargement, profil, router]);

  // Parcours d'inscription inachevé → retour à l'étape courante du wizard.
  const parcours = useParcoursInscription();
  const enParcours = parcours.role === "etablissement" && parcours.etape !== null;
  useEffect(() => {
    if (!parcours.chargement && enParcours) {
      router.replace(`/inscription/professionnel/etapes/${parcours.etape}`);
    }
  }, [parcours.chargement, enParcours, parcours.etape, router]);

  // Tant que la redirection n'a pas eu lieu, ne pas monter les écrans : ils
  // interrogeraient les tables de l'établissement pour n'afficher que du vide.
  if (!chargement && profil?.role !== "etablissement") {
    return (
      <div className="grid min-h-screen place-items-center bg-bg text-[13.5px] text-muted">
        Redirection…
      </div>
    );
  }

  const ETABLISSEMENT_CONNECTE = etablissement ?? ETABLISSEMENT_VIDE;

  return (
    <div className="cadre-espace grid min-h-screen content-start bg-bg lg:content-stretch">
      <BarreLaterale
        avatar="🏥"
        photo={etablissement?.photoUrl}
        avatarEmoji
        fondAvatar={ETABLISSEMENT_CONNECTE.gradient}
        nom={ETABLISSEMENT_CONNECTE.nomCourt}
        sousTitre="Établissement"
        liens={LIENS}
      />
      <main className="ui-contenu-page with-tabbar min-w-0 overflow-x-clip md:px-[30px] md:py-[26px]">
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
