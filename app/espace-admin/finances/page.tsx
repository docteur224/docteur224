"use client";

import { useState } from "react";
import AdminShell from "@/components/admin/AdminShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import Pagination, { usePagination } from "@/components/site/Pagination";
import { formatGNF } from "@/lib/format";
import {
  confirmerPaiement,
  refuserPaiement,
  useComptesEncaissement,
  useCompteursFinances,
  usePaiementsARapprocher,
  useRemboursements,
  validerRemboursement,
  type PaiementARapprocher,
} from "@/lib/admin";

/*
 * Finances — reproduit l'écran « admin-finances » de la maquette web, enrichi
 * du rapprochement des paiements d'abonnement (migration 0040).
 *
 * Le professionnel verse par Mobile Money sur le compte marchand de la
 * plateforme et déclare son versement ; c'est ICI qu'un humain vérifie qu'il
 * est bien arrivé. « Confirmer » est le seul geste qui active un abonnement —
 * rien ne s'active à l'écran du payeur, et rien ne s'active tout seul.
 *
 * Les consultations, elles, continuent de se régler sur place chez le médecin :
 * réconciliation et export comptable n'ont pas d'objet tant qu'aucun paiement
 * patient ne transite par la plateforme.
 */

const MOTIFS = [
  "Sélectionner un motif…",
  "Aucun versement reçu à cette référence",
  "Montant reçu différent du montant dû",
  "Identifiant de transaction introuvable chez l'opérateur",
  "Doublon d'un paiement déjà confirmé",
  "Autre motif (à préciser)",
];
const MOTIF_VIDE = MOTIFS[0];
const MOTIF_LIBRE = MOTIFS[MOTIFS.length - 1];

const LIBELLE_MOYEN: Record<string, string> = {
  orange_money: "Orange Money",
  mtn_momo: "MTN MoMo",
  carte: "Carte bancaire",
};

/**
 * Motif d'un refus. Obligatoire : « paiement refusé » sans raison laisse le
 * professionnel sans rien à corriger — et c'est la première chose qu'il
 * appellera pour demander. La fonction serveur l'exige également.
 */
