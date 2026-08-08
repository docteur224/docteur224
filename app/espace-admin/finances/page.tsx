"use client";

import { useState } from "react";
import AdminShell from "@/components/admin/AdminShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import RevenuMensuel from "@/components/admin/RevenuMensuel";
import Pagination, { usePagination } from "@/components/site/Pagination";
import { formatGNF } from "@/lib/format";
import {
  confirmerPaiement,
  refuserPaiement,
  rembourserPaiement,
  resilierAbonnement,
  useAbonnementsAdmin,
  useComptesEncaissement,
  useHistoriqueFinances,
  useKpiFinances,
  usePaiementsARapprocher,
  type AbonnementAdmin,
  type LigneFinance,
  type PaiementARapprocher,
} from "@/lib/admin";

/*
 * Finances — ce que la plateforme encaisse, ce qu'elle doit encore vérifier,
 * ce qu'elle a rendu.
 *
 * Quatre onglets plutôt qu'une page qui déroule : « À rapprocher » est une
 * FILE DE TRAVAIL (on y vient pour vider une liste), les trois autres sont
 * des REGISTRES (on y vient pour chercher). Mélanger les deux fait perdre la
 * file au milieu de l'historique dès la centième transaction.
 *
 * Les indicateurs restent au-dessus des onglets : ils ne dépendent d'aucun
 * filtre, et c'est la première chose qu'on vient lire.
 */

const ONGLETS = [
  { cle: "file", libelle: "À rapprocher" },
  { cle: "historique", libelle: "Historique" },
  { cle: "abonnements", libelle: "Abonnements" },
  { cle: "encaissement", libelle: "Encaissement" },
] as const;
type Onglet = (typeof ONGLETS)[number]["cle"];

/* Filtres de l'historique. « Tous » d'abord : on arrive sans idée précise. */
const FILTRES_PAIEMENT = [
  { cle: "tous", libelle: "Tous" },
  { cle: "confirme", libelle: "Encaissés" },
  { cle: "en_attente", libelle: "En attente" },
  { cle: "rembourse", libelle: "Remboursés" },
  { cle: "refuse", libelle: "Refusés" },
  { cle: "annule", libelle: "Annulés" },
] as const;

const FILTRES_ABONNEMENT = [
  { cle: "tous", libelle: "Tous" },
  { cle: "actif", libelle: "Actifs" },
  { cle: "essai", libelle: "En essai" },
  { cle: "expire", libelle: "Expirés" },
  { cle: "annule", libelle: "Résiliés" },
] as const;

const LIBELLE_MOYEN: Record<string, string> = {
  orange_money: "Orange Money",
  mtn_momo: "MTN MoMo",
  carte: "Carte bancaire",
};

const TEINTE_STATUT: Record<string, string> = {
  confirme: "bg-green-soft text-green",
  actif: "bg-green-soft text-green",
  en_attente: "bg-amber-soft text-amber",
  essai: "bg-teal-soft text-blue",
  refuse: "bg-red-soft text-red",
  expire: "bg-red-soft text-red",
  rembourse: "bg-amber-soft text-amber",
  annule: "bg-bg text-muted",
};

const LIBELLE_STATUT: Record<string, string> = {
  confirme: "Encaissé",
  en_attente: "En attente",
  refuse: "Refusé",
  annule: "Annulé",
  rembourse: "Remboursé",
  actif: "Actif",
  essai: "Essai",
  expire: "Expiré",
};

const MOTIFS_REFUS = [
  "Sélectionner un motif…",
  "Aucun versement reçu à cette référence",
  "Montant reçu différent du montant dû",
  "Identifiant de transaction introuvable chez l'opérateur",
  "Doublon d'un paiement déjà confirmé",
  "Autre motif (à préciser)",
];

const MOTIFS_REMBOURSEMENT = [
  "Sélectionner un motif…",
  "Double versement du professionnel",
  "Service non rendu",
  "Erreur de montant",
  "Résiliation anticipée",
  "Geste commercial",
  "Autre motif (à préciser)",
];

const MOTIFS_RESILIATION = [
  "Sélectionner un motif…",
  "Demande du professionnel",
  "Cessation d'activité",
  "Impayé",
  "Manquement aux conditions d'utilisation",
  "Autre motif (à préciser)",
];

const dateCourte = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit" }) : "—";

