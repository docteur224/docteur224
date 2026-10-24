"use client";

import { useState } from "react";
import Icone, { type NomIcone } from "@/components/site/Icone";
import { titreDocument } from "@/lib/documents";
import {
  useChronologie,
  type Beneficiaire,
  type Evenement,
  type TypeEvenement,
} from "@/lib/dossier-clinique";
import { LIBELLES_CONTEXTE, nombreFr, type ContexteGlycemie } from "@/lib/normes-constantes";
import { classeStatut, libelleStatut, statutAffiche } from "@/lib/statuts-rdv";
import { BTN_NEUTRE, CARTE, COMPTE, EtatVide, Squelettes, TITRE_SECTION } from "../ui";
import { dateHeure } from "./commun";

/*
 * Chronologie : tout ce qui s'est passé pour ce patient avec vous, du plus
 * récent au plus ancien — rendez-vous, documents, notes, constantes — en une
 * requête (chronologie_patient, migration 0064), filtrable par type.
 */

const FILTRES: { valeur: TypeEvenement | null; libelle: string }[] = [
  { valeur: null, libelle: "Tout" },
  { valeur: "rdv", libelle: "Rendez-vous" },
  { valeur: "document", libelle: "Documents" },
  { valeur: "note", libelle: "Notes" },
  { valeur: "constante", libelle: "Constantes" },
];

const APPARENCE: Record<TypeEvenement, { icone: NomIcone; teinte: string; nom: string }> = {
  rdv: { icone: "calendrier", teinte: "bg-teal-soft text-blue", nom: "Rendez-vous" },
  document: { icone: "document", teinte: "bg-green-soft text-green", nom: "Document" },
  note: { icone: "presse_papiers", teinte: "bg-[#ECE9FB] text-[#4B3BB8]", nom: "Note" },
  constante: { icone: "pouls", teinte: "bg-amber-soft text-amber", nom: "Constantes" },
};

function Contenu({ e }: { e: Evenement }) {
  const x = e.extra;
  if (e.type === "rdv") {
    const etat = statutAffiche({ date: String(x.date), heure: String(x.heure), statut: String(x.statut) });
    return (
      <>
        <b className="text-[13.5px] font-extrabold">{e.titre}</b>
        <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-bold ${classeStatut(etat)}`}>
          {libelleStatut(etat)}
        </span>
      </>
    );
  }
  if (e.type === "document") {
    const origine = x.origine === "patient" ? "reçu du patient" : x.mien ? "remis par vous" : "partagé";
    return (
      <>
        <b className={`text-[13.5px] font-extrabold ${x.annule ? "text-muted line-through" : ""}`}>
          {titreDocument({ type: String(x.type), titre: e.titre, creeLe: e.quand })}
        </b>
        <div className="text-[12px] text-muted">
          {origine}
          {Number(x.version) > 1 ? ` · version ${x.version}` : ""}
          {x.annule ? " · annulé" : ""}
        </div>
      </>
    );
  }
  if (e.type === "note") {
    return (
      <>
        <b className="text-[13.5px] font-extrabold">{e.titre}</b>
        <div className="text-[12px] text-muted">
          {Number(x.version) > 1 ? `Note modifiée (version ${x.version})` : "Note rédigée"}
          {e.detail ? ` · ${e.detail}` : ""}
        </div>
      </>
    );
  }
  const parts = [
    x.poids !== null && x.poids !== undefined ? `${nombreFr(Number(x.poids))} kg` : null,
    x.sys ? `TA ${x.sys}/${x.dia} mmHg` : null,
    x.glycemie !== null && x.glycemie !== undefined
      ? `Glycémie ${nombreFr(Number(x.glycemie), 2)} g/L ${LIBELLES_CONTEXTE[x.contexte as ContexteGlycemie] ?? ""}`
      : null,
  ].filter(Boolean);
  return (
    <>
      <b className={`text-[13.5px] font-extrabold ${x.erronee ? "text-muted line-through" : ""}`}>{parts.join(" · ")}</b>
      {x.erronee ? <div className="text-[12px] text-muted">Mesure marquée erronée</div> : null}
    </>
  );
}

export default function SectionChronologie({
  beneficiaire,
  revision,
  onOuvrirNote,
}: {
  beneficiaire: Beneficiaire;
  revision: number;
  onOuvrirNote: (noteId: string) => void;
}) {
  const [filtre, setFiltre] = useState<TypeEvenement | null>(null);
  const [pages, setPages] = useState(1);
  const { evenements, total, chargement, enCours } = useChronologie(
    beneficiaire,
    filtre ? [filtre] : null,
    pages,
    revision
  );

  return (
    <section className={CARTE} aria-labelledby="titre-chronologie">
      <h3 id="titre-chronologie" className={`${TITRE_SECTION} mb-3`}>
        Chronologie <span className={COMPTE}>({total})</span>
      </h3>

      <div role="radiogroup" aria-label="Type d’événement" className="mb-4 flex flex-wrap gap-1.5">
        {FILTRES.map((f) => (
          <button
            key={f.libelle}
            type="button"
            role="radio"
            aria-checked={filtre === f.valeur}
            onClick={() => {
              setFiltre(f.valeur);
              setPages(1);
            }}
            className={`min-h-9 rounded-full border px-3.5 text-[12.5px] transition-colors pointer-coarse:min-h-11 ${
              filtre === f.valeur ? "border-blue bg-blue font-bold text-white" : "border-line bg-white font-semibold text-muted hover:border-muted"
            }`}
          >
            {f.libelle}
          </button>
        ))}
      </div>

      {chargement ? (
        <Squelettes n={3} hauteur={52} />
      ) : evenements.length === 0 ? (
        <EtatVide icone="historique" titre="Rien à afficher" texte="Aucun événement de ce type pour ce patient." />
      ) : (
        // Garde la liste affichée pendant un « Voir plus » ou un changement de
        // filtre, estompée : pas de saut de mise en page.
        <ol className={`relative grid gap-0 transition-opacity ${enCours ? "opacity-60" : ""}`}>
          {evenements.map((e, i) => {
            const a = APPARENCE[e.type];
            const cliquable = e.type === "note";
            const corps = (
              <>
                <span className={`relative z-[1] grid h-8 w-8 flex-none place-items-center rounded-full ${a.teinte}`}>
                  <Icone nom={a.icone} taille={15} />
                </span>
                <div className="min-w-0 flex-1 pb-4 text-left">
                  <div className="text-[11.5px] font-semibold text-muted">
                    {a.nom} · {dateHeure(e.quand)}
                  </div>
                  <Contenu e={e} />
                </div>
              </>
            );
            return (
              <li key={`${e.type}-${e.refId}-${e.quand}`} className="relative">
                {/* Fil vertical qui relie les événements. */}
                {i < evenements.length - 1 && <span aria-hidden className="absolute bottom-0 left-4 top-8 w-px bg-line" />}
                {cliquable ? (
                  <button
                    type="button"
                    onClick={() => onOuvrirNote(e.refId)}
                    className="flex w-full items-start gap-3 rounded-xl text-left transition-colors hover:bg-bg"
                  >
                    {corps}
                  </button>
                ) : (
                  <div className="flex items-start gap-3">{corps}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {!chargement && evenements.length < total && (
        <button type="button" onClick={() => setPages((p) => p + 1)} disabled={enCours} className={`${BTN_NEUTRE} mt-1`}>
          {enCours ? "Chargement…" : `Voir plus · ${total - evenements.length} restant${total - evenements.length > 1 ? "s" : ""}`}
        </button>
      )}
    </section>
  );
}
