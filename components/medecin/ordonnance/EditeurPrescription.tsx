"use client";

import { useState } from "react";
import Icone from "@/components/site/Icone";
import { allergiesConcernees } from "@/lib/allergies";
import { enregistrerModele, supprimerModele, useModelesOrdonnance } from "@/lib/medicaments";
import { LIGNE_VIDE, ligneRemplie, type LignePrescription } from "@/lib/prescription";
import RechercheMedicament from "./RechercheMedicament";

/*
 * Ordonnance structurée : une ligne par médicament (produit, posologie,
 * durée, quantité), des modèles réutilisables, et l'alerte allergie.
 *
 * L'alerte ne bloque pas — un médecin peut avoir de bonnes raisons de
 * prescrire malgré une allergie déclarée (allergie douteuse, désensibilisation)
 * — mais elle exige une confirmation EXPLICITE, case cochée, avant l'envoi.
 * Une alerte qu'on peut ignorer sans geste finit par ne plus être lue.
 */

const SUGGESTIONS_POSOLOGIE = [
  "1 comprimé le matin",
  "1 comprimé matin et soir",
  "1 comprimé 3 fois par jour",
  "1 gélule 3 fois par jour",
  "1 comprimé si douleur ou fièvre, 4 par jour au maximum",
  "1 cuillère-mesure 3 fois par jour",
  "2 bouffées si gêne respiratoire",
  "1 application matin et soir",
];
const SUGGESTIONS_DUREE = ["3 jours", "5 jours", "7 jours", "10 jours", "14 jours", "1 mois", "3 mois"];

const CHAMP =
  "w-full rounded-[11px] border border-line bg-white px-[13px] py-2.5 text-[13.5px] outline-none focus:border-teal pointer-coarse:min-h-11";
const PETIT_BTN =
  "inline-flex min-h-9 items-center gap-1 rounded-lg px-2.5 text-[12px] font-bold transition-colors pointer-coarse:min-h-11";

