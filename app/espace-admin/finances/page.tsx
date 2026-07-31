"use client";

import AdminShell from "@/components/admin/AdminShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import Pagination, { usePagination } from "@/components/site/Pagination";
import { useCompteursFinances, useRemboursements, validerRemboursement } from "@/lib/admin";

/*
 * Finances — reproduit l'écran « admin-finances » de la maquette web :
 * remboursements & litiges (file vivante, décisions tracées), abonnements
 * actifs (réels). Le paiement en ligne (Orange Money / MTN MoMo) n'est pas
 * encore branché : les sections réconciliation/transactions/export restent
 * indisponibles tant que ce moyen de paiement n'existe pas côté plateforme.
 */

export default function FinancesAdmin() {
  const remboursements = useRemboursements();
  const pagi = usePagination(remboursements, 20);
  const compteurs = useCompteursFinances();

  const blocPaiementAVenir = (
    <div className="rounded-2xl border border-line bg-white p-5">
      <h3 className="mb-1 text-[15px] font-extrabold">Paiement en ligne</h3>
      <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
        La consultation se règle actuellement <b>sur place, chez le médecin</b>. Réconciliation
        Mobile Money, export comptable et transactions détaillées s’activeront lorsque le paiement
        en ligne (Orange Money / MTN MoMo) sera branché à la plateforme.
      </p>
    </div>
  );

  return (
    <AdminShell>
      {/* ===== Version mobile ===== */}
      <div className="md:hidden">
        <EnTeteMobile retour="/espace-admin/plus" titre="Finances" />
        <div className="pad">
          <div className="statcards inpad two">
            <div className="sc b1">
              <b>{compteurs.abonnementsActifs}</b>
              <small>Abonnements actifs</small>
            </div>
          </div>
          <div className="card2" style={{ marginTop: 12 }}>
            <h4>Remboursements &amp; litiges · {remboursements.length}</h4>
            {remboursements.length === 0 && (
              <p className="muted" style={{ fontSize: 12.5 }}>
                ✅ Aucun remboursement en attente.
              </p>
            )}
            {pagi.tranche.map((remboursement) => (
              <div key={remboursement.id} className="asstrowm">
                <span className="av" aria-hidden style={{ background: remboursement.gradient }}>
                  {remboursement.initiales}
                </span>
                <span className="meta">
                  <b>{remboursement.titre}</b>
                  <small>{remboursement.detail}</small>
                </span>
                <button type="button" className="btnm" onClick={() => validerRemboursement(remboursement)}>
                  Rembourser
                </button>
              </div>
            ))}
            <Pagination
              page={pagi.page}
              pages={pagi.pages}
              total={pagi.total}
              premier={pagi.premier}
              dernier={pagi.dernier}
              onPage={pagi.setPage}
              libelle="remboursements"
            />
          </div>
          <div className="card2">
            <h4>Paiement en ligne</h4>
            <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
              La consultation se règle sur place, chez le médecin. Cette section s&apos;activera
              avec le branchement du paiement en ligne.
            </p>
          </div>
        </div>
      </div>

      {/* ===== Version web ===== */}
      <div className="hidden md:block">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Finances</h2>
          <small className="text-[13px] text-muted">
            Abonnements et remboursements
          </small>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-line bg-white p-[18px]">
          <span className="text-lg" aria-hidden>
            🔁
          </span>
          <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-amber">
            {compteurs.abonnementsActifs}
          </b>
          <small className="text-xs font-semibold text-muted">Abonnements actifs</small>
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">
          Remboursements & litiges · {remboursements.length} en attente
        </h3>
        {remboursements.length === 0 && (
          <p className="py-3 text-[12.5px] text-muted">
            ✅ Aucun remboursement en attente.
          </p>
        )}
        {pagi.tranche.map((remboursement) => (
          <div
            key={remboursement.id}
            className="flex flex-wrap items-center gap-[13px] border-b border-line py-[14px] last:border-b-0"
          >
            <span
              aria-hidden
              className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl text-sm font-extrabold text-white"
              style={{ background: remboursement.gradient }}
            >
              {remboursement.initiales}
            </span>
            <div className="min-w-0 flex-1">
              <b className="block text-sm font-extrabold">{remboursement.titre}</b>
              <small className="text-xs text-muted">{remboursement.detail}</small>
            </div>
            <button
              type="button"
              onClick={() => validerRemboursement(remboursement)}
              className="rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
            >
              Rembourser
            </button>
          </div>
        ))}
        <Pagination
          page={pagi.page}
          pages={pagi.pages}
          total={pagi.total}
          premier={pagi.premier}
          dernier={pagi.dernier}
          onPage={pagi.setPage}
          libelle="remboursements"
        />
      </div>

      {blocPaiementAVenir}
      </div>
    </AdminShell>
  );
}
