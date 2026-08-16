"use client";

import Link from "next/link";
import { useState } from "react";
import MedecinShell from "@/components/medecin/MedecinShell";
import DetailRdv from "@/components/medecin/DetailRdv";
import ExporterAgenda from "@/components/medecin/ExporterAgenda";
import {
  JOURS_COURTS,
  capitaliser,
  depuisISO,
  formatDateLongue,
  versISO,
} from "@/lib/dates";
import { useAgenda, useContextePro, type CreneauAgenda, type RdvAgenda } from "@/lib/pro";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";

/*
 * Mon agenda — la journée du praticien, heure par heure.
 *
 * Trois choses que l'écran doit permettre sans détour, et qui commandent sa
 * forme :
 *
 *   1. OUVRIR un rendez-vous. Un nom dans une case ne dit ni le numéro du
 *      patient, ni l'adresse de la visite, ni où en est la confirmation.
 *      Chaque rendez-vous est donc un bouton, qui ouvre le détail — et de là,
 *      le dossier complet en un clic.
 *   2. SE SITUER dans la semaine. La barre des sept jours porte le nombre de
 *      rendez-vous de chacun : c'est ce qui manque pour décider où caler une
 *      urgence, et cela évite d'ouvrir six jours l'un après l'autre.
 *   3. EMPORTER l'agenda — en classeur ou en PDF, pour l'imprimer le matin ou
 *      le transmettre à un remplaçant.
 *
 * Un créneau LIBRE est cliquable lui aussi : il mène à la prise de rendez-vous
 * déjà réglée sur ce jour et cette heure. C'est le geste le plus fréquent
 * après avoir regardé un trou dans la journée.
 */