function DialogueRefus({
  paiement,
  onFermer,
  onConfirmer,
}: {
  paiement: PaiementARapprocher;
  onFermer: () => void;
  onConfirmer: (motif: string) => void;
}) {
  const [choix, setChoix] = useState(MOTIF_VIDE);
  const [libre, setLibre] = useState("");
  const retenu = choix === MOTIF_VIDE ? "" : choix === MOTIF_LIBRE ? libre.trim() : choix;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Refuser le paiement ${paiement.reference}`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 md:items-center md:p-4"
    >
      <div className="w-full max-w-[440px] rounded-t-2xl bg-white p-5 md:rounded-2xl">
        <h3 className="text-[15px] font-extrabold">Refuser — {paiement.reference}</h3>
        <p className="mb-3 mt-1 text-[12.5px] text-muted">
          {paiement.nom} · {formatGNF(paiement.montantGnf)}. Le motif lui est notifié ; son
          abonnement reste inchangé.
        </p>
        <select
          value={choix}
          onChange={(e) => setChoix(e.target.value)}
          aria-label="Motif du refus"
          className="w-full rounded-[11px] border border-line bg-white px-[13px] py-3 text-[13.5px] outline-none focus:border-teal"
        >
          {MOTIFS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        {choix === MOTIF_LIBRE && (
          <textarea
            rows={3}
            value={libre}
            onChange={(e) => setLibre(e.target.value)}
            placeholder="Expliquez ce qui pose problème…"
            aria-label="Motif libre du refus"
            className="mt-2 w-full rounded-[11px] border border-line bg-white px-[13px] py-3 text-[13.5px] outline-none focus:border-teal"
          />
        )}
        <div className="mt-4 flex justify-end gap-[9px]">
          <button
            type="button"
            onClick={onFermer}
            className="rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => onConfirmer(retenu)}
            disabled={!retenu}
            className="rounded-[9px] border-[1.5px] border-[#F3CDC8] bg-white px-[14px] py-2 text-[12.5px] font-bold text-red transition-colors hover:bg-[#FBE9E7] disabled:cursor-not-allowed disabled:opacity-50"
          >
            ✕ Confirmer le refus
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FinancesAdmin() {
  const remboursements = useRemboursements();
  const pagi = usePagination(remboursements, 20);
  const compteurs = useCompteursFinances();
  const { paiements, recharger } = usePaiementsARapprocher();
  const pagiPaiements = usePagination(paiements, 20);
  const { comptes, enregistrer } = useComptesEncaissement();

  const [aRefuser, setARefuser] = useState<PaiementARapprocher | null>(null);
  const [message, setMessage] = useState("");
  const [enCours, setEnCours] = useState("");
  const [numeros, setNumeros] = useState<Record<string, string>>({});

  async function confirmer(p: PaiementARapprocher) {
    setEnCours(p.id);
    setMessage("");
    const res = await confirmerPaiement(p);
    setEnCours("");
    setMessage(res.erreur ? `⚠️ ${res.erreur}` : `✓ Paiement ${p.reference} confirmé — abonnement activé.`);
    if (!res.erreur) recharger();
  }

  async function refuser(p: PaiementARapprocher, motif: string) {
    setARefuser(null);
    setEnCours(p.id);
    setMessage("");
    const res = await refuserPaiement(p, motif);
    setEnCours("");
    setMessage(res.erreur ? `⚠️ ${res.erreur}` : `✓ Paiement ${p.reference} refusé — le professionnel est prévenu.`);
    if (!res.erreur) recharger();
  }

  async function enregistrerNumero(code: string) {
    setEnCours(code);
    setMessage("");
    const res = await enregistrer(code, numeros[code] ?? "");
    setEnCours("");
    setMessage(res.erreur ? `⚠️ ${res.erreur}` : "✓ Coordonnées enregistrées.");
  }

  const dateCourte = (iso: string) =>
    new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });

  /** Un moyen sans numéro marchand ne peut donner aucune consigne de versement. */
  const manquants = comptes.filter((c) => c.code !== "carte" && !c.numeroMarchand);

  const blocPaiementAVenir = (
    <div className="rounded-2xl border border-line bg-white p-5">
      <h3 className="mb-1 text-[15px] font-extrabold">Paiement des consultations</h3>
      <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
        La consultation se règle <b>sur place, chez le médecin</b> : aucune somme patient ne
        transite par la plateforme, il n’y a donc rien à réconcilier ni à rembourser ici. Les
        abonnements, eux, sont encaissés par versement Mobile Money et rapprochés ci-dessus.
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
            <div className="sc b2">
              <b>{compteurs.paiementsEnAttente}</b>
              <small>Paiements à rapprocher</small>
            </div>
          </div>

          <div className="card2" style={{ marginTop: 12 }}>
            <h4>Paiements d’abonnement · {paiements.length}</h4>
            {message && (
              <p style={{ fontSize: 12.5, fontWeight: 700, color: "var(--blue)" }}>{message}</p>
            )}
            {paiements.length === 0 && (
              <p className="muted" style={{ fontSize: 12.5 }}>
                ✅ Aucun versement en attente de vérification.
              </p>
            )}
            {pagiPaiements.tranche.map((p) => (
              <div key={p.id} className="setrow">
                <div>
                  <b>
                    {p.nom} · {formatGNF(p.montantGnf)}
                  </b>
                  <small>
                    {LIBELLE_MOYEN[p.moyen] ?? p.moyen} · réf. {p.reference} · {dateCourte(p.creeLe)}
                    {p.numeroPayeur ? ` · ${p.numeroPayeur}` : ""}
                    {p.referenceOperateur ? ` · ${p.referenceOperateur}` : ""}
                  </small>
                </div>
                <span style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    className="btnm"
                    disabled={enCours === p.id}
                    onClick={() => confirmer(p)}
                  >
                    Confirmer
                  </button>
                  <button
                    type="button"
                    className="btnm gh"
                    disabled={enCours === p.id}
                    onClick={() => setARefuser(p)}
                  >
                    Refuser
                  </button>
                </span>
              </div>
            ))}
            <Pagination
              page={pagiPaiements.page}
              pages={pagiPaiements.pages}
              total={pagiPaiements.total}
              premier={pagiPaiements.premier}
              dernier={pagiPaiements.dernier}
              onPage={pagiPaiements.setPage}
              libelle="paiements"
            />
          </div>

          <div className="card2">
            <h4>Où les professionnels versent</h4>
            {manquants.length > 0 && (
              <div className="privnote">
                <span aria-hidden>⚠️</span>
                <div>
                  Numéro marchand manquant : l’écran de paiement ne peut donner aucune consigne.
                </div>
              </div>
            )}
            {comptes
              .filter((c) => c.code !== "carte")
              .map((c) => (
                <div key={c.code} style={{ marginTop: 10 }}>
                  <div className="labelm">
                    {c.libelle} {c.codeUssd ? `· ${c.codeUssd}` : ""}
                  </div>
                  <input
                    className="inp"
                    inputMode="numeric"
                    placeholder="Numéro marchand"
                    aria-label={`Numéro marchand ${c.libelle}`}
                    value={numeros[c.code] ?? c.numeroMarchand}
                    onChange={(e) => setNumeros({ ...numeros, [c.code]: e.target.value })}
                  />
                  <button
                    type="button"
                    className="btnm gh"
                    style={{ width: "100%" }}
                    disabled={enCours === c.code}
                    onClick={() => enregistrerNumero(c.code)}
                  >
                    Enregistrer
                  </button>
                </div>
              ))}
          </div>

          <div className="card2">
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
            <h4>Paiement des consultations</h4>
            <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
              La consultation se règle sur place, chez le médecin : aucune somme patient ne transite
              par la plateforme.
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
            Abonnements, versements à rapprocher et remboursements
          </small>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { icone: "🔁", valeur: String(compteurs.abonnementsActifs), label: "Abonnements actifs", couleur: "text-amber" },
          { icone: "⏳", valeur: String(compteurs.paiementsEnAttente), label: "Paiements à rapprocher", couleur: "text-blue" },
          { icone: "💰", valeur: formatGNF(compteurs.encaisseCeMois), label: "Encaissé ce mois-ci", couleur: "text-green" },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border border-line bg-white p-[18px]">
            <span className="text-lg" aria-hidden>
              {c.icone}
            </span>
            <b className={`mt-2 block text-[26px] font-extrabold tracking-[-0.6px] ${c.couleur}`}>
              {c.valeur}
            </b>
            <small className="text-xs font-semibold text-muted">{c.label}</small>
          </div>
        ))}
      </div>

      {message && (
        <p className="mb-3 text-[12.5px] font-bold text-blue" role="status">
          {message}
        </p>
      )}

      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">
          Paiements d’abonnement · {paiements.length} à rapprocher
        </h3>
        <p className="mb-2 text-[12.5px] text-muted">
          Vérifiez la réception du versement sur le compte marchand avant de confirmer :
          « Confirmer » active l’abonnement immédiatement.
        </p>
        {paiements.length === 0 && (
          <p className="py-3 text-[12.5px] text-muted">
            ✅ Aucun versement en attente de vérification.
          </p>
        )}
        {pagiPaiements.tranche.map((p) => (
          <div
            key={p.id}
            className="flex flex-wrap items-center gap-[13px] border-b border-line py-[14px] last:border-b-0"
          >
            <div className="min-w-0 flex-1">
              <b className="block text-sm font-extrabold">
                {p.nom} · {p.formule} {p.periode === "annuel" ? "annuel" : "mensuel"}
              </b>
              <small className="text-xs text-muted">
                {LIBELLE_MOYEN[p.moyen] ?? p.moyen} · réf. <b>{p.reference}</b> ·{" "}
                {dateCourte(p.creeLe)}
                {p.numeroPayeur ? ` · depuis le ${p.numeroPayeur}` : " · numéro non précisé"}
                {p.referenceOperateur
                  ? ` · transaction ${p.referenceOperateur}`
                  : " · transaction non déclarée"}
              </small>
            </div>
            <b className="flex-none text-sm font-extrabold text-blue">{formatGNF(p.montantGnf)}</b>
            <button
              type="button"
              onClick={() => confirmer(p)}
              disabled={enCours === p.id}
              className="rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc] disabled:opacity-50"
            >
              {enCours === p.id ? "…" : "✓ Confirmer"}
            </button>
            <button
              type="button"
              onClick={() => setARefuser(p)}
              disabled={enCours === p.id}
              className="rounded-[9px] border-[1.5px] border-[#F3CDC8] bg-white px-[14px] py-2 text-[12.5px] font-bold text-red transition-colors hover:bg-[#FBE9E7] disabled:opacity-50"
            >
              ✕ Refuser
            </button>
          </div>
        ))}
        <Pagination
          page={pagiPaiements.page}
          pages={pagiPaiements.pages}
          total={pagiPaiements.total}
          premier={pagiPaiements.premier}
          dernier={pagiPaiements.dernier}
          onPage={pagiPaiements.setPage}
          libelle="paiements"
        />
      </div>

      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">Où les professionnels versent</h3>
        <p className="mb-3 text-[12.5px] text-muted">
          Ces numéros s’affichent dans les instructions de paiement. Tant qu’ils sont vides,
          l’écran du professionnel n’annonce aucun numéro — il ne montre pas un numéro faux.
        </p>
        {manquants.length > 0 && (
          <p className="mb-3 rounded-lg bg-amber-soft px-3 py-2 text-[12.5px] font-semibold text-amber">
            ⚠️ {manquants.map((c) => c.libelle).join(", ")} : numéro marchand non renseigné.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {comptes
            .filter((c) => c.code !== "carte")
            .map((c) => (
              <div key={c.code} className="rounded-xl border border-line p-[13px]">
                <b className="block text-[13px] font-extrabold">{c.libelle}</b>
                <small className="mb-2 block text-[11.5px] text-muted">
                  Code à composer : {c.codeUssd || "—"}
                </small>
                <div className="flex gap-2">
                  <input
                    className="min-w-0 flex-1 rounded-[9px] border border-line bg-white px-3 py-2 text-[12.5px] outline-none focus:border-teal"
                    inputMode="numeric"
                    placeholder="Numéro marchand"
                    aria-label={`Numéro marchand ${c.libelle}`}
                    value={numeros[c.code] ?? c.numeroMarchand}
                    onChange={(e) => setNumeros({ ...numeros, [c.code]: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => enregistrerNumero(c.code)}
                    disabled={enCours === c.code}
                    className="flex-none rounded-[9px] border-[1.5px] border-line bg-white px-3 py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg disabled:opacity-50"
                  >
                    💾
                  </button>
                </div>
              </div>
            ))}
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

      {/* Monté une seule fois : l'écran rend les deux versions. */}
      {aRefuser && (
        <DialogueRefus
          paiement={aRefuser}
          onFermer={() => setARefuser(null)}
          onConfirmer={(motif) => refuser(aRefuser, motif)}
        />
      )}
    </AdminShell>
  );
}
