"use client";

import Link from "next/link";
import { useState } from "react";
import Etoiles from "@/components/site/Etoiles";
import { formatNote } from "@/lib/format";
import {
  useClassementMedecins,
  useRepartitionAvis,
  useSeuilFiabilite,
  useStatsAvis,
  type LigneClassement,
  type OrdreClassement,
} from "@/lib/admin";

/*
 * Indicateurs d'avis de l'espace admin : baromètre, répartition des notes et
 * classements des médecins.
 *
 * Tout vient des fonctions SQL de la migration 0012 (avis_stats_globales,
 * avis_repartition, avis_classement_medecins) : aucune donnée n'est calculée
 * ni codée en dur ici, et l'agrégation reste en base — le navigateur n'a pas
 * à rapatrier les avis de toute la plateforme pour en faire la moyenne.
 */

/** Pourcentage entier, sans division par zéro. */
const pourcent = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

const ONGLETS: { cle: OrdreClassement; label: string; court: string; aide: string }[] = [
  {
    cle: "meilleurs",
    label: "🏆 Mieux notés",
    court: "Mieux notés",
    aide: "Classement pondéré : un médecin peu noté ne peut pas doubler un médecin très noté sur un coup de chance.",
  },
  {
    cle: "moins_bons",
    label: "🩹 À accompagner",
    court: "À accompagner",
    aide: "Les moins bien notés. Un seul avis négatif ne suffit pas à conclure : regardez la colonne « avis » avant d'agir.",
  },
  {
    cle: "plus_avis",
    label: "💬 Plus d'avis",
    court: "Plus d'avis",
    aide: "Les médecins dont les patients parlent le plus — un volume élevé rend la note d'autant plus fiable.",
  },
  {
    cle: "sans_avis",
    label: "🔇 Aucun avis",
    court: "Aucun avis",
    aide: "Ces médecins n'ont jamais été notés : invisibles au tri par note, ce sont eux qu'il faut relancer.",
  },
];

const LIMITES = [5, 10, 20];

/** Médaille du podium — seulement dans le classement des meilleurs. */
const MEDAILLES = ["🥇", "🥈", "🥉"];