/**
 * Dialogue de décision : un motif obligatoire, et pour un remboursement un
 * montant. Le montant est pré-rempli au reste dû — c'est le cas courant, et
 * le serveur refuse de toute façon tout ce qui dépasse.
 */
function DialogueDecision({
  titre,
  detail,
  motifs,
  montant,
  libelleAction,
  onFermer,
  onConfirmer,
}: {
  titre: string;
  detail: string;
  motifs: string[];
  /** Fourni = remboursement : un champ de montant apparaît. */
  montant?: number;
  libelleAction: string;
  onFermer: () => void;
  onConfirmer: (motif: string, montant: number) => void;
}) {
  const [choix, setChoix] = useState(motifs[0]);
  const [libre, setLibre] = useState("");
  const [somme, setSomme] = useState(String(montant ?? 0));
  const libreChoisi = choix === motifs[motifs.length - 1];
  const retenu = choix === motifs[0] ? "" : libreChoisi ? libre.trim() : choix;
  const valeur = Number(somme.replace(/\s/g, ""));
  const sommeValide = montant === undefined || (valeur > 0 && valeur <= montant);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titre}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 md:items-center md:p-4"
    >
      <div className="w-full max-w-[440px] rounded-t-2xl bg-white p-5 md:rounded-2xl">
        <h3 className="text-[15px] font-extrabold">{titre}</h3>
        <p className="mb-3 mt-1 text-[12.5px] text-muted">{detail}</p>

        {montant !== undefined && (
          <>
            <div className="mb-1.5 text-[12px] font-bold">
              Montant à rendre <span className="text-muted">(maximum {formatGNF(montant)})</span>
            </div>
            <input
              className="mb-3 w-full rounded-[11px] border border-line bg-white px-[13px] py-3 text-[13.5px] outline-none focus:border-teal"
              inputMode="numeric"
              aria-label="Montant à rembourser"
              value={somme}
              onChange={(e) => setSomme(e.target.value)}
            />
          </>
        )}

        <select
          value={choix}
          onChange={(e) => setChoix(e.target.value)}
          aria-label="Motif"
          className="w-full rounded-[11px] border border-line bg-white px-[13px] py-3 text-[13.5px] outline-none focus:border-teal"
        >
          {motifs.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        {libreChoisi && (
          <textarea
            rows={3}
            value={libre}
            onChange={(e) => setLibre(e.target.value)}
            placeholder="Précisez…"
            aria-label="Motif libre"
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
            onClick={() => onConfirmer(retenu, valeur)}
            disabled={!retenu || !sommeValide}
            className="rounded-[9px] border-[1.5px] border-[#F3CDC8] bg-white px-[14px] py-2 text-[12.5px] font-bold text-red transition-colors hover:bg-[#FBE9E7] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {libelleAction}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FinancesAdmin() {
  const { kpi, recharger: rechargerKpi } = useKpiFinances();
  const { paiements, recharger: rechargerFile } = usePaiementsARapprocher();
  const { lignes, recharger: rechargerHistorique } = useHistoriqueFinances();
  const { abonnements, recharger: rechargerAbonnements } = useAbonnementsAdmin();
  const { comptes, enregistrer } = useComptesEncaissement();

  const [onglet, setOnglet] = useState<Onglet>("file");
  const [filtrePaiement, setFiltrePaiement] = useState<string>("tous");
  const [filtreAbonnement, setFiltreAbonnement] = useState<string>("tous");
  const [recherche, setRecherche] = useState("");
  const [message, setMessage] = useState("");
  const [enCours, setEnCours] = useState("");
  const [numeros, setNumeros] = useState<Record<string, string>>({});
  const [aRefuser, setARefuser] = useState<PaiementARapprocher | null>(null);
  const [aRembourser, setARembourser] = useState<LigneFinance | null>(null);
  const [aResilier, setAResilier] = useState<AbonnementAdmin | null>(null);

  function toutRecharger() {
    rechargerKpi();
    rechargerFile();
    rechargerHistorique();
    rechargerAbonnements();
  }

  /* --- Décisions --- */
  async function confirmer(p: PaiementARapprocher) {
    setEnCours(p.id);
    setMessage("");
    const res = await confirmerPaiement(p);
    setEnCours("");
    setMessage(res.erreur ? `⚠️ ${res.erreur}` : `✓ ${p.reference} confirmé — ${p.objet} activé.`);
    if (!res.erreur) toutRecharger();
  }

  async function refuser(p: PaiementARapprocher, motif: string) {
    setARefuser(null);
    setEnCours(p.id);
    setMessage("");
    const res = await refuserPaiement(p, motif);
    setEnCours("");
    setMessage(res.erreur ? `⚠️ ${res.erreur}` : `✓ ${p.reference} refusé — le professionnel est prévenu.`);
    if (!res.erreur) toutRecharger();
  }

  async function rembourser(ligne: LigneFinance, motif: string, montant: number) {
    setARembourser(null);
    setEnCours(ligne.id);
    setMessage("");
    const res = await rembourserPaiement(ligne, montant, motif);
    setEnCours("");
    setMessage(res.erreur ? `⚠️ ${res.erreur}` : `✓ ${formatGNF(montant)} remboursés à ${ligne.nom}.`);
    if (!res.erreur) toutRecharger();
  }

  async function resilier(a: AbonnementAdmin, motif: string) {
    setAResilier(null);
    setEnCours(a.id);
    setMessage("");
    const res = await resilierAbonnement(a, motif);
    setEnCours("");
    setMessage(res.erreur ? `⚠️ ${res.erreur}` : `✓ Abonnement de ${a.nom} résilié.`);
    if (!res.erreur) toutRecharger();
  }

  async function enregistrerNumero(code: string) {
    setEnCours(code);
    setMessage("");
    const res = await enregistrer(code, numeros[code] ?? "");
    setEnCours("");
    setMessage(res.erreur ? `⚠️ ${res.erreur}` : "✓ Coordonnées enregistrées.");
  }

  /* --- Listes filtrées --- */
  const terme = recherche.trim().toLowerCase();
  const historique = lignes.filter(
    (l) =>
      (filtrePaiement === "tous" || l.statut === filtrePaiement) &&
      (terme === "" ||
        l.nom.toLowerCase().includes(terme) ||
        l.reference.toLowerCase().includes(terme) ||
        l.objet.toLowerCase().includes(terme))
  );
  const portefeuille = abonnements.filter(
    (a) =>
      (filtreAbonnement === "tous" || a.statut === filtreAbonnement) &&
      (terme === "" || a.nom.toLowerCase().includes(terme) || a.formule.includes(terme))
  );
  const pagiHistorique = usePagination(historique, 25);
  const pagiAbonnements = usePagination(portefeuille, 25);
  const pagiFile = usePagination(paiements, 25);

  /** Ce qui a déjà été rendu sur CE versement — le serveur revérifie. */
  const dejaRembourse = (ligne: LigneFinance) =>
    lignes
      .filter((l) => l.famille === "remboursement" && l.sourceId === ligne.id)
      .reduce((t, l) => t + l.montantGnf, 0);

  const manquants = comptes.filter((c) => c.code !== "carte" && !c.numeroMarchand);

  /* --- Indicateurs --- */
  const CARTES = [
    {
      icone: "💰",
      valeur: formatGNF(kpi.revenuMois),
      label: "Revenu net ce mois-ci",
      couleur: "text-green",
      note: kpi.rembourseMois > 0 ? `dont ${formatGNF(kpi.rembourseMois)} remboursés` : "",
    },
    {
      icone: "🔁",
      valeur: formatGNF(kpi.mrr),
      label: "Revenu récurrent mensuel",
      couleur: "text-blue",
      note: "annuel ramené au douzième",
    },
    {
      icone: "⏳",
      valeur: String(kpi.attenteNb),
      label: "Versements à rapprocher",
      couleur: "text-amber",
      note: kpi.attenteMontant > 0 ? formatGNF(kpi.attenteMontant) : "",
    },
    {
      icone: "📅",
      valeur: String(kpi.echeances30j),
      label: "Échéances sous 30 jours",
      couleur: "text-blue",
      note: `${kpi.abonnements.actif ?? 0} abonnement(s) actif(s)`,
    },
  ];

  const onglets = (
    <div role="tablist" aria-label="Vues des finances" className="mb-4 flex flex-wrap gap-2">
      {ONGLETS.map((o) => (
        <button
          key={o.cle}
          type="button"
          role="tab"
          aria-selected={onglet === o.cle}
          onClick={() => setOnglet(o.cle)}
          className={`rounded-[10px] border-[1.5px] px-[14px] py-2 text-[12.5px] font-bold transition-colors ${
            onglet === o.cle
              ? "border-teal bg-teal-soft text-blue"
              : "border-line bg-white text-muted hover:bg-bg"
          }`}
        >
          {o.libelle}
          {o.cle === "file" && paiements.length > 0 && (
            <span className="ml-1.5 rounded-full bg-amber px-[7px] py-[1px] text-[10.5px] font-extrabold text-white">
              {paiements.length}
            </span>
          )}
        </button>
      ))}
    </div>
  );

  const champRecherche = (
    <input
      className="mb-3 w-full rounded-[11px] border border-line bg-white px-[13px] py-2.5 text-[13px] outline-none focus:border-teal"
      placeholder="Rechercher un nom, une référence…"
      aria-label="Rechercher"
      value={recherche}
      onChange={(e) => setRecherche(e.target.value)}
    />
  );

  const filtres = (
    liste: readonly { cle: string; libelle: string }[],
    actif: string,
    poser: (c: string) => void,
    compte: (c: string) => number
  ) => (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {liste.map((f) => (
        <button
          key={f.cle}
          type="button"
          aria-pressed={actif === f.cle}
          onClick={() => poser(f.cle)}
          className={`rounded-full border px-[11px] py-[5px] text-[11.5px] font-bold transition-colors ${
            actif === f.cle
              ? "border-blue bg-blue text-white"
              : "border-line bg-white text-muted hover:bg-bg"
          }`}
        >
          {f.libelle} <span className="opacity-70">{compte(f.cle)}</span>
        </button>
      ))}
    </div>
  );

  const puce = (statut: string) => (
    <span
      className={`rounded-lg px-[9px] py-1 text-[11px] font-bold ${TEINTE_STATUT[statut] ?? "bg-bg text-muted"}`}
    >
      {LIBELLE_STATUT[statut] ?? statut}
    </span>
  );

  return (
    <AdminShell>
      {/* ===== Version mobile ===== */}
      <div className="md:hidden">
        <EnTeteMobile retour="/espace-admin/plus" titre="Finances" />
        <div className="pad">
          <div className="statcards inpad two">
            <div className="sc b1">
              <b>{formatGNF(kpi.revenuMois)}</b>
              <small>Revenu net ce mois</small>
            </div>
            <div className="sc b2">
              <b>{kpi.attenteNb}</b>
              <small>À rapprocher</small>
            </div>
            <div className="sc b3">
              <b>{formatGNF(kpi.mrr)}</b>
              <small>Revenu récurrent</small>
            </div>
            <div className="sc b4">
              <b>{kpi.abonnements.actif ?? 0}</b>
              <small>Abonnements actifs</small>
            </div>
          </div>

          {message && (
            <p style={{ fontSize: 12.5, fontWeight: 700, color: "var(--blue)", marginTop: 10 }}>
              {message}
            </p>
          )}

          <div className="card2" style={{ marginTop: 12 }}>
            <h4>À rapprocher · {paiements.length}</h4>
            {paiements.length === 0 && (
              <p className="muted" style={{ fontSize: 12.5 }}>
                ✅ Aucun versement en attente de vérification.
              </p>
            )}
            {pagiFile.tranche.map((p) => (
              <div key={p.id} className="setrow">
                <div>
                  <b>
                    {p.nom} · {formatGNF(p.montantGnf)}
                  </b>
                  <small>
                    {p.objet} · {(LIBELLE_MOYEN[p.moyen] ?? p.moyen) || "moyen non précisé"} · réf.{" "}
                    {p.reference || "—"} · {dateCourte(p.creeLe)}
                  </small>
                </div>
                <span style={{ display: "flex", gap: 6 }}>
                  <button type="button" className="btnm" disabled={enCours === p.id} onClick={() => confirmer(p)}>
                    Confirmer
                  </button>
                  <button type="button" className="btnm gh" disabled={enCours === p.id} onClick={() => setARefuser(p)}>
                    Refuser
                  </button>
                </span>
              </div>
            ))}
            <Pagination
              page={pagiFile.page}
              pages={pagiFile.pages}
              total={pagiFile.total}
              premier={pagiFile.premier}
              dernier={pagiFile.dernier}
              onPage={pagiFile.setPage}
              libelle="versements"
            />
          </div>

          <div className="card2">
            <h4>Historique · {historique.length}</h4>
            {filtres(FILTRES_PAIEMENT, filtrePaiement, setFiltrePaiement, (c) =>
              c === "tous" ? lignes.length : lignes.filter((l) => l.statut === c).length
            )}
            {pagiHistorique.tranche.map((l) => (
              <div key={`${l.famille}-${l.id}`} className="setrow">
                <div>
                  <b>
                    {l.nom} · {formatGNF(l.montantGnf)}
                  </b>
                  <small>
                    {l.objet} · {dateCourte(l.date)}
                    {l.reference ? ` · ${l.reference}` : ""}
                    {l.motif ? ` · ${l.motif}` : ""}
                  </small>
                </div>
                {puce(l.statut)}
              </div>
            ))}
            <Pagination
              page={pagiHistorique.page}
              pages={pagiHistorique.pages}
              total={pagiHistorique.total}
              premier={pagiHistorique.premier}
              dernier={pagiHistorique.dernier}
              onPage={pagiHistorique.setPage}
              libelle="mouvements"
            />
          </div>

          <div className="card2">
            <h4>Abonnements · {portefeuille.length}</h4>
            {filtres(FILTRES_ABONNEMENT, filtreAbonnement, setFiltreAbonnement, (c) =>
              c === "tous" ? abonnements.length : abonnements.filter((a) => a.statut === c).length
            )}
            {pagiAbonnements.tranche.map((a) => (
              <div key={a.id} className="setrow">
                <div>
                  <b>
                    {a.nom} · {a.formule}
                  </b>
                  <small>
                    {a.periode === "annuel" ? "Annuel" : "Mensuel"} ·{" "}
                    {a.dateFin ? `jusqu’au ${dateCourte(a.dateFin)}` : "sans échéance"}
                  </small>
                </div>
                {puce(a.statut)}
              </div>
            ))}
            <Pagination
              page={pagiAbonnements.page}
              pages={pagiAbonnements.pages}
              total={pagiAbonnements.total}
              premier={pagiAbonnements.premier}
              dernier={pagiAbonnements.dernier}
              onPage={pagiAbonnements.setPage}
              libelle="abonnements"
            />
          </div>
        </div>
      </div>

      {/* ===== Version web ===== */}
      <div className="hidden md:block">
        <div className="mb-5">
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Finances</h2>
          <small className="text-[13px] text-muted">
            Encaissements, abonnements et remboursements
          </small>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {CARTES.map((c) => (
            <div key={c.label} className="rounded-2xl border border-line bg-white p-[18px]">
              <span className="text-lg" aria-hidden>
                {c.icone}
              </span>
              <b className={`mt-2 block text-[22px] font-extrabold tracking-[-0.6px] ${c.couleur}`}>
                {c.valeur}
              </b>
              <small className="block text-xs font-semibold text-muted">{c.label}</small>
              {c.note && <small className="mt-0.5 block text-[11px] text-muted">{c.note}</small>}
            </div>
          ))}
        </div>

        <div className="mb-4">
          <RevenuMensuel serie={kpi.serie} />
        </div>

        {message && (
          <p className="mb-3 text-[12.5px] font-bold text-blue" role="status">
            {message}
          </p>
        )}

        {onglets}

        {/* ---- File de rapprochement ---- */}
        {onglet === "file" && (
          <div className="rounded-2xl border border-line bg-white p-5">
            <h3 className="mb-1 text-[15px] font-extrabold">
              Versements à rapprocher · {paiements.length}
            </h3>
            <p className="mb-2 text-[12.5px] text-muted">
              Vérifiez la réception sur le compte marchand avant de confirmer : « Confirmer »
              active l’abonnement ou crédite les SMS immédiatement.
            </p>
            {paiements.length === 0 && (
              <p className="py-3 text-[12.5px] text-muted">✅ Rien en attente de vérification.</p>
            )}
            {pagiFile.tranche.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center gap-[13px] border-b border-line py-[14px] last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <b className="block text-sm font-extrabold">
                    {p.nom} · {p.objet}
                  </b>
                  <small className="text-xs text-muted">
                    {(LIBELLE_MOYEN[p.moyen] ?? p.moyen) || "moyen non précisé"} · réf.{" "}
                    <b>{p.reference || "—"}</b> · {dateCourte(p.creeLe)}
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
              page={pagiFile.page}
              pages={pagiFile.pages}
              total={pagiFile.total}
              premier={pagiFile.premier}
              dernier={pagiFile.dernier}
              onPage={pagiFile.setPage}
              libelle="versements"
            />
          </div>
        )}

        {/* ---- Historique ---- */}
        {onglet === "historique" && (
          <div className="rounded-2xl border border-line bg-white p-5">
            <h3 className="mb-2 text-[15px] font-extrabold">
              Historique des mouvements · {historique.length}
            </h3>
            {champRecherche}
            {filtres(FILTRES_PAIEMENT, filtrePaiement, setFiltrePaiement, (c) =>
              c === "tous" ? lignes.length : lignes.filter((l) => l.statut === c).length
            )}
            {historique.length === 0 && (
              <p className="py-3 text-[12.5px] text-muted">Aucun mouvement pour ce filtre.</p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.04em] text-muted">
                    <th className="py-2 pr-3 font-bold">Date</th>
                    <th className="py-2 pr-3 font-bold">Professionnel</th>
                    <th className="py-2 pr-3 font-bold">Objet</th>
                    <th className="py-2 pr-3 font-bold">Référence</th>
                    <th className="py-2 pr-3 text-right font-bold">Montant</th>
                    <th className="py-2 pr-3 font-bold">État</th>
                    <th className="py-2 font-bold" />
                  </tr>
                </thead>
                <tbody>
                  {pagiHistorique.tranche.map((l) => (
                    <tr key={`${l.famille}-${l.id}`} className="border-b border-line last:border-b-0">
                      <td className="py-2.5 pr-3 whitespace-nowrap text-muted">{dateCourte(l.date)}</td>
                      <td className="py-2.5 pr-3 font-bold">{l.nom}</td>
                      <td className="py-2.5 pr-3">
                        {l.objet}
                        {l.motif && <span className="block text-[11px] text-muted">{l.motif}</span>}
                      </td>
                      <td className="py-2.5 pr-3 whitespace-nowrap text-muted">
                        {l.reference || "—"}
                        {l.moyen && (
                          <span className="block text-[11px]">{LIBELLE_MOYEN[l.moyen] ?? l.moyen}</span>
                        )}
                      </td>
                      <td
                        className={`py-2.5 pr-3 text-right font-extrabold whitespace-nowrap ${
                          l.famille === "remboursement" ? "text-amber" : "text-blue"
                        }`}
                      >
                        {l.famille === "remboursement" ? "− " : ""}
                        {formatGNF(l.montantGnf)}
                      </td>
                      <td className="py-2.5 pr-3">{puce(l.statut)}</td>
                      <td className="py-2.5 text-right">
                        {/* Rembourser n'a de sens que sur un versement
                            réellement encaissé : ni une demande en attente,
                            ni un refus, ni un remboursement lui-même. */}
                        {l.statut === "confirme" && l.famille !== "remboursement" && (
                          <button
                            type="button"
                            onClick={() => setARembourser(l)}
                            disabled={enCours === l.id}
                            className="whitespace-nowrap rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue transition-colors hover:bg-bg disabled:opacity-50"
                          >
                            Rembourser
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={pagiHistorique.page}
              pages={pagiHistorique.pages}
              total={pagiHistorique.total}
              premier={pagiHistorique.premier}
              dernier={pagiHistorique.dernier}
              onPage={pagiHistorique.setPage}
              libelle="mouvements"
            />
          </div>
        )}

        {/* ---- Portefeuille d'abonnements ---- */}
        {onglet === "abonnements" && (
          <div className="rounded-2xl border border-line bg-white p-5">
            <h3 className="mb-2 text-[15px] font-extrabold">
              Abonnements · {portefeuille.length}
            </h3>
            {champRecherche}
            {filtres(FILTRES_ABONNEMENT, filtreAbonnement, setFiltreAbonnement, (c) =>
              c === "tous" ? abonnements.length : abonnements.filter((a) => a.statut === c).length
            )}
            {portefeuille.length === 0 && (
              <p className="py-3 text-[12.5px] text-muted">Aucun abonnement pour ce filtre.</p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.04em] text-muted">
                    <th className="py-2 pr-3 font-bold">Professionnel</th>
                    <th className="py-2 pr-3 font-bold">Formule</th>
                    <th className="py-2 pr-3 font-bold">Depuis</th>
                    <th className="py-2 pr-3 font-bold">Échéance</th>
                    <th className="py-2 pr-3 font-bold">État</th>
                    <th className="py-2 font-bold" />
                  </tr>
                </thead>
                <tbody>
                  {pagiAbonnements.tranche.map((a) => {
                    const bientot = a.echeanceProche;
                    return (
                      <tr key={a.id} className="border-b border-line last:border-b-0">
                        <td className="py-2.5 pr-3 font-bold">
                          {a.nom}
                          <span className="block text-[11px] font-semibold text-muted">{a.role}</span>
                        </td>
                        <td className="py-2.5 pr-3">
                          {a.formule}
                          <span className="block text-[11px] text-muted">
                            {a.periode === "annuel" ? "annuel" : "mensuel"}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 whitespace-nowrap text-muted">
                          {dateCourte(a.dateDebut)}
                        </td>
                        <td
                          className={`py-2.5 pr-3 whitespace-nowrap ${bientot ? "font-bold text-amber" : "text-muted"}`}
                        >
                          {a.dateFin ? dateCourte(a.dateFin) : "sans échéance"}
                        </td>
                        <td className="py-2.5 pr-3">{puce(a.statut)}</td>
                        <td className="py-2.5 text-right">
                          {a.statut !== "annule" && (
                            <button
                              type="button"
                              onClick={() => setAResilier(a)}
                              disabled={enCours === a.id}
                              className="whitespace-nowrap rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue transition-colors hover:bg-bg disabled:opacity-50"
                            >
                              Résilier
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={pagiAbonnements.page}
              pages={pagiAbonnements.pages}
              total={pagiAbonnements.total}
              premier={pagiAbonnements.premier}
              dernier={pagiAbonnements.dernier}
              onPage={pagiAbonnements.setPage}
              libelle="abonnements"
            />
          </div>
        )}

        {/* ---- Coordonnées d'encaissement ---- */}
        {onglet === "encaissement" && (
          <>
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

            <div className="rounded-2xl border border-line bg-white p-5">
              <h3 className="mb-1 text-[15px] font-extrabold">Paiement des consultations</h3>
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
                La consultation se règle <b>sur place, chez le médecin</b> : aucune somme patient ne
                transite par la plateforme, il n’y a donc rien à réconcilier de ce côté. Seuls les
                abonnements et les recharges SMS passent par la caisse de Docteur 224.
              </p>
            </div>
          </>
        )}
      </div>

      {/* Dialogues montés une seule fois : l'écran rend les deux versions. */}
      {aRefuser && (
        <DialogueDecision
          titre={`Refuser — ${aRefuser.reference || aRefuser.objet}`}
          detail={`${aRefuser.nom} · ${formatGNF(aRefuser.montantGnf)}. Le motif lui est notifié ; rien n’est activé.`}
          motifs={MOTIFS_REFUS}
          libelleAction="✕ Confirmer le refus"
          onFermer={() => setARefuser(null)}
          onConfirmer={(motif) => refuser(aRefuser, motif)}
        />
      )}
      {aRembourser && (
        <DialogueDecision
          titre={`Rembourser — ${aRembourser.reference || aRembourser.objet}`}
          detail={`${aRembourser.nom} · versement de ${formatGNF(aRembourser.montantGnf)}. Un remboursement intégral résilie l’abonnement ou retire les crédits SMS.`}
          motifs={MOTIFS_REMBOURSEMENT}
          montant={Math.max(0, aRembourser.montantGnf - dejaRembourse(aRembourser))}
          libelleAction="↩ Confirmer le remboursement"
          onFermer={() => setARembourser(null)}
          onConfirmer={(motif, montant) => rembourser(aRembourser, motif, montant)}
        />
      )}
      {aResilier && (
        <DialogueDecision
          titre={`Résilier — ${aResilier.nom}`}
          detail={`Formule ${aResilier.formule}. L’échéance en cours n’est pas tronquée : le professionnel a payé jusque-là.`}
          motifs={MOTIFS_RESILIATION}
          libelleAction="✕ Confirmer la résiliation"
          onFermer={() => setAResilier(null)}
          onConfirmer={(motif) => resilier(aResilier, motif)}
        />
      )}
    </AdminShell>
  );
}
