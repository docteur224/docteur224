"use client";

import { useId, useMemo, useState } from "react";

/**
 * FAQ rendue trouvable (spec « l'utilisateur trouve sa réponse »).
 *
 * La page serveur garde le contenu (data + balisage FAQPage pour Google) ;
 * ce composant client n'ajoute que ce qui demande de l'interactivité :
 *
 *  - une recherche instantanée, insensible à la casse ET aux accents
 *    (« reserver » trouve « réserver ») qui filtre sur la question ET la
 *    réponse — on tombe sur la bonne entrée même sans connaître son intitulé ;
 *  - des filtres par rubrique, pour parcourir un thème d'un coup ;
 *  - le surlignage des termes trouvés et l'ouverture automatique des réponses
 *    qui correspondent, pour que l'œil aille droit au but ;
 *  - un compteur et un état « aucun résultat » qui ne laisse pas l'utilisateur
 *    dans une impasse.
 *
 * Sans JavaScript, le composant s'affiche dans son état initial : toutes les
 * questions, en accordéons repliables classiques. Rien n'est caché derrière la
 * recherche.
 */

export type QuestionFaq = { q: string; r: string };
export type GroupeFaq = { rubrique: string; questions: QuestionFaq[] };

/** Replie « é/è/ê » sur « e », passe en minuscules : la base de comparaison. */
function aplatir(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Découpe la saisie en mots ; tous doivent être présents (recherche ET). */
function motsCles(requete: string): string[] {
  return aplatir(requete.trim()).split(/\s+/).filter(Boolean);
}

/** Variantes accentuées par lettre, pour surligner malgré les accents. */
const VARIANTES: Record<string, string> = {
  a: "aàâä",
  c: "cç",
  e: "eéèêë",
  i: "iîï",
  o: "oôö",
  u: "uùûü",
  y: "yÿ",
};

function echapper(c: string): string {
  return c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Construit, à partir des mots cherchés, un motif qui tolère les accents. */
function motifSurlignage(mots: string[]): RegExp | null {
  if (mots.length === 0) return null;
  const alternatives = mots
    .map((mot) =>
      [...mot]
        .map((c) => {
          const classe = VARIANTES[c];
          return classe ? `[${classe}]` : echapper(c);
        })
        .join(""),
    )
    .sort((a, b) => b.length - a.length); // le plus long gagne
  return new RegExp(`(${alternatives.join("|")})`, "gi");
}

/** Renvoie le texte avec les portions trouvées encadrées de <mark>. */
function surligner(texte: string, motif: RegExp | null) {
  if (!motif) return texte;
  const morceaux = texte.split(motif);
  return morceaux.map((morceau, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded-[3px] bg-amber-200 px-0.5 text-ink">
        {morceau}
      </mark>
    ) : (
      morceau
    ),
  );
}

export default function FaqInteractive({ groupes }: { groupes: GroupeFaq[] }) {
  const [requete, setRequete] = useState("");
  const [rubriqueActive, setRubriqueActive] = useState<string | null>(null);
  const [ouverts, setOuverts] = useState<Set<string>>(() => new Set());
  const champId = useId();

  const mots = useMemo(() => motsCles(requete), [requete]);
  const motif = useMemo(() => motifSurlignage(mots), [mots]);
  const enRecherche = mots.length > 0;

  // Chaque question porte un index aplati (question + réponse) ; un résultat
  // doit contenir tous les mots cherchés.
  const groupesFiltres = useMemo(() => {
    return groupes
      .filter((g) => !rubriqueActive || g.rubrique === rubriqueActive)
      .map((g) => ({
        rubrique: g.rubrique,
        questions: g.questions.filter((item) => {
          if (!enRecherche) return true;
          const index = aplatir(`${item.q} ${item.r}`);
          return mots.every((mot) => index.includes(mot));
        }),
      }))
      .filter((g) => g.questions.length > 0);
  }, [groupes, rubriqueActive, mots, enRecherche]);

  const total = useMemo(
    () => groupesFiltres.reduce((n, g) => n + g.questions.length, 0),
    [groupesFiltres],
  );

  const basculer = (cle: string, open: boolean) => {
    setOuverts((prec) => {
      const suivant = new Set(prec);
      if (open) suivant.add(cle);
      else suivant.delete(cle);
      return suivant;
    });
  };

  return (
    <div>
      {/* ---------- Barre de recherche ---------- */}
      <div className="sticky top-2 z-10 mb-4 rounded-2xl border border-line bg-white/95 p-2.5 shadow-[0_6px_20px_rgba(0,0,0,.05)] backdrop-blur md:mb-5 md:p-3">
        <div className="relative">
          <span
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[16px] opacity-60"
          >
            🔎
          </span>
          <input
            id={champId}
            type="search"
            inputMode="search"
            autoComplete="off"
            value={requete}
            onChange={(e) => setRequete(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setRequete("");
            }}
            placeholder="Rechercher une question… (ex. annuler, proche, avis)"
            aria-label="Rechercher dans les questions fréquentes"
            className="w-full rounded-xl border border-line bg-bg py-3 pl-11 pr-10 text-[14px] font-semibold text-ink outline-none transition-colors focus:border-teal focus:bg-white"
          />
          {requete && (
            <button
              type="button"
              onClick={() => setRequete("")}
              aria-label="Effacer la recherche"
              className="absolute right-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-[15px] font-bold text-muted transition-colors hover:bg-bg hover:text-ink"
            >
              ×
            </button>
          )}
        </div>

        {/* ---------- Filtres par rubrique ---------- */}
        <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label="Filtrer par thème">
          <PuceFiltre
            actif={rubriqueActive === null}
            onClick={() => setRubriqueActive(null)}
          >
            Tout
          </PuceFiltre>
          {groupes.map((g) => (
            <PuceFiltre
              key={g.rubrique}
              actif={rubriqueActive === g.rubrique}
              onClick={() =>
                setRubriqueActive((prec) => (prec === g.rubrique ? null : g.rubrique))
              }
            >
              {g.rubrique}
            </PuceFiltre>
          ))}
        </div>
      </div>

      {/* ---------- Compteur ---------- */}
      {(enRecherche || rubriqueActive) && (
        <p className="mb-3 px-1 text-[12.5px] font-semibold text-muted" aria-live="polite">
          {total === 0
            ? "Aucune réponse ne correspond"
            : `${total} réponse${total > 1 ? "s" : ""}`}
          {enRecherche && (
            <>
              {" "}pour «&nbsp;<span className="text-ink">{requete.trim()}</span>&nbsp;»
            </>
          )}
        </p>
      )}

      {/* ---------- Résultats ---------- */}
      {total === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-white p-8 text-center">
          <div className="text-[30px]" aria-hidden>
            🧐
          </div>
          <p className="mt-2 text-[14px] font-extrabold text-ink">
            Rien trouvé pour cette recherche
          </p>
          <p className="mx-auto mt-1 max-w-[380px] text-[13px] leading-relaxed text-muted">
            Essayez un autre mot-clé, ou posez votre question directement au secrétariat du
            praticien — son numéro figure sur sa fiche.
          </p>
          <button
            type="button"
            onClick={() => {
              setRequete("");
              setRubriqueActive(null);
            }}
            className="mt-4 rounded-[11px] border-[1.5px] border-line bg-white px-[18px] py-[9px] text-[13px] font-bold text-blue transition-colors hover:bg-bg"
          >
            Réinitialiser la recherche
          </button>
        </div>
      ) : (
        groupesFiltres.map((groupe) => (
          <div key={groupe.rubrique}>
            <h2 className="mb-2.5 mt-6 text-[12px] font-extrabold uppercase tracking-[0.1em] text-muted first:mt-0 md:mb-3 md:mt-9 md:text-[13px]">
              {groupe.rubrique}
            </h2>
            {groupe.questions.map((item) => {
              const cle = `${groupe.rubrique}::${item.q}`;
              const estOuvert = enRecherche || ouverts.has(cle);
              return (
                <details
                  key={cle}
                  open={estOuvert}
                  onToggle={(e) => basculer(cle, (e.target as HTMLDetailsElement).open)}
                  className="group mb-2 overflow-hidden rounded-2xl border border-line bg-white md:mb-2.5"
                >
                  <summary className="flex cursor-pointer list-none items-center gap-3 p-[16px] text-[13.5px] font-extrabold md:p-5 md:text-[15px]">
                    <span className="flex-1">{surligner(item.q, motif)}</span>
                    <span
                      aria-hidden
                      className="grid h-[26px] w-[26px] flex-none place-items-center rounded-full bg-teal-soft text-[15px] font-extrabold text-blue transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="border-t border-line px-[16px] py-[14px] text-[13px] leading-relaxed text-muted md:px-5 md:py-[18px] md:text-[14px]">
                    {surligner(item.r, motif)}
                  </p>
                </details>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}

/** Puce de filtre — même grammaire visuelle que les boutons du site. */
function PuceFiltre({
  actif,
  onClick,
  children,
}: {
  actif: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={
        "rounded-full px-3 py-1.5 text-[12.5px] font-bold transition-colors " +
        (actif
          ? "bg-teal text-white"
          : "border border-line bg-white text-muted hover:border-teal-line hover:text-blue")
      }
    >
      {children}
    </button>
  );
}