export default function IndicateursAvis() {
  const { stats } = useStatsAvis();
  const repartition = useRepartitionAvis();
  const seuil = useSeuilFiabilite();
  const [ordre, setOrdre] = useState<OrdreClassement>("meilleurs");
  const [limite, setLimite] = useState(10);
  const { lignes, chargement } = useClassementMedecins(ordre, limite);

  const ongletActif = ONGLETS.find((o) => o.cle === ordre) ?? ONGLETS[0];
  const evolution = stats.avisCeMois - stats.avisMoisPrecedent;
  const tauxSatisfaction = pourcent(stats.nbPositifs, stats.avisPublies);
  const tauxReponse = pourcent(stats.nbAvecReponse, stats.avisPublies);
  const aTraiter = stats.signalementsOuverts + stats.nbSansReponse7j;

  /* ---------- Baromètre : les 6 chiffres qui résument la plateforme ---------- */
  const cartes = [
    {
      cle: "moyenne",
      valeur: stats.avisPublies > 0 ? formatNote(stats.noteMoyenne) : "—",
      libelle: "Note moyenne",
      detail: `sur ${stats.avisPublies} avis publiés`,
      ton: "b1" as const,
    },
    {
      cle: "volume",
      valeur: String(stats.avisCeMois),
      libelle: "Avis ce mois",
      detail:
        stats.avisMoisPrecedent === 0
          ? "premier mois de mesure"
          : `${evolution >= 0 ? "+" : ""}${evolution} vs mois dernier`,
      ton: (evolution >= 0 ? "b3" : "b2") as "b3" | "b2",
    },
    {
      cle: "satisfaction",
      valeur: `${tauxSatisfaction} %`,
      libelle: "Satisfaction",
      detail: `${stats.nbPositifs} avis à 4★ et plus`,
      ton: (tauxSatisfaction >= 75 ? "b3" : "b2") as "b3" | "b2",
    },
    {
      cle: "reponse",
      valeur: `${tauxReponse} %`,
      libelle: "Taux de réponse",
      detail: `${stats.nbAvecReponse} avis ont une réponse`,
      ton: (tauxReponse >= 50 ? "b3" : "b2") as "b3" | "b2",
    },
    {
      cle: "couverture",
      valeur: `${stats.medecinsNotes}/${stats.medecinsValides}`,
      libelle: "Médecins notés",
      detail: `${stats.medecinsValides - stats.medecinsNotes} sans aucun avis`,
      ton: "b1" as const,
    },
    {
      cle: "atraiter",
      valeur: String(aTraiter),
      libelle: "À traiter",
      detail: `${stats.signalementsOuverts} signalé(s) · ${stats.nbSansReponse7j} sans réponse > 7 j`,
      ton: (aTraiter === 0 ? "b3" : "b2") as "b3" | "b2",
    },
  ];

  const maxRepartition = Math.max(1, ...repartition.map((r) => r.nb));

  /* ---------- Fragments partagés web / mobile ---------- */

  const selecteurOrdre = (
    <div className="flex flex-wrap gap-2">
      {ONGLETS.map((o) => (
        <button
          key={o.cle}
          type="button"
          onClick={() => setOrdre(o.cle)}
          aria-pressed={ordre === o.cle}
          className={`rounded-full border-[1.5px] px-[13px] py-[7px] text-[12px] font-bold transition-colors ${
            ordre === o.cle
              ? "border-teal bg-teal-soft text-blue"
              : "border-line bg-white text-muted hover:bg-bg"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );

  const selecteurLimite = (
    <div className="flex items-center gap-1.5">
      <span className="text-[11.5px] font-semibold text-muted">Afficher</span>
      {LIMITES.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => setLimite(n)}
          aria-pressed={limite === n}
          className={`rounded-lg border-[1.5px] px-[9px] py-1 text-[11.5px] font-bold transition-colors ${
            limite === n
              ? "border-teal bg-teal-soft text-blue"
              : "border-line bg-white text-muted hover:bg-bg"
          }`}
        >
          Top {n}
        </button>
      ))}
    </div>
  );

  /** Une ligne de classement, rendue en carte (mobile) ou en ligne de table (web). */
  const rangAffiche = (i: number) =>
    ordre === "meilleurs" && i < 3 ? MEDAILLES[i] : `${i + 1}`;

  const vide = (
    <p className="py-4 text-center text-[12.5px] text-muted">
      {ordre === "sans_avis"
        ? "✅ Tous les médecins validés ont au moins un avis."
        : "Aucun médecin noté pour l’instant."}
    </p>
  );

  return (
    <>
      {/* ============ VERSION MOBILE ============ */}
      <div className="md:hidden">
        <div className="statcards inpad">
          {cartes.map((c) => (
            <div key={c.cle} className={`sc ${c.ton}`}>
              <b>{c.valeur}</b>
              <small>{c.libelle}</small>
            </div>
          ))}
        </div>

        <div className="card2" style={{ marginTop: 12 }}>
          <h4>Répartition des notes</h4>
          {stats.avisPublies === 0 ? (
            <p className="muted" style={{ fontSize: 12.5 }}>
              Aucun avis publié pour l’instant.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {repartition.map((r) => (
                <div key={r.etoiles} className="flex items-center gap-[10px] text-[12px]">
                  <span className="w-[34px] flex-none font-bold text-muted">{r.etoiles} ★</span>
                  <span className="h-[7px] flex-1 overflow-hidden rounded-full bg-[#E3EAEF]">
                    <span
                      className="block h-full rounded-full bg-[#E8A33D]"
                      style={{ width: `${(r.nb / maxRepartition) * 100}%` }}
                    />
                  </span>
                  <span className="w-[26px] flex-none text-right font-bold text-muted">{r.nb}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card2">
          <h4>Classement des médecins</h4>
          {selecteurOrdre}
          <p className="muted" style={{ fontSize: 11, margin: "9px 0 4px", lineHeight: 1.45 }}>
            {ongletActif.aide}
          </p>
          <div style={{ margin: "8px 0 4px" }}>{selecteurLimite}</div>

          {chargement ? (
            <p className="muted" style={{ fontSize: 12.5, padding: "10px 0" }}>
              Chargement…
            </p>
          ) : lignes.length === 0 ? (
            vide
          ) : (
            lignes.map((m, i) => (
              <CarteClassementMobile
                key={m.medecinId}
                ligne={m}
                rang={rangAffiche(i)}
                ordre={ordre}
                seuil={seuil}
              />
            ))
          )}
        </div>
      </div>

      {/* ============ VERSION WEB ============ */}
      <div className="hidden md:block">
        <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {cartes.map((c) => (
            <div key={c.cle} className="rounded-2xl border border-line bg-white p-4 text-center">
              <b
                className={`block text-[24px] font-extrabold leading-none tracking-[-0.5px] ${
                  c.ton === "b3" ? "text-green" : c.ton === "b2" ? "text-amber" : "text-blue"
                }`}
              >
                {c.valeur}
              </b>
              <div className="mt-1.5 text-[11.5px] font-bold text-ink">{c.libelle}</div>
              <small className="mt-0.5 block text-[10.5px] leading-tight text-muted">
                {c.detail}
              </small>
            </div>
          ))}
        </div>

        <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_1.15fr]">
          <div className="rounded-2xl border border-line bg-white p-5">
            <h3 className="mb-[14px] text-[15px] font-extrabold">Répartition des notes</h3>
            {stats.avisPublies === 0 ? (
              <p className="text-[12.5px] text-muted">Aucun avis publié pour l’instant.</p>
            ) : (
              <div className="flex flex-col gap-[9px]">
                {repartition.map((r) => (
                  <div key={r.etoiles} className="flex items-center gap-[10px] text-[12.5px]">
                    <span className="w-[38px] flex-none font-bold text-muted">{r.etoiles} ★</span>
                    <span className="h-[9px] flex-1 overflow-hidden rounded-full bg-[#E3EAEF]">
                      <span
                        className="block h-full rounded-full bg-[#E8A33D]"
                        style={{ width: `${(r.nb / maxRepartition) * 100}%` }}
                      />
                    </span>
                    <span className="w-[66px] flex-none whitespace-nowrap text-right font-bold text-muted">
                      {r.nb} ({pourcent(r.nb, stats.avisPublies)} %)
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Le classement est pondéré : autant l'expliquer là où on le lit,
              sinon un admin qui voit un 5,0 en 3e position croira à un bug. */}
          <div className="rounded-2xl border border-line bg-bg p-5">
            <h3 className="mb-2 text-[15px] font-extrabold">Comment lire le classement</h3>
            <p className="text-[12.5px] leading-relaxed text-[#3f5360]">
              Le rang ne suit pas la moyenne brute mais une <b>moyenne pondérée</b> : tant qu’un
              médecin a peu d’avis, sa note est ramenée vers la moyenne de la plateforme
              ({stats.avisPublies > 0 ? formatNote(stats.noteMoyenne) : "—"}). Sans cela, un
              médecin noté 5,0 par un seul patient passerait devant un médecin noté 4,8 par
              quarante — et une récompense irait au hasard plutôt qu’au mérite.
            </p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-[#3f5360]">
              Le badge <b className="text-green">Éligible</b> n’apparaît qu’à partir de{" "}
              <b>{seuil} avis</b> : en dessous, l’échantillon est trop mince pour récompenser ou
              sanctionner qui que ce soit.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-white p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-[15px] font-extrabold">Classement des médecins</h3>
            {selecteurLimite}
          </div>
          {selecteurOrdre}
          <p className="mb-1 mt-[10px] text-[12px] leading-relaxed text-muted">
            {ongletActif.aide}
          </p>

          {chargement ? (
            <p className="py-4 text-center text-[12.5px] text-muted">Chargement…</p>
          ) : lignes.length === 0 ? (
            vide
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr>
                    {[
                      "Rang",
                      "Médecin",
                      "Spécialité",
                      "Note",
                      "Avis",
                      ordre === "sans_avis" ? "" : "Score pondéré",
                      "Sans réponse",
                      "",
                    ].map((th, i) => (
                      <th
                        key={i}
                        className="whitespace-nowrap border-b border-line px-[10px] py-[9px] text-left text-[11px] font-extrabold uppercase tracking-[0.04em] text-muted"
                      >
                        {th}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((m, i) => (
                    <tr key={m.medecinId} className="hover:bg-bg">
                      <td className="border-b border-line px-[10px] py-[10px] text-[15px] font-extrabold text-blue">
                        {rangAffiche(i)}
                      </td>
                      <td className="border-b border-line px-[10px] py-[10px]">
                        <Link
                          href={`/medecin/${m.medecinId}`}
                          className="font-bold text-ink hover:text-teal hover:underline"
                        >
                          {m.nomComplet}
                        </Link>
                        {m.ville && (
                          <small className="block text-[11px] text-muted">{m.ville}</small>
                        )}
                      </td>
                      <td className="border-b border-line px-[10px] py-[10px] text-[12.5px] text-muted">
                        {m.specialite}
                      </td>
                      <td className="whitespace-nowrap border-b border-line px-[10px] py-[10px]">
                        {m.nbAvis > 0 ? (
                          <span className="flex items-center gap-1.5">
                            <b className="font-extrabold">{formatNote(m.noteMoyenne)}</b>
                            <Etoiles note={m.noteMoyenne} taille={12} />
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="border-b border-line px-[10px] py-[10px] font-bold">
                        {m.nbAvis}
                      </td>
                      <td className="border-b border-line px-[10px] py-[10px] font-bold text-blue">
                        {ordre === "sans_avis" ? "—" : formatNote(m.scorePondere)}
                      </td>
                      <td className="border-b border-line px-[10px] py-[10px]">
                        {m.nbSansReponse > 0 ? (
                          <span className="rounded-lg bg-amber-soft px-[8px] py-[3px] text-[11px] font-bold text-amber">
                            {m.nbSansReponse}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="border-b border-line px-[10px] py-[10px]">
                        <BadgeEligible ligne={m} ordre={ordre} seuil={seuil} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Verdict d'une ligne : récompensable, à surveiller, ou échantillon trop
 * mince. C'est le seul endroit qui traduit les chiffres en décision, pour
 * que les deux versions (web et mobile) ne divergent pas.
 */
function BadgeEligible({
  ligne,
  ordre,
  seuil,
}: {
  ligne: LigneClassement;
  ordre: OrdreClassement;
  seuil: number;
}) {
  if (ordre === "sans_avis") {
    return (
      <span className="whitespace-nowrap rounded-lg bg-[#EEF1F4] px-[9px] py-1 text-[11px] font-bold text-[#7e8c97]">
        À relancer
      </span>
    );
  }
  if (!ligne.eligibleRecompense) {
    return (
      <span
        title={`Moins de ${seuil} avis : échantillon trop mince pour conclure.`}
        className="whitespace-nowrap rounded-lg bg-[#EEF1F4] px-[9px] py-1 text-[11px] font-bold text-[#7e8c97]"
      >
        Trop peu d’avis
      </span>
    );
  }
  if (ordre === "moins_bons") {
    return (
      <span className="whitespace-nowrap rounded-lg bg-red-soft px-[9px] py-1 text-[11px] font-bold text-red">
        À accompagner
      </span>
    );
  }
  return (
    <span className="whitespace-nowrap rounded-lg bg-green-soft px-[9px] py-1 text-[11px] font-bold text-green">
      Éligible
    </span>
  );
}

/** Une ligne de classement en version mobile (pas de table à 8 colonnes). */
function CarteClassementMobile({
  ligne,
  rang,
  ordre,
  seuil,
}: {
  ligne: LigneClassement;
  rang: string;
  ordre: OrdreClassement;
  seuil: number;
}) {
  return (
    <div className="mt-[9px] rounded-xl border border-line p-[11px]">
      <div className="flex items-start gap-[10px]">
        <span className="w-[26px] flex-none text-[15px] font-extrabold text-blue">{rang}</span>
        <div className="min-w-0 flex-1">
          <Link
            href={`/medecin/${ligne.medecinId}`}
            className="block text-[13px] font-extrabold text-ink"
          >
            {ligne.nomComplet}
          </Link>
          <small className="block text-[11px] text-muted">
            {ligne.specialite}
            {ligne.ville ? ` · ${ligne.ville}` : ""}
          </small>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            {ligne.nbAvis > 0 ? (
              <>
                <span className="text-[12px] font-extrabold">{formatNote(ligne.noteMoyenne)}</span>
                <Etoiles note={ligne.noteMoyenne} taille={11} />
                <small className="text-[11px] text-muted">
                  {ligne.nbAvis} avis
                  {ordre !== "sans_avis" && ` · score ${formatNote(ligne.scorePondere)}`}
                </small>
              </>
            ) : (
              <small className="text-[11px] text-muted">Jamais noté</small>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <BadgeEligible ligne={ligne} ordre={ordre} seuil={seuil} />
            {ligne.nbSansReponse > 0 && (
              <span className="rounded-lg bg-amber-soft px-[8px] py-[3px] text-[11px] font-bold text-amber">
                {ligne.nbSansReponse} sans réponse
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
