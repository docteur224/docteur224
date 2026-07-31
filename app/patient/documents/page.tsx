"use client";

import { useState } from "react";
import PatientShell from "@/components/patient/PatientShell";
import EnvoyerDocument from "@/components/patient/EnvoyerDocument";
import PartagerDocument from "@/components/patient/PartagerDocument";
import TransmissionsEntreMedecins from "@/components/patient/TransmissionsEntreMedecins";
import Pagination, { usePagination } from "@/components/site/Pagination";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import { formatDateCourte } from "@/lib/dates";
import {
  iconeType,
  libelleType,
  supprimerDocument,
  urlSignee,
  useMesDocuments,
  type DocumentPatient,
} from "@/lib/documents";

/*
 * Mes documents — ordonnances et comptes rendus remis par les médecins, et
 * pièces que le patient leur transmet.
 *
 * Le patient décide seul de qui voit quoi : il peut partager n'importe lequel
 * de ses documents avec un autre praticien, et retirer cet accès. Il ne peut
 * en revanche ni modifier ni supprimer ce qu'un médecin a rédigé — seul le
 * déposant en a le droit (policy `upd_docs` / `del_docs`).
 */

const TOUS = "tous";
const ONGLETS = [
  { cle: "tous", libelle: "Tous" },
  { cle: "recus", libelle: "Reçus" },
  { cle: "envoyes", libelle: "Envoyés" },
  // Vue de contrôle : ce que les médecins se sont transmis à votre sujet.
  { cle: "entre-medecins", libelle: "Entre médecins" },
] as const;

