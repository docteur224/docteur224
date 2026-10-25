"use client";

import Icone from "@/components/site/Icone";
import { derniere, type NoteConsultation } from "@/lib/dossier-clinique";
import { BTN_NEUTRE, BTN_PRIMAIRE, CARTE, COMPTE, EtatVide, Squelettes, TITRE_SECTION } from "../ui";
import { dateHeure } from "./commun";

/** Notes de consultation, la plus récemment modifiée en tête. */
export default function SectionNotes({
  notes,
  chargement,
  consultation,
  onNouvelle,
  onOuvrir,
  onModifier,
}: {
  notes: NoteConsultation[];
  chargement: boolean;
  /** Libellé de la consultation rattachée, s'il y en a une. */
  consultation: (rdvId: string | null) => string | null;
  onNouvelle: () => void;
  onOuvrir: (note: NoteConsultation) => void;
  onModifier: (note: NoteConsultation) => void;
}) {
  return (
    <section className={CARTE} aria-labelledby="titre-notes">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2.5">
        <h3 id="titre-notes" className={TITRE_SECTION}>
          Notes de consultation <span className={COMPTE}>({notes.length})</span>
        </h3>
        <button type="button" onClick={onNouvelle} className={`${BTN_PRIMAIRE} max-md:flex-1`}>
          <Icone nom="plus" taille={15} epaisseur={2.4} />
          Nouvelle note
        </button>
      </div>
      <p className="mb-4 flex items-center gap-1.5 text-[12px] text-muted">
        <Icone nom="interdit" taille={13} />
        Privées : ni le patient, ni votre assistant(e), ni un confrère ne les voient.
      </p>

      {chargement ? (
        <Squelettes n={2} hauteur={78} />
      ) : notes.length === 0 ? (
        <EtatVide
          icone="presse_papiers"
          titre="Aucune note pour l’instant"
          texte="Motif, examen, diagnostic, conduite à tenir : la trace de chaque consultation, versionnée."
          action={
            <button type="button" onClick={onNouvelle} className={BTN_PRIMAIRE}>
              Rédiger la première note
            </button>
          }
        />
      ) : (
        <div className="grid gap-3">
          {notes.map((n) => {
            const v = derniere(n);
            const rdv = consultation(n.rendezVousId);
            return (
              <article
                key={n.id}
                className="flex flex-wrap items-start gap-3 rounded-xl border border-line p-3.5 transition-colors hover:border-line"
              >
                <span className="grid h-[38px] w-[38px] flex-none place-items-center rounded-[10px] bg-teal-soft text-blue">
                  <Icone nom="presse_papiers" taille={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="text-[14px] font-extrabold">{v.motif || "Note de consultation"}</b>
                    {n.versionCourante > 1 && (
                      <span className="rounded-md bg-amber-soft px-2 py-0.5 text-[11px] font-semibold text-amber">
                        Modifiée · v{n.versionCourante}
                      </span>
                    )}
                  </div>
                  {v.diagnostic && <p className="mt-0.5 line-clamp-2 text-[12.5px] text-ink">{v.diagnostic}</p>}
                  <div className="mt-0.5 text-[12px] text-muted">
                    {rdv ?? "Note libre"} · {n.versionCourante > 1 ? "modifiée" : "rédigée"} le {dateHeure(n.majLe)}
                  </div>
                </div>
                <div className="flex w-full flex-wrap justify-end gap-2 md:w-auto">
                  <button type="button" onClick={() => onModifier(n)} className={`${BTN_NEUTRE} max-md:flex-1`}>
                    Modifier
                  </button>
                  <button type="button" onClick={() => onOuvrir(n)} className={`${BTN_PRIMAIRE} max-md:flex-1`}>
                    Ouvrir
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
