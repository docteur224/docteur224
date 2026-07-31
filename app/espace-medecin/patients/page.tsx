"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import MedecinShell from "@/components/medecin/MedecinShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import { calculerAge, formatDateCourte } from "@/lib/dates";
import { PAR_PAGE, useRecherchePatients, type PatientListe } from "@/lib/pro";

/*
 * Mes patients — liste cherchable et paginée.
 *
 * Le filtre, le tri et la pagination sont faits en SQL (RPC
 * `patients_du_medecin`) : la version précédente ramenait tous les
 * rendez-vous du médecin pour reconstruire la liste dans le navigateur, ce
 * qui ne tient pas avec plusieurs centaines de patients et interdisait de
 * chercher sur la date de naissance.
 *
 * Chaque ligne mène au dossier du patient : les actions (documents,
 * historique) y vivent, plus dans un panneau déplié à l'intérieur du tableau.
 */

const initiales = (p: { prenom: string; nom: string }) =>
  `${p.prenom.charAt(0)}${p.nom.charAt(0)}`.toUpperCase() || "?";

const LIBELLE_TYPE: Record<PatientListe["type"], string> = {
  compte: "",
  proche: "proche",
  sans_compte: "sans compte",
};

/** « 36 ans · née le 14/03/1990 », ou rien si la date manque. */
function ligneAge(p: PatientListe): string {
  if (!p.dateNaissance) return "";
  const ans = calculerAge(p.dateNaissance);
  return `${ans} an${ans > 1 ? "s" : ""} · ${formatDateCourte(p.dateNaissance)}`;
}