/** Lundi de la semaine contenant `iso` — la semaine française commence lundi. */
function lundi(iso: string): Date {
  const d = depuisISO(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function decalerDate(d: Date, jours: number): Date {
  const copie = new Date(d);
  copie.setDate(copie.getDate() + jours);
  return copie;
}

/**
 * Fenêtre de lecture, arrondie par blocs de 45 jours : naviguer d'un jour ne
 * doit pas relancer une requête, mais partir à trois mois doit charger ce
 * qu'il y a là-bas — sinon la journée s'afficherait entièrement libre.
 */
const bloc = (jours: number) => Math.ceil(jours / 45) * 45;

const TEINTE_STATUT: Record<string, string> = {
  confirme: "bg-green-soft text-green",
  en_attente: "bg-amber-soft text-amber",
  honore: "bg-teal-soft text-blue",
};

const LIBELLE_STATUT: Record<string, string> = {
  confirme: "Confirmé",
  en_attente: "À confirmer",
  honore: "Honoré",
};

const BTN_BARRE =
  "rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg";

export default function AgendaMedecin() {
  const { medecin } = useContextePro();
  const [dateISO, setDateISO] = useState(() => versISO(new Date()));
  const [seulementRdv, setSeulementRdv] = useState(false);
  const [ouvert, setOuvert] = useState<RdvAgenda | null>(null);
  const [exporter, setExporter] = useState(false);

  const aujourdhui = versISO(new Date());
  const ecart = Math.round(
    (depuisISO(dateISO).getTime() - depuisISO(aujourdhui).getTime()) / 86400000
  );
  const { creneauxJour, rdvs, chargement, recharger } = useAgenda(
    medecin?.id,
    bloc(Math.max(45, ecart + 21)),
    bloc(Math.max(90, 21 - ecart))
  );

  const ouverts = creneauxJour(dateISO).filter((c) => c.statut !== "ferme");
  const creneaux = seulementRdv ? ouverts.filter((c) => c.statut === "reserve") : ouverts;

  const reserves = ouverts.filter((c) => c.statut === "reserve");
  const aConfirmer = reserves.filter((c) => c.statutRdv === "en_attente").length;
  const aDomicile = reserves.filter((c) => c.lieu === "domicile").length;
  const libres = ouverts.length - reserves.length;

  const debutSemaine = lundi(dateISO);
  const semaine = Array.from({ length: 7 }, (_, i) => versISO(decalerDate(debutSemaine, i)));
  const nbRdv = (iso: string) =>
    rdvs.filter((r) => r.date === iso && r.statut !== "annule").length;

  function decaler(jours: number) {
    setDateISO(versISO(decalerDate(depuisISO(dateISO), jours)));
  }

  /** Lien de prise de rendez-vous préréglé sur un créneau libre. */
  const lienCreneau = (heure: string) =>
    `/espace-medecin/nouveau-rdv?date=${dateISO}&heure=${heure}`;

  /* ===== Barre des sept jours, partagée par les deux versions ===== */
  const barreSemaine = (
    <div className="flex items-stretch gap-1.5">
      <button
        type="button"
        onClick={() => decaler(-7)}
        aria-label="Semaine précédente"
        className="flex-none rounded-[10px] border-[1.5px] border-line bg-white px-2 text-[13px] font-bold text-blue transition-colors hover:bg-bg"
      >
        ‹
      </button>
      <div className="grid flex-1 grid-cols-7 gap-1.5">
        {semaine.map((iso) => {
          const jour = depuisISO(iso);
          const choisi = iso === dateISO;
          const compte = nbRdv(iso);
          return (
            <button
              key={iso}
              type="button"
              onClick={() => setDateISO(iso)}
              aria-current={choisi ? "date" : undefined}
              className={`rounded-[11px] border-[1.5px] px-1 py-2 text-center transition-colors ${
                choisi
                  ? "border-teal bg-teal text-white"
                  : iso === aujourdhui
                    ? "border-teal bg-teal-soft text-blue hover:bg-white"
                    : "border-line bg-white text-muted hover:bg-bg"
              }`}
            >
              <span className="block text-[10px] font-bold uppercase tracking-wide opacity-80">
                {JOURS_COURTS[jour.getDay()]}
              </span>
              <span className="block text-[15px] font-extrabold leading-tight">
                {jour.getDate()}
              </span>
              <span
                className={`mt-0.5 block text-[10px] font-bold ${
                  compte === 0 ? "opacity-40" : choisi ? "" : "text-teal"
                }`}
              >
                {compte === 0 ? "—" : `${compte} RDV`}
              </span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => decaler(7)}
        aria-label="Semaine suivante"
        className="flex-none rounded-[10px] border-[1.5px] border-line bg-white px-2 text-[13px] font-bold text-blue transition-colors hover:bg-bg"
      >
        ›
      </button>
    </div>
  );

  /* ===== Une ligne de créneau (version web) ===== */
  const ligneWeb = (creneau: CreneauAgenda) => (
    <div
      key={creneau.heure}
      className="grid grid-cols-[66px_1fr] border-t border-line first:border-t-0"
    >
      <div className="border-r border-line px-3 py-[14px] text-center text-xs font-bold text-muted">
        {creneau.heure}
      </div>
      <div className="px-[14px] py-[10px]">
        {creneau.statut === "reserve" && creneau.rdv ? (
          <button
            type="button"
            onClick={() => setOuvert(creneau.rdv!)}
            className={`flex w-full items-center gap-3 rounded-lg border-l-[3px] px-3 py-[9px] text-left text-[12.5px] transition-colors ${
              creneau.statutRdv === "en_attente"
                ? "border-amber bg-amber-soft hover:bg-[#fbeacd]"
                : creneau.lieu === "domicile"
                  ? "border-green bg-green-soft hover:bg-[#d5efdf]"
                  : "border-teal bg-teal-soft hover:bg-[#d6ecf6]"
            }`}
          >
            <span className="min-w-0 flex-1">
              <b className="font-extrabold">{creneau.patient}</b>{" "}
              <small className="text-muted">· {creneau.motif}</small>
              <small className="block text-[11.5px] text-muted">
                {creneau.rdv.telephone || "Aucun numéro"}
                {creneau.lieu === "domicile" &&
                  ` · 🏠 ${creneau.rdv.adresseDomicile || "adresse non précisée"}`}
              </small>
            </span>
            <span
              className={`flex-none rounded-md px-2 py-1 text-[10.5px] font-extrabold uppercase tracking-[.03em] ${
                TEINTE_STATUT[creneau.statutRdv ?? ""] ?? "bg-white text-muted"
              }`}
            >
              {LIBELLE_STATUT[creneau.statutRdv ?? ""] ?? creneau.statutRdv}
            </span>
            <span aria-hidden className="flex-none font-bold text-muted">
              ›
            </span>
          </button>
        ) : (
          <Link
            href={lienCreneau(creneau.heure)}
            className="group flex items-center gap-3 rounded-lg border-l-[3px] border-[#CBD8E0] bg-[#F4F8FA] px-3 py-[9px] text-[12.5px] italic text-muted transition-colors hover:border-teal hover:bg-teal-soft"
          >
            <span className="flex-1">Disponible</span>
            <span className="flex-none text-[11.5px] font-bold not-italic text-teal opacity-0 transition-opacity group-hover:opacity-100">
              + Poser un rendez-vous
            </span>
          </Link>
        )}
      </div>
    </div>
  );

  const tuile = (valeur: number, libelle: string, couleur: string) => (
    <div className="rounded-2xl border border-line bg-white p-[14px]">
      <b className={`block text-[24px] font-extrabold tracking-[-0.6px] ${couleur}`}>{valeur}</b>
      <small className="text-[11.5px] font-semibold text-muted">{libelle}</small>
    </div>
  );

  const messageVide = seulementRdv
    ? "Aucun rendez-vous ce jour."
    : "Aucun créneau ouvert ce jour (journée fermée).";

  return (
    <MedecinShell>
      {/* ===== Version mobile ===== */}
      <div className="md:hidden">
        <EnTeteMobile variante="marque" />
        <div className="appbar">
          <div>
            <h3 style={{ paddingLeft: 4 }}>Mon agenda</h3>
            <div className="sub" style={{ paddingLeft: 4 }}>
              {capitaliser(formatDateLongue(dateISO))}
            </div>
          </div>
          <Link href="/espace-medecin/nouveau-rdv" className="btnm" style={{ marginLeft: "auto" }}>
            + RDV
          </Link>
        </div>
        <div className="pad" style={{ paddingTop: 8 }}>
          {barreSemaine}

          <div className="chips scroll" style={{ marginTop: 12 }}>
            <button
              type="button"
              className={`chip ${dateISO === aujourdhui ? "blue" : "grey"}`}
              onClick={() => setDateISO(aujourdhui)}
            >
              Aujourd’hui
            </button>
            <button
              type="button"
              className={`chip ${seulementRdv ? "blue" : "grey"}`}
              aria-pressed={seulementRdv}
              onClick={() => setSeulementRdv(!seulementRdv)}
            >
              RDV seulement
            </button>
            <button type="button" className="chip grey" onClick={() => setExporter(true)}>
              ⤓ Exporter
            </button>
          </div>

          <div className="statcards inpad" style={{ paddingTop: 12 }}>
            <div className="sc b1">
              <b>{reserves.length}</b>
              <small>RDV du jour</small>
            </div>
            <div className="sc b2">
              <b>{aConfirmer}</b>
              <small>À confirmer</small>
            </div>
            <div className="sc b3">
              <b>{libres}</b>
              <small>Créneaux libres</small>
            </div>
          </div>

          <div className="section-t">Journée</div>
          {creneaux.map((creneau) =>
            creneau.statut === "reserve" && creneau.rdv ? (
              <button
                key={creneau.heure}
                type="button"
                className="agm"
                style={{ width: "100%", textAlign: "left" }}
                onClick={() => setOuvert(creneau.rdv!)}
              >
                <div className="t">{creneau.heure}</div>
                <div className="who">
                  <b>
                    {creneau.patient}
                    {creneau.lieu === "domicile" && " 🏠"}
                  </b>
                  <small>
                    {creneau.motif}
                    {creneau.lieu === "domicile" && ` · À domicile : ${creneau.adresseDomicile}`}
                  </small>
                </div>
                <span
                  className={`badge ${
                    creneau.statutRdv === "en_attente"
                      ? "wait"
                      : creneau.statutRdv === "honore"
                        ? ""
                        : "ok"
                  }`}
                  style={{ marginLeft: "auto" }}
                >
                  {LIBELLE_STATUT[creneau.statutRdv ?? ""] ?? ""}
                </span>
              </button>
            ) : (
              <Link key={creneau.heure} href={lienCreneau(creneau.heure)} className="agm free">
                <div className="t">{creneau.heure}</div>
                <div className="who">
                  <b>Disponible</b>
                  <small>Toucher pour poser un rendez-vous</small>
                </div>
              </Link>
            )
          )}
          {creneaux.length === 0 && (
            <p className="muted" style={{ fontSize: 13 }}>
              {chargement ? "Chargement de l’agenda…" : messageVide}
            </p>
          )}
        </div>
      </div>

      {/* ===== Version web ===== */}
      <div className="hidden md:block">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Mon agenda</h2>
            <small className="text-[13px] text-muted">
              {capitaliser(formatDateLongue(dateISO))}
              {dateISO === aujourdhui && " · aujourd’hui"}
            </small>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/espace-medecin/nouveau-rdv"
              className="rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
            >
              + Nouveau RDV
            </Link>
            <button type="button" onClick={() => setExporter(true)} className={BTN_BARRE}>
              ⤓ Exporter
            </button>
          </div>
        </div>

        {/* ---- Navigation ---- */}
        <div className="mb-4 rounded-2xl border border-line bg-white p-[14px]">
          {barreSemaine}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => decaler(-1)} className={BTN_BARRE}>
              ‹ Hier
            </button>
            <button type="button" onClick={() => setDateISO(aujourdhui)} className={BTN_BARRE}>
              Aujourd’hui
            </button>
            <button type="button" onClick={() => decaler(1)} className={BTN_BARRE}>
              Demain ›
            </button>
            <label className="ml-auto flex items-center gap-2 text-[11.5px] font-bold text-muted">
              Aller au
              <input
                type="date"
                value={dateISO}
                onChange={(e) => e.target.value && setDateISO(e.target.value)}
                aria-label="Aller à une date"
                className="rounded-[9px] border-[1.5px] border-line bg-white px-2.5 py-1.5 text-[12.5px] font-bold text-blue outline-none focus:border-teal"
              />
            </label>
          </div>
        </div>

        {/* ---- Le jour en un coup d'œil ---- */}
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tuile(reserves.length, "Rendez-vous du jour", "text-blue")}
          {tuile(aConfirmer, "À confirmer", "text-amber")}
          {tuile(aDomicile, "À domicile", "text-green")}
          {tuile(libres, "Créneaux libres", "text-teal")}
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          {(
            [
              [false, "Toute la journée"],
              [true, "Rendez-vous seulement"],
            ] as [boolean, string][]
          ).map(([valeur, libelle]) => (
            <button
              key={libelle}
              type="button"
              aria-pressed={seulementRdv === valeur}
              onClick={() => setSeulementRdv(valeur)}
              className={`rounded-[9px] border-[1.5px] px-3 py-1.5 text-[12px] font-bold transition-colors ${
                seulementRdv === valeur
                  ? "border-teal bg-teal-soft text-blue"
                  : "border-line bg-white text-muted hover:bg-bg"
              }`}
            >
              {libelle}
            </button>
          ))}
          <span className="ml-auto text-[11.5px] text-muted">
            Cliquez un rendez-vous pour son détail, un créneau libre pour en poser un.
          </span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          {creneaux.map(ligneWeb)}
          {creneaux.length === 0 && (
            <p className="px-5 py-[14px] text-[13px] text-muted">
              {chargement ? "Chargement de l’agenda…" : messageVide}
            </p>
          )}
        </div>
      </div>

      {ouvert && (
        <DetailRdv rdv={ouvert} onFermer={() => setOuvert(null)} apres={recharger} />
      )}
      {exporter && <ExporterAgenda dateISO={dateISO} onFermer={() => setExporter(false)} />}
    </MedecinShell>
  );
}
