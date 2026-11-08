"use client";

import { formatDateCourte } from "@/lib/dates";
import { APPARENCE_NIVEAU, formatPourcent, tauxNoShow } from "@/lib/suivi-absence";
import type { LigneSuivi } from "@/lib/suivi-absence-donnees";
import Icone from "@/components/site/Icone";
import { EtatVide, Squelettes } from "@/components/medecin/fiche/ui";

/*
 * La liste des patients concernés.
 *
 * Un tableau sur ordinateur, des cartes sur téléphone — et pas un tableau
 * réduit, qui obligerait à faire défiler de côté pour lire la dernière
 * colonne. Chaque ligne s'ouvre pour montrer le détail et les actions.
 *
 * L'ordre par défaut est le nombre d'absences, décroissant : ce que le
 * praticien vient chercher est en haut. Les en-têtes de colonne sont de
 * vrais boutons (`aria-sort`), pas des libellés cliquables par surprise.
 *
 * Ce que cette liste ne fait pas : trier par « gravité » ressentie, colorier
 * des lignes entières, ni proposer quoi que ce soit qui ressemble à une
 * exclusion. Elle affiche des faits et ouvre deux gestes : avertir, ou
 * remettre le compteur à zéro.
 */

export type Tri = "absences" | "taux" | "derniere" | "nom";

const COLONNES: { cle: Tri; libelle: string; classe: string }[] = [
  { cle: "nom", libelle: "Patient", classe: "text-left" },
  { cle: "absences", libelle: "Absences", classe: "text-right" },
  { cle: "taux", libelle: "No-show", classe: "text-right" },
  { cle: "derniere", libelle: "Dernière", classe: "text-right" },
];

