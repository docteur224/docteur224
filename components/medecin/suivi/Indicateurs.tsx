"use client";

import {
  formatMontantGnf,
  formatPourcent,
  manqueAGagner,
  tauxNoShowMois,
  type NiveauAbsence,
} from "@/lib/suivi-absence";
import { moisAbrege, type MoisRdv, type ResumeSuivi } from "@/lib/suivi-absence-donnees";

/*
 * Les indicateurs en tête du suivi d'absence.
 *
 * Des faits, et de quoi les situer. Un taux sans point de comparaison ne dit
 * rien : 8 % de no-show est une bonne nouvelle si le mois dernier en comptait
 * 14, une mauvaise s'il en comptait 3. D'où la variation, affichée avec le
 * mois précédent nommé plutôt qu'une flèche seule.
 *
 * Le manque à gagner ne s'affiche que si le praticien publie un prix ferme.
 * Faute de quoi la tuile disparaît : annoncer « 0 GNF » se lirait comme
 * « cela ne coûte rien », ce qui est l'inverse du propos.
 */

export default function Indicateurs({
  resume,
  mois,
  parNiveau,
  chargement,
}: {
  resume: ResumeSuivi | null;
  mois: MoisRdv[];
  /** Nombre de patients par niveau, compté sur la liste complète. */
  parNiveau: Record<NiveauAbsence, number>;
  chargement: boolean;
}) {
  if (chargement) {
    return (
      <div className="mb-5 grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4" aria-busy="true">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="h-[104px] animate-pulse rounded-2xl border border-line bg-bg"
            aria-hidden
          />
        ))}
      </div>
    );
  }

  const courant = mois[mois.length - 1];
  const precedent = mois[mois.length - 2];
  const taux = tauxNoShowMois(courant);
  const tauxPrecedent = tauxNoShowMois(precedent);
  const ecart = taux !== null && tauxPrecedent !== null ? taux - tauxPrecedent : null;

  const creneauxPerdus = resume?.absences ?? 0;
  const perte = manqueAGagner(creneauxPerdus, resume?.tarifReference ?? null);

  return (
    <div className="mb-5 grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
      <Tuile
        icone="📉"
        valeur={taris(taux)}
        libelle="No-show ce mois"
        teinte="text-orange"
        pied={
          ecart === null
            ? precedent
              ? `Aucun rendez-vous terminé en ${moisAbrege(precedent.mois).toLowerCase()}`
              : undefined
            : `${ecart > 0 ? "+" : ecart < 0 ? "−" : "="} ${formatPourcent(Math.abs(ecart))} vs ${moisAbrege(precedent!.mois).toLowerCase()}`
        }
      />
      <Tuile
        icone="🕳️"
        valeur={`${creneauxPerdus}`}
        libelle="Créneaux perdus"
        teinte="text-blue"
        pied={resume ? `Sur ${resume.periodeMois} mois` : undefined}
      />
      <Tuile
        icone="👁️"
        valeur={`${parNiveau.a_surveiller}`}
        libelle="À surveiller"
        teinte="text-amber"
        pied={`${parNiveau.a_risque} à risque`}
      />
      {perte !== null ? (
        <Tuile
          icone="💸"
          valeur={formatMontantGnf(perte)}
          libelle="Manque à gagner estimé"
          teinte="text-ink"
          petit
          pied="Créneaux perdus × tarif de référence"
        />
      ) : (
        <Tuile
          icone="✅"
          valeur={taux === null ? "—" : formatPourcent(1 - taux)}
          libelle="Taux de présence"
          teinte="text-green"
          pied="Présence = 100 % − no-show"
        />
      )}
    </div>
  );
}

/** « — » plutôt que « 0 % » quand aucun rendez-vous n'est encore terminé. */
const taris = (taux: number | null) => (taux === null ? "—" : formatPourcent(taux));

function Tuile({
  icone,
  valeur,
  libelle,
  teinte,
  pied,
  petit = false,
}: {
  icone: string;
  valeur: string;
  libelle: string;
  teinte: string;
  pied?: string;
  /** Un montant tient moins bien en 26 px qu'un pourcentage. */
  petit?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-line bg-white p-3.5 md:p-[18px]">
      <span className="text-lg" aria-hidden>
        {icone}
      </span>
      <b
        className={`mt-2 block font-extrabold tracking-[-0.6px] ${teinte} ${
          petit ? "text-[18px] md:text-[20px]" : "text-[22px] md:text-[26px]"
        }`}
      >
        {valeur}
      </b>
      <small className="block text-[11.5px] font-semibold text-muted md:text-xs">{libelle}</small>
      {pied && (
        <small className="mt-1 block text-[10.5px] font-semibold leading-tight text-muted opacity-80">
          {pied}
        </small>
      )}
    </div>
  );
}
