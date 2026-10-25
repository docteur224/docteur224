"use client";

import { useState } from "react";
import Icone from "@/components/site/Icone";
import { enregistrerModele, supprimerModele, useModelesOrdonnance } from "@/lib/modeles-ordonnance";
import {
  LIGNE_ACTE_VIDE,
  ligneActeRemplie,
  optionsEnBase,
  type DomaineActe,
  type LigneActe,
  type OptionsActes,
} from "@/lib/prescription-actes";
import RechercheActe from "./RechercheActe";

/*
 * Ordonnance d'actes : une ligne par analyse ou par examen, des modèles
 * réutilisables, et le contexte clinique dit UNE FOIS en bas.
 *
 * Pas de posologie, pas de durée, pas d'alerte allergie : on ne prescrit
 * pas une NFS « deux fois par jour pendant sept jours ». L'éditeur des
 * médicaments reste à côté, avec ses champs à lui.
 *
 * « Urgent » et « à jeun » portent sur l'ordonnance entière et sont rangées
 * à part des lignes, pour survivre à une correction.
 */

const CHAMP =
  "w-full rounded-[11px] border border-line bg-white px-[13px] py-2.5 text-[13.5px] outline-none focus:border-teal pointer-coarse:min-h-11";
const PETIT_BTN =
  "inline-flex min-h-9 items-center gap-1 rounded-lg px-2.5 text-[12px] font-bold transition-colors pointer-coarse:min-h-11";

