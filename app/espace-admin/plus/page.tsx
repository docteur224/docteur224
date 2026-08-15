"use client";

import Link from "next/link";
import AdminShell from "@/components/admin/AdminShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import { useDroitsAdmin } from "@/lib/admin";
import { aPermission, PERMISSION_PAR_ROUTE } from "@/lib/permissions-admin";

/*
 * Plus (hub mobile) — reproduit l'écran « m-admin-plus » de la maquette
 * mobile : menu vers les écrans admin qui n'ont pas d'onglet dans la barre
 * basse. Sur web (≥ md), même liste en carte, la sidebar restant la
 * navigation principale.
 */

const TOUTES_ENTREES = [
  { href: "/espace-admin/moderation", icone: "🚩", titre: "Modération", sous: "Signalements et avis" },
  { href: "/espace-admin/pilotage", icone: "🧭", titre: "Pilotage & croissance", sous: "Couverture, SMS, vedette" },
  { href: "/espace-admin/annonces", icone: "📢", titre: "Annonces", sous: "Diffuser un message" },
  { href: "/espace-admin/etablissements", icone: "🏥", titre: "Établissements", sous: "Structures inscrites" },
  { href: "/espace-admin/finances", icone: "💳", titre: "Finances", sous: "Revenus et abonnements" },
  { href: "/espace-admin/abonnements", icone: "🏷️", titre: "Abonnements", sous: "Configurer les offres" },
  { href: "/espace-admin/parametres", icone: "⚙️", titre: "Paramètres", sous: "Spécialités, villes, réglages" },
  { href: "/espace-admin/equipe", icone: "🛡️", titre: "Équipe admin", sous: "Comptes et rôles" },
  { href: "/espace-admin/audit", icone: "📜", titre: "Journal d'audit", sous: "Traçabilité" },
  { href: "/espace-admin/mon-compte", icone: "🔐", titre: "Mon compte", sous: "Mot de passe et sécurité" },
  { href: "/", icone: "↩️", titre: "Déconnexion", sous: "" },
];

export default function PlusAdmin() {
  // Même règle que la barre latérale web : ce hub ne propose que les sections
  // que les permissions de l'administrateur lui ouvrent (migration 0043).
  const { droits, chargement } = useDroitsAdmin();
  const ENTREES = TOUTES_ENTREES.filter((e) => {
    const requise = PERMISSION_PAR_ROUTE[e.href];
    return !requise || chargement || aPermission(droits, requise);
  });

  return (
    <AdminShell>
      {/* ===== Version mobile ===== */}
      <div className="md:hidden">
        <EnTeteMobile variante="marque" />
        <div className="appbar">
          <h3 style={{ paddingLeft: 4 }}>Plus</h3>
        </div>
        <div className="pad">
          <div className="acctop">
            <span
              className="av"
              aria-hidden
              style={{ background: "linear-gradient(135deg,#15506B,#0B2E3D)" }}
            >
              🛡️
            </span>
            <div>
              <b>Administrateur</b>
              <small>Docteur 224</small>
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
          </div>
        </div>
      </div>

      {/* ===== Version web (carte équivalente, la sidebar reste la navigation) ===== */}
      <div className="hidden md:block">
        <h2 className="mb-5 text-[21px] font-extrabold tracking-[-0.3px]">Plus</h2>
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
              <span className="ml-auto text-lg text-[#B9C7D0]" aria-hidden>
                ›
              </span>
            </Link>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
