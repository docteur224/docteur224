"use client";

import { useState } from "react";
import AdminShell from "@/components/admin/AdminShell";
import { majStatutUtilisateur, supprimerCompteUtilisateur, useUtilisateurs } from "@/lib/admin";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import Pagination, { usePagination } from "@/components/site/Pagination";

/*
 * Utilisateurs — reproduit l'écran « admin-users » de la maquette web :
 * recherche, filtres par rôle et liste des comptes réels (table
 * `utilisateurs`). Suspendre/réactiver écrit le statut en base.
 *
 * La suppression est définitive et passe par le serveur : elle anonymise
 * le compte et le bannit (voir lib/suppression-compte.ts). Elle s'arme en
 * deux clics — pas de confirm() natif, qui casse le rendu mobile — et
 * n'est jamais proposée sur un compte administrateur.
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
  const [aSupprimer, setASupprimer] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);

  const roleCible = ROLE_PAR_CATEGORIE[categorie];
  // La recherche porte aussi sur l'e-mail : c'est ce que l'écran affiche
  // sous chaque nom, et souvent le seul identifiant qu'on ait sous la main.
  const terme = recherche.trim().toLowerCase();
  const comptes = utilisateurs
    .filter((u) => roleCible === null || u.role === roleCible)
    .filter(
      (u) => u.nom.toLowerCase().includes(terme) || u.email.toLowerCase().includes(terme)
    )
    .map((u) => ({
      ...u,
      detail: `${LIBELLE_ROLE[u.role] ?? u.role} · ${u.email}`,
      initiales: initiales(u.nom),
      gradient: gradientPour(u.id),
      actif: u.statut === "actif",
      supprime: u.statut === "supprime",
      // Un compte administrateur ne se ferme pas depuis ici, et l'écran ne
      // sait pas lequel est le vôtre : masquer les actions sur tous les
      // comptes admin évite qu'un administrateur se suspende lui-même.
      protege: u.role === "admin",
    }))
    // Les comptes fermés restent consultables — un administrateur doit
    // pouvoir vérifier une suppression — mais en fin de liste : anonymisés,
    // ils sont récents et occuperaient sinon le haut de la première page.
    .sort((a, b) => Number(a.supprime) - Number(b.supprime));
  const pagi = usePagination(comptes, 20);

  async function basculerStatut(id: string, actif: boolean) {
    setEnCours(id);
    const res = await majStatutUtilisateur(id, actif ? "suspendu" : "actif");
    setEnCours(null);
    setMessage(
      res.erreur
        ? { texte: res.erreur, erreur: true }
        : { texte: actif ? "Compte suspendu." : "Compte réactivé.", erreur: false }
    );
    recharger();
  }

  /* Suppression en deux temps : le premier clic arme, le second exécute. */
  async function supprimer(id: string, nom: string) {
    if (aSupprimer !== id) {
      setASupprimer(id);
      setMessage(null);
      return;
    }
    setEnCours(id);
    const res = await supprimerCompteUtilisateur(id);
    setEnCours(null);
    setASupprimer(null);
    setMessage(
      res.erreur
        ? { texte: res.erreur, erreur: true }
        : { texte: `Le compte de ${nom} a été supprimé.`, erreur: false }
    );
    recharger();
  }

  const bandeau = message && (
    <p
      role="status"
      className={`mb-3 rounded-[11px] px-[13px] py-2.5 text-[12.5px] font-semibold ${
        message.erreur ? "bg-red-50 text-red-600" : "bg-green-soft text-green"
      }`}
    >
      {message.erreur ? "⚠️ " : "✓ "}
      {message.texte}
    </p>
  );

  return (
    <AdminShell>
      {/* ===== Version mobile (écran « m-admin-users » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <EnTeteMobile variante="marque" />
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
            {bandeau}
            {comptes.length === 0 && (
              <p className="muted" style={{ fontSize: 12.5 }}>
                Aucun compte ne correspond à la recherche.
              </p>
            )}
            {pagi.tranche.map((compte) => (
              <div key={compte.id} style={{ borderBottom: "1px solid var(--line)" }}>
                <div className="asstrowm" style={{ borderBottom: "none" }}>
                  <span className="av" aria-hidden style={{ background: compte.gradient }}>
                    {compte.initiales}
                  </span>
                  <span className="meta">
                    <b>{compte.nom}</b>
                    <small>{compte.detail}</small>
                  </span>
                  <span className={`pill ${compte.supprime ? "lock" : compte.actif ? "ok" : "lock"}`}>
                    {compte.supprime ? "Supprimé" : compte.actif ? "Actif" : "Suspendu"}
                  </span>
                </div>
                {!compte.protege && !compte.supprime && (
                  <div style={{ display: "flex", gap: 8, padding: "0 0 12px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn ghost"
                      style={{ flex: 1, minWidth: 120, padding: "9px 12px", fontSize: 12 }}
                      disabled={enCours === compte.id}
                      onClick={() => basculerStatut(compte.id, compte.actif)}
                    >
                      {compte.actif ? "Suspendre" : "Réactiver"}
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      style={{
                        flex: 1,
                        minWidth: 120,
                        padding: "9px 12px",
                        fontSize: 12,
                        color: aSupprimer === compte.id ? "#fff" : "#DC2626",
                        background: aSupprimer === compte.id ? "#DC2626" : undefined,
                        borderColor: aSupprimer === compte.id ? "#DC2626" : undefined,
                      }}
                      disabled={enCours === compte.id}
                      onClick={() => supprimer(compte.id, compte.nom)}
                    >
                      {enCours === compte.id
                        ? "Suppression…"
                        : aSupprimer === compte.id
                          ? "Confirmer"
                          : "Supprimer"}
                    </button>
                  </div>
                )}
              </div>
            ))}
            {aSupprimer && (
              <p className="abannerm" style={{ marginTop: 10 }}>
                <span aria-hidden>⚠️</span>
                <span>
                  Suppression définitive : le compte est anonymisé et ne pourra plus se connecter.
                  Les rendez-vous à venir sont annulés.
                </span>
              </p>
            )}
            <Pagination
              page={pagi.page}
              pages={pagi.pages}
              total={pagi.total}
              premier={pagi.premier}
              dernier={pagi.dernier}
              onPage={pagi.setPage}
              libelle="comptes"
            />
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
        {bandeau}
        {comptes.length === 0 && (
          <p className="py-3 text-[12.5px] text-muted">
            Aucun compte ne correspond à la recherche.
          </p>
        )}
        {pagi.tranche.map((compte) => (
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
                compte.supprime
                  ? "bg-red-50 text-red-600"
                  : compte.actif
                    ? "bg-green-soft text-green"
                    : "bg-[#EEF1F4] text-[#7E8C97]"
              }`}
            >
              {compte.supprime ? "Supprimé" : compte.actif ? "Actif" : "Suspendu"}
            </span>
            {compte.protege ? (
              <span className="text-[11.5px] font-semibold text-muted">Administrateur</span>
            ) : compte.supprime ? null : (
              <>
                <button
                  type="button"
                  disabled={enCours === compte.id}
                  onClick={() => basculerStatut(compte.id, compte.actif)}
                  className="rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue transition-colors hover:bg-bg disabled:opacity-50"
                >
                  {compte.actif ? "Suspendre" : "Réactiver"}
                </button>
                <button
                  type="button"
                  disabled={enCours === compte.id}
                  onClick={() => supprimer(compte.id, compte.nom)}
                  className={`rounded-[9px] border-[1.5px] px-3 py-1.5 text-[11.5px] font-bold transition-colors disabled:opacity-50 ${
                    aSupprimer === compte.id
                      ? "border-red-600 bg-red-600 text-white"
                      : "border-line bg-white text-red-600 hover:bg-red-50"
                  }`}
                >
                  {enCours === compte.id
                    ? "Suppression…"
                    : aSupprimer === compte.id
                      ? "Confirmer la suppression"
                      : "Supprimer"}
                </button>
                {aSupprimer === compte.id && (
                  <button
                    type="button"
                    onClick={() => setASupprimer(null)}
                    className="text-[11.5px] font-bold text-muted underline"
                  >
                    Annuler
                  </button>
                )}
              </>
            )}
          </div>
        ))}
        {aSupprimer && (
          <p className="mt-3 rounded-[11px] bg-amber-soft px-[13px] py-2.5 text-[12.5px] font-semibold text-amber">
            La suppression est définitive : le compte est anonymisé et ne pourra plus se
            connecter. Les rendez-vous à venir sont annulés ; l&apos;historique déjà honoré reste
            au dossier.
          </p>
        )}
        <Pagination
          page={pagi.page}
          pages={pagi.pages}
          total={pagi.total}
          premier={pagi.premier}
          dernier={pagi.dernier}
          onPage={pagi.setPage}
          libelle="comptes"
        />
      </div>
      </div>
    </AdminShell>
  );
}
