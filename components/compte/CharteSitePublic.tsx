"use client";

import { useEffect, useMemo, useState } from "react";
import { construireCharte, contraste, normaliserHex } from "@/lib/charte-couleurs";
import { verdictElement, verdictTexte, type Verdict } from "@/lib/lisibilite";
import {
  CHARTES_PUBLIQUES_PRETES, CHARTE_PUBLIQUE_DEFAUT,
} from "@/lib/chartes-publiques-pretes";
import {
  ecrireChartePublique, lireChartePublique,
} from "@/lib/charte-publique-compte";
import { estActive, type ChartePublique } from "@/lib/charte-publique";

/*
 * « Couleurs du site public » — RÉSERVÉ À L'ADMINISTRATION (permission
 * Paramètres). Distinct de « Couleurs de mon espace » juste au-dessus : ici
 * on habille les pages PUBLIQUES, pour tout le monde, le temps d'une campagne
 * (Octobre Rose…). Passé la date de fin, le site revient de lui-même à la
 * charte Docteur 224.
 *
 * L'aperçu montre une page publique (héros, recherche, spécialités) et non le
 * tableau de bord : c'est bien le site public que ces couleurs touchent.
 */

const CARTE = "rounded-2xl border border-line bg-white p-5";
const TITRE_CARTE = "mb-1 text-[15px] font-extrabold";

const PASTILLE: Record<Verdict, string> = {
  lisible: "bg-green-soft text-green",
  moyen: "bg-amber-soft text-amber-ink",
  illisible: "bg-red-soft text-red",
};
const MOT: Record<Verdict, string> = {
  lisible: "✓ Lisible",
  moyen: "⚠️ Contraste moyen",
  illisible: "✖ Illisible",
};

