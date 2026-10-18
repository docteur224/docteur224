"use client";

import { useState } from "react";
import Dialogue from "@/components/site/Dialogue";
import Icone from "@/components/site/Icone";
import { formatDateCourte } from "@/lib/dates";
import {
  annulerDocument,
  libelleType,
  MOTIFS_ANNULATION_DOCUMENT,
  type DocumentPatient,
} from "@/lib/documents";

/*
 * Annulation d'une pièce remise.
 *
 * Le bouton s'appelait « Retirer » et supprimait la ligne. Pour une
 * ordonnance, c'est indéfendable : le patient l'a peut-être déjà présentée
 * en pharmacie, et après suppression plus personne — ni lui, ni le
 * pharmacien, ni le médecin six mois plus tard — ne peut dire ce qui avait
 * été prescrit.
 *
 * Donc : la pièce reste, barrée, avec son motif. Et le motif est EXIGÉ,
 * parce que c'est la première question qu'on posera. « Erreur de
 * prescription » et « changement de traitement » n'appellent pas du tout la
 * même suite.
 */

export default function AnnulerDocument({
  document: doc,
  onFermer,
  onAnnule,
  onErreur,
}: {
  document: DocumentPatient;
  onFermer: () => void;
  onAnnule: () => void;
  onErreur: (message: string) => void;
}) {
  const [motif, setMotif] = useState<string | null>(null);
  const [autre, setAutre] = useState("");
  const [enCours, setEnCours] = useState(false);

  const retenu = motif === "Autre" ? autre.trim() : (motif ?? "");

  async function confirmer() {
    if (!retenu || enCours) return;
    setEnCours(true);
    const res = await annulerDocument(doc.id, retenu);
    setEnCours(false);
    if (res.erreur) {
      onErreur(res.erreur);
      return;
    }
    onAnnule();
  }

  return (
    <Dialogue
      titre="Annuler ce document ?"
      icone={<Icone nom="interdit" taille={18} />}
      sousTitre={`${libelleType(doc.type)} · émis le ${formatDateCourte(doc.creeLe.slice(0, 10))}`}
      onFermer={onFermer}
      pied={
        <>
          <button
            type="button"
            onClick={onFermer}
            className="min-h-11 flex-1 rounded-[10px] border border-line bg-white px-4 text-[13px] font-bold text-ink transition-colors hover:border-muted md:flex-none"
          >
            Retour
          </button>
          <button
            type="button"
            onClick={confirmer}
            disabled={!retenu || enCours}
            className="min-h-11 flex-1 rounded-[10px] bg-red px-4 text-[13px] font-bold text-white transition-colors hover:bg-[#99291d] disabled:opacity-45 md:flex-none"
          >
            {enCours ? "Annulation…" : "Confirmer l’annulation"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5 p-4">
        <p className="m-0 text-[13px] leading-relaxed text-muted">
          Le document restera visible dans l’historique, barré, avec la mention « Annulée ». Le
          patient est prévenu : il saura que la pièce qu’il a en main n’est plus valable.
        </p>

        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-2 p-0 text-[13px] font-extrabold">Motif</legend>
          <div className="flex flex-wrap gap-2">
            {MOTIFS_ANNULATION_DOCUMENT.map((m) => {
              const choisi = motif === m;
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={choisi}
                  onClick={() => setMotif(m)}
                  className={`min-h-11 rounded-full border px-3.5 text-[13px] font-semibold transition-colors ${
                    choisi
                      ? "border-blue bg-blue text-white"
                      : "border-line bg-white text-ink hover:border-muted"
                  }`}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </fieldset>

        {motif === "Autre" && (
          <label className="block text-[13px] font-semibold">
            Précisez le motif
            <input
              type="text"
              value={autre}
              maxLength={300}
              autoFocus
              onChange={(e) => setAutre(e.target.value)}
              placeholder="En quelques mots"
              className="mt-1.5 block min-h-11 w-full rounded-[10px] border border-line px-3 text-[13px] font-normal outline-none focus:border-teal"
            />
          </label>
        )}
      </div>
    </Dialogue>
  );
}
