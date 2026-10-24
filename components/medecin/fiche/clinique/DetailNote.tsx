"use client";

import { useState } from "react";
import Dialogue from "@/components/site/Dialogue";
import type { NoteConsultation } from "@/lib/dossier-clinique";
import { BTN_NEUTRE, BTN_PRIMAIRE } from "../ui";
import { dateHeure } from "./commun";

/**
 * Lecture d'une note et de ses versions. La version en cours s'ouvre ; les
 * précédentes se choisissent au-dessus, chacune avec sa date — c'est ce qui
 * permet de retrouver ce qui était écrit le jour où l'on a décidé.
 */
export default function DetailNote({
  note,
  consultation,
  onFermer,
  onModifier,
}: {
  note: NoteConsultation;
  /** « Consultation du 12/10/2026 à 09:30 », si la note y est rattachée. */
  consultation: string | null;
  onFermer: () => void;
  onModifier: () => void;
}) {
  const [choisie, setChoisie] = useState(note.versions[0].version);
  const v = note.versions.find((x) => x.version === choisie) ?? note.versions[0];
  const estCourante = v.version === note.versionCourante;

  const blocs: [string, string | null][] = [
    ["Motif", v.motif],
    ["Examen", v.examen],
    ["Diagnostic", v.diagnostic],
    ["Conduite à tenir", v.conduite],
  ];

  return (
    <Dialogue
      titre={v.motif || "Note de consultation"}
      sousTitre={consultation ?? "Note libre, sans rendez-vous"}
      icone="🩺"
      largeur="640px"
      onFermer={onFermer}
      pied={
        <>
          <button type="button" onClick={onModifier} className={BTN_PRIMAIRE}>
            Modifier (nouvelle version)
          </button>
          <button type="button" onClick={onFermer} className={BTN_NEUTRE}>
            Fermer
          </button>
        </>
      }
    >
      <div className="grid gap-4 p-4">
        {note.versions.length > 1 && (
          <div role="radiogroup" aria-label="Version affichée" className="flex flex-wrap gap-2">
            {note.versions.map((x) => (
              <button
                key={x.version}
                type="button"
                role="radio"
                aria-checked={x.version === choisie}
                onClick={() => setChoisie(x.version)}
                className={`inline-flex min-h-11 items-center rounded-full border px-3.5 text-[12.5px] transition-colors ${
                  x.version === choisie
                    ? "border-blue bg-blue font-extrabold text-white"
                    : "border-line bg-white font-semibold text-muted hover:border-muted"
                }`}
              >
                v{x.version}
                {x.version === note.versionCourante ? " · actuelle" : ""}
              </button>
            ))}
          </div>
        )}

        <p className="text-[12px] text-muted">
          {estCourante ? "Version en cours" : `Version ${v.version}, remplacée depuis`} · rédigée par vous le{" "}
          {dateHeure(v.creeLe)}
        </p>

        <dl className="grid gap-3.5">
          {blocs.map(([libelle, texte]) => (
            <div key={libelle}>
              <dt className="mb-1 text-[11.5px] font-extrabold uppercase tracking-[0.04em] text-muted">{libelle}</dt>
              <dd className={`m-0 whitespace-pre-wrap text-[13.5px] leading-relaxed ${texte ? "" : "text-muted"}`}>
                {texte || "—"}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Dialogue>
  );
}