export default function EditeurActes({
  domaine,
  lignes,
  onLignes,
  options,
  onOptions,
}: {
  domaine: DomaineActe;
  lignes: LigneActe[];
  onLignes: (lignes: LigneActe[]) => void;
  /** Renseignements cliniques, « à jeun », « urgent » : tout ce qui porte
      sur l'ordonnance entière plutôt que sur une ligne. */
  options: OptionsActes;
  onOptions: (options: OptionsActes) => void;
}) {
  const [revisionModeles, setRevisionModeles] = useState(0);
  const { modeles } = useModelesOrdonnance<LigneActe>(domaine, revisionModeles);
  const [modeleCourant, setModeleCourant] = useState<string>("");
  const [nomModele, setNomModele] = useState<string | null>(null);
  const [infoModele, setInfoModele] = useState<{ texte: string; erreur?: boolean } | null>(null);

  const modifier = (i: number, champs: Partial<LigneActe>) =>
    onLignes(lignes.map((l, j) => (j === i ? { ...l, ...champs } : l)));
  const retirer = (i: number) => {
    const reste = lignes.filter((_, j) => j !== i);
    onLignes(reste.length ? reste : [{ ...LIGNE_ACTE_VIDE }]);
  };

  async function sauverModele() {
    if (nomModele === null) return;
    const existant = modeles.find((m) => m.nom.toLowerCase() === nomModele.trim().toLowerCase());
    // `remarques` reste vide : pour une ordonnance d'actes, les
    // renseignements cliniques voyagent dans `options`, avec le reste de ce
    // qui porte sur l'ordonnance entière.
    const res = await enregistrerModele(
      domaine,
      nomModele,
      lignes.filter(ligneActeRemplie),
      "",
      existant?.id,
      optionsEnBase(options)
    );
    if (res.erreur) {
      setInfoModele({ texte: res.erreur, erreur: true });
      return;
    }
    setInfoModele({
      texte: existant ? `Modèle « ${nomModele.trim()} » mis à jour` : `Modèle « ${nomModele.trim()} » enregistré`,
    });
    setNomModele(null);
    setRevisionModeles((r) => r + 1);
  }

  const nomActe = domaine === "biologie" ? "analyse" : "examen";

  return (
    <div className="grid gap-3">
      {/* ---- Modèles ---- */}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="modele-actes" className="sr-only">
          Charger un modèle
        </label>
        <select
          id="modele-actes"
          value={modeleCourant}
          onChange={(e) => {
            const m = modeles.find((x) => x.id === e.target.value);
            setModeleCourant(e.target.value);
            if (m) {
              onLignes(m.lignes.length ? m.lignes.map((l) => ({ ...LIGNE_ACTE_VIDE, ...l })) : [{ ...LIGNE_ACTE_VIDE }]);
              onOptions(m.options ?? {});
              setInfoModele({ texte: `Modèle « ${m.nom} » chargé` });
            }
          }}
          className={`${CHAMP} w-auto min-w-[200px] flex-1`}
        >
          <option value="">{modeles.length ? "Charger un modèle…" : "Aucun modèle enregistré"}</option>
          {modeles.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nom} ({m.lignes.length} {nomActe}
              {m.lignes.length > 1 ? "s" : ""})
            </option>
          ))}
        </select>
        {nomModele === null ? (
          <button
            type="button"
            onClick={() => setNomModele(modeles.find((m) => m.id === modeleCourant)?.nom ?? "")}
            disabled={!lignes.some(ligneActeRemplie)}
            className={`${PETIT_BTN} border border-line bg-white text-blue hover:bg-bg disabled:opacity-45`}
          >
            Enregistrer comme modèle
          </button>
        ) : (
          <span className="flex flex-1 flex-wrap items-center gap-2">
            <label htmlFor="nom-modele-actes" className="sr-only">
              Nom du modèle
            </label>
            <input
              id="nom-modele-actes"
              autoFocus
              placeholder={domaine === "biologie" ? "Nom : Bilan préopératoire…" : "Nom : Bilan traumatologique…"}
              value={nomModele}
              maxLength={80}
              onChange={(e) => setNomModele(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  sauverModele();
                }
              }}
              className={`${CHAMP} min-w-[180px] flex-1`}
            />
            <button type="button" onClick={sauverModele} className={`${PETIT_BTN} bg-teal text-white hover:bg-blue`}>
              Enregistrer
            </button>
            <button type="button" onClick={() => setNomModele(null)} className={`${PETIT_BTN} text-muted hover:bg-bg`}>
              Annuler
            </button>
          </span>
        )}
        {modeleCourant && nomModele === null && (
          <button
            type="button"
            onClick={async () => {
              const m = modeles.find((x) => x.id === modeleCourant);
              const res = await supprimerModele(modeleCourant);
              setInfoModele(res.erreur ? { texte: res.erreur, erreur: true } : { texte: `Modèle « ${m?.nom} » supprimé` });
              setModeleCourant("");
              setRevisionModeles((r) => r + 1);
            }}
            className={`${PETIT_BTN} text-muted hover:bg-red-soft hover:text-red`}
          >
            Supprimer ce modèle
          </button>
        )}
      </div>
      {infoModele && (
        <p role="status" className={`text-[12px] font-semibold ${infoModele.erreur ? "text-red" : "text-green"}`}>
          {infoModele.texte}
        </p>
      )}

      {/* ---- Lignes ---- */}
      <ol className="grid gap-2">
        {lignes.map((l, i) => (
          <li key={i} className="flex items-center gap-2 rounded-xl border border-line p-2.5">
            <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-teal-soft text-[11.5px] font-extrabold text-blue">
              {i + 1}
            </span>
            {ligneActeRemplie(l) ? (
              <b className="min-w-0 flex-1 truncate text-[13.5px] font-extrabold">{l.libelle}</b>
            ) : (
              <div className="min-w-0 flex-1">
                <label htmlFor={`acte-${i}`} className="sr-only">
                  {nomActe} {i + 1}
                </label>
                <RechercheActe
                  idChamp={`acte-${i}`}
                  domaine={domaine}
                  autoFocus={i > 0}
                  onChoisir={(c) => modifier(i, c)}
                />
              </div>
            )}
            {ligneActeRemplie(l) && (
              <button
                type="button"
                onClick={() => modifier(i, { acteId: null, libelle: "" })}
                className={`${PETIT_BTN} text-blue hover:bg-bg`}
              >
                Changer
              </button>
            )}
            <button
              type="button"
              onClick={() => retirer(i)}
              aria-label={`Retirer la ligne ${i + 1}`}
              className={`${PETIT_BTN} text-muted hover:bg-red-soft hover:text-red`}
            >
              <Icone nom="croix" taille={14} />
            </button>
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={() => onLignes([...lignes, { ...LIGNE_ACTE_VIDE }])}
        disabled={!ligneActeRemplie(lignes[lignes.length - 1] ?? LIGNE_ACTE_VIDE)}
        className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-blue-line bg-white px-3.5 text-[12.5px] font-bold text-blue transition-colors hover:bg-teal-soft disabled:opacity-45"
      >
        <Icone nom="plus" taille={14} epaisseur={2.4} />
        Ajouter {domaine === "biologie" ? "une analyse" : "un examen"}
      </button>

      {/* ---- Renseignements cliniques ---- */}
      <div>
        {/* Obligatoires en imagerie : c'est l'indication qui décide des
            incidences et de l'injection. Facultatifs en biologie, où
            l'analyse demandée se suffit le plus souvent à elle-même. */}
        <label htmlFor="actes-renseignements" className="mb-1 block text-[12.5px] font-bold">
          Renseignements cliniques{domaine === "imagerie" ? " *" : ""}{" "}
          <span className="font-semibold text-muted">
            {domaine === "imagerie"
              ? "(le radiologue en tire le protocole de l’examen)"
              : "(facultatif, imprimé sur l’ordonnance — ce qui aide à interpréter)"}
          </span>
        </label>
        <textarea
          id="actes-renseignements"
          rows={2}
          value={options.renseignements ?? ""}
          maxLength={1000}
          onChange={(e) => onOptions({ ...options, renseignements: e.target.value })}
          placeholder={
            domaine === "imagerie"
              ? "Traumatisme du genou droit, suspicion de lésion méniscale."
              : "Asthénie depuis 3 semaines, suspicion d’anémie."
          }
          className={`${CHAMP} resize-y`}
        />
      </div>

      {/* ---- Options ---- */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["jeun", domaine === "biologie" ? "Prélèvement à jeun" : "Patient à jeun"],
            ["urgent", "Urgent"],
          ] as ["jeun" | "urgent", string][]
        ).map(([cle, libelle]) => (
          <label
            key={cle}
            className={`flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-xl border px-3 text-[12.5px] font-bold transition-colors ${
              options[cle] ? "border-teal bg-teal-soft text-blue" : "border-line bg-white text-muted hover:bg-bg"
            }`}
          >
            <input
              type="checkbox"
              checked={!!options[cle]}
              onChange={(e) => onOptions({ ...options, [cle]: e.target.checked })}
              className="h-4 w-4 flex-none accent-teal"
            />
            {libelle}
          </label>
        ))}
      </div>
      <p className="text-[11px] leading-relaxed text-muted">
        Ces mentions sont imprimées <b>en tête</b> de l’ordonnance : « urgent » s’adresse au laboratoire, « à jeun » au
        patient.
      </p>
    </div>
  );
}
