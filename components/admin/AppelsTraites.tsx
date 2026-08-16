"use client";

import { useEffect, useState } from "react";
import Dialogue from "@/components/site/Dialogue";
import Pagination from "@/components/site/Pagination";
import { useDisponibilites } from "@/lib/disponibilites";
import { HEURES_JOURNEE, statutCreneau } from "@/lib/donnees";
import {
  JOURS_COURTS,
  MOIS_LONGS,
  capitaliser,
  depuisISO,
  formatDateLongue,
  versISO,
} from "@/lib/dates";
import {
  APPELS_PAR_PAGE,
  FILTRES_APPELS,
  LIBELLE_TYPE_FICHE,
  annulerRdv,
  reprogrammerRdv,
  resumeEnvoi,
  supprimerRdv,
  useAppelsTraites,
  type AppelTraite,
} from "@/lib/rdv-centre-appel";

/*
 * « Appels traités » — la main courante du centre d'appel.
 *
 * Ce que l'opérateur vient y chercher, dans cet ordre :
 *   1. RETROUVER un rendez-vous (par nom, numéro, praticien ou motif) ;
 *   2. JOINDRE l'appelant — d'où le téléphone et l'e-mail en clair, cliquables ;
 *   3. AGIR : déplacer, annuler, supprimer.
 *
 * Trois règles portées par la base et rappelées ici, parce qu'elles se
 * discutent :
 *   - annuler exige un MOTIF : sans lui, l'opérateur suivant ne sait pas si le
 *     patient s'est décommandé ou si c'est une erreur de saisie ;
 *   - supprimer n'est possible qu'APRÈS annulation : la suppression ne
 *     prévient personne, l'annulation si ;
 *   - un rendez-vous portant un avis ne se supprime pas — l'avis partirait
 *     avec (`on delete cascade`, migration 0011).
 *
 * La portée par défaut est « pris par la console ». La bascule « tous » n'ouvre
 * aucun droit nouveau (la RLS donne déjà tous les rendez-vous à un
 * administrateur) : elle évite de changer d'écran quand l'appelant veut
 * annuler un rendez-vous qu'il avait pris lui-même en ligne.
 */

const CHAMP =
  "w-full rounded-[11px] border border-line bg-white px-[13px] py-2.5 text-[13.5px] outline-none focus:border-teal";
const BTN_LEGER =
  "rounded-[10px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[12px] font-bold text-blue transition-colors hover:bg-bg disabled:cursor-not-allowed disabled:opacity-40";
const BTN_ROUGE =
  "rounded-[10px] border-[1.5px] border-[#F3C9C2] bg-white px-3 py-1.5 text-[12px] font-bold text-red transition-colors hover:bg-red-soft disabled:cursor-not-allowed disabled:opacity-40";

const TEINTE_STATUT: Record<string, string> = {
  confirme: "bg-green-soft text-green",
  en_attente: "bg-amber-soft text-amber",
  honore: "bg-teal-soft text-blue",
  annule: "bg-red-soft text-red",
};
const LIBELLE_STATUT: Record<string, string> = {
  confirme: "Confirmé",
  en_attente: "En attente",
  honore: "Honoré",
  annule: "Annulé",
};

const initiales = (nom: string) =>
  nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m.charAt(0))
    .join("")
    .toUpperCase() || "?";

/** « 17/08/2026 à 08:00 ». */
const quandCourt = (date: string, heure: string) => {
  const d = depuisISO(date);
  return `${JOURS_COURTS[d.getDay()]} ${d.getDate()} ${MOIS_LONGS[d.getMonth()].slice(0, 4)}. ${d.getFullYear()} · ${heure}`;
};

