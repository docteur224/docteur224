"use client";

import { useState } from "react";
import AdminShell from "@/components/admin/AdminShell";

/*
 * Utilisateurs — reproduit l'écran « admin-users » de la maquette web :
 * recherche, filtres par type de compte et liste des comptes. Recherche et
 * filtres fonctionnent en direct sur la liste de démonstration.
 */

const CATEGORIES = ["Tous", "Patients", "Médecins", "Assistant(e)s", "Établissements"] as const;

const COMPTES = [
  {
    nom: "Mariama Sow",
    detail: "Patiente · +224 621 00 11 22",
    initiales: "MS",
    gradient: "linear-gradient(135deg,#E08E45,#C0392B)",
    categorie: "Patients",
    statut: "Actif",
  },
  {
    nom: "Dr Aïssata Barry",
    detail: "Médecin · Pédiatrie · Vérifié",
    initiales: "AB",
    gradient: "linear-gradient(135deg,#2E9CCA,#15506B)",
    categorie: "Médecins",
    statut: "Actif",
  },
  {
    nom: "Hawa Diallo",
    detail: "Assistante · Dr A. Barry",
    initiales: "HD",
    gradient: "linear-gradient(135deg,#6C5CE7,#341F97)",
    categorie: "Assistant(e)s",
    statut: "Actif",
  },
  {
    nom: "Clinique Ambroise Paré",
    detail: "Établissement · 5 médecins",
    initiales: "🏥",
    gradient: "linear-gradient(135deg,#16A085,#0E6655)",
    categorie: "Établissements",
    statut: "Actif",
  },
  {
    nom: "Ousmane Baldé",
    detail: "Patient · compte suspendu",
    initiales: "OB",
    gradient: "linear-gradient(135deg,#9AA8B2,#647A89)",
    categorie: "Patients",
    statut: "Suspendu",
  },
];

export default function UtilisateursAdmin() {
  const [categorie, setCategorie] = useState<(typeof CATEGORIES)[number]>("Tous");
  const [recherche, setRecherche] = useState("");

  const comptes = COMPTES.filter(
    (compte) =>
      (categorie === "Tous" || compte.categorie === categorie) &&
      compte.nom.toLowerCase().includes(recherche.trim().toLowerCase())
  );

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
            <h4>15 240 comptes</h4>
            {comptes.length === 0 && (
              <p className="muted" style={{ fontSize: 12.5 }}>
                Aucun compte ne correspond à la recherche.
              </p>
            )}
            {comptes.map((compte) => (
              <div key={compte.nom} className="asstrowm">
                <span className="av" aria-hidden style={{ background: compte.gradient }}>
                  {compte.initiales}
                </span>
                <span className="meta">
                  <b>{compte.nom}</b>
                  <small>{compte.detail}</small>
                </span>
                <span className={`pill ${compte.statut === "Actif" ? "ok" : "lock"}`}>
                  {compte.statut}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== Version web (inchangée) ===== */}
      <div className="hidden md:block">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Utilisateurs</h2>
          <small className="text-[13px] text-muted">15 240 comptes au total</small>
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
            key={compte.nom}
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
                compte.statut === "Actif"
                  ? "bg-green-soft text-green"
                  : "bg-[#EEF1F4] text-[#7E8C97]"
              }`}
            >
              {compte.statut}
            </span>
            <button
              type="button"
              disabled
              title="Disponible avec la base de données"
              className="cursor-not-allowed rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue opacity-50"
            >
              {compte.statut === "Actif" ? "Gérer" : "Réactiver"}
            </button>
          </div>
        ))}
      </div>
      </div>
    </AdminShell>
  );
}
