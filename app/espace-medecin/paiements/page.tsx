"use client";

import { useState } from "react";
import MedecinShell from "@/components/medecin/MedecinShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import Pagination, { usePagination } from "@/components/site/Pagination";
import { formatGNF } from "@/lib/format";
import {
  LIBELLES_STATUT,
  useHistoriquePaiements,
  type MouvementPaiement,
} from "@/lib/paiements";

/*
 * Mes paiements — ce que le professionnel a versé à Docteur 224.
 *
 * Une seule liste pour les abonnements, les recharges SMS et les
 * remboursements : il ne raisonne pas en tables, il veut savoir ce qui est
 * sorti de sa poche et où en est chaque versement.
 *
 * Le reçu PDF n'est proposé que sur un versement réellement encaissé — la
 * route le revérifie. Un justificatif émis pour une demande en attente
 * attesterait une recette qui n'est pas entrée en caisse.
 */

const FILTRES = [
  { cle: "tous", libelle: "Tous" },
  { cle: "abonnement", libelle: "Abonnements" },
  { cle: "recharge", libelle: "Recharges SMS" },
  { cle: "remboursement", libelle: "Remboursements" },
] as const;

const TEINTE: Record<string, string> = {
  confirme: "bg-green-soft text-green",
  en_attente: "bg-amber-soft text-amber",
  refuse: "bg-red-soft text-red",
  rembourse: "bg-amber-soft text-amber",
  annule: "bg-bg text-muted",
};

const PILL_MOBILE: Record<string, string> = {
  confirme: "ok",
  en_attente: "soon",
  refuse: "bad",
  rembourse: "soon",
  annule: "lock",
};

const LIBELLE_MOYEN: Record<string, string> = {
  orange_money: "Orange Money",
  mtn_momo: "MTN MoMo",
  carte: "Carte bancaire",
};

const dateLongue = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }) : "—";