/** Tri stable : à égalité, on retombe sur le nom pour que l'ordre ne saute pas. */
export function trier(lignes: LigneSuivi[], tri: Tri): LigneSuivi[] {
  const parNom = (a: LigneSuivi, b: LigneSuivi) =>
    `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, "fr");
  return [...lignes].sort((a, b) => {
    switch (tri) {
      case "absences":
        return b.absences - a.absences || parNom(a, b);
      case "taux":
        return tauxNoShow(b) - tauxNoShow(a) || parNom(a, b);
      case "derniere":
        return (b.derniereAbsence ?? "").localeCompare(a.derniereAbsence ?? "") || parNom(a, b);
      default:
        return parNom(a, b);
    }
  });
}

/** « Averti le 04/11 » ou « Surveillé » — l'état du suivi, en clair. */
export function libelleSuivi(l: LigneSuivi): string {
  if (l.avertiLe) {
    const quand = formatDateCourte(l.avertiLe.slice(0, 10));
    return l.nbAvertissements > 1
      ? `Averti le ${quand} (${l.nbAvertissements} fois)`
      : `Averti le ${quand}`;
  }
  return "Surveillé";
}

export default function ListeSuivi({
  lignes,
  tri,
  onTri,
  onOuvrir,
  chargement,
  filtre,
}: {
  lignes: LigneSuivi[];
  tri: Tri;
  onTri: (t: Tri) => void;
  onOuvrir: (l: LigneSuivi) => void;
  chargement: boolean;
  /** Un filtre actif change le message de l'état vide. */
  filtre: boolean;
}) {
  if (chargement) {
    return (
      <div className="rounded-2xl border border-line bg-white p-4 md:p-5">
        <Squelettes n={4} hauteur={54} />
      </div>
    );
  }

  if (lignes.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-white">
        <EtatVide
          icone="coche"
          titre={filtre ? "Aucun patient à ce niveau" : "Aucune absence sur la période"}
          texte={
            filtre
              ? "Élargissez le niveau de signal ou la période pour voir d’autres patients."
              : "Les rendez-vous marqués « non honoré » apparaissent ici. Tant que personne ne manque son rendez-vous, cette liste reste vide — c’est bon signe."
          }
        />
      </div>
    );
  }

  const ordonnees = trier(lignes, tri);

  return (
    <>
      {/* ===== Téléphone : une carte par patient ===== */}
      <div className="grid gap-2.5 md:hidden">
        {ordonnees.map((l) => {
          const apparence = APPARENCE_NIVEAU[l.niveau];
          return (
            <button
              key={l.cle}
              type="button"
              onClick={() => onOuvrir(l)}
              className="flex min-h-11 w-full items-center gap-3 rounded-2xl border border-line bg-white p-3.5 text-left"
            >
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[13.5px] font-extrabold">
                  {l.prenom} {l.nom}
                </b>
                <small className="block text-[11.5px] text-muted">
                  {l.absences} / {l.termines} rendez-vous · {formatPourcent(tauxNoShow(l))}
                  {l.derniereAbsence ? ` · ${formatDateCourte(l.derniereAbsence)}` : ""}
                </small>
                <small className="mt-0.5 block text-[11px] font-semibold text-muted opacity-80">
                  {libelleSuivi(l)}
                </small>
              </span>
              <span
                className={`inline-flex flex-none items-center gap-1 rounded-[20px] px-2 py-1 text-[10.5px] font-extrabold ${apparence.classe}`}
              >
                <Icone nom={apparence.icone} taille={12} />
                {apparence.court}
              </span>
            </button>
          );
        })}
      </div>

      {/* ===== Ordinateur : tableau ===== */}
      <div className="hidden overflow-hidden rounded-2xl border border-line bg-white md:block">
        <table className="w-full border-collapse text-[13px]">
          <caption className="sr-only">
            Patients ayant au moins une absence sur la période, avec leur niveau de signal
          </caption>
          <thead>
            <tr className="border-b border-line bg-bg">
              {COLONNES.map((c) => (
                <th
                  key={c.cle}
                  scope="col"
                  aria-sort={tri === c.cle ? "descending" : "none"}
                  className={`px-4 py-3 text-[11.5px] font-extrabold uppercase tracking-[.03em] text-muted ${c.classe}`}
                >
                  <button
                    type="button"
                    onClick={() => onTri(c.cle)}
                    className={`inline-flex items-center gap-1 ${tri === c.cle ? "text-blue" : ""}`}
                  >
                    {c.libelle}
                    {tri === c.cle && <span aria-hidden>▾</span>}
                  </button>
                </th>
              ))}
              <th
                scope="col"
                className="px-4 py-3 text-left text-[11.5px] font-extrabold uppercase tracking-[.03em] text-muted"
              >
                Signal
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-[11.5px] font-extrabold uppercase tracking-[.03em] text-muted"
              >
                Suivi
              </th>
              <th scope="col" className="px-4 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {ordonnees.map((l) => {
              const apparence = APPARENCE_NIVEAU[l.niveau];
              return (
                <tr key={l.cle} className="border-b border-line last:border-b-0 hover:bg-bg">
                  <td className="px-4 py-3">
                    <b className="block text-[13.5px] font-extrabold">
                      {l.prenom} {l.nom}
                    </b>
                    <small className="text-[11.5px] text-muted">
                      {l.type === "proche"
                        ? "Proche d’un patient"
                        : l.type === "sans_compte"
                          ? "Fiche cabinet"
                          : "Compte patient"}
                    </small>
                  </td>
                  <td className="px-4 py-3 text-right font-extrabold">
                    {l.absences}
                    <span className="font-semibold text-muted"> / {l.termines}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-extrabold">
                    {formatPourcent(tauxNoShow(l))}
                  </td>
                  <td className="px-4 py-3 text-right text-muted">
                    {l.derniereAbsence ? formatDateCourte(l.derniereAbsence) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-[20px] px-2.5 py-1 text-[11px] font-extrabold ${apparence.classe}`}
                    >
                      <Icone nom={apparence.icone} taille={12} />
                      {apparence.libelle}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-muted">{libelleSuivi(l)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onOuvrir(l)}
                      className="min-h-9 rounded-[10px] border border-line bg-white px-3 text-[12px] font-bold text-blue transition-colors hover:bg-teal-soft"
                    >
                      Ouvrir
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
