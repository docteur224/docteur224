"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import TabBarMobile from "@/components/mobile/TabBarMobile";
import { useContextePro } from "@/lib/pro";
import { useProfilConnecte } from "@/lib/patient";
import CompteSuspendu from "@/components/compte/CompteSuspendu";
import { useParcoursInscription } from "@/lib/inscription-pro";
import BarreLaterale from "@/components/site/BarreLaterale";

/**
 * Coquille de l'espace médecin — reproduit la structure .dash / .side / .snav
 * de la maquette web. Menu conforme à la spec C.4 : Tableau de bord · Mon
 * agenda · Mes patients · Mes disponibilités · Avis et notes · Statistiques ·
 * Mes assistant(e)s · Mon abonnement · Mon profil · Déconnexion.
 *
 * L'espace est partagé avec les assistant(e)s, qui y travaillent sous les
 * permissions accordées par leur médecin. Trois écrans ne leur reviennent
 * pas pour autant : l'équipe (on ne se donne pas de droits à soi-même) et
 * tout ce qui touche à l'argent (spec C.4.4). Le menu les masque, et
 * `reserveAuMedecin` ferme la page — un lien masqué reste tapable dans la
 * barre d'adresse. La RLS reste la vraie barrière : elle ne rend rien à un
 * assistant sur `abonnements` ni sur `paiements_abonnement`.
 */
const LIENS = [
  { href: "/espace-medecin", icone: "📊", label: "Tableau de bord" },
  { href: "/espace-medecin/agenda", icone: "📅", label: "Mon agenda" },
  { href: "/espace-medecin/patients", icone: "👥", label: "Mes patients" },
  { href: "/espace-medecin/correspondance", icone: "📨", label: "Correspondance" },
  { href: "/espace-medecin/disponibilites", icone: "🕐", label: "Mes disponibilités" },
  { href: "/espace-medecin/avis", icone: "⭐", label: "Avis et notes" },
  { href: "/espace-medecin/statistiques", icone: "📈", label: "Statistiques" },
  { href: "/espace-medecin/equipe", icone: "🧑‍💼", label: "Mes assistant(e)s", medecinSeul: true },
  { href: "/espace-medecin/abonnement", icone: "💳", label: "Mon abonnement", medecinSeul: true },
  { href: "/espace-medecin/paiements", icone: "🧾", label: "Mes paiements", medecinSeul: true },
  { href: "/espace-medecin/profil", icone: "👤", label: "Mon profil" },
  { href: "/espace-medecin/mon-compte", icone: "🔐", label: "Mon compte" },
];

export default function MedecinShell({
  children,
  reserveAuMedecin = false,
}: {
  children: React.ReactNode;
  /** Page interdite aux assistant(e)s (équipe, abonnement, paiements). */
  reserveAuMedecin?: boolean;
}) {
  const router = useRouter();
  const { medecin, chargement, role } = useContextePro();
  const { profil } = useProfilConnecte();

  // Garde d'accès : l'espace médecin exige un compte medecin ou assistant.
  // Sans ça, un patient (ou une session expirée) restait bloqué sur « Chargement… ».
  useEffect(() => {
    if (!chargement && role !== "medecin" && role !== "assistant") {
      router.replace("/connexion");
    }
  }, [chargement, role, router]);

  // Parcours d'inscription inachevé → retour à l'étape courante du wizard.
  const parcours = useParcoursInscription();
  const enParcours = parcours.role === "medecin" && parcours.etape !== null;
  useEffect(() => {
    if (!parcours.chargement && enParcours) {
      router.replace(`/inscription/professionnel/etapes/${parcours.etape}`);
    }
  }, [parcours.chargement, enParcours, parcours.etape, router]);
  // Tant que le rôle n'est pas lu, on montre le menu complet plutôt qu'un
  // menu qui s'amputerait sous les yeux du médecin.
  const liens = LIENS.filter((lien) => !lien.medecinSeul || chargement || role === "medecin");
  const refuse = reserveAuMedecin && !chargement && role !== "medecin";

  const medecinConnecte = medecin ?? {
    gradient: "linear-gradient(135deg,#2E9CCA,#15506B)",
    initiales: "…",
    civilite: "Dr",
    prenom: "",
    nom: "",
    specialite: "",
  };

  return (
    <div className="grid min-h-screen content-start bg-bg lg:grid-cols-[236px_1fr] lg:content-stretch">
      <BarreLaterale
        avatar={medecinConnecte.initiales}
        fondAvatar={medecinConnecte.gradient}
        nom={`${medecinConnecte.civilite} ${medecinConnecte.prenom.charAt(0)}. ${medecinConnecte.nom}`}
        sousTitre={medecinConnecte.specialite}
        liens={liens}
      />
      <main className="with-tabbar min-w-0 overflow-x-clip md:px-[30px] md:py-[26px]">
        {enParcours ? (
          <p className="py-16 text-center text-[13px] text-muted">Redirection…</p>
        ) : profil?.statut === "suspendu" ? (
          // Compte mis en pause par son titulaire : l'espace se referme sur
          // l'écran de réactivation. Laisser l'interface ouverte donnerait
          // des boutons que la base refuse (migration 0045).
          <CompteSuspendu role={profil.role} parAdmin={profil.suspenduParAdmin} />
        ) : refuse ? (
          <EcranReserve />
        ) : (
          children
        )}
      </main>
      <TabBarMobile role="medecin" />
    </div>
  );
}

/**
 * On dit ce qui manque plutôt que de rediriger : un écran qui se dérobe
 * sans explication passe pour une panne.
 */
function EcranReserve() {
  return (
    <div className="grid place-items-center px-4 py-16 text-center">
      <div className="max-w-[420px]">
        <span aria-hidden className="text-[34px]">
          🔒
        </span>
        <h2 className="mt-3 text-[17px] font-extrabold">Réservé au médecin</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          Cette page relève du compte du médecin : composition de l’équipe, abonnement et
          paiements ne sont pas accessibles aux assistant(e)s.
        </p>
        <Link
          href="/espace-medecin"
          className="mt-4 inline-block rounded-[11px] bg-teal px-[18px] py-2.5 text-[13px] font-bold text-white"
        >
          Retour au tableau de bord
        </Link>
      </div>
    </div>
  );
}