export default function MesPaiements() {
  const { mouvements, totalPaye, totalEnAttente, totalRembourse, chargement } =
    useHistoriquePaiements();
  const [filtre, setFiltre] = useState<string>("tous");
  const [message, setMessage] = useState("");

  const liste = mouvements.filter((m) => filtre === "tous" || m.famille === filtre);
  const pagi = usePagination(liste, 20);

  /** Un reçu s'ouvre dans un onglet ; le PDF est composé côté serveur. */
  async function ouvrirRecu(m: MouvementPaiement) {
    setMessage("");
    // L'onglet est ouvert AVANT l'attente réseau : ouvert après, Chrome le
    // prendrait pour une fenêtre surgissante et le bloquerait.
    const onglet = window.open("", "_blank", "noopener");
    const reponse = await fetch("/api/recu-paiement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: m.id, famille: m.famille }),
    });
    if (!reponse.ok) {
      onglet?.close();
      const corps = await reponse.json().catch(() => ({}));
      setMessage(`⚠️ ${corps.erreur ?? "Reçu indisponible."}`);
      return;
    }
    const url = URL.createObjectURL(await reponse.blob());
    if (onglet) onglet.location.href = url;
    else window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  const TOTAUX = [
    { label: "Total réglé", valeur: formatGNF(totalPaye), couleur: "text-green" },
    { label: "En attente de confirmation", valeur: formatGNF(totalEnAttente), couleur: "text-amber" },
    { label: "Remboursé", valeur: formatGNF(totalRembourse), couleur: "text-blue" },
  ];

  const boutonsFiltre = (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {FILTRES.map((f) => (
        <button
          key={f.cle}
          type="button"
          aria-pressed={filtre === f.cle}
          onClick={() => setFiltre(f.cle)}
          className={`rounded-full border px-[11px] py-[5px] text-[11.5px] font-bold transition-colors ${
            filtre === f.cle
              ? "border-blue bg-blue text-white"
              : "border-line bg-white text-muted hover:bg-bg"
          }`}
        >
          {f.libelle}{" "}
          <span className="opacity-70">
            {f.cle === "tous"
              ? mouvements.length
              : mouvements.filter((m) => m.famille === f.cle).length}
          </span>
        </button>
      ))}
    </div>
  );

  const recuPossible = (m: MouvementPaiement) =>
    m.famille !== "remboursement" && (m.statut === "confirme" || m.statut === "rembourse");

  return (
    <MedecinShell reserveAuMedecin>
      {/* ===== Version mobile ===== */}
      <div className="md:hidden">
        <EnTeteMobile retour="/espace-medecin/abonnement" titre="Mes paiements" />
        <div className="pad">
          <div className="statcards inpad two">
            <div className="sc b1">
              <b>{formatGNF(totalPaye)}</b>
              <small>Total réglé</small>
            </div>
            <div className="sc b2">
              <b>{formatGNF(totalEnAttente)}</b>
              <small>En attente</small>
            </div>
          </div>

          <div className="card2" style={{ marginTop: 12 }}>
            <h4>Historique · {liste.length}</h4>
            {boutonsFiltre}
            {message && (
              <p style={{ color: "var(--red)", fontSize: 12.5, fontWeight: 700 }}>{message}</p>
            )}
            {!chargement && liste.length === 0 && (
              <p className="muted" style={{ fontSize: 12.5 }}>
                Aucun paiement pour ce filtre.
              </p>
            )}
            {pagi.tranche.map((m) => (
              <div key={`${m.famille}-${m.id}`} className="setrow">
                <div>
                  <b>
                    {m.famille === "remboursement" ? "− " : ""}
                    {formatGNF(m.montantGnf)} · {m.objet}
                  </b>
                  <small>
                    {dateLongue(m.date)}
                    {m.reference ? ` · réf. ${m.reference}` : ""}
                    {m.motif ? ` · ${m.motif}` : ""}
                  </small>
                  {recuPossible(m) && (
                    <button
                      type="button"
                      className="btnm gh"
                      style={{ marginTop: 6 }}
                      onClick={() => ouvrirRecu(m)}
                    >
                      📄 Reçu
                    </button>
                  )}
                </div>
                <span className={`pill ${PILL_MOBILE[m.statut] ?? "lock"}`}>
                  {LIBELLES_STATUT[m.statut] ?? m.statut}
                </span>
              </div>
            ))}
            <Pagination
              page={pagi.page}
              pages={pagi.pages}
              total={pagi.total}
              premier={pagi.premier}
              dernier={pagi.dernier}
              onPage={pagi.setPage}
              libelle="paiements"
            />
          </div>
        </div>
      </div>

      {/* ===== Version web ===== */}
      <div className="hidden md:block">
        <div className="mb-5">
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Mes paiements</h2>
          <small className="text-[13px] text-muted">
            Abonnements, recharges SMS et remboursements
          </small>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-4">
          {TOTAUX.map((t) => (
            <div key={t.label} className="rounded-2xl border border-line bg-white p-[18px]">
              <b className={`block text-[22px] font-extrabold tracking-[-0.6px] ${t.couleur}`}>
                {t.valeur}
              </b>
              <small className="text-xs font-semibold text-muted">{t.label}</small>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-2 text-[15px] font-extrabold">Historique · {liste.length}</h3>
          {boutonsFiltre}
          {message && (
            <p role="alert" className="mb-2 text-[12.5px] font-bold text-red">
              {message}
            </p>
          )}
          {chargement && <p className="py-3 text-[12.5px] text-muted">Chargement…</p>}
          {!chargement && liste.length === 0 && (
            <p className="py-3 text-[12.5px] text-muted">
              Aucun paiement pour ce filtre. Vos règlements apparaîtront ici dès votre premier
              versement.
            </p>
          )}
          {liste.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse text-[12.5px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.04em] text-muted">
                    <th className="py-2 pr-3 font-bold">Date</th>
                    <th className="py-2 pr-3 font-bold">Objet</th>
                    <th className="py-2 pr-3 font-bold">Référence</th>
                    <th className="py-2 pr-3 text-right font-bold">Montant</th>
                    <th className="py-2 pr-3 font-bold">État</th>
                    <th className="py-2 font-bold" />
                  </tr>
                </thead>
                <tbody>
                  {pagi.tranche.map((m) => (
                    <tr key={`${m.famille}-${m.id}`} className="border-b border-line last:border-b-0">
                      <td className="py-2.5 pr-3 whitespace-nowrap text-muted">{dateLongue(m.date)}</td>
                      <td className="py-2.5 pr-3">
                        <b className="font-bold">{m.objet}</b>
                        {m.motif && <span className="block text-[11px] text-muted">{m.motif}</span>}
                      </td>
                      <td className="py-2.5 pr-3 whitespace-nowrap text-muted">
                        {m.reference || "—"}
                        {m.moyen && (
                          <span className="block text-[11px]">
                            {LIBELLE_MOYEN[m.moyen] ?? m.moyen}
                          </span>
                        )}
                      </td>
                      <td
                        className={`py-2.5 pr-3 text-right font-extrabold whitespace-nowrap ${
                          m.famille === "remboursement" ? "text-amber" : "text-blue"
                        }`}
                      >
                        {m.famille === "remboursement" ? "− " : ""}
                        {formatGNF(m.montantGnf)}
                      </td>
                      <td className="py-2.5 pr-3">
                        <span
                          className={`whitespace-nowrap rounded-lg px-[9px] py-1 text-[11px] font-bold ${
                            TEINTE[m.statut] ?? "bg-bg text-muted"
                          }`}
                        >
                          {LIBELLES_STATUT[m.statut] ?? m.statut}
                        </span>
                      </td>
                      <td className="py-2.5 text-right">
                        {recuPossible(m) && (
                          <button
                            type="button"
                            onClick={() => ouvrirRecu(m)}
                            className="whitespace-nowrap rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue transition-colors hover:bg-bg"
                          >
                            📄 Reçu
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            page={pagi.page}
            pages={pagi.pages}
            total={pagi.total}
            premier={pagi.premier}
            dernier={pagi.dernier}
            onPage={pagi.setPage}
            libelle="paiements"
          />
        </div>
      </div>
    </MedecinShell>
  );
}
