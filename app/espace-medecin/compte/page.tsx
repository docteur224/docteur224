"use client";

import Link from "next/link";
import MedecinShell from "@/components/medecin/MedecinShell";
import { useContextePro } from "@/lib/pro";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import InvitationsEtablissement from "@/components/medecin/InvitationsEtablissement";

/*
 * Mon compte (hub mobile) — reproduit l'écran « m-med-compte » de la maquette
 * mobile : avatar vérifié, menu vers profil / disponibilités / statistiques /
 * assistant(e)s / abonnement / déconnexion. Sur web (≥ md), même liste en
 * carte, la sidebar restant la navigation principale.
 */

type EntreeCompte = { href: string; icone: string; titre: string; sous: string };

/*
 * Version WEB (≥ md) : liste historique inchangée — la navigation reste la
 * barre latérale, cette carte n'est qu'un rappel.
 */
const ENTREES: EntreeCompte[] = [
  { href: "/espace-medecin/profil", icone: "👤", titre: "Mon profil", sous: "Infos affichées aux patients" },
  { href: "/espace-medecin/disponibilites", icone: "🕐", titre: "Mes disponibilités", sous: "Horaires et congés" },
  {
    href: "/espace-medecin/avis",
    icone: "⭐",
    titre: "Avis et notes",
    sous: "Retours des patients et réponses",
  },
  { href: "/espace-medecin/statistiques", icone: "📈", titre: "Statistiques", sous: "Performances et avis" },
  {
    href: "/espace-medecin/suivi-absence",
    icone: "📉",
    titre: "Suivi d’absence",
    sous: "Rendez-vous non honorés et rappels",
  },
  {
    href: "/espace-medecin/equipe",
    icone: "🧑‍💼",
    titre: "Mes assistant(e)s",
    sous: "Comptes et permissions de l'équipe",
  },
  { href: "/espace-medecin/abonnement", icone: "💳", titre: "Mon abonnement", sous: "Formule Standard / Premium" },
  {
    href: "/espace-medecin/mon-compte",
    icone: "🔐",
    titre: "Mon compte",
    sous: "Mot de passe, abonnement, suspension",
  },
  { href: "/", icone: "↩️", titre: "Déconnexion", sous: "" },
];

/*
 * Version MOBILE : « mon compte & ma pratique », en sections. La navigation
 * (agenda, patients, avis, statistiques, suivi d'absence) vit désormais dans
 * le tiroir latéral ; ici, uniquement la gestion du compte et de la pratique.
 * La Déconnexion est dans le tiroir (section Réglages) — pas de doublon ici.
 */
const SECTIONS_PROFIL: { titre: string; entrees: EntreeCompte[] }[] = [
  {
    titre: "Ma pratique",
    entrees: [
      { href: "/espace-medecin/profil", icone: "👤", titre: "Mon profil", sous: "Infos affichées aux patients" },
      { href: "/espace-medecin/disponibilites", icone: "🕐", titre: "Mes disponibilités", sous: "Horaires et congés" },
      { href: "/espace-medecin/equipe", icone: "🧑‍💼", titre: "Mes assistant(e)s", sous: "Comptes et permissions de l'équipe" },
    ],
  },
  {
    titre: "Abonnement & paiements",
    entrees: [
      { href: "/espace-medecin/abonnement", icone: "💳", titre: "Mon abonnement", sous: "Formule Standard / Premium" },
      { href: "/espace-medecin/paiements", icone: "🧾", titre: "Mes paiements", sous: "Factures et règlements" },
    ],
  },
  {
    titre: "Sécurité",
    entrees: [
      { href: "/espace-medecin/mon-compte", icone: "🔐", titre: "Sécurité & connexion", sous: "Mot de passe et sessions" },
    ],
  },
];

export default function CompteMedecin() {
  const { medecin } = useContextePro();
  const medecinConnecte = medecin ?? { gradient: "var(--avatar-bleu)", initiales: "…", civilite: "Dr", prenom: "", nom: "", note: 0, specialite: "" };
  return (
    <MedecinShell>
      {/* ===== Version mobile ===== */}
      <div className="md:hidden">
        <EnTeteMobile variante="marque" />
        <div className="appbar">
          <h3 style={{ paddingLeft: 4 }}>Mon compte</h3>
        </div>
        <div className="pad">
          <div className="acctop">
            <span className="av" aria-hidden style={{ background: medecinConnecte.gradient }}>
              {medecinConnecte.initiales}
            </span>
            <div>
              <b>
                {medecinConnecte.civilite} {medecinConnecte.prenom} {medecinConnecte.nom}
              </b>
              <small>Pédiatre · Profil vérifié ✔</small>
            </div>
          </div>
          {/* Les invitations de rattachement arrivent ici : c'est l'écran
              que vise la notification « Invitation reçue » (migration 0013). */}
          <InvitationsEtablissement mobile />
          {SECTIONS_PROFIL.map((section) => (
            <div key={section.titre}>
              <p className="sect-titre">{section.titre}</p>
              <div className="menu">
                {section.entrees.map((e) => (
                  <Link key={e.href} href={e.href} className="mrow">
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
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ===== Version web (carte équivalente, la sidebar reste la navigation) ===== */}
      <div className="hidden md:block">
        <h2 className="mb-5 text-[21px] font-extrabold tracking-[-0.3px]">Mon compte</h2>
        <InvitationsEtablissement />
        <div className="max-w-[520px] overflow-hidden rounded-2xl border border-line bg-white">
          {ENTREES.map((e) => (
            <Link
              key={e.titre}
              href={e.href}
              className="flex items-center gap-3 border-b border-line px-4 py-[14px] last:border-b-0 hover:bg-bg"
            >
              <span
                className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[10px] bg-teal-soft text-[15px]"
                aria-hidden
              >
                {e.icone}
              </span>
              <span>
                <b className="block text-sm font-bold">{e.titre}</b>
                {e.sous && <small className="text-[11.5px] text-muted">{e.sous}</small>}
              </span>
              <span className="ml-auto text-lg text-muted-soft" aria-hidden>
                ›
              </span>
            </Link>
          ))}
        </div>
      </div>
    </MedecinShell>
  );
}
