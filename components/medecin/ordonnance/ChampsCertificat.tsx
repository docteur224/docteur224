"use client";

import { useState } from "react";
import {
  joursArret,
  MODELES,
  remplirModele,
  type CleModele,
  type ContexteModele,
} from "@/lib/modeles-certificats";

/*
 * Certificats médicaux et arrêts de travail : le modèle choisi pré-remplit
 * le titre et le texte avec l'identité du patient et du médecin.
 *
 * Le texte reste modifiable dessous : changer un champ ici le RÉÉCRIT (le
 * modèle repart de zéro), modifier le texte lui-même ne touche à rien ici.
 */

export type BaseModele = Omit<ContexteModele, "aujourdhui">;

const aujourdhui = () => new Date().toISOString().slice(0, 10);
const plusJours = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

interface Champs {
  cle: CleModele;
  sport: string;
  competition: boolean;
  debut: string;
  fin: string;
  sortiesAutorisees: boolean;
  prolongation: boolean;
}

export function champsInitiaux(type: "certificat" | "arret_travail"): Champs {
  const j = aujourdhui();
  return {
    cle: type === "arret_travail" ? "arret" : "constatation",
    sport: "",
    competition: false,
    debut: j,
    fin: plusJours(j, 2),
    sortiesAutorisees: true,
    prolongation: false,
  };
}

/** Titre et texte du modèle pour ces champs. */
export function texteModele(base: BaseModele, c: Champs) {
  return remplirModele(c.cle, { ...base, ...c, aujourdhui: aujourdhui() });
}

const CHAMP =
  "w-full rounded-[11px] border border-line bg-white px-[13px] py-2.5 text-[13.5px] outline-none focus:border-teal pointer-coarse:min-h-11";
const ETIQUETTE = "mb-1.5 block text-[12.5px] font-bold";

export default function ChampsCertificat({
  type,
  base,
  onRemplir,
}: {
  type: "certificat" | "arret_travail";
  base: BaseModele;
  onRemplir: (r: { titre: string; texte: string }) => void;
}) {
  const [champs, setChamps] = useState<Champs>(() => champsInitiaux(type));
  const modeles = MODELES.filter((m) => m.type === type);

  function changer(partiel: Partial<Champs>) {
    const suivant = { ...champs, ...partiel };
    setChamps(suivant);
    onRemplir(texteModele(base, suivant));
  }

  const jours = joursArret(champs.debut, champs.fin);

  return (
    <div className="mb-3 grid gap-3 rounded-xl bg-bg p-3">
      {modeles.length > 1 && (
        <div>
          <label htmlFor="cert-modele" className={ETIQUETTE}>
            Modèle
          </label>
          <select
            id="cert-modele"
            value={champs.cle}
            onChange={(e) => changer({ cle: e.target.value as CleModele })}
            className={CHAMP}
          >
            {modeles.map((m) => (
              <option key={m.cle} value={m.cle}>
                {m.libelle}
              </option>
            ))}
          </select>
        </div>
      )}

      {champs.cle === "sport" && (
        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label htmlFor="cert-sport" className={ETIQUETTE}>
              Sport
            </label>
            <input
              id="cert-sport"
              value={champs.sport}
              onChange={(e) => changer({ sport: e.target.value })}
              placeholder="football, athlétisme…"
              className={CHAMP}
            />
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[12.5px] font-semibold">
            <input
              type="checkbox"
              checked={champs.competition}
              onChange={(e) => changer({ competition: e.target.checked })}
              className="h-4 w-4 accent-teal"
            />
            En compétition
          </label>
        </div>
      )}

      {champs.cle === "arret" && (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label htmlFor="arret-debut" className={ETIQUETTE}>
                Du
              </label>
              <input id="arret-debut" type="date" value={champs.debut} onChange={(e) => changer({ debut: e.target.value })} className={CHAMP} />
            </div>
            <div>
              <label htmlFor="arret-fin" className={ETIQUETTE}>
                Au (inclus)
              </label>
              <input
                id="arret-fin"
                type="date"
                min={champs.debut}
                value={champs.fin}
                onChange={(e) => changer({ fin: e.target.value })}
                className={CHAMP}
              />
            </div>
          </div>
          <p className={`text-[12.5px] font-bold ${jours ? "text-ink" : "text-red"}`}>
            {jours ? `${jours} jour${jours > 1 ? "s" : ""} d’arrêt` : "La date de fin précède la date de début."}
          </p>
          <div className="flex flex-wrap gap-x-5">
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[12.5px] font-semibold">
              <input
                type="checkbox"
                checked={champs.sortiesAutorisees}
                onChange={(e) => changer({ sortiesAutorisees: e.target.checked })}
                className="h-4 w-4 accent-teal"
              />
              Sorties autorisées
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[12.5px] font-semibold">
              <input
                type="checkbox"
                checked={champs.prolongation}
                onChange={(e) => changer({ prolongation: e.target.checked })}
                className="h-4 w-4 accent-teal"
              />
              Prolongation
            </label>
          </div>
          <p className="text-[11.5px] text-muted">L’arrêt de travail ne mentionne aucun diagnostic : il est destiné à l’employeur.</p>
        </>
      )}

      <p className="text-[11.5px] text-muted">
        Texte pré-rempli ci-dessous, à relire et compléter. Changer un champ ici réécrit le texte.
      </p>
    </div>
  );
}
