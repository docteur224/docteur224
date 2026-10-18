"use client";

import { useState } from "react";
import Dialogue from "@/components/site/Dialogue";
import Icone from "@/components/site/Icone";
import {
  enregistrerInfosMedicales,
  GROUPES_SANGUINS,
  type InfosMedicales as Infos,
} from "@/lib/pro";

/*
 * Le bloc médical de la fiche : groupe sanguin, allergies, antécédents,
 * traitements en cours.
 *
 * Ces quatre champs n'existaient nulle part en base avant la migration 0063,
 * alors que ce sont exactement ceux qu'on relit avant de prescrire. Les
 * allergies ont leur propre liste plutôt qu'une ligne de texte : énumérées
 * une par une, elles se repèrent d'un coup d'œil et se rappellent dans
 * l'aperçu d'ordonnance — noyées dans un paragraphe d'antécédents, elles se
 * ratent.
 *
 * L'écriture est réservée au médecin (la base le vérifie aussi) : un(e)
 * assistant(e) prépare la consultation, il/elle ne pose pas un groupe
 * sanguin.
 */

export default function InfosMedicales({
  infos,
  cle,
  modifiable,
  onEnregistre,
  onErreur,
}: {
  infos: Infos;
  /** « c-<uuid> », « p-<uuid> » ou « s-<uuid> ». */
  cle: string;
  modifiable: boolean;
  onEnregistre: (message: string) => void;
  onErreur: (message: string) => void;
}) {
  const [ouvert, setOuvert] = useState(false);

  return (
    <div className="mt-4 flex flex-col gap-2.5 border-t border-line pt-4 text-[13px]">
      <div className="flex items-center justify-between gap-2">
        <b className="flex items-center gap-1.5 font-extrabold">
          <Icone nom="pouls" taille={15} epaisseur={2.2} className="text-green" />
          Informations médicales
        </b>
        {modifiable && (
          <button
            type="button"
            onClick={() => setOuvert(true)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-[8px] border border-line px-2.5 text-[11.5px] font-bold text-ink transition-colors hover:border-muted"
          >
            <Icone nom="crayon" taille={13} />
            Modifier
          </button>
        )}
      </div>

      <div className="flex justify-between gap-3">
        <span className="text-muted">Groupe sanguin</span>
        <b className="font-bold">{infos.groupeSanguin || "—"}</b>
      </div>

      <div>
        <div className="mb-1.5 text-muted">Allergies</div>
        {infos.allergies.length === 0 ? (
          <span className="font-semibold text-muted">Aucune renseignée</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {infos.allergies.map((a) => (
              <span
                key={a}
                className="rounded-[7px] bg-red-soft px-2 py-0.5 text-[12px] font-semibold text-red"
              >
                {a}
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-1 text-muted">Antécédents</div>
        <div className="font-semibold">{infos.antecedents || "—"}</div>
      </div>

      <div>
        <div className="mb-1 text-muted">Traitements en cours</div>
        <div className="font-semibold">{infos.traitements || "—"}</div>
      </div>

      {ouvert && (
        <FormulaireInfos
          infos={infos}
          cle={cle}
          onFermer={() => setOuvert(false)}
          onEnregistre={(m) => {
            setOuvert(false);
            onEnregistre(m);
          }}
          onErreur={onErreur}
        />
      )}
    </div>
  );
}

const CHAMP =
  "mt-1.5 block w-full rounded-[10px] border border-line px-3 py-2.5 text-[13px] font-normal outline-none focus:border-teal";

function FormulaireInfos({
  infos,
  cle,
  onFermer,
  onEnregistre,
  onErreur,
}: {
  infos: Infos;
  cle: string;
  onFermer: () => void;
  onEnregistre: (message: string) => void;
  onErreur: (message: string) => void;
}) {
  const [groupe, setGroupe] = useState(infos.groupeSanguin ?? "");
  const [allergies, setAllergies] = useState<string[]>(infos.allergies);
  const [saisie, setSaisie] = useState("");
  const [antecedents, setAntecedents] = useState(infos.antecedents);
  const [traitements, setTraitements] = useState(infos.traitements);
  const [enCours, setEnCours] = useState(false);

  function ajouterAllergie() {
    const propre = saisie.trim();
    if (!propre) return;
    // Comparaison insensible à la casse : « Pénicilline » et « pénicilline »
    // sont la même allergie, et deux entrées pour une seule font douter.
    if (!allergies.some((a) => a.toLowerCase() === propre.toLowerCase())) {
      setAllergies([...allergies, propre]);
    }
    setSaisie("");
  }

  async function enregistrer() {
    if (enCours) return;
    setEnCours(true);
    const res = await enregistrerInfosMedicales(cle, {
      groupeSanguin: groupe || null,
      allergies,
      antecedents: antecedents.trim(),
      traitements: traitements.trim(),
      majLe: null,
    });
    setEnCours(false);
    if (res.erreur) {
      onErreur(res.erreur);
      return;
    }
    onEnregistre("Informations médicales enregistrées");
  }

  return (
    <Dialogue
      titre="Informations médicales"
      icone={<Icone nom="pouls" taille={18} />}
      sousTitre="Ce que vous relirez avant de prescrire"
      onFermer={onFermer}
      pied={
        <>
          <button
            type="button"
            onClick={onFermer}
            className="min-h-11 flex-1 rounded-[10px] border border-line bg-white px-4 text-[13px] font-bold text-ink transition-colors hover:border-muted md:flex-none"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={enregistrer}
            disabled={enCours}
            className="min-h-11 flex-1 rounded-[10px] bg-teal px-4 text-[13px] font-bold text-white transition-colors hover:bg-blue disabled:opacity-45 md:flex-none"
          >
            {enCours ? "Enregistrement…" : "Enregistrer"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4 p-4">
        <label className="block text-[13px] font-semibold">
          Groupe sanguin
          <select
            value={groupe}
            onChange={(e) => setGroupe(e.target.value)}
            className={`${CHAMP} min-h-11`}
          >
            <option value="">Non renseigné</option>
            {GROUPES_SANGUINS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>

        <div className="text-[13px] font-semibold">
          Allergies
          <div className="mt-1.5 flex gap-2">
            <input
              type="text"
              value={saisie}
              maxLength={80}
              placeholder="Pénicilline, arachides…"
              onChange={(e) => setSaisie(e.target.value)}
              onKeyDown={(e) => {
                // Entrée ajoute l'allergie et ne soumet rien : c'est le geste
                // qu'on fait d'instinct après avoir tapé le mot.
                if (e.key === "Enter") {
                  e.preventDefault();
                  ajouterAllergie();
                }
              }}
              className="min-h-11 flex-1 rounded-[10px] border border-line px-3 text-[13px] font-normal outline-none focus:border-teal"
            />
            <button
              type="button"
              onClick={ajouterAllergie}
              disabled={!saisie.trim()}
              className="min-h-11 flex-none rounded-[10px] border border-line bg-white px-3.5 text-[13px] font-bold text-ink transition-colors hover:border-muted disabled:opacity-45"
            >
              Ajouter
            </button>
          </div>
          {allergies.length > 0 && (
            <ul className="mt-2 flex list-none flex-wrap gap-1.5 p-0">
              {allergies.map((a) => (
                <li key={a}>
                  <button
                    type="button"
                    onClick={() => setAllergies(allergies.filter((x) => x !== a))}
                    aria-label={`Retirer l’allergie ${a}`}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-[8px] bg-red-soft px-2.5 text-[12.5px] font-semibold text-red transition-opacity hover:opacity-75"
                  >
                    {a}
                    <Icone nom="croix" taille={12} epaisseur={2.4} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <label className="block text-[13px] font-semibold">
          Antécédents
          <textarea
            value={antecedents}
            rows={3}
            maxLength={1000}
            placeholder="Hypertension · paludisme (2024)…"
            onChange={(e) => setAntecedents(e.target.value)}
            className={`${CHAMP} resize-y`}
          />
        </label>

        <label className="block text-[13px] font-semibold">
          Traitements en cours
          <textarea
            value={traitements}
            rows={3}
            maxLength={1000}
            placeholder="Amlodipine 5 mg · 1 par jour…"
            onChange={(e) => setTraitements(e.target.value)}
            className={`${CHAMP} resize-y`}
          />
        </label>
      </div>
    </Dialogue>
  );
}
