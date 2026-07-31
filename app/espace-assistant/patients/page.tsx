"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AssistantShell from "@/components/assistant/AssistantShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import { formatDateCourte } from "@/lib/dates";
import { PAR_PAGE, useContextePro, useRecherchePatients } from "@/lib/pro";

/*
 * Patients (assistant(e)) — reproduit l'écran « asst-patients » de la
 * maquette web : coordonnées uniquement (nom, téléphone) pour organiser les
 * rendez-vous. Le dossier médical n'est pas accessible (spec C.5) — donc pas
 * de lien vers /espace-medecin/patients/[cle], qui expose les documents.
 *
 * Recherche et pagination en SQL (RPC patients_du_medecin, comme côté
 * médecin — elle gère déjà l'assistant via medecin_de_assistant()) :
 * reconstruire la liste depuis tous les rendez-vous ne tient pas au-delà de
 * quelques dizaines de patients.
 */
export default function PatientsAssistant() {
  const { permissions } = useContextePro();
  const [saisie, setSaisie] = useState("");
  const [recherche, setRecherche] = useState("");
  const [page, setPage] = useState(0);
  const { patients, total, chargement } = useRecherchePatients(recherche, page);
  const peutCreer = permissions.creerRdv;

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
  const messageVide = recherche
    ? `Aucun patient ne correspond à « ${recherche} ».`
    : "Aucun patient pour l’instant. Ils apparaîtront ici dès le premier rendez-vous.";

  const boutonRdv = (classe: string) =>
    peutCreer ? (
      <Link href="/espace-assistant/nouveau-rdv" className={classe}>
        RDV
      </Link>
    ) : (
      <span
        className={classe}
        style={{ opacity: 0.5, cursor: "not-allowed" }}
        title="Permission « Créer un rendez-vous pour un patient » non accordée"
      >
        RDV 🔒
      </span>
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

  return (
    <AssistantShell>
      {/* ===== Version mobile ===== */}
      <div className="md:hidden">
        <EnTeteMobile retour="/espace-assistant/compte" titre="Patients" />
        <div className="pad">
          <div className="noteboxm" style={{ marginTop: 0 }}>
            <span aria-hidden>🔒</span>
            <div>
              Coordonnées uniquement (nom, téléphone). Le <b>dossier médical</b> n&apos;est pas
              accessible.
            </div>
          </div>
          <input
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            placeholder="🔍 Nom, téléphone ou date de naissance…"
            aria-label="Rechercher un patient par nom, téléphone ou date de naissance"
            className="inp"
            style={{ marginTop: 10 }}
          />
          <div className="card2">
            <h4>Liste des patients ({total})</h4>
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
              <div key={p.cle} className="asstrowm">
                <span className="av" aria-hidden style={{ background: p.gradient }}>
                  {`${p.prenom.charAt(0)}${p.nom.charAt(0)}`.toUpperCase()}
                </span>
                <span className="meta">
                  <b>
                    {p.prenom} {p.nom}
                  </b>
                  <small>
                    {p.telephone || "—"}
                    {p.derniereVisite
                      ? ` · vu le ${formatDateCourte(p.derniereVisite)}`
                      : p.prochaineVisite
                        ? ` · RDV le ${formatDateCourte(p.prochaineVisite)}`
                        : ""}
                  </small>
                </span>
                {boutonRdv("btnm gh")}
              </div>
            ))}
            <div style={{ paddingTop: 4 }}>{pagination}</div>
          </div>
        </div>
      </div>

      {/* ===== Version web ===== */}
      <div className="hidden md:block">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Patients</h2>
            <small className="text-[13px] text-muted">
              {total} patient{total > 1 ? "s" : ""} · coordonnées pour organiser et rappeler les
              rendez-vous
            </small>
          </div>
          <input
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            placeholder="🔍 Nom, téléphone ou date de naissance…"
            aria-label="Rechercher un patient par nom, téléphone ou date de naissance"
            className="min-w-[320px] rounded-[11px] border border-line bg-white px-[13px] py-3 text-[13.5px] outline-none focus:border-teal"
          />
        </div>

        <div className="mb-4 flex items-start gap-[9px] rounded-xl border border-[#F2D9B6] bg-[#FFF5E9] px-[14px] py-3 text-[12.5px] font-semibold leading-relaxed text-[#8A5A1B]">
          <span aria-hidden>🔒</span>
          <div>
            Vous accédez uniquement aux <b>coordonnées</b> (nom, téléphone) nécessaires à la prise
            de rendez-vous. Le <b>dossier médical</b> n’est pas accessible.
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-1 text-[15px] font-extrabold">Liste des patients</h3>
          {chargement && <p className="pt-3 text-[13px] text-muted">Recherche…</p>}
          {!chargement && patients.length === 0 && (
            <p className="pt-3 text-[13px] text-muted">{messageVide}</p>
          )}
          {patients.map((p) => (
            <div
              key={p.cle}
              className="flex flex-wrap items-center gap-[13px] border-b border-line py-[14px] last:border-b-0"
            >
              <span
                aria-hidden
                className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl text-sm font-extrabold text-white"
                style={{ background: p.gradient }}
              >
                {`${p.prenom.charAt(0)}${p.nom.charAt(0)}`.toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <b className="block text-sm font-extrabold">
                  {p.prenom} {p.nom}
                </b>
                <small className="text-xs text-muted">
                  {p.derniereVisite
                    ? `Dernier RDV : ${formatDateCourte(p.derniereVisite)}`
                    : p.prochaineVisite
                      ? `RDV à venir : ${formatDateCourte(p.prochaineVisite)}`
                      : "Aucun rendez-vous"}
                  {" · "}
                  {p.telephone || "—"}
                </small>
              </div>
              {boutonRdv(
                peutCreer
                  ? "rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue transition-colors hover:bg-bg"
                  : "cursor-not-allowed rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue opacity-50"
              )}
            </div>
          ))}
        </div>

        {pagination}
      </div>
    </AssistantShell>
  );
}
