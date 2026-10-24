"use client";

import { useState } from "react";
import { formatDateCourte } from "@/lib/dates";
import { derniere, type NoteConsultation } from "@/lib/dossier-clinique";
import type { RdvDossier } from "@/lib/pro";
import { classeStatut, libelleStatut, statutAffiche } from "@/lib/statuts-rdv";
import { BTN_CONTOUR, BTN_NEUTRE, CARTE, COMPTE, Squelettes, TITRE_SECTION } from "../ui";

const PAR_PAGE = 5;

/**
 * Consultations passées avec ce praticien, la plus récente en tête : date,
 * motif et diagnostic retenu — tirés de la note quand elle existe, du motif
 * de réservation sinon. Une consultation sans note se signale d'elle-même,
 * avec le geste qui la complète.
 */
export default function SectionConsultations({
  consultations,
  notes,
  chargement,
  onOuvrir,
  onRediger,
}: {
  /** Rendez-vous passés et non annulés, du plus récent au plus ancien. */
  consultations: RdvDossier[];
  notes: NoteConsultation[];
  chargement: boolean;
  onOuvrir: (note: NoteConsultation) => void;
  onRediger: (rdvId: string) => void;
}) {
  const [toutVoir, setToutVoir] = useState(false);
  // Les cinq dernières suffisent à se remettre le suivi en tête ; le reste
  // se déplie à la demande.
  const visibles = toutVoir ? consultations : consultations.slice(0, PAR_PAGE);

  return (
    <section className={CARTE} aria-labelledby="titre-consultations">
      <h3 id="titre-consultations" className={`${TITRE_SECTION} mb-3`}>
        Historique des consultations <span className={COMPTE}>({consultations.length})</span>
      </h3>

      {chargement ? (
        <Squelettes n={2} hauteur={56} />
      ) : consultations.length === 0 ? (
        <p className="py-4 text-center text-[12.5px] text-muted">Aucune consultation passée avec vous.</p>
      ) : (
        <ul className="divide-y divide-line">
          {visibles.map((r) => {
            const note = notes.find((n) => n.rendezVousId === r.id);
            const v = note ? derniere(note) : null;
            const etat = statutAffiche(r);
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="text-[13.5px] font-extrabold">
                      {formatDateCourte(r.date)} · {r.heure}
                    </b>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${classeStatut(etat)}`}>
                      {libelleStatut(etat)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[12.5px]">
                    <span className="text-muted">Motif : </span>
                    {v?.motif || r.motif || "—"}
                  </div>
                  <div className="text-[12.5px]">
                    <span className="text-muted">Diagnostic : </span>
                    {v?.diagnostic || <span className="text-muted">pas de note pour cette consultation</span>}
                  </div>
                </div>
                {note ? (
                  <button type="button" onClick={() => onOuvrir(note)} className={`${BTN_CONTOUR} max-md:flex-1`}>
                    Voir la note
                  </button>
                ) : (
                  <button type="button" onClick={() => onRediger(r.id)} className={`${BTN_NEUTRE} max-md:flex-1`}>
                    Rédiger la note
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {consultations.length > PAR_PAGE && (
        <button type="button" onClick={() => setToutVoir((v) => !v)} className={`${BTN_NEUTRE} mt-2`}>
          {toutVoir ? "Réduire" : `Tout afficher (${consultations.length})`}
        </button>
      )}
    </section>
  );
}
