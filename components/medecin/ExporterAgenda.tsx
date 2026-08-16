"use client";

import { useState } from "react";
import Dialogue from "@/components/site/Dialogue";
import { capitaliser, depuisISO, formatDateLongue, versISO } from "@/lib/dates";

/*
 * Export de l'agenda en classeur Excel ou en PDF.
 *
 * La période se choisit d'abord — jour, semaine, mois — parce que c'est la
 * question à laquelle le praticien répond en premier, et parce qu'une plage
 * libre demandée d'entrée oblige à saisir deux dates pour le cas de loin le
 * plus fréquent (« la semaine qui vient »).
 *
 * Le fichier est demandé par `fetch` plutôt que par un lien : c'est le seul
 * moyen de MONTRER l'erreur. Avec un `<a download>`, un refus du serveur
 * s'enregistre en silence dans un fichier .xlsx contenant du JSON, que le
 * praticien découvre en l'ouvrant.
 */

type Portee = "jour" | "semaine" | "mois" | "personnalise";

const PORTEES: { cle: Portee; libelle: string }[] = [
  { cle: "jour", libelle: "Ce jour" },
  { cle: "semaine", libelle: "Cette semaine" },
  { cle: "mois", libelle: "Ce mois" },
  { cle: "personnalise", libelle: "Période libre" },
];

