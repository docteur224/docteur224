"use client";

import { ORDRE_SEMAINE, JOURS_NOMS, type PlageHoraire } from "@/lib/horaires";
import type { PlageHebdo } from "@/lib/inscription-pro";

/*
 * Éditeur des horaires type de la semaine (un interrupteur par jour, une
 * plage début/fin).
 *
 * Partagé par l'étape « Horaires » du parcours d'inscription et par
 * /espace-medecin/profil : le médecin doit pouvoir corriger après coup ce
 * qu'il a saisi à l'inscription, or l'écran « Mes disponibilités » ne gère
 * que les exceptions ponctuelles, jamais la grille hebdomadaire.
 *
 * L'état est tenu par l'appelant : l'un enchaîne sur l'étape suivante,
 * l'autre enregistre en continu, et ce composant n'a pas à connaître la
 * différence.
 */

export interface JourEdition {
  ouvert: boolean;
  debut: string;
  fin: string;
}

export const JOURS_EDITEUR = ORDRE_SEMAINE.map((jour) => ({ jour, nom: JOURS_NOMS[jour] }));

/** Gabarit de départ : lundi–vendredi 08:00–17:00. */
export const JOURS_DEFAUT: Record<number, JourEdition> = Object.fromEntries(
  ORDRE_SEMAINE.map((jour) => [
    jour,
    { ouvert: jour >= 1 && jour <= 5, debut: "08:00", fin: "17:00" },
  ])
);

const TOUS_FERMES: Record<number, JourEdition> = Object.fromEntries(
  ORDRE_SEMAINE.map((jour) => [jour, { ouvert: false, debut: "08:00", fin: "17:00" }])
);

/** Convertit les lignes de `horaires_types` en état d'édition. */
export function depuisPlages(plages: PlageHoraire[]): Record<number, JourEdition> {
  const repris: Record<number, JourEdition> = { ...TOUS_FERMES };
  for (const p of plages) {
    repris[p.jour_semaine] = {
      ouvert: true,
      debut: p.heure_debut.slice(0, 5),
      fin: p.heure_fin.slice(0, 5),
    };
  }
  return repris;
}

/** Inverse de `depuisPlages`, prêt pour `enregistrerHorairesHebdo`. */
export function versPlages(jours: Record<number, JourEdition>): PlageHebdo[] {
  return JOURS_EDITEUR.filter(({ jour }) => jours[jour]?.ouvert).map(({ jour }) => ({
    jour,
    debut: jours[jour].debut,
    fin: jours[jour].fin,
  }));
}

/** Première incohérence trouvée, ou null. */
export function premiereErreurHoraires(jours: Record<number, JourEdition>): string | null {
  const ouverts = JOURS_EDITEUR.filter(({ jour }) => jours[jour]?.ouvert);
  if (ouverts.length === 0) return "Ouvrez au moins un jour de consultation.";
  for (const { jour, nom } of ouverts) {
    if (jours[jour].debut >= jours[jour].fin)
      return `${nom} : l’heure de fin doit être après l’heure de début.`;
  }
  return null;
}

export default function HorairesHebdo({
  jours,
  onChange,
}: {
  jours: Record<number, JourEdition>;
  onChange: (jour: number, maj: Partial<JourEdition>) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {JOURS_EDITEUR.map(({ jour, nom }) => {
        const j = jours[jour] ?? { ouvert: false, debut: "08:00", fin: "17:00" };
        return (
          <div key={jour} className="rounded-xl border border-line px-[14px] py-3">
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={j.ouvert}
                onChange={(e) => onChange(jour, { ouvert: e.target.checked })}
                className="h-[18px] w-[18px] accent-[#2E9CCA]"
              />
              <b className="flex-1 text-[13.5px]">{nom}</b>
              <small className={`text-[12px] font-bold ${j.ouvert ? "text-blue" : "text-muted"}`}>
                {j.ouvert ? `${j.debut} – ${j.fin}` : "Fermé"}
              </small>
            </label>
            {j.ouvert && (
              <div className="mt-3 flex items-center gap-2 text-[12.5px] font-semibold text-muted">
                De
                <input
                  type="time"
                  value={j.debut}
                  aria-label={`${nom} — heure de début`}
                  onChange={(e) => onChange(jour, { debut: e.target.value })}
                  className="rounded-lg border border-line bg-white px-2 py-1.5 text-[13px] text-ink outline-none focus:border-teal"
                />
                à
                <input
                  type="time"
                  value={j.fin}
                  aria-label={`${nom} — heure de fin`}
                  onChange={(e) => onChange(jour, { fin: e.target.value })}
                  className="rounded-lg border border-line bg-white px-2 py-1.5 text-[13px] text-ink outline-none focus:border-teal"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
