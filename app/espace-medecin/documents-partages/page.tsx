"use client";

import { useState } from "react";
import MedecinShell from "@/components/medecin/MedecinShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import { formatDateCourte } from "@/lib/dates";
import {
  iconeType,
  libelleType,
  urlSignee,
  useDocumentsPartagesAvecMoi,
  type DocumentPartage,
} from "@/lib/documents";

/*
 * Documents que des patients ont partagés avec ce médecin.
 *
 * Existe séparément de la fiche patient parce qu'un partage n'exige aucun
 * historique de rendez-vous : un patient peut partager un document qui
 * concerne un proche (son enfant, par exemple) avec un médecin qui n'a
 * jamais reçu ce proche. La liste des patients (construite à partir des
 * rendez-vous) ne contient alors aucune fiche où l'afficher — c'est ce que
 * cet écran corrige : la RLS autorisait déjà la lecture, rien n'y menait.
 */
export default function DocumentsPartagesMedecin() {
  const { documents, chargement } = useDocumentsPartagesAvecMoi();
  const [deplie, setDeplie] = useState<string | null>(null);
  const [erreur, setErreur] = useState("");

  async function ouvrir(d: DocumentPartage) {
    if (!d.fichierPath) return;
    setErreur("");
    const res = await urlSignee(d.fichierPath);
    if (res.erreur || !res.url) {
      setErreur(res.erreur ?? "Fichier introuvable.");
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  const vide = !chargement && documents.length === 0;

  const carte = (d: DocumentPartage, mobile: boolean) => (
    <div key={d.documentId} className={mobile ? "asstrowm" : "rounded-2xl border border-line bg-white p-4"} style={mobile ? { alignItems: "flex-start" } : undefined}>
      <div className={mobile ? "meta" : "flex items-start gap-3"} style={mobile ? undefined : {}}>
        {!mobile && (
          <span
            aria-hidden
            className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl bg-teal-soft text-lg"
          >
            {iconeType(d.type)}
          </span>
        )}
        <div className={mobile ? undefined : "min-w-0 flex-1"}>
          {mobile ? (
            <>
              <b>{d.titre}</b>
              <small>
                {libelleType(d.type)} · {d.patientNom}
                {d.pourQui !== "Lui-même" ? ` (pour ${d.pourQui})` : ""} ·{" "}
                {formatDateCourte(d.creeLe.slice(0, 10))}
              </small>
              {d.redigePar && (
                <small style={{ display: "block", color: "var(--muted)" }}>
                  Rédigé par {d.redigePar}
                </small>
              )}
            </>
          ) : (
            <>
              <b className="block text-sm font-extrabold">{d.titre}</b>
              <div className="text-[11.5px] text-muted">
                {libelleType(d.type)} · {formatDateCourte(d.creeLe.slice(0, 10))} · partagé le{" "}
                {formatDateCourte(d.partageLe.slice(0, 10))}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="rounded bg-teal-soft px-1.5 py-0.5 text-[10.5px] font-bold text-blue">
                  {d.patientNom}
                </span>
                {d.pourQui !== "Lui-même" && (
                  <span className="rounded bg-bg px-1.5 py-0.5 text-[10.5px] font-bold text-muted">
                    pour {d.pourQui}
                  </span>
                )}
                {d.redigePar && (
                  <span className="text-[10.5px] text-muted">rédigé par {d.redigePar}</span>
                )}
              </div>
            </>
          )}
        </div>
        {d.fichierPath && (
          <button
            type="button"
            onClick={() => ouvrir(d)}
            className={
              mobile
                ? "btnm"
                : "flex-none rounded-[9px] bg-teal px-3 py-1.5 text-[11.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
            }
          >
            Ouvrir
          </button>
        )}
      </div>

      {d.contenu && (
        <>
          <button
            type="button"
            onClick={() => setDeplie(deplie === d.documentId ? null : d.documentId)}
            className={mobile ? "btnm gh" : "mt-2 text-[11.5px] font-bold text-teal hover:underline"}
            style={mobile ? { marginTop: 8 } : undefined}
          >
            {deplie === d.documentId ? "Replier" : "Lire le contenu"}
          </button>
          {deplie === d.documentId && (
            <pre
              className={
                mobile
                  ? undefined
                  : "mt-2 whitespace-pre-wrap border-t border-line pt-2 font-sans text-[13px] leading-[1.7] text-[#3f5360]"
              }
              style={
                mobile
                  ? { whiteSpace: "pre-wrap", fontSize: 12.5, lineHeight: 1.6, marginTop: 8 }
                  : undefined
              }
            >
              {d.contenu}
            </pre>
          )}
        </>
      )}
    </div>
  );

  return (
    <MedecinShell>
      {/* ===== Version mobile ===== */}
      <div className="md:hidden">
        <EnTeteMobile variante="marque" />
        <div className="appbar">
          <h3 style={{ paddingLeft: 4 }}>Documents partagés</h3>
          <span className="sub" style={{ marginLeft: "auto", paddingRight: 6 }}>
            {documents.length}
          </span>
        </div>
        <div className="pad" style={{ paddingTop: 8 }}>
          {chargement && (
            <p className="muted" style={{ fontSize: 13 }}>
              Chargement…
            </p>
          )}
          {vide && (
            <div className="noteboxm" style={{ marginTop: 0 }}>
              <span aria-hidden>📤</span>
              <div>
                Aucun document partagé pour l’instant. Vos patients peuvent partager un document
                avec vous depuis leur espace, même s’ils n’ont pas encore pris rendez-vous.
              </div>
            </div>
          )}
          <div className="card2" style={{ display: vide ? "none" : undefined }}>
            {documents.map((d) => carte(d, true))}
          </div>
          {erreur && (
            <p style={{ color: "var(--red)", fontSize: 12.5, fontWeight: 700, paddingTop: 10 }}>
              ⚠️ {erreur}
            </p>
          )}
        </div>
      </div>

      {/* ===== Version web ===== */}
      <div className="hidden md:block">
        <div className="mb-5">
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Documents partagés</h2>
          <small className="text-[13px] text-muted">
            Documents que vos patients ont partagés avec vous, avec ou sans rendez-vous préalable
          </small>
        </div>

        {chargement && <p className="text-[13px] text-muted">Chargement…</p>}

        {vide && (
          <div className="rounded-2xl border border-line bg-white p-8 text-center">
            <div className="mb-2 text-3xl" aria-hidden>
              📤
            </div>
            <b className="block text-sm font-extrabold">Aucun document partagé pour l’instant</b>
            <p className="mx-auto mt-1 max-w-[460px] text-[12.5px] text-muted">
              Un patient peut partager avec vous un document — le sien ou celui d’un proche — même
              s’il n’a jamais pris rendez-vous. Il apparaîtra ici.
            </p>
          </div>
        )}

        <div className="grid gap-3">{documents.map((d) => carte(d, false))}</div>

        {erreur && <p className="mt-3 text-[12.5px] font-bold text-red">⚠️ {erreur}</p>}
      </div>
    </MedecinShell>
  );
}
