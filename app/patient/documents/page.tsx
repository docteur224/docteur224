"use client";

import { useState } from "react";
import PatientShell from "@/components/patient/PatientShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import { formatDateCourte } from "@/lib/dates";
import {
  iconeType,
  libelleType,
  urlSignee,
  useMesDocuments,
  type DocumentPatient,
} from "@/lib/documents";

/*
 * Mes documents — ordonnances, comptes rendus et résultats remis par les
 * médecins. Lecture seule : le patient ne dépose rien lui-même, c'est le
 * praticien qui engage sa responsabilité sur le contenu.
 */

const TOUS = "tous";

export default function MesDocuments() {
  const { documents, chargement } = useMesDocuments();
  const [filtre, setFiltre] = useState<string>(TOUS);
  const [deplie, setDeplie] = useState<string | null>(null);
  const [erreur, setErreur] = useState("");

  const types = [TOUS, ...new Set(documents.map((d) => d.type))];
  const visibles = filtre === TOUS ? documents : documents.filter((d) => d.type === filtre);

  /* Le fichier vit dans un bucket privé : on signe une URL au clic, puis on
     l'ouvre. Pas de <a href> possible, l'URL n'existe pas avant. */
  async function ouvrir(doc: DocumentPatient) {
    if (!doc.fichierPath) return;
    setErreur("");
    const res = await urlSignee(doc.fichierPath);
    if (res.erreur || !res.url) {
      setErreur(res.erreur ?? "Fichier introuvable.");
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  const vide = !chargement && documents.length === 0;

  return (
    <PatientShell>
      {/* ===== Version mobile ===== */}
      <div className="md:hidden">
        <EnTeteMobile retour="/patient/compte" titre="Mes documents" />
        <div className="pad">
          {types.length > 2 && (
            <div className="tabsm" style={{ marginBottom: 12 }}>
              {types.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`tabm${filtre === t ? " on" : ""}`}
                  onClick={() => setFiltre(t)}
                >
                  {t === TOUS ? "Tous" : libelleType(t)}
                </button>
              ))}
            </div>
          )}
          <div className="card2">
            <h4>Documents reçus</h4>
            {chargement && (
              <p className="muted" style={{ fontSize: 13 }}>
                Chargement…
              </p>
            )}
            {vide && (
              <p className="muted" style={{ fontSize: 13 }}>
                Aucun document pour l’instant. Vos ordonnances et comptes rendus apparaîtront ici
                dès qu’un médecin vous en remettra un.
              </p>
            )}
            {visibles.map((d) => (
              <div key={d.id} className="asstrowm" style={{ alignItems: "flex-start" }}>
                <span className="av" aria-hidden style={{ background: "#EAF4F9", color: "#15506B" }}>
                  {iconeType(d.type)}
                </span>
                <span className="meta">
                  <b>{d.titre}</b>
                  <small>
                    {libelleType(d.type)} · {d.medecinNom} · {formatDateCourte(d.creeLe.slice(0, 10))}
                    {d.pourQui !== "Moi-même" ? ` · pour ${d.pourQui}` : ""}
                  </small>
                  {deplie === d.id && d.contenu && (
                    <span
                      style={{
                        display: "block",
                        whiteSpace: "pre-wrap",
                        fontSize: 12.5,
                        lineHeight: 1.6,
                        marginTop: 8,
                        color: "var(--ink)",
                      }}
                    >
                      {d.contenu}
                    </span>
                  )}
                </span>
                <span style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {d.contenu && (
                    <button
                      type="button"
                      className="btnm gh"
                      onClick={() => setDeplie(deplie === d.id ? null : d.id)}
                    >
                      {deplie === d.id ? "Replier" : "Lire"}
                    </button>
                  )}
                  {d.fichierPath && (
                    <button type="button" className="btnm" onClick={() => ouvrir(d)}>
                      Ouvrir
                    </button>
                  )}
                </span>
              </div>
            ))}
            {erreur && (
              <div style={{ color: "var(--red)", fontSize: 12, fontWeight: 700, paddingTop: 10 }}>
                ⚠️ {erreur}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== Version web ===== */}
      <div className="hidden md:block">
        <div className="mb-5">
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Mes documents</h2>
          <small className="text-[13px] text-muted">
            Ordonnances, comptes rendus et résultats remis par vos médecins
          </small>
        </div>

        {types.length > 2 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {types.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFiltre(t)}
                className={`rounded-[9px] border-[1.5px] px-3 py-1.5 text-[11.5px] font-bold transition-colors ${
                  filtre === t
                    ? "border-teal bg-teal-soft text-blue"
                    : "border-line bg-white text-muted hover:bg-bg"
                }`}
              >
                {t === TOUS ? "Tous" : libelleType(t)}
              </button>
            ))}
          </div>
        )}

        {chargement && <p className="text-[13px] text-muted">Chargement…</p>}

        {vide && (
          <div className="rounded-2xl border border-line bg-white p-8 text-center">
            <div className="mb-2 text-3xl" aria-hidden>
              📄
            </div>
            <b className="block text-sm font-extrabold">Aucun document pour l’instant</b>
            <p className="mx-auto mt-1 max-w-[460px] text-[12.5px] text-muted">
              Vos ordonnances, comptes rendus et résultats apparaîtront ici dès qu’un médecin vous
              en remettra un depuis son espace. Vous ne pouvez pas en déposer vous-même.
            </p>
          </div>
        )}

        <div className="grid gap-3">
          {visibles.map((d) => (
            <div key={d.id} className="rounded-2xl border border-line bg-white p-4">
              <div className="flex items-start gap-[13px]">
                <span
                  aria-hidden
                  className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl bg-teal-soft text-lg"
                >
                  {iconeType(d.type)}
                </span>
                <div className="min-w-0 flex-1">
                  <b className="block text-sm font-extrabold">{d.titre}</b>
                  <div className="text-[11.5px] text-muted">
                    {libelleType(d.type)} · {d.medecinNom} ·{" "}
                    {formatDateCourte(d.creeLe.slice(0, 10))}
                    {d.pourQui !== "Moi-même" && (
                      <span className="ml-1.5 rounded bg-teal-soft px-1.5 py-0.5 font-bold text-blue">
                        pour {d.pourQui}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-none gap-2">
                  {d.contenu && (
                    <button
                      type="button"
                      onClick={() => setDeplie(deplie === d.id ? null : d.id)}
                      className="rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue transition-colors hover:bg-bg"
                    >
                      {deplie === d.id ? "Replier" : "Lire"}
                    </button>
                  )}
                  {d.fichierPath && (
                    <button
                      type="button"
                      onClick={() => ouvrir(d)}
                      className="rounded-[9px] bg-teal px-3 py-1.5 text-[11.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
                    >
                      Ouvrir le fichier
                    </button>
                  )}
                </div>
              </div>
              {deplie === d.id && d.contenu && (
                <pre className="mt-3 whitespace-pre-wrap border-t border-line pt-3 font-sans text-[13px] leading-[1.7] text-[#3f5360]">
                  {d.contenu}
                </pre>
              )}
            </div>
          ))}
        </div>

        {erreur && <p className="mt-3 text-[12.5px] font-bold text-red">⚠️ {erreur}</p>}
      </div>
    </PatientShell>
  );
}