export default function EditeurPrescription({
  lignes,
  onLignes,
  remarques,
  onRemarques,
  allergies,
  confirmationAllergie,
  onConfirmationAllergie,
}: {
  lignes: LignePrescription[];
  onLignes: (lignes: LignePrescription[]) => void;
  remarques: string;
  onRemarques: (texte: string) => void;
  /** Allergies déclarées du patient (infos médicales). */
  allergies: string[];
  confirmationAllergie: boolean;
  onConfirmationAllergie: (ok: boolean) => void;
}) {
  const [revisionModeles, setRevisionModeles] = useState(0);
  const { modeles } = useModelesOrdonnance(revisionModeles);
  const [modeleCourant, setModeleCourant] = useState<string>("");
  const [nomModele, setNomModele] = useState<string | null>(null);
  const [infoModele, setInfoModele] = useState<{ texte: string; erreur?: boolean } | null>(null);

  const alertes = lignes.map((l) => (ligneRemplie(l) ? allergiesConcernees(l, allergies) : []));
  const nbAlertes = alertes.filter((a) => a.length).length;

  const modifier = (i: number, champs: Partial<LignePrescription>) =>
    onLignes(lignes.map((l, j) => (j === i ? { ...l, ...champs } : l)));
  const retirer = (i: number) => {
    const reste = lignes.filter((_, j) => j !== i);
    onLignes(reste.length ? reste : [{ ...LIGNE_VIDE }]);
  };

  async function sauverModele() {
    if (nomModele === null) return;
    const existant = modeles.find((m) => m.nom.toLowerCase() === nomModele.trim().toLowerCase());
    const res = await enregistrerModele(nomModele, lignes.filter(ligneRemplie), remarques, existant?.id);
    if (res.erreur) {
      setInfoModele({ texte: res.erreur, erreur: true });
      return;
    }
    setInfoModele({ texte: existant ? `Modèle « ${nomModele.trim()} » mis à jour` : `Modèle « ${nomModele.trim()} » enregistré` });
    setNomModele(null);
    setRevisionModeles((r) => r + 1);
  }

  return (
    <div className="grid gap-3">
      {/* ---- Allergies déclarées : toujours sous les yeux ---- */}
      <p
        className={`flex flex-wrap items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] ${
          allergies.length ? "bg-amber-soft text-ink" : "bg-bg text-muted"
        }`}
      >
        <Icone nom="alerte" taille={13} className={allergies.length ? "text-amber" : ""} />
        {allergies.length ? (
          <>
            <b>Allergies déclarées :</b> {allergies.join(", ")}
          </>
        ) : (
          "Aucune allergie renseignée dans le dossier."
        )}
      </p>

      {/* ---- Modèles ---- */}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="modele-ordonnance" className="sr-only">
          Charger un modèle d’ordonnance
        </label>
        <select
          id="modele-ordonnance"
          value={modeleCourant}
          onChange={(e) => {
            const m = modeles.find((x) => x.id === e.target.value);
            setModeleCourant(e.target.value);
            if (m) {
              onLignes(m.lignes.length ? m.lignes.map((l) => ({ ...LIGNE_VIDE, ...l })) : [{ ...LIGNE_VIDE }]);
              onRemarques(m.remarques);
              onConfirmationAllergie(false);
              setInfoModele({ texte: `Modèle « ${m.nom} » chargé — vérifiez les posologies pour ce patient` });
            }
          }}
          className={`${CHAMP} w-auto min-w-[200px] flex-1`}
        >
          <option value="">{modeles.length ? "Charger un modèle…" : "Aucun modèle enregistré"}</option>
          {modeles.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nom} ({m.lignes.length} médicament{m.lignes.length > 1 ? "s" : ""})
            </option>
          ))}
        </select>
        {nomModele === null ? (
          <button
            type="button"
            onClick={() => setNomModele(modeles.find((m) => m.id === modeleCourant)?.nom ?? "")}
            disabled={!lignes.some(ligneRemplie)}
            className={`${PETIT_BTN} border border-line bg-white text-blue hover:bg-bg disabled:opacity-45`}
          >
            Enregistrer comme modèle
          </button>
        ) : (
          <span className="flex flex-1 flex-wrap items-center gap-2">
            <label htmlFor="nom-modele" className="sr-only">
              Nom du modèle
            </label>
            <input
              id="nom-modele"
              autoFocus
              placeholder="Nom : Angine de l’adulte…"
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
      <ol className="grid gap-2.5">
        {lignes.map((l, i) => (
          <li key={i} className={`rounded-xl border p-3 ${alertes[i]?.length ? "border-[#F4C9C9] bg-red-soft/40" : "border-line"}`}>
            <div className="mb-2 flex items-center gap-2">
              <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-teal-soft text-[11.5px] font-extrabold text-blue">
                {i + 1}
              </span>
              {ligneRemplie(l) ? (
                <b className="min-w-0 flex-1 text-[13.5px] font-extrabold">{l.libelle}</b>
              ) : (
                <div className="min-w-0 flex-1">
                  <label htmlFor={`med-${i}`} className="sr-only">
                    Médicament {i + 1}
                  </label>
                  <RechercheMedicament
                    idChamp={`med-${i}`}
                    autoFocus={i > 0}
                    onChoisir={(c) => {
                      modifier(i, { ...c });
                      // La confirmation ne vaut que pour les alertes qu'on a
                      // vues : un NOUVEAU médicament en alerte la redemande ;
                      // un médicament sans alerte ne la retire pas.
                      if (allergiesConcernees(c, allergies).length) onConfirmationAllergie(false);
                    }}
                  />
                </div>
              )}
              {ligneRemplie(l) && (
                <button
                  type="button"
                  onClick={() => modifier(i, { medicamentId: null, libelle: "", dci: null, classe: null })}
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
            </div>

            {alertes[i]?.length > 0 && (
              <p role="alert" className="mb-2 flex items-start gap-1.5 rounded-lg bg-red-soft px-2.5 py-2 text-[12px] font-semibold text-red">
                <Icone nom="alerte" taille={14} className="mt-px flex-none" />
                <span>
                  Allergie déclarée :{" "}
                  {alertes[i].map((a) => `${a.allergie} (${a.raison})`).join(" ; ")}
                </span>
              </p>
            )}

            <div className="grid gap-2 sm:grid-cols-[1.6fr_0.9fr_0.9fr]">
              <div>
                <label htmlFor={`poso-${i}`} className="mb-1 block text-[11.5px] font-bold text-muted">
                  Posologie *
                </label>
                <input
                  id={`poso-${i}`}
                  list="suggestions-posologie"
                  value={l.posologie}
                  onChange={(e) => modifier(i, { posologie: e.target.value })}
                  placeholder="1 comprimé matin et soir"
                  className={CHAMP}
                />
              </div>
              <div>
                <label htmlFor={`duree-${i}`} className="mb-1 block text-[11.5px] font-bold text-muted">
                  Durée
                </label>
                <input
                  id={`duree-${i}`}
                  list="suggestions-duree"
                  value={l.duree}
                  onChange={(e) => modifier(i, { duree: e.target.value })}
                  placeholder="7 jours"
                  className={CHAMP}
                />
              </div>
              <div>
                <label htmlFor={`qte-${i}`} className="mb-1 block text-[11.5px] font-bold text-muted">
                  Quantité
                </label>
                <input
                  id={`qte-${i}`}
                  value={l.quantite}
                  onChange={(e) => modifier(i, { quantite: e.target.value })}
                  placeholder="2 boîtes"
                  className={CHAMP}
                />
              </div>
            </div>
          </li>
        ))}
      </ol>
      <datalist id="suggestions-posologie">
        {SUGGESTIONS_POSOLOGIE.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <datalist id="suggestions-duree">
        {SUGGESTIONS_DUREE.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <button
        type="button"
        onClick={() => onLignes([...lignes, { ...LIGNE_VIDE }])}
        disabled={!ligneRemplie(lignes[lignes.length - 1] ?? LIGNE_VIDE)}
        className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-[#BFD3F6] bg-white px-3.5 text-[12.5px] font-bold text-blue transition-colors hover:bg-teal-soft disabled:opacity-45"
      >
        <Icone nom="plus" taille={14} epaisseur={2.4} />
        Ajouter un médicament
      </button>

      <div>
        <label htmlFor="ordo-remarques" className="mb-1 block text-[12.5px] font-bold">
          Remarques <span className="font-semibold text-muted">(facultatif, imprimé en bas de l’ordonnance)</span>
        </label>
        <textarea
          id="ordo-remarques"
          rows={2}
          value={remarques}
          maxLength={1000}
          onChange={(e) => onRemarques(e.target.value)}
          placeholder="Revoir si la fièvre persiste au-delà de 48 h."
          className={`${CHAMP} resize-y`}
        />
      </div>

      {nbAlertes > 0 && (
        <label className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xl border border-[#F4C9C9] bg-white px-3 py-2.5 text-[12.5px] font-semibold text-red">
          <input
            type="checkbox"
            checked={confirmationAllergie}
            onChange={(e) => onConfirmationAllergie(e.target.checked)}
            className="mt-0.5 h-4 w-4 flex-none accent-[#C0392B]"
          />
          Je maintiens cette prescription en connaissance de l’allergie déclarée.
        </label>
      )}
      <p className="text-[11px] leading-relaxed text-muted">
        Alerte allergie : comparaison avec la molécule et sa classe, pour les médicaments de la base. Une aide, pas une
        garantie — une allergie mal orthographiée ou un produit saisi hors base peut passer.
      </p>
    </div>
  );
}

/** Nombre de lignes en alerte, pour bloquer l'envoi sans confirmation. */
export function compterAlertes(lignes: LignePrescription[], allergies: string[]): number {
  return lignes.filter((l) => ligneRemplie(l) && allergiesConcernees(l, allergies).length > 0).length;
}
