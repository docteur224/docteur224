"use client";

import AdminShell from "@/components/admin/AdminShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import Pagination, { usePagination } from "@/components/site/Pagination";
import { useJournalAudit } from "@/lib/admin";

/*
 * Journal d'audit — reproduit l'écran « admin-audit » de la maquette web.
 * Alimenté en direct par les décisions prises dans Validations, Modération,
 * Finances, Paramètres et Abonnements. Lecture seule.
 */

export default function AuditAdmin() {
  const journal = useJournalAudit();
  const pagi = usePagination(journal, 20);

  return (
    <AdminShell>
      {/* ===== Version mobile (écran « m-admin-audit » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <EnTeteMobile retour="/espace-admin/plus" titre="Journal d'audit" />
        <div className="pad">
          <div className="card2">
            <h4>Actions récentes</h4>
            <div style={{ overflowX: "auto" }}>
              <table className="atab">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Acteur</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pagi.tranche.map((entree) => (
                    <tr key={entree.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{entree.date}</td>
                      <td>{entree.acteur}</td>
                      <td>
                        {entree.action} — {entree.cible}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Hors du <table> : un <div> dans un <tbody> est du HTML invalide,
                que TypeScript ne signale pas. */}
            <Pagination
              page={pagi.page}
              pages={pagi.pages}
              total={pagi.total}
              premier={pagi.premier}
              dernier={pagi.dernier}
              onPage={pagi.setPage}
              libelle="entrées"
            />
            <div className="privnote info">
              <span aria-hidden>🔒</span>
              <div>
                Journal en lecture seule, conservé pour la traçabilité. Aucune action ne peut être
                supprimée.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Version web (inchangée) ===== */}
      <div className="hidden md:block">
      <div className="mb-5">
        <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Journal d’audit</h2>
        <small className="text-[13px] text-muted">Traçabilité des actions sensibles</small>
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-[14px] text-[15px] font-extrabold">Actions récentes</h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {["Date", "Acteur", "Action", "Cible"].map((th) => (
                  <th
                    key={th}
                    className="border-b border-line px-[10px] py-[9px] text-left text-[11px] font-extrabold uppercase tracking-[0.04em] text-muted"
                  >
                    {th}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagi.tranche.map((entree) => (
                <tr key={entree.id}>
                  <td className="whitespace-nowrap border-b border-line px-[10px] py-[9px]">
                    {entree.date}
                  </td>
                  <td className="whitespace-nowrap border-b border-line px-[10px] py-[9px]">
                    {entree.acteur}
                  </td>
                  <td className="border-b border-line px-[10px] py-[9px]">{entree.action}</td>
                  <td className="border-b border-line px-[10px] py-[9px]">{entree.cible}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Hors du <table>, comme sur le rendu mobile. */}
        <Pagination
          page={pagi.page}
          pages={pagi.pages}
          total={pagi.total}
          premier={pagi.premier}
          dernier={pagi.dernier}
          onPage={pagi.setPage}
          libelle="entrées"
        />
        <div className="mt-[14px] flex items-start gap-[9px] rounded-[11px] bg-teal-soft px-[13px] py-[11px] text-[12.5px] font-semibold leading-relaxed text-blue">
          <span aria-hidden>🔒</span>
          <div>
            Le journal est en lecture seule et conservé pour la traçabilité. Aucune action ne
            peut être supprimée.
          </div>
        </div>
      </div>
      </div>
    </AdminShell>
  );
}
