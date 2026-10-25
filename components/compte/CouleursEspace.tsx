"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { CHARTE_DEFAUT, construireCharte, normaliserHex } from "@/lib/charte-couleurs";
import { accentPlusSombre, controlerCharte, verdictGlobal, type Verdict } from "@/lib/lisibilite";
import {
  analyser, estCharteDefaut, instantane, instantaneServeur, sAbonner, type Charte,
} from "@/lib/charte-stockage";
import { ecrireCharteDuCompte } from "@/lib/charte-compte";

/*
 * « Couleurs de mon espace » — le réglage de charte, commun aux cinq rôles.
 *
 * Deux couleurs suffisent : tout le reste en découle (voir charte-couleurs).
 * On n'en demande pas davantage parce qu'une palette complète à régler à la
 * main produit surtout des interfaces illisibles.
 *
 * L'aperçu est cantonné à son encadré : les variables sont posées en style
 * en ligne sur ce seul bloc. On compare donc l'essai à l'espace réel qui
 * l'entoure, et rien ne change tant qu'on n'a pas enregistré.
 *
 * Les chartes proposées ont toutes été passées au contrôle de lisibilité :
 * aucune ne déclenche d'avertissement. Des teintes séduisantes en ont été
 * écartées — un accent violet avale le ✔️ des boutons de validation.
 */

/** Chartes prêtes à l'emploi, toutes vérifiées sans réserve. */
const CHARTES: { nom: string; principale: string; accent: string }[] = [
  { nom: "Docteur 224", principale: CHARTE_DEFAUT.principale, accent: CHARTE_DEFAUT.accent },
  { nom: "Océan", principale: "#0b3f4a", accent: "#0097aa" },
  { nom: "Émeraude", principale: "#0a4030", accent: "#109d7b" },
  { nom: "Terracotta", principale: "#5a2a14", accent: "#c25400" },
  { nom: "Bordeaux", principale: "#3a1218", accent: "#b4123a" },
  { nom: "Nuit & or", principale: "#232323", accent: "#9c7400" },
];

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

