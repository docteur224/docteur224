"use client";

import { useCallback, useMemo, useState } from "react";
import Dialogue from "@/components/site/Dialogue";
import Icone from "@/components/site/Icone";
import { invaliderConstante, type Constante } from "@/lib/dossier-clinique";
import {
  dansPeriode,
  evaluerGlycemie,
  evaluerTension,
  LIBELLES_CONTEXTE,
  nombreFr,
  PERIODES,
  variationPoids,
  type Periode,
} from "@/lib/normes-constantes";
import { BTN_DANGER, BTN_NEUTRE, BTN_PRIMAIRE, CARTE, COMPTE, EtatVide, Squelettes, TITRE_SECTION } from "../ui";
import { CLASSE_CHAMP, CLASSE_ETIQUETTE, dateHeure, PastilleEtat } from "./commun";
import CourbeConstante, { type SerieCourbe } from "./CourbeConstante";

/*
 * Constantes : dernière valeur de chaque mesure, courbe d'évolution, et
 * historique complet.
 *
 * Une mesure marquée erronée reste dans l'historique, barrée avec son motif,
 * mais sort des tuiles et des courbes : c'est la valeur fausse qu'on retire
 * du raisonnement, pas la trace de sa saisie.
 */

type Mesure = "poids" | "tension" | "glycemie";

const ONGLETS: { valeur: Mesure; libelle: string }[] = [
  { valeur: "poids", libelle: "Poids" },
  { valeur: "tension", libelle: "Tension" },
  { valeur: "glycemie", libelle: "Glycémie" },
];

// Couleurs de série validées (contraste, daltonisme) sur fond blanc.
// L'ambre et le rouge restent réservés aux valeurs anormales.
const SERIE_1 = "#2e9cca";
const SERIE_2 = "#6250d6";

const PAR_PAGE = 8;

