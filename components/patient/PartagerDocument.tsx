"use client";

import { useState } from "react";
import {
  partagerDocument,
  retirerPartage,
  useMesMedecins,
  type DocumentPatient,
} from "@/lib/documents";

/*
 * Partage d'un document avec un autre médecin, et révocation.
 *
 * C'est une décision du patient seul : la policy `ins_partages` n'autorise
 * que le titulaire du document. Ni le médecin qui l'a rédigé, ni un confrère
 * déjà destinataire ne peuvent rediffuser une pièce du dossier.
 *
 * Le panneau est déplié sous la carte du document plutôt qu'en boîte de
 * dialogue : la liste des accès en cours doit rester visible pendant qu'on
 * en ajoute ou qu'on en retire un.
 */
export default function PartagerDocument({
  document: doc,
  apres,
}: {
  document: DocumentPatient;
  apres: () => void;
}) {
  const { medecins } = useMesMedecins();
  const [ouvert, setOuvert] = useState(false);
  const [choix, setChoix] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);

  // Ni le médecin concerné ni ceux qui ont déjà l'accès.
  const dejaVus = new Set([doc.medecinId, ...doc.partages.map((p) => p.medecinId)]);
  const candidats = medecins.filter((m) => !dejaVus.has(m.id));

  async function partager() {
    if (!choix || enCours) return;
    setEnCours(true);
    const res = await partagerDocument(doc.id, choix);
    setEnCours(false);
    if (res.erreur) {
      setMessage({ texte: `⚠️ ${res.erreur}`, erreur: true });
      return;
    }
    const nom = medecins.find((m) => m.id === choix)?.nom ?? "ce médecin";
    setChoix("");
    setMessage({ texte: `✓ Partagé avec ${nom}.`, erreur: false });
    apres();
  }

  async function retirer(medecinId: string, nom: string) {
    const res = await retirerPartage(doc.id, medecinId);
    setMessage(
      res.erreur
        ? { texte: `⚠️ ${res.erreur}`, erreur: true }
        : { texte: `✓ Accès retiré à ${nom}.`, erreur: false }
    );
    apres();
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => {
          setOuvert((o) => !o);
          setMessage(null);
        }}
        className="rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue transition-colors hover:bg-bg"
      >
        {ouvert ? "Fermer le partage" : "Partager"}
        {doc.partages.length > 0 && (
          <span className="ml-1.5 rounded bg-teal-soft px-1.5 py-0.5 text-[10px] text-blue">
            {doc.partages.length}
          </span>
        )}
      </button>

      {ouvert && (
        <div className="mt-2 rounded-xl border border-line bg-bg p-3">
          <b className="block text-[12px] font-extrabold">Qui peut voir ce document</b>

          <ul className="mt-2 grid gap-1.5 text-[12px]">
            {doc.medecinId && (
              <li className="flex items-center justify-between gap-2">
                <span className="truncate">
                  {doc.medecinNom}
                  <span className="ml-1 text-muted">
                    ({doc.origine === "medecin" ? "auteur" : "destinataire"})
                  </span>
                </span>
              </li>
            )}
            {doc.partages.map((p) => (
              <li key={p.medecinId} className="flex items-center justify-between gap-2">
                <span className="truncate">{p.medecinNom}</span>
                <button
                  type="button"
                  onClick={() => retirer(p.medecinId, p.medecinNom)}
                  className="flex-none font-bold text-red hover:underline"
                >
                  Retirer l’accès
                </button>
              </li>
            ))}
            {!doc.medecinId && doc.partages.length === 0 && (
              <li className="text-muted">Vous seul pour l’instant.</li>
            )}
          </ul>

          <div className="mt-3 border-t border-line pt-3">
            {candidats.length === 0 ? (
              <p className="text-[11.5px] text-muted">
                Tous vos médecins ont déjà accès à ce document.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={choix}
                  onChange={(e) => setChoix(e.target.value)}
                  aria-label="Médecin avec qui partager"
                  className="min-w-[180px] flex-1 rounded-[11px] border border-line bg-white px-3 py-2 text-[12.5px] outline-none focus:border-teal"
                >
                  <option value="">Choisir un médecin…</option>
                  {candidats.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nom}
                      {m.specialite ? ` — ${m.specialite}` : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={partager}
                  disabled={!choix || enCours}
                  className="rounded-[9px] bg-teal px-3 py-2 text-[12px] font-bold text-white transition-colors hover:bg-[#2790bc] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {enCours ? "…" : "Partager"}
                </button>
              </div>
            )}
          </div>

          {message && (
            <p
              className={`mt-2 text-[11.5px] font-bold ${
                message.erreur ? "text-red" : "text-green"
              }`}
            >
              {message.texte}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
