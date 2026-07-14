"use client";

import { useState } from "react";
import AdminShell from "@/components/admin/AdminShell";
import { majStatutUtilisateur, useUtilisateurs } from "@/lib/admin";

/*
 * Utilisateurs — reproduit l'écran « admin-users » de la maquette web :
 * recherche, filtres par rôle et liste des comptes réels (table
 * `utilisateurs`). Suspendre/réactiver écrit le statut en base.
 */

const CATEGORIES = ["Tous", "Patients", "Médecins", "Assistant(e)s", "Établissements"] as const;

const ROLE_PAR_CATEGORIE: Record<(typeof CATEGORIES)[number], string | null> = {
  Tous: null,
  Patients: "patient",
  Médecins: "medecin",
  "Assistant(e)s": "assistant",
  Établissements: "etablissement",
};

const GRADIENTS = [
  "linear-gradient(135deg,#2E9CCA,#15506B)",
  "linear-gradient(135deg,#E08E45,#C0392B)",
  "linear-gradient(135deg,#6C5CE7,#341F97)",
  "linear-gradient(135deg,#16A085,#0E6655)",
  "linear-gradient(135deg,#9AA8B2,#647A89)",
];

const gradientPour = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return GRADIENTS[Math.abs(h) % GRADIENTS.length];
};

const initiales = (nom: string) =>
  nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m.charAt(0))
    .join("")
    .toUpperCase() || "?";

const LIBELLE_ROLE: Record<string, string> = {
  patient: "Patient",
  medecin: "Médecin",
  assistant: "Assistant(e)",
  etablissement: "Établissement",
  admin: "Administrateur",
};

export default function UtilisateursAdmin() {
  const { utilisateurs, recharger } = useUtilisateurs();
  const [categorie, setCategorie] = useState<(typeof CATEGORIES)[number]>("Tous");
  const [recherche, setRecherche] = useState("");

  const roleCible = ROLE_PAR_CATEGORIE[categorie];
  const comptes = utilisateurs
    .filter((u) => (roleCible === null || u.role === roleCible))
    .filter((u) => u.nom.toLowerCase().includes(recherche.trim().toLowerCase()))
    .map((u) => ({
      ...u,
      detail: `${LIBELLE_ROLE[u.role] ?? u.role} · ${u.email}`,
      initiales: initiales(u.nom),
      gradient: gradientPour(u.id),
      actif: u.statut === "actif",
    }));

  async function basculerStatut(id: string, actif: boolean) {
    await majStatutUtilisateur(id, actif ? "suspendu" : "actif");
    recharger();
  }

  return (
    <AdminShell>
      {/* ===== Version mobile (écran « m-admin-users » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <div className="appbar">
          <h3 style={{ paddingLeft: 4 }}>Utilisateurs</h3>
        </div>
        <div className="pad">
          <input
            className="inp"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="🔍 Rechercher un utilisateur…"
          />
          <div className="chips" style={{ marginBottom: 12 }}>
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                className={`chip${categorie === c ? " blue" : ""}`}
                onClick={() => setCategorie(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="card2">
            <h4>{utilisateurs.length} comptes</h4>
            {comptes.length === 0 && (
              <p className="muted" style={{ fontSize: 12.5 }}>
                Aucun compte ne correspond à la recherche.
              </p>
            )}
            {comptes.map((compte) => (
              <div key={compte.id} className="asstrowm">
                <span className="av" aria-hidden style={{ background: compte.gradient }}>
                  {compte.initiales}
                </span>
                <span className="meta">
                  <b>{compte.nom}</b>
                  <small>{compte.detail}</small>
                </span>
                <span className={`pill ${compte.actif ? "ok" : "lock"}`}>
                  {compte.actif ? "Actif" : "Suspendu"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== Version web ===== */}
      <div className="hidden md:block">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Utilisateurs</h2>
          <small className="text-[13px] text-muted">{utilisateurs.length} comptes au total</small>
        </div>
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="🔍 Rechercher un utilisateur…"
          className="min-w-[240px] rounded-[11px] border border-line bg-white px-[13px] py-3 text-[13.5px] outline-none focus:border-teal"
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategorie(c)}
            className={`rounded-full border px-[14px] py-2 text-xs font-bold ${
              categorie === c
                ? "border-blue bg-blue text-white"
                : "border-[#CDE6F2] bg-teal-soft text-blue"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">Comptes</h3>
        {comptes.length === 0 && (
          <p className="py-3 text-[12.5px] text-muted">
            Aucun compte ne correspond à la recherche.
          </p>
        )}
        {comptes.map((compte) => (
          <div
            key={compte.id}
            className="flex flex-wrap items-center gap-[13px] border-b border-line py-[14px] last:border-b-0"
          >
            <span
              aria-hidden
              className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl text-sm font-extrabold text-white"
              style={{ background: compte.gradient }}
            >
              {compte.initiales}
            </span>
            <div className="min-w-0 flex-1">
              <b className="block text-sm font-extrabold">{compte.nom}</b>
              <small className="text-xs text-muted">{compte.detail}</small>
            </div>
            <span
              className={`rounded-lg px-[9px] py-1 text-[11px] font-bold ${
                compte.actif ? "bg-green-soft text-green" : "bg-[#EEF1F4] text-[#7E8C97]"
              }`}
            >
              {compte.actif ? "Actif" : "Suspendu"}
            </span>
            <button
              type="button"
              onClick={() => basculerStatut(compte.id, compte.actif)}
              className="rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue transition-colors hover:bg-bg"
            >
              {compte.actif ? "Suspendre" : "Réactiver"}
            </button>
          </div>
        ))}
      </div>
      </div>
    </AdminShell>
  );
}
