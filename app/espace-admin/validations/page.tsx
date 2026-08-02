"use client";

import { useState } from "react";
import AdminShell from "@/components/admin/AdminShell";
import {
  ancienneteDossier,
  deciderDossier,
  demanderComplement,
  LIBELLE_PIECE,
  urlPieceValidation,
  useEtablissementsEnAttente,
  useMedecinsEnAttente,
  type DossierValidation,
  type PieceDossier,
} from "@/lib/admin";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import Pagination, { usePagination } from "@/components/site/Pagination";

/*
 * Validations — reproduit l'écran « admin-validation » de la maquette web :
 * dossier en cours d'examen (pièces, motif, décision), files des médecins et
 * établissements en attente. Chaque décision retire le dossier de la file et
 * est tracée en direct dans le journal d'audit (spec).
 *
 * Les pièces affichées sont celles réellement déposées : la maquette en
 * montrait quatre en dur, ce qui laissait croire qu'un dossier vide était
 * complet. Un dossier sans pièce se voit désormais comme tel.
 */

const ICONE_PIECE: Record<string, string> = {
  identite: "🪪",
  diplome: "🎓",
  carte_ordre: "🏥",
  autorisation_exercice: "📜",
};

const MOTIFS = [
  "Sélectionner un motif…",
  "Document illisible ou incomplet",
  "Diplôme non conforme",
  "Pièce d'identité expirée",
  "Informations incohérentes",
  "Autre motif (à préciser)",
];
const MOTIF_VIDE = MOTIFS[0];
const MOTIF_LIBRE = MOTIFS[MOTIFS.length - 1];

/**
 * Demande le motif d'un rejet lancé depuis une ligne de file : ces lignes
 * n'ont pas le sélecteur de la carte d'examen, et aucun rejet ne doit partir
 * sans motif. Dialogue unique, responsive (feuille en bas sous md).
 */