export default function MesDocuments() {
  const { documents, chargement, recharger } = useMesDocuments();
  const [onglet, setOnglet] = useState<(typeof ONGLETS)[number]["cle"]>("tous");
  const [filtre, setFiltre] = useState<string>(TOUS);
  const [deplie, setDeplie] = useState<string | null>(null);
  const [aSupprimer, setASupprimer] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const surTransmissions = onglet === "entre-medecins";
  const parOnglet = surTransmissions
    ? []
    : documents.filter((d) =>
        onglet === "tous"
          ? true
          : onglet === "recus"
            ? d.origine === "medecin"
            : d.origine === "patient"
      );
  const types = [TOUS, ...new Set(parOnglet.map((d) => d.type))];
  const visibles = filtre === TOUS ? parOnglet : parOnglet.filter((d) => d.type === filtre);
  const p = usePagination(visibles, 10);

  /* Le fichier vit dans un bucket privé : on signe une URL au clic, puis on
     l'ouvre. Pas de <a href> possible, l'URL n'existe pas avant. */
  async function ouvrir(doc: DocumentPatient) {
    if (!doc.fichierPath) return;
    setMessage("");
    const res = await urlSignee(doc.fichierPath);
    if (res.erreur || !res.url) {
      setMessage(`⚠️ ${res.erreur ?? "Fichier introuvable."}`);
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  async function supprimer(doc: DocumentPatient) {
    if (aSupprimer !== doc.id) {
      setASupprimer(doc.id);
      setMessage("");
      return;
    }
    const res = await supprimerDocument(doc.id, doc.fichierPath);
    setMessage(res.erreur ? `⚠️ ${res.erreur}` : "✓ Document retiré.");
    setASupprimer(null);
    recharger();
  }

  const vide = !chargement && parOnglet.length === 0;

  /** Une carte de document, commune aux deux rendus. */
  const carte = (d: DocumentPatient) => (
    <div key={d.id} className="rounded-2xl border border-line bg-white p-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl bg-teal-soft text-lg"
        >
          {iconeType(d.type)}
        </span>
        <div className="min-w-0 flex-1">
          <b className="block text-sm font-extrabold">{d.titre}</b>
          <div className="text-[11.5px] text-muted">
            {libelleType(d.type)} ·{" "}
            {d.origine === "medecin"
              ? `remis par ${d.medecinNom}`
              : `envoyé à ${d.medecinNom}`}{" "}
            · {formatDateCourte(d.creeLe.slice(0, 10))}
          </div>
          {d.pourQui !== "Moi-même" && (
            <span className="mt-1 inline-block rounded bg-teal-soft px-1.5 py-0.5 text-[10.5px] font-bold text-blue">
              pour {d.pourQui}
            </span>
          )}
        </div>
        {d.fichierPath && (
          <button
            type="button"
            onClick={() => ouvrir(d)}
            className="flex-none rounded-[9px] bg-teal px-3 py-1.5 text-[11.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
          >
            Ouvrir
          </button>
        )}
      </div>

      {d.contenu && (
        <>
          <button
            type="button"
            onClick={() => setDeplie(deplie === d.id ? null : d.id)}
            className="mt-2 text-[11.5px] font-bold text-teal hover:underline"
          >
            {deplie === d.id ? "Replier" : "Lire le contenu"}
          </button>
          {deplie === d.id && (
            <pre className="mt-2 whitespace-pre-wrap border-t border-line pt-2 font-sans text-[13px] leading-[1.7] text-[#3f5360]">
              {d.contenu}
            </pre>
          )}
        </>
      )}

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <PartagerDocument document={d} apres={recharger} />
        {/* Seul le déposant retire : une ordonnance appartient à son auteur. */}
        {d.origine === "patient" && (
          <button
            type="button"
            onClick={() => supprimer(d)}
            className="rounded-[9px] border-[1.5px] border-[#F3C9C2] bg-white px-3 py-1.5 text-[11.5px] font-bold text-red transition-colors hover:bg-red-soft"
          >
            {aSupprimer === d.id ? "Confirmer" : "Retirer"}
          </button>
        )}
      </div>
    </div>
  );

  const onglets = (
    <div className="flex flex-wrap gap-2">
      {ONGLETS.map((o) => {
        // L'onglet des transmissions a sa propre source (RPC dédiée) : pas de
        // compteur ici, il ne se déduit pas de la liste des documents.
        const n =
          o.cle === "entre-medecins"
            ? null
            : o.cle === "tous"
              ? documents.length
              : documents.filter((d) =>
                  o.cle === "recus" ? d.origine === "medecin" : d.origine === "patient"
                ).length;
        return (
          <button
            key={o.cle}
            type="button"
            onClick={() => {
              setOnglet(o.cle);
              setFiltre(TOUS);
              p.setPage(0);
            }}
            className={`rounded-[9px] border-[1.5px] px-3 py-1.5 text-[11.5px] font-bold transition-colors ${
              onglet === o.cle
                ? "border-teal bg-teal-soft text-blue"
                : "border-line bg-white text-muted hover:bg-bg"
            }`}
          >
            {o.libelle}
            {n !== null ? ` (${n})` : ""}
          </button>
        );
      })}
    </div>
  );

  const filtresType = types.length > 2 && (
    <div className="flex flex-wrap gap-2">
      {types.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => {
            setFiltre(t);
            p.setPage(0);
          }}
          className={`rounded-[9px] border px-2.5 py-1 text-[11px] font-bold transition-colors ${
            filtre === t ? "border-teal text-blue" : "border-line text-muted hover:bg-bg"
          }`}
        >
          {t === TOUS ? "Tous les types" : libelleType(t)}
        </button>
      ))}
    </div>
  );

  const etatVide = (
    <div className="rounded-2xl border border-line bg-white p-8 text-center">
      <div className="mb-2 text-3xl" aria-hidden>
        📄
      </div>
      <b className="block text-sm font-extrabold">
        {onglet === "envoyes" ? "Vous n’avez rien envoyé" : "Aucun document pour l’instant"}
      </b>
      <p className="mx-auto mt-1 max-w-[460px] text-[12.5px] text-muted">
        {onglet === "envoyes"
          ? "Vous pouvez transmettre un résultat d’analyse ou une ancienne ordonnance à l’un de vos médecins."
          : "Vos ordonnances et comptes rendus apparaîtront ici dès qu’un médecin vous en remettra un. Vous pouvez aussi lui envoyer une pièce vous-même."}
      </p>
    </div>
  );

  return (
    <PatientShell>
      {/* ===== Version mobile ===== */}
      <div className="md:hidden">
        <EnTeteMobile retour="/patient/compte" titre="Mes documents" />
        <div className="pad">
          <div className="mb-3">
            <EnvoyerDocument apres={recharger} />
          </div>
          <div className="mb-3 grid gap-2">
            {onglets}
            {filtresType}
          </div>
          {surTransmissions ? (
            <TransmissionsEntreMedecins />
          ) : (
            <>
              {chargement && (
                <p className="muted" style={{ fontSize: 13 }}>
                  Chargement…
                </p>
              )}
              {vide && etatVide}
              <div className="grid gap-3">{p.tranche.map(carte)}</div>
              <Pagination
                page={p.page}
                pages={p.pages}
                total={p.total}
                premier={p.premier}
                dernier={p.dernier}
                onPage={p.setPage}
                libelle="documents"
              />
            </>
          )}
          {message && (
            <p
              style={{
                color: message.startsWith("⚠️") ? "var(--red)" : "var(--green)",
                fontSize: 12.5,
                fontWeight: 700,
                paddingTop: 10,
              }}
            >
              {message}
            </p>
          )}
        </div>
      </div>

      {/* ===== Version web ===== */}
      <div className="hidden md:block">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Mes documents</h2>
            <small className="text-[13px] text-muted">
              Ordonnances reçues, pièces envoyées à vos médecins, et qui y a accès
            </small>
          </div>
          <EnvoyerDocument apres={recharger} />
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          {onglets}
          {filtresType}
        </div>

        {surTransmissions ? (
          <TransmissionsEntreMedecins />
        ) : (
          <>
            {chargement && <p className="text-[13px] text-muted">Chargement…</p>}
            {vide && etatVide}
            <div className="grid gap-3">{p.tranche.map(carte)}</div>
            <Pagination
              page={p.page}
              pages={p.pages}
              total={p.total}
              premier={p.premier}
              dernier={p.dernier}
              onPage={p.setPage}
              libelle="documents"
            />
          </>
        )}

        {message && (
          <p
            className={`mt-3 text-[12.5px] font-bold ${
              message.startsWith("⚠️") ? "text-red" : "text-green"
            }`}
          >
            {message}
          </p>
        )}
      </div>
    </PatientShell>
  );
}
