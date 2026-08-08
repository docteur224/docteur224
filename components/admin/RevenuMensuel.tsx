"use client";

import { useState } from "react";
import { formatGNF } from "@/lib/format";

/*
 * Revenu net des 12 derniers mois.
 *
 * Une seule série, donc une seule teinte et aucune légende : le titre nomme
 * ce qui est tracé. Les barres ne portent pas toutes leur valeur — seul le
 * mois en cours et le meilleur mois sont étiquetés, le reste se lit au survol.
 * Une valeur sur chaque barre transformerait le graphique en tableau mal
 * aligné.
 *
 * Net, et pas brut : les remboursements sont déjà retranchés en SQL. Un
 * chiffre d'affaires qui les ignore se dément au premier litige.
 */

const MOIS_COURTS = [
  "janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc.",
];

/** « 2026-08 » → « août ». */
function libelleMois(cle: string): string {
  const mois = Number(cle.slice(5, 7));
  return MOIS_COURTS[mois - 1] ?? cle;
}

/** « 1 250 000 GNF » → « 1,3 M » : l'axe doit rester lisible, pas exact. */
function abrege(montant: number): string {
  if (montant >= 1_000_000) return `${(montant / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M`;
  if (montant >= 1_000) return `${Math.round(montant / 1_000)} k`;
  return String(montant);
}

export default function RevenuMensuel({ serie }: { serie: { mois: string; revenu: number }[] }) {
  const [survol, setSurvol] = useState<number | null>(null);

  const maximum = Math.max(1, ...serie.map((m) => m.revenu));
  const indexMax = serie.findIndex((m) => m.revenu === maximum && m.revenu > 0);
  const dernier = serie.length - 1;
  const total = serie.reduce((t, m) => t + m.revenu, 0);

  if (serie.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-white p-5">
        <h3 className="text-[15px] font-extrabold">Revenu net · 12 derniers mois</h3>
        <p className="mt-2 text-[12.5px] text-muted">Aucun encaissement pour l’instant.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-extrabold">Revenu net · 12 derniers mois</h3>
        <small className="text-[12px] font-semibold text-muted">
          {formatGNF(total)} au total
        </small>
      </div>
      <p className="mb-4 text-[11.5px] text-muted">
        Abonnements et recharges encaissés, remboursements déduits.
      </p>

      {/* Les barres portent leur propre libellé : pas d'axe des abscisses
          séparé à garder aligné. La hauteur est fixe, la valeur est relative
          au meilleur mois. */}
      <div className="flex items-end gap-[2px]" style={{ height: 150 }}>
        {serie.map((m, i) => {
          const part = m.revenu / maximum;
          const etiquette = i === dernier || i === indexMax;
          const actif = survol === i;
          return (
            <div
              key={m.mois}
              className="relative flex h-full min-w-0 flex-1 flex-col justify-end"
              onMouseEnter={() => setSurvol(i)}
              onMouseLeave={() => setSurvol((s) => (s === i ? null : s))}
            >
              {/* Infobulle : la valeur exacte se lit ici, pas sur chaque barre. */}
              {actif && (
                <div
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg bg-blue px-2.5 py-1.5 text-[11px] font-bold text-white shadow-lg"
                >
                  {libelleMois(m.mois)} {m.mois.slice(0, 4)} · {formatGNF(m.revenu)}
                </div>
              )}
              {etiquette && m.revenu > 0 && !actif && (
                <span className="mb-1 truncate text-center text-[10px] font-bold text-muted">
                  {abrege(m.revenu)}
                </span>
              )}
              <div
                aria-hidden
                /* Extrémité arrondie côté données, base carrée : la barre est
                   ancrée à sa ligne de référence. */
                className="w-full rounded-t-[4px] transition-colors"
                style={{
                  height: `${Math.max(m.revenu > 0 ? 3 : 1, part * 100)}%`,
                  background: m.revenu > 0 ? (actif ? "var(--blue)" : "var(--teal)") : "var(--line)",
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-1.5 flex gap-[2px]">
        {serie.map((m, i) => (
          <small
            key={m.mois}
            className={`min-w-0 flex-1 truncate text-center text-[10px] ${
              i === dernier ? "font-bold text-blue" : "text-muted"
            }`}
          >
            {libelleMois(m.mois)}
          </small>
        ))}
      </div>

      {/* Le graphique n'est pas la seule voie d'accès aux chiffres : les
          montants exacts sont dans l'onglet « Historique » juste en dessous. */}
      <p className="sr-only">
        {serie.map((m) => `${libelleMois(m.mois)} : ${formatGNF(m.revenu)}`).join(". ")}
      </p>
    </div>
  );
}