/** Lundi de la semaine contenant `iso` (la semaine française commence lundi). */
function lundi(iso: string): Date {
  const d = depuisISO(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function decaler(d: Date, jours: number): Date {
  const copie = new Date(d);
  copie.setDate(copie.getDate() + jours);
  return copie;
}

const CHAMP =
  "w-full rounded-[11px] border border-line bg-white px-[13px] py-2.5 text-[13.5px] outline-none focus:border-teal";

export default function ExporterAgenda({
  dateISO,
  onFermer,
}: {
  /** Jour affiché à l'écran : il sert d'ancre aux périodes proposées. */
  dateISO: string;
  onFermer: () => void;
}) {
  const [portee, setPortee] = useState<Portee>("semaine");
  const [debutLibre, setDebutLibre] = useState(dateISO);
  const [finLibre, setFinLibre] = useState(versISO(decaler(depuisISO(dateISO), 6)));
  const [annules, setAnnules] = useState(false);
  const [enCours, setEnCours] = useState<"xlsx" | "pdf" | null>(null);
  const [erreur, setErreur] = useState("");

  const jour = depuisISO(dateISO);
  const periode: { debut: string; fin: string } =
    portee === "jour"
      ? { debut: dateISO, fin: dateISO }
      : portee === "semaine"
        ? { debut: versISO(lundi(dateISO)), fin: versISO(decaler(lundi(dateISO), 6)) }
        : portee === "mois"
          ? {
              debut: versISO(new Date(jour.getFullYear(), jour.getMonth(), 1)),
              fin: versISO(new Date(jour.getFullYear(), jour.getMonth() + 1, 0)),
            }
          : { debut: debutLibre, fin: finLibre };

  // Un champ de date vidé à la main donne une chaîne vide : sans ce garde-fou,
  // le bouton part chercher un export que le serveur refusera.
  const incomplet = !periode.debut || !periode.fin;
  const inverse = !incomplet && periode.debut > periode.fin;
  const bloque = incomplet || inverse;

  async function telecharger(format: "xlsx" | "pdf") {
    if (enCours || bloque) return;
    setEnCours(format);
    setErreur("");
    try {
      const reponse = await fetch(
        `/api/medecin/agenda-export?debut=${periode.debut}&fin=${periode.fin}` +
          `&format=${format}&annules=${annules ? "1" : "0"}`
      );
      if (!reponse.ok) {
        const corps = await reponse.json().catch(() => null);
        setErreur(corps?.erreur ?? "Export impossible pour le moment.");
        return;
      }
      const blob = await reponse.blob();
      const url = URL.createObjectURL(blob);
      const lien = document.createElement("a");
      lien.href = url;
      lien.download =
        periode.debut === periode.fin
          ? `agenda-${periode.debut}.${format}`
          : `agenda-${periode.debut}-au-${periode.fin}.${format}`;
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErreur("Téléchargement interrompu — vérifiez votre connexion.");
    } finally {
      setEnCours(null);
    }
  }

  return (
    <Dialogue
      titre="Exporter l’agenda"
      icone="⤓"
      sousTitre="Classeur Excel ou document PDF"
      onFermer={onFermer}
      pied={
        <>
          <button
            type="button"
            onClick={() => telecharger("xlsx")}
            disabled={!!enCours || bloque}
            className="flex-1 rounded-[10px] bg-green px-4 py-2.5 text-[12.5px] font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {enCours === "xlsx" ? "Génération…" : "📊 Excel (.xlsx)"}
          </button>
          <button
            type="button"
            onClick={() => telecharger("pdf")}
            disabled={!!enCours || bloque}
            className="flex-1 rounded-[10px] bg-teal px-4 py-2.5 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {enCours === "pdf" ? "Génération…" : "📄 PDF"}
          </button>
        </>
      }
    >
      <div className="p-4">
        <div className="mb-1.5 text-[12px] font-bold">Période</div>
        <div role="radiogroup" aria-label="Période à exporter" className="grid grid-cols-2 gap-2">
          {PORTEES.map((p) => (
            <button
              key={p.cle}
              type="button"
              role="radio"
              aria-checked={portee === p.cle}
              onClick={() => setPortee(p.cle)}
              className={`rounded-[11px] border-[1.5px] px-3 py-2.5 text-[12.5px] font-bold transition-colors ${
                portee === p.cle
                  ? "border-teal bg-teal-soft text-blue"
                  : "border-line bg-white text-muted hover:bg-bg"
              }`}
            >
              {p.libelle}
            </button>
          ))}
        </div>

        {portee === "personnalise" && (
          <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
            <label className="text-[11.5px] font-bold text-muted">
              Du
              <input
                type="date"
                className={`mt-1 ${CHAMP}`}
                value={debutLibre}
                onChange={(e) => setDebutLibre(e.target.value)}
              />
            </label>
            <label className="text-[11.5px] font-bold text-muted">
              Au
              <input
                type="date"
                className={`mt-1 ${CHAMP}`}
                value={finLibre}
                onChange={(e) => setFinLibre(e.target.value)}
              />
            </label>
          </div>
        )}

        <p className="mt-2.5 rounded-[11px] bg-bg px-[13px] py-2.5 text-[12px] font-semibold text-blue">
          {incomplet ? (
            <span className="text-red">⚠️ Renseignez les deux dates de la période.</span>
          ) : inverse ? (
            <span className="text-red">⚠️ La date de fin précède la date de début.</span>
          ) : periode.debut === periode.fin ? (
            capitaliser(formatDateLongue(periode.debut))
          ) : (
            `Du ${formatDateLongue(periode.debut)} au ${formatDateLongue(periode.fin)}`
          )}
        </p>

        <label className="mt-3 flex items-start gap-2.5 text-[12.5px] font-semibold">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={annules}
            onChange={(e) => setAnnules(e.target.checked)}
          />
          <span>
            Inclure les rendez-vous annulés
            <small className="block font-normal text-muted">
              Avec leur motif d’annulation. Utile pour un point d’activité, encombrant pour une
              feuille de route de la journée.
            </small>
          </span>
        </label>

        <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
          🔒 Le fichier contient des noms, des numéros et des motifs de consultation : ce sont des
          données de santé. Conservez-le sur un poste du cabinet et ne le transmettez pas par
          messagerie ordinaire.
        </p>

        {erreur && (
          <p role="alert" className="mt-3 text-[12.5px] font-bold text-red">
            ⚠️ {erreur}
          </p>
        )}
      </div>
    </Dialogue>
  );
}