export default function AppelsTraites() {
  const [saisie, setSaisie] = useState("");
  const [recherche, setRecherche] = useState("");
  const [statut, setStatut] = useState("");
  const [portee, setPortee] = useState<"console" | "tous">("console");
  const [page, setPage] = useState(0);
  const { appels, total, chargement, erreur, recharger } = useAppelsTraites(
    recherche,
    statut,
    portee,
    page
  );

  const [ouvert, setOuvert] = useState<string | null>(null);
  const [action, setAction] = useState<{ type: "deplacer" | "annuler" | "supprimer"; appel: AppelTraite } | null>(null);
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);

  useEffect(() => {
    const minuteur = setTimeout(() => {
      setRecherche(saisie.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(minuteur);
  }, [saisie]);

  const pages = Math.max(1, Math.ceil(total / APPELS_PAR_PAGE));
  const premier = total === 0 ? 0 : page * APPELS_PAR_PAGE + 1;
  const dernier = Math.min(total, (page + 1) * APPELS_PAR_PAGE);

  function apresAction(texte: string, estErreur: boolean) {
    setMessage({ texte, erreur: estErreur });
    setAction(null);
    if (!estErreur) recharger();
  }

  return (
    <div className="px-[18px] pb-6 pt-3 md:px-0 md:pt-0">
      <div className="mb-4 hidden md:block">
        <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Appels traités</h2>
        <small className="text-[13px] text-muted">
          Retrouver un rendez-vous, rappeler l’appelant, déplacer ou annuler
        </small>
      </div>

      <div className="mb-4 rounded-[16px] border border-line bg-white p-[18px]">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <input
            className={`${CHAMP} lg:col-span-2`}
            placeholder="Nom, téléphone, e-mail, praticien, motif…"
            aria-label="Rechercher un appel traité"
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
          />
          <select
            className={CHAMP}
            aria-label="État du rendez-vous"
            value={statut}
            onChange={(e) => {
              setStatut(e.target.value);
              setPage(0);
            }}
          >
            {FILTRES_APPELS.map((f) => (
              <option key={f.cle} value={f.cle}>
                {f.label}
              </option>
            ))}
          </select>
          <select
            className={CHAMP}
            aria-label="Portée"
            value={portee}
            onChange={(e) => {
              setPortee(e.target.value === "tous" ? "tous" : "console");
              setPage(0);
            }}
          >
            <option value="console">Pris au centre d’appel</option>
            <option value="tous">Tous les rendez-vous</option>
          </select>
        </div>
        <p className="mt-2.5 text-[11.5px] text-muted">
          {chargement
            ? "Chargement…"
            : `${total} rendez-vous${portee === "console" ? " posé(s) par la console" : " sur la plateforme"}`}
        </p>
      </div>

      {message && (
        <p
          role="status"
          className={`mb-3 rounded-[11px] px-[13px] py-2.5 text-[12.5px] font-semibold ${
            message.erreur ? "bg-red-soft text-red" : "bg-green-soft text-green"
          }`}
        >
          {message.erreur ? "⚠️ " : "✓ "}
          {message.texte}
        </p>
      )}
      {erreur && (
        <p role="alert" className="mb-3 rounded-[11px] bg-red-soft px-[13px] py-2.5 text-[12.5px] font-semibold text-red">
          {erreur}
        </p>
      )}

      {/* Nommée : la liste est la région que l'opérateur parcourt, et c'est
          aussi le seul repère stable quand un lecteur d'écran — ou un test —
          doit la distinguer du reste de la console. */}
      <section aria-label="Liste des appels traités" className="grid gap-2.5">
        {!chargement && appels.length === 0 && (
          <p className="rounded-[16px] border border-line bg-white p-6 text-center text-[13px] text-muted">
            Aucun rendez-vous ne correspond à cette recherche.
          </p>
        )}
        {appels.map((a) => (
          <LigneAppel
            key={a.id}
            appel={a}
            ouvert={ouvert === a.id}
            onBasculer={() => setOuvert(ouvert === a.id ? null : a.id)}
            onAction={(type) => {
              setMessage(null);
              setAction({ type, appel: a });
            }}
          />
        ))}
      </section>

      {total > APPELS_PAR_PAGE && (
        <div className="mt-4">
          <Pagination
            page={page}
            pages={pages}
            total={total}
            premier={premier}
            dernier={dernier}
            onPage={setPage}
            libelle="rendez-vous"
          />
        </div>
      )}

      {action?.type === "deplacer" && (
        <DialogueDeplacer appel={action.appel} onFermer={() => setAction(null)} onFini={apresAction} />
      )}
      {action?.type === "annuler" && (
        <DialogueAnnuler appel={action.appel} onFermer={() => setAction(null)} onFini={apresAction} />
      )}
      {action?.type === "supprimer" && (
        <DialogueSupprimer appel={action.appel} onFermer={() => setAction(null)} onFini={apresAction} />
      )}
    </div>
  );
}

/* ===== Une ligne ===== */

function LigneAppel({
  appel,
  ouvert,
  onBasculer,
  onAction,
}: {
  appel: AppelTraite;
  ouvert: boolean;
  onBasculer: () => void;
  onAction: (type: "deplacer" | "annuler" | "supprimer") => void;
}) {
  const annule = appel.statut === "annule";
  const honore = appel.statut === "honore";
  return (
    <div className="rounded-[16px] border border-line bg-white">
      <button
        type="button"
        onClick={onBasculer}
        aria-expanded={ouvert}
        className="flex w-full flex-wrap items-center gap-[11px] p-[14px] text-left"
      >
        <span
          aria-hidden
          className="grid h-10 w-10 flex-none place-items-center rounded-[11px] text-[13px] font-extrabold text-white"
          style={{ background: appel.gradient }}
        >
          {initiales(appel.patient)}
        </span>
        <span className="min-w-[160px] flex-1">
          <b className="block text-[13.5px]">{appel.patient}</b>
          <small className="block text-[11.5px] text-muted">
            {appel.medecin} · {quandCourt(appel.date, appel.heure)}
          </small>
          <small className="block text-[11.5px] font-semibold text-blue">
            {appel.telephone || "Aucun numéro"}
            {appel.email && ` · ${appel.email}`}
          </small>
        </span>
        <span className="flex flex-none items-center gap-2">
          <span
            className={`rounded-lg px-2 py-1 text-[11px] font-bold ${TEINTE_STATUT[appel.statut] ?? "bg-[#F1F4F6] text-muted"}`}
          >
            {LIBELLE_STATUT[appel.statut] ?? appel.statut}
          </span>
          <span aria-hidden className="text-muted">
            {ouvert ? "▴" : "▾"}
          </span>
        </span>
      </button>

      {ouvert && (
        <div className="border-t border-line p-[14px]">
          <div className="grid gap-3 sm:grid-cols-2">
            <Detail libelle="Fiche">
              {LIBELLE_TYPE_FICHE[appel.typeFiche]}
              {appel.titulaire && ` · rendez-vous pour un proche de ${appel.titulaire}`}
            </Detail>
            <Detail libelle="Joindre l’appelant">
              {appel.telephone ? (
                <a className="font-bold text-blue underline" href={`tel:${appel.telephone}`}>
                  {appel.telephone}
                </a>
              ) : (
                <span className="text-muted">Aucun numéro enregistré</span>
              )}
              {appel.email ? (
                <>
                  {" · "}
                  <a className="font-bold text-blue underline" href={`mailto:${appel.email}`}>
                    {appel.email}
                  </a>
                </>
              ) : (
                <span className="text-muted"> · pas d’adresse e-mail</span>
              )}
            </Detail>
            <Detail libelle="Rendez-vous">
              {capitaliser(formatDateLongue(appel.date))} à {appel.heure} ·{" "}
              {appel.lieu === "domicile"
                ? `à domicile${appel.adresseDomicile ? ` (${appel.adresseDomicile})` : ""}`
                : "au cabinet"}
            </Detail>
            <Detail libelle="Praticien">
              {appel.medecin}
              {appel.medecinTelephone && ` · ${appel.medecinTelephone}`}
            </Detail>
            <Detail libelle="Motif">{appel.motif || "Non précisé"}</Detail>
            <Detail libelle="Saisi par">
              {appel.prisPar || "—"} ·{" "}
              {appel.source === "telephone"
                ? "au téléphone"
                : appel.source === "cabinet"
                  ? "au cabinet"
                  : "en ligne"}
            </Detail>
            {appel.motifAnnulation && (
              <Detail libelle="Motif d’annulation">{appel.motifAnnulation}</Detail>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={BTN_LEGER}
              disabled={annule || honore}
              title={
                annule
                  ? "Un rendez-vous annulé ne se déplace pas"
                  : honore
                    ? "La consultation a déjà eu lieu"
                    : undefined
              }
              onClick={() => onAction("deplacer")}
            >
              📅 Déplacer
            </button>
            <button
              type="button"
              className={BTN_LEGER}
              disabled={annule || honore}
              onClick={() => onAction("annuler")}
            >
              ✖️ Annuler
            </button>
            <button
              type="button"
              className={BTN_ROUGE}
              disabled={!annule}
              title={annule ? undefined : "Annulez d’abord : le patient doit être prévenu"}
              onClick={() => onAction("supprimer")}
            >
              🗑️ Supprimer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return (
    <div>
      <small className="block text-[11px] font-bold uppercase tracking-wide text-muted">
        {libelle}
      </small>
      <span className="text-[12.5px] leading-relaxed">{children}</span>
    </div>
  );
}

/* ===== Déplacer ===== */

/** Comme sur l'écran de prise : seuls les créneaux passés disparaissent. */
function creneauFutur(dateISO: string, heure: string): boolean {
  const debut = depuisISO(dateISO);
  const [h, m] = heure.split(":").map(Number);
  debut.setHours(h, m, 0, 0);
  return debut.getTime() >= Date.now();
}

function joursSuivants(nb: number): string[] {
  const jours: string[] = [];
  const curseur = new Date();
  for (let i = 0; i < nb; i++) {
    jours.push(versISO(curseur));
    curseur.setDate(curseur.getDate() + 1);
  }
  return jours;
}

function DialogueDeplacer({
  appel,
  onFermer,
  onFini,
}: {
  appel: AppelTraite;
  onFermer: () => void;
  onFini: (texte: string, erreur: boolean) => void;
}) {
  const { plages, etats, chargement } = useDisponibilites(appel.medecinId, 30);
  const [jour, setJour] = useState(appel.date);
  const [heure, setHeure] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  const creneaux = HEURES_JOURNEE.map((h) => ({
    heure: h,
    statut: statutCreneau(plages, etats, jour, h),
  })).filter((c) => c.statut !== "ferme" && creneauFutur(jour, c.heure));

  async function valider() {
    if (!heure || enCours) return;
    setEnCours(true);
    setErreur("");
    const res = await reprogrammerRdv(appel.id, jour, heure);
    setEnCours(false);
    if (res.erreur) return setErreur(res.erreur);
    onFini(
      `Rendez-vous de ${appel.patient} déplacé au ${formatDateLongue(jour)} à ${heure}. ${resumeEnvoi(res.envoi)}`,
      false
    );
  }

  return (
    <Dialogue
      titre="Déplacer le rendez-vous"
      icone="📅"
      sousTitre={`${appel.patient} · ${appel.medecin}`}
      onFermer={onFermer}
      pied={
        <>
          <button type="button" className={BTN_LEGER} onClick={onFermer}>
            Annuler
          </button>
          <button
            type="button"
            onClick={valider}
            disabled={!heure || enCours}
            className="flex-1 rounded-[10px] bg-teal px-4 py-2 text-[12.5px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {enCours ? "Déplacement…" : "Déplacer et prévenir le patient"}
          </button>
        </>
      }
    >
      <div className="p-4">
        <p className="mb-3 text-[12.5px] text-muted">
          Actuellement le {formatDateLongue(appel.date)} à {appel.heure}. Le patient recevra le
          nouvel horaire.
        </p>
        <label className="mb-1.5 block text-[12px] font-bold">Nouvelle date</label>
        <select
          className={CHAMP}
          value={jour}
          onChange={(e) => {
            setJour(e.target.value);
            setHeure(null);
          }}
        >
          {joursSuivants(21).map((j) => (
            <option key={j} value={j}>
              {capitaliser(formatDateLongue(j))}
            </option>
          ))}
        </select>

        <div className="mb-1.5 mt-3 text-[12px] font-bold">Créneau</div>
        {chargement ? (
          <p className="text-[12.5px] text-muted">Lecture de l’agenda…</p>
        ) : creneaux.length === 0 ? (
          <p className="text-[12.5px] text-muted">
            Rien d’ouvert ce jour-là chez ce praticien — choisissez une autre date.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {creneaux.map((c) => {
              const pris = c.statut === "reserve" && !(jour === appel.date && c.heure === appel.heure);
              return (
                <button
                  key={c.heure}
                  type="button"
                  disabled={pris}
                  aria-pressed={heure === c.heure}
                  onClick={() => setHeure(c.heure)}
                  className={`rounded-[10px] border-[1.5px] px-3 py-2 text-[12.5px] font-bold transition-colors ${
                    heure === c.heure
                      ? "border-teal bg-teal-soft text-blue"
                      : pris
                        ? "cursor-not-allowed border-line bg-[#F7F9FA] text-muted line-through"
                        : "border-line bg-white"
                  }`}
                >
                  {c.heure}
                </button>
              );
            })}
          </div>
        )}
        {erreur && (
          <p role="alert" className="mt-3 text-[12.5px] font-bold text-red">
            ⚠️ {erreur}
          </p>
        )}
      </div>
    </Dialogue>
  );
}

/* ===== Annuler ===== */

const MOTIFS_ANNULATION = [
  "Le patient s’est décommandé",
  "Le patient ne peut plus se déplacer",
  "Le praticien est indisponible",
  "Rendez-vous en double",
  "Erreur de saisie",
];

function DialogueAnnuler({
  appel,
  onFermer,
  onFini,
}: {
  appel: AppelTraite;
  onFermer: () => void;
  onFini: (texte: string, erreur: boolean) => void;
}) {
  const [motif, setMotif] = useState("");
  const [autre, setAutre] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  const retenu = motif === "autre" ? autre.trim() : motif;

  async function valider() {
    if (!retenu || enCours) return;
    setEnCours(true);
    setErreur("");
    const res = await annulerRdv(appel.id, retenu);
    setEnCours(false);
    if (res.erreur) return setErreur(res.erreur);
    onFini(`Rendez-vous de ${appel.patient} annulé. ${resumeEnvoi(res.envoi)}`, false);
  }

  return (
    <Dialogue
      titre="Annuler le rendez-vous"
      icone="✖️"
      sousTitre={`${appel.patient} · ${formatDateLongue(appel.date)} à ${appel.heure}`}
      onFermer={onFermer}
      pied={
        <>
          <button type="button" className={BTN_LEGER} onClick={onFermer}>
            Revenir
          </button>
          <button
            type="button"
            onClick={valider}
            disabled={!retenu || enCours}
            className="flex-1 rounded-[10px] bg-red px-4 py-2 text-[12.5px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {enCours ? "Annulation…" : "Annuler et prévenir"}
          </button>
        </>
      }
    >
      <div className="p-4">
        <p className="mb-3 text-[12.5px] text-muted">
          Le motif est obligatoire : le praticien le demandera, et l’opérateur suivant en a besoin.
          Le patient et le praticien sont prévenus. Rien n’est effacé — le rendez-vous reste au
          dossier, marqué annulé.
        </p>
        {MOTIFS_ANNULATION.map((m) => (
          <label key={m} className="mb-1.5 flex items-center gap-2 text-[12.5px] font-semibold">
            <input
              type="radio"
              name="motif-annulation"
              checked={motif === m}
              onChange={() => setMotif(m)}
            />
            {m}
          </label>
        ))}
        <label className="mb-1.5 flex items-center gap-2 text-[12.5px] font-semibold">
          <input
            type="radio"
            name="motif-annulation"
            checked={motif === "autre"}
            onChange={() => setMotif("autre")}
          />
          Autre motif
        </label>
        {motif === "autre" && (
          <input
            className={CHAMP}
            placeholder="Précisez"
            aria-label="Autre motif d’annulation"
            value={autre}
            onChange={(e) => setAutre(e.target.value)}
          />
        )}
        {erreur && (
          <p role="alert" className="mt-3 text-[12.5px] font-bold text-red">
            ⚠️ {erreur}
          </p>
        )}
      </div>
    </Dialogue>
  );
}

/* ===== Supprimer ===== */

function DialogueSupprimer({
  appel,
  onFermer,
  onFini,
}: {
  appel: AppelTraite;
  onFermer: () => void;
  onFini: (texte: string, erreur: boolean) => void;
}) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  async function valider() {
    if (enCours) return;
    setEnCours(true);
    setErreur("");
    const res = await supprimerRdv(appel.id);
    setEnCours(false);
    if (res.erreur) return setErreur(res.erreur);
    onFini(`Rendez-vous de ${appel.patient} supprimé définitivement.`, false);
  }

  return (
    <Dialogue
      titre="Supprimer définitivement"
      icone="🗑️"
      sousTitre={`${appel.patient} · ${formatDateLongue(appel.date)} à ${appel.heure}`}
      onFermer={onFermer}
      pied={
        <>
          <button type="button" className={BTN_LEGER} onClick={onFermer}>
            Revenir
          </button>
          <button
            type="button"
            onClick={valider}
            disabled={enCours}
            className="flex-1 rounded-[10px] bg-red px-4 py-2 text-[12.5px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {enCours ? "Suppression…" : "Supprimer"}
          </button>
        </>
      }
    >
      <div className="p-4">
        <p className="text-[12.5px] leading-relaxed text-muted">
          La ligne disparaît du dossier du patient et de l’agenda du praticien, et ne peut pas être
          rétablie. La trace au <b>journal d’audit</b>, elle, subsiste : elle dit qui a supprimé
          quoi.
        </p>
        <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
          À réserver aux <b>erreurs de saisie</b>. Un rendez-vous annulé garde sa valeur
          d’historique : il montre qu’il a existé, et pourquoi il n’a pas eu lieu.
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