function DialogueMotif({
  dossier,
  onFermer,
  onConfirmer,
}: {
  dossier: DossierValidation;
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
      aria-label={`Rejeter ${dossier.nom}`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 md:items-center md:p-4"
    >
      <div className="w-full max-w-[440px] rounded-t-2xl bg-white p-5 md:rounded-2xl">
        <h3 className="text-[15px] font-extrabold">Rejeter — {dossier.nom}</h3>
        <p className="mb-3 mt-1 text-[12.5px] text-muted">
          Le motif est transmis au professionnel et tracé dans le journal d’audit.
        </p>
        <select
          value={choix}
          onChange={(e) => setChoix(e.target.value)}
          aria-label="Motif du rejet"
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
            aria-label="Motif libre du rejet"
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
            ✕ Confirmer le rejet
          </button>
        </div>
      </div>
    </div>
  );
}

/** Vignette d'une pièce réellement déposée : ouvre le fichier en URL signée. */
function Vignette({ piece, mobile = false }: { piece: PieceDossier; mobile?: boolean }) {
  const [ouverture, setOuverture] = useState(false);

  async function ouvrir() {
    setOuverture(true);
    // L'onglet doit être ouvert AVANT l'attente réseau, sinon Chrome le
    // bloque comme fenêtre surgissante.
    const onglet = window.open("", "_blank");
    const url = await urlPieceValidation(piece.fichierPath);
    setOuverture(false);
    if (!url) {
      onglet?.close();
      return;
    }
    if (onglet) onglet.location.href = url;
  }

  const libelle = LIBELLE_PIECE[piece.type] ?? piece.type;
  return (
    <button
      type="button"
      onClick={ouvrir}
      title={`Ouvrir : ${libelle}`}
      aria-label={`Ouvrir la pièce ${libelle}`}
      className={
        mobile
          ? "docthumb"
          : "flex h-[104px] w-[82px] flex-col items-center justify-center gap-1.5 rounded-[9px] border border-line bg-[#F6FAFC] text-2xl text-muted transition-colors hover:border-teal hover:bg-teal-soft"
      }
    >
      <span aria-hidden>{ouverture ? "⏳" : ICONE_PIECE[piece.type] ?? "📄"}</span>
      <small className={mobile ? undefined : "text-[9.5px] font-extrabold text-blue"}>{libelle}</small>
    </button>
  );
}

/** Ligne mobile de la file (mêmes actions que la version web). */
function LigneDossierMobile({ dossier, approuver, demanderRejet }: { dossier: DossierValidation; approuver: (d: DossierValidation) => void; demanderRejet: (d: DossierValidation) => void }) {
  return (
    <div className="asstrowm">
      <span
        className="av"
        aria-hidden
        style={{ background: "linear-gradient(135deg,#9AA8B2,#647A89)" }}
      >
        {dossier.initiales}
      </span>
      <span className="meta">
        <b>{dossier.nom}</b>
        <small>
          {[dossier.detail, ancienneteDossier(dossier.depotLe)].filter(Boolean).join(" · ")}
        </small>
        <small style={{ color: dossier.documents.length ? undefined : "var(--red)" }}>
          {dossier.documents.length > 0
            ? `📄 ${dossier.documents.length} pièce${dossier.documents.length > 1 ? "s" : ""}`
            : "⚠ aucune pièce"}
        </small>
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <button type="button" className="btnm" onClick={() => approuver(dossier)}>
          Approuver
        </button>
        <button type="button" className="btnm dg" onClick={() => demanderRejet(dossier)}>
          Rejeter
        </button>
      </span>
    </div>
  );
}

function LigneDossier({ dossier, approuver, demanderRejet }: { dossier: DossierValidation; approuver: (d: DossierValidation) => void; demanderRejet: (d: DossierValidation) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-[13px] border-b border-line py-[14px] last:border-b-0">
      <span
        aria-hidden
        className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl text-sm font-extrabold text-white"
        style={{ background: "linear-gradient(135deg,#9AA8B2,#647A89)" }}
      >
        {dossier.initiales}
      </span>
      <div className="min-w-0 flex-1">
        <b className="block text-sm font-extrabold">{dossier.nom}</b>
        <small className="text-xs text-muted">
          {[dossier.detail, ancienneteDossier(dossier.depotLe)].filter(Boolean).join(" · ")} ·{" "}
          {dossier.documents.length > 0 ? (
            <span className="font-bold text-teal">
              📄 {dossier.documents.length} pièce{dossier.documents.length > 1 ? "s" : ""}
            </span>
          ) : (
            <span className="font-bold text-red">⚠ aucune pièce</span>
          )}
        </small>
      </div>
      <button
        type="button"
        onClick={() => approuver(dossier)}
        className="rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
      >
        Approuver
      </button>
      <button
        type="button"
        onClick={() => demanderRejet(dossier)}
        className="rounded-[9px] border-[1.5px] border-[#F3CDC8] bg-white px-[14px] py-2 text-[12.5px] font-bold text-red transition-colors hover:bg-[#FBE9E7]"
      >
        Rejeter
      </button>
    </div>
  );
}

export default function ValidationsAdmin() {
  const { dossiers: medecins, recharger: rechargerMedecins } = useMedecinsEnAttente();
  const { dossiers: etablissements, recharger: rechargerEtabs } = useEtablissementsEnAttente();
  const pagiMedecins = usePagination(medecins, 10);
  const pagiEtabs = usePagination(etablissements, 10);
  const [motif, setMotif] = useState(MOTIF_VIDE);
  const [motifLibre, setMotifLibre] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  /** Dossier dont le rejet est en cours de motivation (lignes de file). */
  const [rejetEnCours, setRejetEnCours] = useState<DossierValidation | null>(null);

  // Motif retenu : la saisie libre quand « Autre motif » est choisi, sinon
  // l'intitulé de la liste. `undefined` = rien de motivé.
  const motifChoisi =
    motif === MOTIF_VIDE ? undefined : motif === MOTIF_LIBRE ? motifLibre.trim() || undefined : motif;

  function reinitialiserMotif() {
    setMotif(MOTIF_VIDE);
    setMotifLibre("");
  }

  async function decider(
    d: DossierValidation,
    decision: "valide" | "refuse",
    motifRejet?: string
  ) {
    if (enCours) return;
    setErreur(null);
    setSucces(null);
    setEnCours(true);
    const res = await deciderDossier(d, decision, motifRejet);
    setEnCours(false);
    if (res.erreur) {
      setErreur(res.erreur);
      return;
    }
    setSucces(
      decision === "valide" ? `${d.nom} a été approuvé.` : `${d.nom} a été rejeté.`
    );
    reinitialiserMotif(); // sinon le motif précédent collait au dossier suivant
    rechargerMedecins();
    rechargerEtabs();
  }

  /**
   * Rien de négatif ne part sans motif : le professionnel doit savoir ce
   * qu'on lui reproche, et la décision doit rester justifiable dans l'audit.
   */
  function motifManquant(action: string): boolean {
    if (motifChoisi) return false;
    setSucces(null);
    setErreur(
      motif === MOTIF_LIBRE
        ? `Précisez le motif avant de ${action}.`
        : `Choisissez ou saisissez un motif avant de ${action}.`
    );
    return true;
  }

  async function rejeterAvecMotif(d: DossierValidation) {
    if (motifManquant("rejeter le dossier")) return;
    await decider(d, "refuse", motifChoisi);
  }

  /** Approbation : la seule décision qui n'a pas à être motivée. */
  const approuver = (d: DossierValidation) => decider(d, "valide");

  async function complement(d: DossierValidation) {
    if (enCours) return;
    if (motifManquant("demander un complément")) return;
    setErreur(null);
    setSucces(null);
    setEnCours(true);
    const res = await demanderComplement(d, motifChoisi);
    setEnCours(false);
    if (res.erreur) {
      setErreur(res.erreur);
      return;
    }
    setSucces(`Complément demandé à ${d.nom} — le dossier reste en attente.`);
    reinitialiserMotif();
  }

  // Le dossier « en cours d'examen » est le premier médecin de la file.
  const dossierEnCours = medecins[0];

  const messages = (
    <>
      {erreur && (
        <div
          role="alert"
          className="mb-3 rounded-[11px] bg-red-soft px-[13px] py-[11px] text-[12.5px] font-semibold text-red"
        >
          {erreur}
        </div>
      )}
      {succes && (
        <div
          role="status"
          className="mb-3 rounded-[11px] bg-green-soft px-[13px] py-[11px] text-[12.5px] font-semibold text-green"
        >
          ✓ {succes}
        </div>
      )}
    </>
  );

  return (
    <AdminShell>
      {rejetEnCours && (
        <DialogueMotif
          dossier={rejetEnCours}
          onFermer={() => setRejetEnCours(null)}
          onConfirmer={(m) => {
            const d = rejetEnCours;
            setRejetEnCours(null);
            decider(d, "refuse", m);
          }}
        />
      )}

      {/* ===== Version mobile (écran « m-admin-validation » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <EnTeteMobile variante="marque" />
        <div className="appbar">
          <h3 style={{ paddingLeft: 4 }}>Validations</h3>
        </div>
        <div className="pad">
          <div className="abannerm">
            <span aria-hidden>ℹ️</span>
            <div>
              Vérifiez diplôme, carte de l&apos;ordre, autorisation d&apos;exercice et pièce
              d&apos;identité avant d&apos;approuver.
            </div>
          </div>
          {messages}
          {dossierEnCours ? (
            <div className="card2">
              <h4>Dossier en examen — {dossierEnCours.nom}</h4>
              <p className="muted" style={{ fontSize: 12 }}>
                {ancienneteDossier(dossierEnCours.depotLe)}
              </p>
              {dossierEnCours.documents.length > 0 ? (
                <div className="docthumbs">
                  {dossierEnCours.documents.map((piece) => (
                    <Vignette key={piece.id} piece={piece} mobile />
                  ))}
                </div>
              ) : (
                <div className="privnote">
                  <span aria-hidden>⚠️</span>
                  <div>Aucune pièce déposée — demandez un complément avant d&apos;approuver.</div>
                </div>
              )}
              <div className="fldm" style={{ marginTop: 6 }}>
                <label>Motif — obligatoire pour rejeter ou demander un complément</label>
                <select
                  className="v"
                  value={motif}
                  onChange={(e) => setMotif(e.target.value)}
                  aria-label="Motif"
                >
                  {MOTIFS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </div>
              {motif === MOTIF_LIBRE && (
                <div className="fldm">
                  <label>Précisez le motif</label>
                  <textarea
                    className="inp"
                    rows={3}
                    value={motifLibre}
                    onChange={(e) => setMotifLibre(e.target.value)}
                    placeholder="Expliquez ce qui manque ou ce qui pose problème…"
                    aria-label="Motif libre"
                  />
                </div>
              )}
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 8 }}>
                <button
                  type="button"
                  className="btnm"
                  disabled={enCours}
                  onClick={() => decider(dossierEnCours, "valide")}
                >
                  ✔ Approuver
                </button>
                <button
                  type="button"
                  className="btnm gh"
                  disabled={enCours}
                  onClick={() => complement(dossierEnCours)}
                >
                  📩 Complément
                </button>
                <button
                  type="button"
                  className="btnm dg"
                  disabled={enCours}
                  onClick={() => rejeterAvecMotif(dossierEnCours)}
                >
                  ✕ Rejeter
                </button>
              </div>
              <div className="privnote info">
                <span aria-hidden>📜</span>
                <div>Toute décision est horodatée et tracée dans le journal d&apos;audit.</div>
              </div>
            </div>
          ) : (
            <div className="card2" style={{ textAlign: "center" }}>
              <p className="muted" style={{ fontSize: 13 }}>
                ✅ Aucun dossier médecin en cours d&apos;examen — la file est vide.
              </p>
            </div>
          )}
          <div className="card2">
            <h4>Médecins en attente · {medecins.length}</h4>
            {medecins.length === 0 && (
              <p className="muted" style={{ fontSize: 12.5 }}>
                Aucun médecin en attente.
              </p>
            )}
            {pagiMedecins.tranche.map((dossier) => (
              <LigneDossierMobile key={dossier.id} dossier={dossier} approuver={approuver} demanderRejet={setRejetEnCours} />
            ))}
            <Pagination
              page={pagiMedecins.page}
              pages={pagiMedecins.pages}
              total={pagiMedecins.total}
              premier={pagiMedecins.premier}
              dernier={pagiMedecins.dernier}
              onPage={pagiMedecins.setPage}
              libelle="dossiers"
            />
          </div>
          <div className="card2">
            <h4>Établissements en attente · {etablissements.length}</h4>
            {etablissements.length === 0 && (
              <p className="muted" style={{ fontSize: 12.5 }}>
                Aucun établissement en attente.
              </p>
            )}
            {pagiEtabs.tranche.map((dossier) => (
              <LigneDossierMobile key={dossier.id} dossier={dossier} approuver={approuver} demanderRejet={setRejetEnCours} />
            ))}
            <Pagination
              page={pagiEtabs.page}
              pages={pagiEtabs.pages}
              total={pagiEtabs.total}
              premier={pagiEtabs.premier}
              dernier={pagiEtabs.dernier}
              onPage={pagiEtabs.setPage}
              libelle="dossiers"
            />
          </div>
        </div>
      </div>

      {/* ===== Version web (inchangée) ===== */}
      <div className="hidden md:block">
      <div className="mb-5">
        <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Validations</h2>
        <small className="text-[13px] text-muted">
          Vérifiez et approuvez les professionnels et établissements
        </small>
      </div>

      <div className="mb-4 flex items-start gap-[9px] rounded-xl border border-[#BFE0EF] bg-teal-soft px-[14px] py-3 text-[12.5px] font-semibold leading-relaxed text-blue">
        <span aria-hidden>ℹ️</span>
        <div>
          Vérifiez les pièces (diplôme, carte de l’ordre des médecins, autorisation d’exercice,
          pièce d’identité) avant d’approuver. Un professionnel validé obtient le badge{" "}
          <b>Vérifié</b>.
        </div>
      </div>

      {messages}

      {dossierEnCours ? (
        <div className="mb-4 rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-[14px] text-[15px] font-extrabold">
            Dossier en cours d’examen — {dossierEnCours.nom}
          </h3>
          {dossierEnCours.documents.length > 0 ? (
            <div className="mb-1 mt-2 flex flex-wrap gap-[10px]">
              {dossierEnCours.documents.map((piece) => (
                <Vignette key={piece.id} piece={piece} />
              ))}
            </div>
          ) : (
            <div className="flex items-start gap-[9px] rounded-[11px] bg-red-soft px-[13px] py-[11px] text-[12.5px] font-semibold text-red">
              <span aria-hidden>⚠️</span>
              <div>
                Aucune pièce déposée pour ce dossier — demandez un complément avant
                d’approuver.
              </div>
            </div>
          )}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-muted">Statut</label>
              <div className="rounded-[11px] border border-line bg-white px-[13px] py-3 text-[13.5px]">
                En attente · {ancienneteDossier(dossierEnCours.depotLe)}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-muted">
                Motif — obligatoire pour rejeter ou demander un complément
              </label>
              <select
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                aria-label="Motif"
                className="w-full rounded-[11px] border border-line bg-white px-[13px] py-3 text-[13.5px] outline-none focus:border-teal"
              >
                {MOTIFS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
              {motif === MOTIF_LIBRE && (
                <textarea
                  rows={3}
                  value={motifLibre}
                  onChange={(e) => setMotifLibre(e.target.value)}
                  placeholder="Expliquez ce qui manque ou ce qui pose problème…"
                  aria-label="Motif libre"
                  className="mt-2 w-full rounded-[11px] border border-line bg-white px-[13px] py-3 text-[13.5px] outline-none focus:border-teal"
                />
              )}
            </div>
          </div>
          <div className="mt-[14px] flex flex-wrap gap-[9px]">
            <button
              type="button"
              onClick={() => decider(dossierEnCours, "valide")}
              disabled={enCours}
              className="rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc] disabled:cursor-not-allowed disabled:opacity-50"
            >
              ✔ Approuver
            </button>
            <button
              type="button"
              onClick={() => complement(dossierEnCours)}
              disabled={enCours}
              className="rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg disabled:cursor-not-allowed disabled:opacity-50"
            >
              📩 Demander un complément
            </button>
            <button
              type="button"
              onClick={() => rejeterAvecMotif(dossierEnCours)}
              disabled={enCours}
              className="rounded-[9px] border-[1.5px] border-[#F3CDC8] bg-white px-[14px] py-2 text-[12.5px] font-bold text-red transition-colors hover:bg-[#FBE9E7] disabled:cursor-not-allowed disabled:opacity-50"
            >
              ✕ Rejeter avec motif
            </button>
          </div>
          <div className="mt-[14px] flex items-start gap-[9px] rounded-[11px] bg-teal-soft px-[13px] py-[11px] text-[12.5px] font-semibold leading-relaxed text-blue">
            <span aria-hidden>📜</span>
            <div>
              Chaque décision (approbation, rejet, demande de complément) est horodatée et
              tracée dans le <b>journal d’audit</b>.
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-4 rounded-2xl border border-line bg-white p-5 text-center text-[13px] text-muted">
          ✅ Aucun dossier médecin en cours d’examen — la file est vide.
        </div>
      )}

      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">
          Médecins en attente · {medecins.length}
        </h3>
        {medecins.length === 0 && (
          <p className="py-3 text-[12.5px] text-muted">Aucun médecin en attente.</p>
        )}
        {pagiMedecins.tranche.map((dossier) => (
          <LigneDossier key={dossier.id} dossier={dossier} approuver={approuver} demanderRejet={setRejetEnCours} />
        ))}
        <Pagination
          page={pagiMedecins.page}
          pages={pagiMedecins.pages}
          total={pagiMedecins.total}
          premier={pagiMedecins.premier}
          dernier={pagiMedecins.dernier}
          onPage={pagiMedecins.setPage}
          libelle="dossiers"
        />
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">
          Établissements en attente · {etablissements.length}
        </h3>
        {etablissements.length === 0 && (
          <p className="py-3 text-[12.5px] text-muted">Aucun établissement en attente.</p>
        )}
        {pagiEtabs.tranche.map((dossier) => (
          <LigneDossier key={dossier.id} dossier={dossier} approuver={approuver} demanderRejet={setRejetEnCours} />
        ))}
        <Pagination
          page={pagiEtabs.page}
          pages={pagiEtabs.pages}
          total={pagiEtabs.total}
          premier={pagiEtabs.premier}
          dernier={pagiEtabs.dernier}
          onPage={pagiEtabs.setPage}
          libelle="dossiers"
        />
      </div>
      </div>
    </AdminShell>
  );
}
