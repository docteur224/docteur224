"use client";

import AdminShell from "@/components/admin/AdminShell";
import { useRemboursements, validerRemboursement } from "@/lib/mock-admin";

/*
 * Finances — reproduit l'écran « admin-finances » de la maquette web :
 * remboursements & litiges (file vivante, décisions tracées), réconciliation
 * Mobile Money, export comptable, indicateurs et transactions récentes.
 */

const REVERSEMENTS = [
  {
    beneficiaire: "Dr Aïssata Barry",
    periode: "Mai 2026",
    montant: "1 240 000 GNF",
    statut: "Réconcilié",
    classes: "bg-green-soft text-green",
  },
  {
    beneficiaire: "Clinique Ambroise Paré",
    periode: "Mai 2026",
    montant: "4 680 000 GNF",
    statut: "À reverser",
    classes: "bg-teal-soft text-blue",
  },
  {
    beneficiaire: "Dr Mamadou Diallo",
    periode: "Mai 2026",
    montant: "820 000 GNF",
    statut: "Écart à vérifier",
    classes: "bg-amber-soft text-amber",
  },
];

const TRANSACTIONS = [
  {
    titre: "Abonnement médecin · Dr A. Barry",
    detail: "11 juin · Orange Money",
    initiales: "OM",
    gradient: "linear-gradient(135deg,#E08E45,#C0392B)",
    montant: "+150 000 GNF",
  },
  {
    titre: "Commission RDV · Dr M. Diallo",
    detail: "11 juin · MTN MoMo",
    initiales: "MM",
    gradient: "linear-gradient(135deg,#F1C40F,#C29D0B)",
    montant: "+4 500 GNF",
  },
  {
    titre: "Abonnement établissement · Clinique A. Paré",
    detail: "10 juin · Virement",
    initiales: "CA",
    gradient: "linear-gradient(135deg,#16A085,#0E6655)",
    montant: "+800 000 GNF",
  },
];

export default function FinancesAdmin() {
  const remboursements = useRemboursements();

  return (
    <AdminShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Finances</h2>
          <small className="text-[13px] text-muted">
            Revenus, abonnements et commissions
          </small>
        </div>
        <span className="rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-muted">
          Ce mois ⌄
        </span>
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
        {remboursements.map((remboursement) => (
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
            <button
              type="button"
              disabled
              title="Détail du litige : disponible avec la base de données"
              className="cursor-not-allowed rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue opacity-50"
            >
              Examiner
            </button>
          </div>
        ))}
      </div>

      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-[14px] text-[15px] font-extrabold">
          Reversements & réconciliation Mobile Money
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {["Bénéficiaire", "Période", "À reverser", "Statut"].map((th) => (
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
              {REVERSEMENTS.map((ligne) => (
                <tr key={ligne.beneficiaire}>
                  <td className="border-b border-line px-[10px] py-[9px]">
                    {ligne.beneficiaire}
                  </td>
                  <td className="border-b border-line px-[10px] py-[9px]">{ligne.periode}</td>
                  <td className="border-b border-line px-[10px] py-[9px]">{ligne.montant}</td>
                  <td className="border-b border-line px-[10px] py-[9px]">
                    <span
                      className={`rounded-lg px-[9px] py-1 text-[11px] font-bold ${ligne.classes}`}
                    >
                      {ligne.statut}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-[14px] flex items-start gap-[9px] rounded-[11px] bg-teal-soft px-[13px] py-[11px] text-[12.5px] font-semibold leading-relaxed text-blue">
          <span aria-hidden>🔄</span>
          <div>
            Rapprochement des relevés Orange Money / MTN MoMo avec les transactions de la
            plateforme.
          </div>
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">Export comptable</h3>
        <div className="flex items-center justify-between gap-[14px] py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">Exporter les transactions</b>
            <small className="text-xs text-muted">Période en cours · format CSV</small>
          </div>
          <button
            type="button"
            disabled
            title="Disponible avec la base de données"
            className="cursor-not-allowed rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue opacity-50"
          >
            ⬇️ Exporter en CSV
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-line bg-white p-[18px]">
          <span className="text-lg" aria-hidden>
            💳
          </span>
          <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-blue">42 M</b>
          <small className="text-xs font-semibold text-muted">GNF ce mois</small>
        </div>
        <div className="rounded-2xl border border-line bg-white p-[18px]">
          <span className="text-lg" aria-hidden>
            🔁
          </span>
          <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-amber">210</b>
          <small className="text-xs font-semibold text-muted">Abonnements actifs</small>
        </div>
        <div className="rounded-2xl border border-line bg-white p-[18px]">
          <span className="text-lg" aria-hidden>
            📱
          </span>
          <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-green">
            6,3 M
          </b>
          <small className="text-xs font-semibold text-muted">Commissions Mobile Money</small>
        </div>
        <div className="rounded-2xl border border-line bg-white p-[18px]">
          <span className="text-lg" aria-hidden>
            ⚠️
          </span>
          <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-teal">3</b>
          <small className="text-xs font-semibold text-muted">Impayés</small>
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">Transactions récentes</h3>
        {TRANSACTIONS.map((transaction) => (
          <div
            key={transaction.titre}
            className="flex flex-wrap items-center gap-[13px] border-b border-line py-[14px] last:border-b-0"
          >
            <span
              aria-hidden
              className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl text-sm font-extrabold text-white"
              style={{ background: transaction.gradient }}
            >
              {transaction.initiales}
            </span>
            <div className="min-w-0 flex-1">
              <b className="block text-sm font-extrabold">{transaction.titre}</b>
              <small className="text-xs text-muted">{transaction.detail}</small>
            </div>
            <b className="text-[13.5px] font-extrabold text-green">{transaction.montant}</b>
          </div>
        ))}
      </div>

      <div className="flex items-start gap-[9px] rounded-xl border border-[#F2D9B6] bg-[#FFF5E9] px-[14px] py-3 text-[12.5px] font-semibold leading-relaxed text-[#8A5A1B]">
        <span aria-hidden>ℹ️</span>
        <div>Chiffres illustratifs pour la maquette. Ceci ne constitue pas un conseil financier.</div>
      </div>
    </AdminShell>
  );
}
