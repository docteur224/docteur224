"use client";

import EtablissementShell from "@/components/etablissement/EtablissementShell";
import { useMedecinsRattaches } from "@/lib/mock-etablissement";

/*
 * Statistiques — reproduit l'écran « etab-stats » de la maquette web :
 * 4 indicateurs consolidés, graphique « Rendez-vous par mois · tous
 * médecins », classement des médecins par activité (calculé en direct
 * depuis les rattachés). Chiffres de démonstration.
 */

const BARRES = [
  { mois: "Jan", hauteur: 55 },
  { mois: "Fév", hauteur: 64 },
  { mois: "Mar", hauteur: 71 },
  { mois: "Avr", hauteur: 68 },
  { mois: "Mai", hauteur: 88 },
  { mois: "Juin", hauteur: 100 },
];

export default function StatistiquesEtablissement() {
  const rattaches = useMedecinsRattaches();
  const classement = [...rattaches].sort((a, b) => b.rdvSemaine - a.rdvSemaine);
  const maxRdv = Math.max(1, ...classement.map((m) => m.rdvSemaine));

  return (
    <EtablissementShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Statistiques</h2>
          <small className="text-[13px] text-muted">
            Activité consolidée de tous les médecins
          </small>
        </div>
        <span className="rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-muted">
          Ce mois ⌄
        </span>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-line bg-white p-[18px]">
          <span className="text-lg" aria-hidden>
            📅
          </span>
          <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-blue">486</b>
          <small className="text-xs font-semibold text-muted">RDV ce mois</small>
        </div>
        <div className="rounded-2xl border border-line bg-white p-[18px]">
          <span className="text-lg" aria-hidden>
            👨‍⚕️
          </span>
          <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-teal">
            {rattaches.length}
          </b>
          <small className="text-xs font-semibold text-muted">Médecins actifs</small>
        </div>
        <div className="rounded-2xl border border-line bg-white p-[18px]">
          <span className="text-lg" aria-hidden>
            📈
          </span>
          <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-green">78%</b>
          <small className="text-xs font-semibold text-muted">Taux d’occupation</small>
        </div>
        <div className="rounded-2xl border border-line bg-white p-[18px]">
          <span className="text-lg" aria-hidden>
            ✕
          </span>
          <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-amber">5%</b>
          <small className="text-xs font-semibold text-muted">Taux d’annulation</small>
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-[14px] text-[15px] font-extrabold">
          Rendez-vous par mois · tous médecins
        </h3>
        <div className="flex h-[180px] items-end gap-[14px] px-1 pt-[10px]">
          {BARRES.map((barre) => (
            <div
              key={barre.mois}
              className="flex h-full flex-1 flex-col items-center justify-end gap-2"
            >
              <div
                className="w-full max-w-[46px] rounded-t-lg bg-[linear-gradient(180deg,var(--teal),var(--blue))]"
                style={{ height: `${barre.hauteur}%` }}
              />
              <small className="text-[11px] font-bold text-muted">{barre.mois}</small>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">Activité par médecin · cette semaine</h3>
        {classement.map((medecin) => (
          <div
            key={medecin.id}
            className="flex items-center gap-[13px] border-b border-line py-[14px] last:border-b-0"
          >
            <span
              aria-hidden
              className="grid h-[36px] w-[36px] flex-none place-items-center rounded-[10px] text-xs font-extrabold text-white"
              style={{ background: medecin.gradient }}
            >
              {medecin.initiales}
            </span>
            <div className="w-[190px] min-w-0 flex-none">
              <b className="block truncate text-[13px] font-extrabold">{medecin.nom}</b>
              <small className="text-[11.5px] text-muted">{medecin.specialite}</small>
            </div>
            <div className="h-[10px] flex-1 overflow-hidden rounded-full bg-bg">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,var(--teal),var(--blue))]"
                style={{ width: `${(medecin.rdvSemaine / maxRdv) * 100}%` }}
              />
            </div>
            <b className="w-14 flex-none text-right text-[13px] font-extrabold text-blue">
              {medecin.rdvSemaine} RDV
            </b>
          </div>
        ))}
        <p className="mt-3 text-[11.5px] text-muted">
          Chiffres de démonstration — les vraies statistiques consolidées viendront avec la base
          de données.
        </p>
      </div>
    </EtablissementShell>
  );
}