/** yyyy-mm-dd (fuseau local) d'une date ISO, pour un <input type="date">. */
function isoVersJour(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
/** Début de journée locale -> ISO ; fin de journée locale -> ISO. */
const jourVersDebut = (j: string) => (j ? new Date(`${j}T00:00:00`).toISOString() : null);
const jourVersFin = (j: string) => (j ? new Date(`${j}T23:59:59.999`).toISOString() : null);

const pireVerdict = (vs: Verdict[]): Verdict =>
  vs.includes("illisible") ? "illisible" : vs.includes("moyen") ? "moyen" : "lisible";

type Etat = "active" | "programmee" | "terminee" | null;
/** Où en est la campagne enregistrée, à l'instant où on la (re)lit. */
function calculerEtat(c: ChartePublique | null): Etat {
  if (!c) return null;
  const now = Date.now();
  if (c.debut && now < Date.parse(c.debut)) return "programmee";
  if (estActive(c, now)) return "active";
  return "terminee";
}

export default function CharteSitePublic() {
  const [principale, setPrincipale] = useState(CHARTE_PUBLIQUE_DEFAUT.principale);
  const [accent, setAccent] = useState(CHARTE_PUBLIQUE_DEFAUT.accent);
  const [jourDebut, setJourDebut] = useState("");
  const [jourFin, setJourFin] = useState("");
  const [enregistree, setEnregistree] = useState<ChartePublique | null>(null);
  const [etat, setEtat] = useState<Etat>(null);
  const [chargement, setChargement] = useState(true);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);

  useEffect(() => {
    let actif = true;
    lireChartePublique()
      .then((c) => {
        if (!actif) return;
        setEnregistree(c);
        setEtat(calculerEtat(c));
        if (c) {
          setPrincipale(c.principale);
          setAccent(c.accent);
          setJourDebut(isoVersJour(c.debut));
          setJourFin(isoVersJour(c.fin));
        }
      })
      .catch(() => {})
      .finally(() => actif && setChargement(false));
    return () => { actif = false; };
  }, []);

  const valideCouleurs =
    normaliserHex(principale) !== null && normaliserHex(accent) !== null;

  const { palette, controles, verdict } = useMemo(() => {
    const p = construireCharte(principale, accent) as Record<string, string>;
    const c = [
      { libelle: "Titre sur le héros", v: verdictTexte(contraste(p.blue, p["sur-principale"])) },
      { libelle: "Texte des boutons", v: verdictElement(contraste(p.teal, p["sur-accent"])) },
      { libelle: "Liens d’accent (sur blanc)", v: verdictTexte(contraste(p.teal, "#ffffff")) },
    ];
    return { palette: p, controles: c, verdict: pireVerdict(c.map((x) => x.v)) };
  }, [principale, accent]);

  const problemes = controles.filter((x) => x.v !== "lisible");

  const datesCompletes = jourDebut !== "" && jourFin !== "";
  const finApresDebut = !datesCompletes || jourDebut <= jourFin;
  const peutEnregistrer =
    valideCouleurs && datesCompletes && finApresDebut && verdict !== "illisible" && !enCours;


  async function activer() {
    if (!peutEnregistrer) return;
    setEnCours(true);
    setMessage(null);
    const charte: ChartePublique = {
      principale: normaliserHex(principale)!,
      accent: normaliserHex(accent)!,
      debut: jourVersDebut(jourDebut),
      fin: jourVersFin(jourFin),
    };
    const ok = await ecrireChartePublique(charte).catch(() => false);
    setEnCours(false);
    if (!ok) {
      setMessage({ texte: "Enregistrement impossible. Vérifiez votre connexion.", erreur: true });
      return;
    }
    setEnregistree(charte);
    setEtat(calculerEtat(charte));
    setMessage({ texte: "Campagne enregistrée. Les pages publiques l’afficheront pendant la période choisie.", erreur: false });
  }

  async function reinitialiser() {
    setEnCours(true);
    setMessage(null);
    const ok = await ecrireChartePublique(null).catch(() => false);
    setEnCours(false);
    if (!ok) {
      setMessage({ texte: "Impossible de rétablir les couleurs d’origine.", erreur: true });
      return;
    }
    setEnregistree(null);
    setEtat(null);
    setPrincipale(CHARTE_PUBLIQUE_DEFAUT.principale);
    setAccent(CHARTE_PUBLIQUE_DEFAUT.accent);
    setJourDebut("");
    setJourFin("");
    setMessage({ texte: "Le site public est revenu aux couleurs Docteur 224.", erreur: false });
  }

  return (
    <section id="couleurs-site-public" className={`${CARTE} scroll-mt-20`}>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className={TITRE_CARTE}>Couleurs du site public</h3>
        {etat && (
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
              etat === "active"
                ? "bg-green-soft text-green"
                : etat === "programmee"
                  ? "bg-teal-soft text-blue"
                  : "bg-amber-soft text-amber-ink"
            }`}
          >
            {etat === "active" ? "Campagne en cours" : etat === "programmee" ? "Programmée" : "Terminée"}
          </span>
        )}
      </div>
      <small className="mb-4 block text-xs text-muted">
        Habille <b>uniquement les pages publiques</b> (accueil, recherche, À propos,
        FAQ…) le temps d’une cause — Octobre Rose, par exemple. Les espaces
        connectés et les documents remis gardent leurs couleurs. Passé la date de
        fin, le site revient aux couleurs de Docteur&nbsp;224.
      </small>

      {chargement ? (
        <p className="py-3 text-[12.5px] text-muted">Chargement…</p>
      ) : (
        <>
          {/* ---- habillages prêts à l'emploi ---- */}
          <div className="mb-4 flex flex-wrap gap-2">
            {CHARTES_PUBLIQUES_PRETES.map((c) => {
              const actif =
                normaliserHex(principale) === c.principale &&
                normaliserHex(accent) === c.accent;
              return (
                <button
                  key={c.nom}
                  type="button"
                  onClick={() => { setPrincipale(c.principale); setAccent(c.accent); setMessage(null); }}
                  aria-pressed={actif}
                  className={`pointer-coarse:py-3 flex items-center gap-2 rounded-full border-[1.5px] px-[13px] py-2 text-[12.5px] font-bold transition-colors ${
                    actif ? "border-teal bg-teal-soft text-blue" : "border-line bg-white text-ink hover:bg-bg"
                  }`}
                >
                  <span aria-hidden className="flex gap-1">
                    <i className="block h-[13px] w-[13px] rounded-full" style={{ background: c.principale }} />
                    <i className="block h-[13px] w-[13px] rounded-full" style={{ background: c.accent }} />
                  </span>
                  {c.nom}
                </button>
              );
            })}
          </div>

          {/* ---- les deux couleurs ---- */}
          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            <Choix
              id="site-principale"
              libelle="Couleur principale"
              aide="Ton foncé — sert de fond au héros et aux bandeaux."
              valeur={principale}
              sur={(v) => { setPrincipale(v); setMessage(null); }}
            />
            <Choix
              id="site-accent"
              libelle="Couleur d’accent"
              aide="Ton plus clair — met en valeur les boutons et les liens."
              valeur={accent}
              sur={(v) => { setAccent(v); setMessage(null); }}
            />
          </div>

          {/* ---- période ---- */}
          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            <DateChoix id="site-debut" libelle="Début de la campagne" valeur={jourDebut} sur={(v) => { setJourDebut(v); setMessage(null); }} />
            <DateChoix id="site-fin" libelle="Fin de la campagne" valeur={jourFin} min={jourDebut || undefined} sur={(v) => { setJourFin(v); setMessage(null); }} />
          </div>
          {datesCompletes && !finApresDebut && (
            <p className="mb-3 rounded-[11px] bg-amber-soft px-[13px] py-2.5 text-[12.5px] font-semibold text-amber-ink">
              ⚠️ La date de fin précède la date de début.
            </p>
          )}

          {/* ---- aperçu d'une page publique ---- */}
          <b className="mb-2 block text-[13px] font-bold">Aperçu d’une page publique</b>
          <div
            style={Object.fromEntries(
              Object.entries(palette).map(([n, v]) => [`--${n}`, v]),
            ) as React.CSSProperties}
            className="overflow-hidden rounded-[13px] border border-line"
          >
            {/* héros */}
            <div className="bg-blue px-[18px] py-5">
              <b className="block text-[16px] font-extrabold" style={{ color: palette["sur-principale"] }}>
                Trouvez un médecin
              </b>
              <small className="mb-3 block text-[12px] opacity-80" style={{ color: palette["sur-principale"] }}>
                Réservez en quelques clics, confirmation par SMS.
              </small>
              <div className="flex items-center gap-2 rounded-[12px] bg-white p-2">
                <span className="flex-1 px-2 text-[12px] text-muted">Spécialité, ville…</span>
                <span
                  className="inline-flex items-center gap-1.5 rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold"
                  style={{ color: palette["sur-accent"] }}
                >
                  <span aria-hidden>🔍</span> Rechercher
                </span>
              </div>
            </div>
            {/* spécialités, sur cartes blanches : les emoji ne bougent pas */}
            <div className="bg-bg px-[18px] py-4">
              <div className="flex flex-wrap gap-2">
                {[["🩺", "Médecine générale"], ["🌸", "Gynécologie"], ["❤️", "Cardiologie"], ["👁️", "Ophtalmologie"]].map(
                  ([e, l]) => (
                    <span key={l} className="flex items-center gap-1.5 rounded-[10px] border border-line bg-white px-2.5 py-1.5 text-[12px] font-bold text-ink">
                      <span aria-hidden>{e}</span> {l}
                    </span>
                  ),
                )}
              </div>
              <p className="mt-3 text-[12px]">
                <a className="font-bold text-teal underline">Lire nos conseils santé</a>
                <span className="text-muted"> — un lien d’accent sur fond clair.</span>
              </p>
            </div>
          </div>

          {/* ---- ce qui cloche ---- */}
          <div className="mt-3 flex items-center gap-2">
            <Pastille verdict={verdict} />
            <small className="text-xs text-muted">
              {verdict === "lisible"
                ? "Tout reste lisible sur les pages publiques."
                : `${problemes.length} point${problemes.length > 1 ? "s" : ""} à regarder.`}
            </small>
          </div>
          {problemes.length > 0 && (
            <ul className="mt-2 grid gap-1.5">
              {problemes.map((p) => (
                <li key={p.libelle} className="flex items-start gap-2 text-[12.5px] leading-snug">
                  <span aria-hidden className="flex-none">{p.v === "illisible" ? "✖" : "⚠️"}</span>
                  <span className={p.v === "illisible" ? "text-red" : "text-amber-ink"}>{p.libelle}</span>
                </li>
              ))}
            </ul>
          )}

          {/* ---- actions ---- */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={activer}
              disabled={!peutEnregistrer}
              className="pointer-coarse:py-[13px] rounded-[10px] bg-teal px-[18px] py-[11px] text-[13.5px] font-bold text-white transition-colors hover:bg-teal-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {enCours ? "Enregistrement…" : "Activer la campagne"}
            </button>
            <button
              type="button"
              onClick={reinitialiser}
              disabled={enCours || !enregistree}
              className="pointer-coarse:py-[13px] rounded-[10px] border-[1.5px] border-line bg-white px-[18px] py-[11px] text-[13.5px] font-bold text-blue transition-colors hover:bg-bg disabled:cursor-not-allowed disabled:opacity-50"
            >
              Couleurs d’origine
            </button>
            {verdict === "illisible" && (
              <small className="text-[12px] font-semibold text-red">
                Corrigez les points ✖ pour pouvoir activer.
              </small>
            )}
            {!datesCompletes && valideCouleurs && verdict !== "illisible" && (
              <small className="text-[12px] font-semibold text-muted">
                Choisissez une date de début et de fin.
              </small>
            )}
            {message && (
              <small role="status" className={`text-[12px] font-semibold ${message.erreur ? "text-red" : "text-green"}`}>
                {message.texte}
              </small>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function Pastille({ verdict }: { verdict: Verdict }) {
  return (
    <span className={`flex-none rounded-full px-2.5 py-1 text-[11.5px] font-bold ${PASTILLE[verdict]}`}>
      {MOT[verdict]}
    </span>
  );
}

function Choix({
  id, libelle, aide, valeur, sur,
}: {
  id: string; libelle: string; aide: string; valeur: string; sur: (v: string) => void;
}) {
  const normalisee = normaliserHex(valeur);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[12.5px] font-bold text-ink">{libelle}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={normalisee ?? "#000000"}
          onChange={(e) => sur(e.target.value)}
          aria-label={`${libelle} — nuancier`}
          className="h-[38px] w-[52px] flex-none cursor-pointer rounded-[9px] border border-line bg-white p-1"
        />
        <input
          id={id}
          type="text"
          value={valeur}
          onChange={(e) => sur(e.target.value)}
          spellCheck={false}
          aria-invalid={normalisee === null}
          className={`w-full rounded-[9px] border bg-white px-3 py-2 font-mono text-[13px] uppercase outline-none focus:border-teal ${
            normalisee === null ? "border-red text-red" : "border-line"
          }`}
        />
      </div>
      <small className="mt-1 block text-[11.5px] leading-snug text-muted">
        {normalisee === null ? "Couleur attendue au format #RRGGBB." : aide}
      </small>
    </div>
  );
}

function DateChoix({
  id, libelle, valeur, min, sur,
}: {
  id: string; libelle: string; valeur: string; min?: string; sur: (v: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[12.5px] font-bold text-ink">{libelle}</label>
      <input
        id={id}
        type="date"
        value={valeur}
        min={min}
        onChange={(e) => sur(e.target.value)}
        className="w-full rounded-[9px] border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-teal"
      />
    </div>
  );
}
