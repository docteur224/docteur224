"use client";

import Link from "next/link";
import AdminShell from "@/components/admin/AdminShell";
import AppBarMobile from "@/components/mobile/AppBarMobile";
import { useEtablissementsEnAttente } from "@/lib/admin";

/*
 * Établissements — reproduit l'écran « admin-etabs » de la maquette web :
 * toutes les structures de la plateforme. La Polyclinique de Ratoma apparaît
 * « En attente » tant que son dossier n'a pas été traité dans Validations.
 */

const STRUCTURES = [
  {
    nom: "Clinique Ambroise Paré",
    detail: "Clinique privée · Conakry · 5 médecins",
    gradient: "linear-gradient(135deg,#16A085,#0E6655)",
  },
  {
    nom: "Hôpital Donka",
    detail: "Hôpital public · Conakry · 28 médecins",
    gradient: "linear-gradient(135deg,#2E9CCA,#15506B)",
  },
  {
    nom: "CHU de Conakry",
    detail: "Centre hospitalier · Conakry · 40+ médecins",
    gradient: "linear-gradient(135deg,#6C5CE7,#341F97)",
  },
];

export default function EtablissementsAdmin() {
  const { dossiers: enAttente } = useEtablissementsEnAttente();
  const ratomaEnAttente = enAttente.some((d) => d.id === "val-ratoma");

  return (
    <AdminShell>
      {/* ===== Version mobile (écran « m-admin-etabs » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <AppBarMobile retour="/espace-admin/plus" titre="Établissements" />
        <div className="pad">
          <div className="card2">
            <h4>Structures inscrites</h4>
            {STRUCTURES.map((structure) => (
              <div key={structure.nom} className="asstrowm">
                <span className="av" aria-hidden style={{ background: structure.gradient }}>
                  🏥
                </span>
                <span className="meta">
                  <b>{structure.nom}</b>
                  <small>{structure.detail}</small>
                </span>
                <span className="pill ok">Vérifié</span>
              </div>
            ))}
            <div className="asstrowm">
              <span
                className="av"
                aria-hidden
                style={{ background: "linear-gradient(135deg,#9AA8B2,#647A89)" }}
              >
                🏥
              </span>
              <span className="meta">
                <b>Polyclinique de Ratoma</b>
                <small>
                  Clinique privée · Conakry ·{" "}
                  {ratomaEnAttente ? "en cours de validation" : "dossier traité"}
                </small>
              </span>
              {ratomaEnAttente ? (
                <Link href="/espace-admin/validations" className="pill soon">
                  Attente
                </Link>
              ) : (
                <span className="pill ok">Traité ✓</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ===== Version web (inchangée) ===== */}
      <div className="hidden md:block">
      <div className="mb-5">
        <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Établissements</h2>
        <small className="text-[13px] text-muted">Toutes les structures de la plateforme</small>
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">Structures inscrites</h3>
        {STRUCTURES.map((structure) => (
          <div
            key={structure.nom}
            className="flex flex-wrap items-center gap-[13px] border-b border-line py-[14px]"
          >
            <span
              aria-hidden
              className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl text-sm text-white"
              style={{ background: structure.gradient }}
            >
              🏥
            </span>
            <div className="min-w-0 flex-1">
              <b className="block text-sm font-extrabold">{structure.nom}</b>
              <small className="text-xs text-muted">{structure.detail}</small>
            </div>
            <span className="rounded-lg bg-green-soft px-[9px] py-1 text-[11px] font-bold text-green">
              Vérifié
            </span>
            <button
              type="button"
              disabled
              title="Disponible avec la base de données"
              className="cursor-not-allowed rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue opacity-50"
            >
              Gérer
            </button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-[13px] py-[14px]">
          <span
            aria-hidden
            className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl text-sm text-white"
            style={{ background: "linear-gradient(135deg,#9AA8B2,#647A89)" }}
          >
            🏥
          </span>
          <div className="min-w-0 flex-1">
            <b className="block text-sm font-extrabold">Polyclinique de Ratoma</b>
            <small className="text-xs text-muted">
              Clinique privée · Conakry ·{" "}
              {ratomaEnAttente ? "en cours de validation" : "dossier traité"}
            </small>
          </div>
          {ratomaEnAttente ? (
            <>
              <span className="rounded-lg bg-amber-soft px-[9px] py-1 text-[11px] font-bold text-amber">
                En attente
              </span>
              <Link
                href="/espace-admin/validations"
                className="rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue transition-colors hover:bg-bg"
              >
                Vérifier
              </Link>
            </>
          ) : (
            <span className="rounded-lg bg-green-soft px-[9px] py-1 text-[11px] font-bold text-green">
              Traité ✓
            </span>
          )}
        </div>
      </div>
      </div>
    </AdminShell>
  );
}