export default function SectionConstantes({
  mesures,
  chargement,
  onSaisir,
  onChange,
  onErreur,
}: {
  mesures: Constante[];
  chargement: boolean;
  onSaisir: () => void;
  onChange: (message: string) => void;
  onErreur: (message: string) => void;
}) {
  const [mesure, setMesure] = useState<Mesure>("tension");
  const [periode, setPeriode] = useState<Periode>("6m");
  const [toutVoir, setToutVoir] = useState(false);
  const [aInvalider, setAInvalider] = useState<Constante | null>(null);
  // Lu une fois : la période se compte depuis l'ouverture de l'onglet.
  const [maintenant] = useState(() => new Date());

  const valides = useMemo(() => mesures.filter((m) => !m.erronee), [mesures]);
  const dernierPoids = valides.filter((m) => m.poidsKg !== null);
  const derniereTension = valides.find((m) => m.sys !== null);
  const derniereGlycemie = valides.find((m) => m.glycemie !== null);

  const series: SerieCourbe[] = useMemo(() => {
    const dans = (liste: Constante[]) => dansPeriode(liste, periode, maintenant);
    if (mesure === "poids") {
      return [
        {
          id: "poids",
          nom: "Poids",
          couleur: SERIE_1,
          points: dans(valides.filter((m) => m.poidsKg !== null)).map((m) => ({ le: m.le, v: m.poidsKg! })),
        },
      ];
    }
    if (mesure === "glycemie") {
      return [
        {
          id: "glycemie",
          nom: "Glycémie",
          couleur: SERIE_1,
          points: dans(valides.filter((m) => m.glycemie !== null)).map((m) => {
            const e = evaluerGlycemie(m.glycemie!, m.contexte!);
            return { le: m.le, v: m.glycemie!, niveau: e.niveau, note: `${e.libelle} · ${LIBELLES_CONTEXTE[m.contexte!]}` };
          }),
        },
      ];
    }
    const t = dans(valides.filter((m) => m.sys !== null));
    const etat = (m: Constante) => evaluerTension(m.sys!, m.dia!);
    return [
      { id: "sys", nom: "Systolique", couleur: SERIE_1, points: t.map((m) => ({ le: m.le, v: m.sys!, niveau: etat(m).niveau, note: etat(m).libelle })) },
      { id: "dia", nom: "Diastolique", couleur: SERIE_2, points: t.map((m) => ({ le: m.le, v: m.dia!, niveau: etat(m).niveau, note: etat(m).libelle })) },
    ];
  }, [mesure, periode, valides, maintenant]);

  const nbPoints = series[0]?.points.length ?? 0;
  const unite = mesure === "poids" ? "kg" : mesure === "tension" ? "mmHg" : "g/L";
  const visibles = toutVoir ? mesures : mesures.slice(0, PAR_PAGE);

  const fermerInvalidation = useCallback(() => setAInvalider(null), []);

  /* ---------- Tuiles ---------- */
  const variation =
    dernierPoids.length > 1
      ? variationPoids({ kg: dernierPoids[1].poidsKg!, le: dernierPoids[1].le }, { kg: dernierPoids[0].poidsKg!, le: dernierPoids[0].le })
      : null;

  const tuiles = [
    {
      titre: "Poids",
      valeur: dernierPoids[0] ? `${nombreFr(dernierPoids[0].poidsKg!)} kg` : "—",
      le: dernierPoids[0]?.le,
      etat:
        variation?.signalee
          ? { niveau: "attention" as const, libelle: `${variation.pourcentage > 0 ? "+" : ""}${nombreFr(variation.pourcentage)} % en peu de temps` }
          : null,
      complement: variation && !variation.signalee ? `${variation.pourcentage > 0 ? "+" : ""}${nombreFr(variation.pourcentage)} % depuis la pesée précédente` : null,
    },
    {
      titre: "Tension",
      valeur: derniereTension ? `${derniereTension.sys}/${derniereTension.dia} mmHg` : "—",
      le: derniereTension?.le,
      etat: derniereTension ? evaluerTension(derniereTension.sys!, derniereTension.dia!) : null,
      complement: null,
    },
    {
      titre: "Glycémie",
      valeur: derniereGlycemie ? `${nombreFr(derniereGlycemie.glycemie!, 2)} g/L` : "—",
      le: derniereGlycemie?.le,
      etat: derniereGlycemie ? evaluerGlycemie(derniereGlycemie.glycemie!, derniereGlycemie.contexte!) : null,
      complement: derniereGlycemie ? LIBELLES_CONTEXTE[derniereGlycemie.contexte!] : null,
    },
  ];

  return (
    <section className={CARTE} aria-labelledby="titre-constantes">
      {aInvalider && (
        <InvaliderMesure
          mesure={aInvalider}
          onFermer={fermerInvalidation}
          onFait={() => {
            setAInvalider(null);
            onChange("Mesure marquée comme erronée — elle reste dans l’historique, hors des courbes");
          }}
          onErreur={onErreur}
        />
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
        <h3 id="titre-constantes" className={TITRE_SECTION}>
          Constantes <span className={COMPTE}>({valides.length})</span>
        </h3>
        <button type="button" onClick={onSaisir} className={`${BTN_PRIMAIRE} max-md:flex-1`}>
          <Icone nom="plus" taille={15} epaisseur={2.4} />
          Saisir des constantes
        </button>
      </div>

      {chargement ? (
        <Squelettes n={2} hauteur={90} />
      ) : mesures.length === 0 ? (
        <EtatVide
          icone="historique"
          titre="Aucune constante pour l’instant"
          texte="Poids, tension et glycémie saisis ici forment les courbes d’évolution du patient."
          action={
            <button type="button" onClick={onSaisir} className={BTN_PRIMAIRE}>
              Saisir les premières constantes
            </button>
          }
        />
      ) : (
        <div className="grid gap-5">
          {/* ---- Dernières valeurs ---- */}
          <div className="grid gap-3 sm:grid-cols-3">
            {/* Téléphone : une ligne par mesure (libellé à gauche, valeur à
                droite) — trois tuiles empilées repoussaient la courbe sous
                la ligne de flottaison. Tuiles à partir de sm. */}
            {tuiles.map((t) => (
              <div
                key={t.titre}
                className="flex items-start justify-between gap-3 rounded-xl border border-line px-3.5 py-3 sm:block sm:p-3.5"
              >
                <div className="min-w-0">
                  <div className="text-[12px] font-bold text-muted">{t.titre}</div>
                  <div className="mt-1 text-[17px] font-extrabold tracking-[-0.2px] sm:text-[19px]">{t.valeur}</div>
                </div>
                <div className="flex flex-col items-end gap-1 text-right sm:items-start sm:text-left">
                  <div className="flex flex-wrap items-center justify-end gap-1.5 text-[11.5px] text-muted sm:mt-1.5 sm:justify-start">
                    {t.etat && <PastilleEtat {...t.etat} />}
                    {t.complement && <span>{t.complement}</span>}
                  </div>
                  {t.le && <div className="text-[11px] text-muted">{dateHeure(t.le)}</div>}
                </div>
              </div>
            ))}
          </div>

          {/* ---- Courbe ---- */}
          <div className="rounded-xl border border-line p-3.5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div role="radiogroup" aria-label="Constante affichée" className="flex gap-0.5 rounded-[10px] bg-bg p-[3px]">
                {ONGLETS.map((o) => (
                  <button
                    key={o.valeur}
                    type="button"
                    role="radio"
                    aria-checked={mesure === o.valeur}
                    onClick={() => setMesure(o.valeur)}
                    className={`min-h-9 pointer-coarse:min-h-11 rounded-lg px-3 text-[12.5px] transition-colors ${
                      mesure === o.valeur
                        ? "bg-white font-extrabold text-ink shadow-[0_1px_2px_rgba(16,59,80,0.12)]"
                        : "font-semibold text-muted"
                    }`}
                  >
                    {o.libelle}
                  </button>
                ))}
              </div>
              <div role="radiogroup" aria-label="Période" className="flex flex-wrap gap-1">
                {PERIODES.map((p) => (
                  <button
                    key={p.valeur}
                    type="button"
                    role="radio"
                    aria-checked={periode === p.valeur}
                    onClick={() => setPeriode(p.valeur)}
                    className={`min-h-9 pointer-coarse:min-h-11 rounded-full border px-3 text-[12px] transition-colors ${
                      periode === p.valeur ? "border-blue bg-blue font-bold text-white" : "border-line bg-white font-semibold text-muted"
                    }`}
                  >
                    {p.libelle}
                  </button>
                ))}
              </div>
            </div>

            {nbPoints === 0 ? (
              <p className="py-10 text-center text-[12.5px] text-muted">
                Aucune mesure de {ONGLETS.find((o) => o.valeur === mesure)?.libelle.toLowerCase()} sur cette période.
              </p>
            ) : (
              <>
                <CourbeConstante
                  titre={`Évolution — ${ONGLETS.find((o) => o.valeur === mesure)?.libelle}`}
                  series={series}
                  unite={unite}
                  decimales={mesure === "glycemie" ? 2 : 1}
                  hauteur={220}
                />
                {nbPoints === 1 && (
                  <p className="mt-2 text-center text-[12px] text-muted">
                    Une seule mesure sur la période : la courbe se tracera dès la deuxième.
                  </p>
                )}
              </>
            )}
            <p className="mt-2 text-[11px] text-muted">
              Points en ambre ou en rouge : valeur hors des repères adultes usuels — une aide à la lecture, pas un
              diagnostic.
            </p>
          </div>

          {/* ---- Historique : le tableau des valeurs, sans survol ---- */}
          <div>
            <h4 className="mb-2 text-[13px] font-extrabold">Historique des mesures</h4>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {visibles.map((m) => {
                const t = m.sys !== null ? evaluerTension(m.sys, m.dia!) : null;
                const g = m.glycemie !== null ? evaluerGlycemie(m.glycemie, m.contexte!) : null;
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3.5 py-3">
                    <div className={`min-w-[150px] text-[12.5px] font-bold ${m.erronee ? "text-muted line-through" : ""}`}>
                      {dateHeure(m.le)}
                    </div>
                    <div className={`flex flex-1 flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] ${m.erronee ? "text-muted line-through" : ""}`}>
                      {m.poidsKg !== null && <span>{nombreFr(m.poidsKg)} kg</span>}
                      {t && (
                        <span className="inline-flex items-center gap-1.5">
                          {m.sys}/{m.dia} mmHg {!m.erronee && <PastilleEtat {...t} />}
                        </span>
                      )}
                      {g && (
                        <span className="inline-flex items-center gap-1.5">
                          {nombreFr(m.glycemie!, 2)} g/L <span className="text-muted">{LIBELLES_CONTEXTE[m.contexte!]}</span>
                          {!m.erronee && <PastilleEtat {...g} />}
                        </span>
                      )}
                    </div>
                    {m.erronee ? (
                      <span className="text-[11.5px] font-semibold text-muted">Erronée · {m.motifInvalidation}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAInvalider(m)}
                        className="min-h-9 pointer-coarse:min-h-11 rounded-lg px-2.5 text-[12px] font-bold text-muted transition-colors hover:bg-bg hover:text-red"
                      >
                        Signaler une erreur
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            {mesures.length > PAR_PAGE && (
              <button type="button" onClick={() => setToutVoir((v) => !v)} className={`${BTN_NEUTRE} mt-3`}>
                {toutVoir ? "Réduire" : `Tout afficher (${mesures.length})`}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

const MOTIFS = ["Faute de frappe", "Appareil mal calibré", "Mauvais patient", "Autre"] as const;

/** Une mesure erronée ne s'efface pas : elle se barre, avec son motif. */
function InvaliderMesure({
  mesure,
  onFermer,
  onFait,
  onErreur,
}: {
  mesure: Constante;
  onFermer: () => void;
  onFait: () => void;
  onErreur: (message: string) => void;
}) {
  const [motif, setMotif] = useState<(typeof MOTIFS)[number]>("Faute de frappe");
  const [precision, setPrecision] = useState("");
  const [enCours, setEnCours] = useState(false);
  const texte = motif === "Autre" ? precision.trim() : precision.trim() ? `${motif} — ${precision.trim()}` : motif;

  async function valider() {
    if (!texte || enCours) return;
    setEnCours(true);
    const res = await invaliderConstante(mesure.id, texte);
    setEnCours(false);
    if (res.erreur) onErreur(res.erreur);
    else onFait();
  }

  return (
    <Dialogue
      titre="Signaler une mesure erronée"
      sousTitre={`Mesure du ${dateHeure(mesure.le)}`}
      icone="⚠️"
      onFermer={onFermer}
      pied={
        <>
          <button type="button" onClick={valider} disabled={!texte || enCours} className={BTN_DANGER}>
            {enCours ? "Enregistrement…" : "Marquer comme erronée"}
          </button>
          <button type="button" onClick={onFermer} className={BTN_NEUTRE}>
            Annuler
          </button>
        </>
      }
    >
      <div className="grid gap-3 p-4">
        <p className="text-[12.5px] leading-relaxed text-muted">
          La mesure reste dans l’historique, barrée avec ce motif, et sort des courbes. Elle ne s’efface pas.
        </p>
        <div>
          <label htmlFor="inv-motif" className={CLASSE_ETIQUETTE}>
            Motif
          </label>
          <select id="inv-motif" value={motif} onChange={(e) => setMotif(e.target.value as (typeof MOTIFS)[number])} className={CLASSE_CHAMP}>
            {MOTIFS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="inv-precision" className={CLASSE_ETIQUETTE}>
            Précision {motif === "Autre" ? "(obligatoire)" : "(facultative)"}
          </label>
          <input
            id="inv-precision"
            value={precision}
            maxLength={250}
            onChange={(e) => setPrecision(e.target.value)}
            className={CLASSE_CHAMP}
          />
        </div>
      </div>
    </Dialogue>
  );
}