export default function PatientsMedecin() {
  const [saisie, setSaisie] = useState("");
  const [recherche, setRecherche] = useState("");
  const [page, setPage] = useState(0);
  const { patients, total, chargement } = useRecherchePatients(recherche, page);

  // Frappe temporisée : une requête par mot saisi saturerait la base.
  useEffect(() => {
    const minuteur = setTimeout(() => {
      setRecherche(saisie.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(minuteur);
  }, [saisie]);

  const pages = Math.max(1, Math.ceil(total / PAR_PAGE));
  const debut = total === 0 ? 0 : page * PAR_PAGE + 1;
  const fin = Math.min(total, (page + 1) * PAR_PAGE);

  const champRecherche = (classe: string) => (
    <input
      value={saisie}
      onChange={(e) => setSaisie(e.target.value)}
      placeholder="🔍 Nom, téléphone ou date de naissance…"
      aria-label="Rechercher un patient par nom, téléphone ou date de naissance"
      className={classe}
    />
  );

  const pagination = (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
      <span className="text-[11.5px] text-muted">
        {total === 0 ? "Aucun résultat" : `${debut}–${fin} sur ${total}`}
      </span>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue transition-colors hover:bg-bg disabled:cursor-not-allowed disabled:opacity-40"
          >
            ‹ Précédent
          </button>
          <span className="text-[11.5px] font-bold text-muted">
            {page + 1} / {pages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
            disabled={page >= pages - 1}
            className="rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue transition-colors hover:bg-bg disabled:cursor-not-allowed disabled:opacity-40"
          >
            Suivant ›
          </button>
        </div>
      )}
    </div>
  );

  const messageVide = recherche
    ? `Aucun patient ne correspond à « ${recherche} ».`
    : "Aucun patient pour l’instant. Ils apparaîtront ici dès le premier rendez-vous.";

  return (
    <MedecinShell>
      {/* ===== Version mobile ===== */}
      <div className="md:hidden">
        <EnTeteMobile variante="marque" />
        <div className="appbar">
          <h3 style={{ paddingLeft: 4 }}>Mes patients</h3>
          <span className="sub" style={{ marginLeft: "auto", paddingRight: 6 }}>
            {total} suivi{total > 1 ? "s" : ""}
          </span>
        </div>
        <div className="pad" style={{ paddingTop: 8 }}>
          {champRecherche("inp")}
          {chargement && (
            <p className="muted" style={{ fontSize: 13 }}>
              Recherche…
            </p>
          )}
          {!chargement && patients.length === 0 && (
            <p className="muted" style={{ fontSize: 13 }}>
              {messageVide}
            </p>
          )}
          {patients.map((p) => (
            <Link key={p.cle} href={`/espace-medecin/patients/${p.cle}`} className="paycard">
              <span
                className="pi"
                aria-hidden
                style={{ background: p.gradient, color: "#fff", fontWeight: 800 }}
              >
                {initiales(p)}
              </span>
              <span className="pinfo">
                <b>
                  {p.prenom} {p.nom}
                  {LIBELLE_TYPE[p.type] && (
                    <span
                      style={{
                        marginLeft: 6,
                        fontSize: 10,
                        fontWeight: 700,
                        color: "var(--muted)",
                      }}
                    >
                      {LIBELLE_TYPE[p.type]}
                    </span>
                  )}
                </b>
                <small>
                  {ligneAge(p) || p.telephone || "—"}
                  {p.prochaineVisite
                    ? ` · RDV le ${formatDateCourte(p.prochaineVisite)}`
                    : p.derniereVisite
                      ? ` · vu le ${formatDateCourte(p.derniereVisite)}`
                      : ""}
                </small>
              </span>
              <span className="ch" aria-hidden>
                ›
              </span>
            </Link>
          ))}
          <div style={{ paddingTop: 4 }}>{pagination}</div>
          <div className="noteboxm">
            <span aria-hidden>🔒</span>
            <div>
              Ouvrez un patient pour voir son historique de rendez-vous et les documents échangés.
            </div>
          </div>
        </div>
      </div>

      {/* ===== Version web ===== */}
      <div className="hidden md:block">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Mes patients</h2>
            <small className="text-[13px] text-muted">
              {total} patient{total > 1 ? "s" : ""} suivi{total > 1 ? "s" : ""}
            </small>
          </div>
          {champRecherche(
            "min-w-[320px] rounded-[11px] border border-line bg-white px-[13px] py-3 text-[13.5px] outline-none focus:border-teal"
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          <div className="grid grid-cols-[1fr_150px_150px_120px] items-center gap-3 bg-[#F3F7FA] px-[18px] py-[13px] text-[11px] font-extrabold uppercase tracking-[.04em] text-muted">
            <span>Patient</span>
            <span>Téléphone</span>
            <span>Dernière visite</span>
            <span className="text-right">Rendez-vous</span>
          </div>

          {chargement && (
            <p className="border-t border-line px-[18px] py-[13px] text-[13px] text-muted">
              Recherche…
            </p>
          )}

          {!chargement && patients.length === 0 && (
            <p className="border-t border-line px-[18px] py-[13px] text-[13px] text-muted">
              {messageVide}
            </p>
          )}

          {patients.map((p) => (
            <Link
              key={p.cle}
              href={`/espace-medecin/patients/${p.cle}`}
              className="grid grid-cols-[1fr_150px_150px_120px] items-center gap-3 border-t border-line px-[18px] py-[11px] text-[13px] transition-colors hover:bg-bg"
            >
              <span className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[10px] text-[12px] font-extrabold text-white"
                  style={{ background: p.gradient }}
                >
                  {initiales(p)}
                </span>
                <span className="min-w-0">
                  <b className="block truncate font-extrabold">
                    {p.prenom} {p.nom}
                    {LIBELLE_TYPE[p.type] && (
                      <span className="ml-2 rounded bg-teal-soft px-1.5 py-0.5 text-[10px] font-bold text-blue">
                        {LIBELLE_TYPE[p.type]}
                      </span>
                    )}
                  </b>
                  {ligneAge(p) && (
                    <small className="block text-[11px] text-muted">{ligneAge(p)}</small>
                  )}
                </span>
              </span>
              <span className="text-muted">{p.telephone || "—"}</span>
              <span>
                {p.derniereVisite ? formatDateCourte(p.derniereVisite) : "—"}
                {p.prochaineVisite && (
                  <small className="block text-[11px] font-bold text-teal">
                    à venir : {formatDateCourte(p.prochaineVisite)}
                  </small>
                )}
              </span>
              <span className="text-right text-muted">
                {p.nbRdv} · <span className="font-bold text-blue">Ouvrir ›</span>
              </span>
            </Link>
          ))}
        </div>

        {pagination}

        <p className="mt-3 text-[11.5px] text-muted">
          🔒 Ouvrez un patient pour consulter son historique et les documents échangés. La
          recherche accepte un nom, un prénom, un numéro de téléphone ou une date de naissance.
        </p>
      </div>
    </MedecinShell>
  );
}