export default function CouleursEspace() {
  // La charte enregistrée fait foi ; l'essai en cours se pose par-dessus.
  // Lue par useSyncExternalStore plutôt que recopiée dans un état au montage :
  // le stockage est extérieur à React, et cette voie-là reste juste au rendu
  // serveur comme après coup, sans rendu intermédiaire à la mauvaise couleur.
  const brut = useSyncExternalStore(sAbonner, instantane, instantaneServeur);
  const enregistree = useMemo(() => analyser(brut) ?? CHARTE_DEFAUT, [brut]);

  const [essai, setEssai] = useState<Charte | null>(null);
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);
  const charte = essai ?? enregistree;
  const setCharte = (c: Charte | ((p: Charte) => Charte)) =>
    setEssai((p) => (typeof c === "function" ? c(p ?? enregistree) : c));

  const valide =
    normaliserHex(charte.principale) !== null && normaliserHex(charte.accent) !== null;

  const { palette, controles, verdict, accentSombre } = useMemo(() => {
    const p = construireCharte(charte.principale, charte.accent) as Record<string, string>;
    const c = controlerCharte(charte.principale, charte.accent);
    return {
      palette: p,
      controles: c,
      verdict: verdictGlobal(c),
      accentSombre: accentPlusSombre(charte.principale, charte.accent),
    };
  }, [charte]);

  const problemes = controles.filter((x) => x.verdict !== "lisible");
  const modifie =
    normaliserHex(charte.principale) !== normaliserHex(enregistree.principale) ||
    normaliserHex(charte.accent) !== normaliserHex(enregistree.accent);

  const [enCours, setEnCours] = useState(false);

  // La base d'abord, l'avance locale ensuite : c'est l'écriture distante qui
  // décide, et un échec ne doit pas laisser l'écran affirmer le contraire.
  const appliquerEnBase = async (voulue: Charte | null, succes: string) => {
    setEnCours(true);
    setMessage(null);
    // Le rejet est rattrapé ici et pas seulement l'échec annoncé : réseau
    // coupé ou session expirée lèvent une exception, et sans ce filet le
    // bouton resterait indéfiniment sur « Enregistrement… », sans un mot
    // pour dire ce qui s'est passé.
    const ok = await ecrireCharteDuCompte(voulue).catch(() => false);
    setEnCours(false);
    if (!ok) {
      setMessage({ texte: "Enregistrement impossible. Vérifiez votre connexion.", erreur: true });
      return;
    }
    setEssai(null); // l'essai devient la charte du compte
    setMessage({ texte: succes, erreur: false });
  };

  const enregistrer = () => appliquerEnBase(charte, "Couleurs enregistrées.");
  const reinitialiser = () =>
    appliquerEnBase(null, "Couleurs d’origine rétablies.");

  return (
    // L'ancre sert aux renvois depuis les écrans de réglages propres à un
    // rôle ; la marge de défilement évite que le titre se cale sous le
    // bandeau collant en arrivant.
    <section id="couleurs" className={`${CARTE} scroll-mt-20`}>
      <h3 className={TITRE_CARTE}>Couleurs de mon espace</h3>
      <small className="mb-4 block text-xs text-muted">
        Ne change que votre affichage. Les autres comptes, le site public et les
        documents que vous remettez gardent les couleurs de Docteur&nbsp;224.
      </small>

      {/* ---- chartes prêtes à l'emploi ---- */}
      <div className="mb-4 flex flex-wrap gap-2">
        {CHARTES.map((c) => {
          const actif =
            normaliserHex(charte.principale) === c.principale &&
            normaliserHex(charte.accent) === c.accent;
          return (
            <button
              key={c.nom}
              type="button"
              onClick={() => { setCharte({ principale: c.principale, accent: c.accent }); setMessage(null); }}
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
          id="charte-principale"
          libelle="Couleur principale"
          aide="Ton foncé — sert de fond aux en-têtes et aux bandeaux."
          valeur={charte.principale}
          sur={(v) => { setCharte((c) => ({ ...c, principale: v })); setMessage(null); }}
        />
        <Choix
          id="charte-accent"
          libelle="Couleur d’accent"
          aide="Ton plus clair — met en valeur les boutons et les liens."
          valeur={charte.accent}
          sur={(v) => { setCharte((c) => ({ ...c, accent: v })); setMessage(null); }}
        />
      </div>

      {accentSombre && (
        <p className="mb-3 rounded-[11px] bg-amber-soft px-[13px] py-2.5 text-[12.5px] font-semibold text-amber-ink">
          ⚠️ Votre accent est plus foncé que la couleur principale. La hiérarchie
          s’inverse : choisissez une principale foncée et un accent plus clair.
        </p>
      )}

      {/* ---- aperçu ---- */}
      <b className="mb-2 block text-[13px] font-bold">Aperçu</b>
      <div
        // Les variables ne valent que dans cet encadré : l'espace autour
        // garde ses couleurs, et l'essai se compare à l'existant.
        style={Object.fromEntries(
          Object.entries(palette).map(([n, v]) => [`--${n}`, v]),
        ) as React.CSSProperties}
        className="overflow-hidden rounded-[13px] border border-line"
      >
        <div className="flex items-center justify-between gap-3 bg-blue px-[15px] py-3">
          <div>
            <b className="block text-[15px] font-extrabold" style={{ color: palette["sur-principale"] }}>
              Votre espace
            </b>
            <small className="text-[12px] opacity-80" style={{ color: palette["sur-principale"] }}>
              Agenda · Patients · Documents
            </small>
          </div>
          <Pastille verdict={controles.find((c) => c.libelle === "Titres des bandeaux")!.verdict} />
        </div>

        <div className="bg-bg p-[15px]">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span
              className="pointer-coarse:py-3 inline-flex items-center gap-1.5 rounded-[10px] bg-teal px-[14px] py-2 text-[13px] font-bold"
              style={{ color: palette["sur-accent"] }}
            >
              <span aria-hidden>📅</span> Bouton principal
            </span>
            <Pastille verdict={controles.find((c) => c.libelle === "Texte des boutons")!.verdict} />
          </div>

          {/* Même composition que les encarts de l'application : texte bleu
              sur fond teinté, bordure claire. */}
          <div className="mb-3 rounded-[11px] border border-teal-line bg-teal-soft p-3">
            <b className="block text-[13px] font-bold text-blue">Encart d’accent clair</b>
            <small className="text-[12px] text-blue opacity-80">Information mise en avant</small>
          </div>

          {/* Les icônes sont des emoji : leurs couleurs ne changent jamais.
              Les montrer sur l'aplat choisi est le seul moyen honnête de
              laisser juger — d'où cette rangée dans l'aperçu. */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex flex-wrap gap-1.5 rounded-[10px] bg-teal px-2.5 py-1.5 text-[15px]" aria-hidden>
              {["🔒", "📅", "✔️", "🏠", "🚩", "📜", "🧑", "✉️"].map((e) => (
                <span key={e}>{e}</span>
              ))}
            </span>
            <Pastille
              verdict={controles.find((c) => c.categorie === "icone" && c.libelle.includes("pastilles"))!.verdict}
            />
          </div>
        </div>
      </div>

      {/* ---- ce qui cloche ---- */}
      <div className="mt-3 flex items-center gap-2">
        <Pastille verdict={verdict} />
        <small className="text-xs text-muted">
          {verdict === "lisible"
            ? "Tout reste lisible avec ces couleurs."
            : `${problemes.length} point${problemes.length > 1 ? "s" : ""} à regarder.`}
        </small>
      </div>
      {problemes.length > 0 && (
        <ul className="mt-2 grid gap-1.5">
          {problemes.map((p) => (
            <li key={p.libelle} className="flex items-start gap-2 text-[12.5px] leading-snug">
              <span aria-hidden className="flex-none">{p.verdict === "illisible" ? "✖" : "⚠️"}</span>
              <span className={p.verdict === "illisible" ? "text-red" : "text-amber-ink"}>
                {p.libelle}
                {p.categorie !== "icone" && (
                  <span className="text-muted"> — contraste {p.mesure.toFixed(1)}:1</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* ---- actions ---- */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={enregistrer}
          // Une charte illisible ne s'enregistre pas : l'avertissement seul
          // laisserait des comptes bloqués sur une interface inutilisable,
          // sans pouvoir retrouver le bouton qui l'en sortirait.
          disabled={!valide || verdict === "illisible" || !modifie || enCours}
          className="pointer-coarse:py-[13px] rounded-[10px] bg-teal px-[18px] py-[11px] text-[13.5px] font-bold text-white transition-colors hover:bg-teal-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {enCours ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={reinitialiser}
          disabled={enCours || (estCharteDefaut(charte) && estCharteDefaut(enregistree))}
          className="pointer-coarse:py-[13px] rounded-[10px] border-[1.5px] border-line bg-white px-[18px] py-[11px] text-[13.5px] font-bold text-blue transition-colors hover:bg-bg disabled:cursor-not-allowed disabled:opacity-50"
        >
          Couleurs d’origine
        </button>
        {verdict === "illisible" && (
          <small className="text-[12px] font-semibold text-red">
            Corrigez les points ✖ pour pouvoir enregistrer.
          </small>
        )}
        {message && (
          <small
            role="status"
            className={`text-[12px] font-semibold ${message.erreur ? "text-red" : "text-green"}`}
          >
            {message.texte}
          </small>
        )}
      </div>
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
      <label htmlFor={id} className="mb-1.5 block text-[12.5px] font-bold text-ink">
        {libelle}
      </label>
      <div className="flex items-center gap-2">
        <input
          // Le sélecteur natif n'accepte que « #rrggbb » : on ne lui passe
          // jamais une saisie en cours de frappe.
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
