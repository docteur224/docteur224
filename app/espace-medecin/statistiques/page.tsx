"use client";

import Link from "next/link";
import MedecinShell from "@/components/medecin/MedecinShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import { formatNote } from "@/lib/format";
import { formatDateCourte } from "@/lib/dates";
import { useContextePro } from "@/lib/pro";
import { useAvisRecus } from "@/lib/avis";
import { formatPourcent, tauxNoShowMois } from "@/lib/suivi-absence";
import { moisAbrege, useRdvMensuels, type MoisRdv } from "@/lib/suivi-absence-donnees";

/*
 * Statistiques — reproduit l'écran « med-stats » de la maquette web :
 * 4 indicateurs, graphique « Rendez-vous par mois », derniers avis.
 *
 * Les chiffres étaient ceux de la maquette, écrits en dur dans le JSX : 142
 * rendez-vous, 96 % de présence, 4 % d'annulation, six barres fixes et deux
 * avis inventés. Ils viennent maintenant de la base, par les mêmes fonctions
 * que le tableau de bord et le menu Suivi d'absence (`rdv_mensuel_medecin`,
 * migration 0085) — un seul calcul, donc aucune chance que la présence
 * affichée ici contredise le no-show affiché là.
 *
 * La forme de l'écran, elle, ne change pas : mêmes cartes, mêmes barres,
 * mêmes couleurs. Seule leur source change.
 *
 * Trois conventions tenues sur les taux :
 *   • un mois sans rendez-vous terminé n'a pas de taux : « — », et non 0 % ni
 *     100 %, qui seraient tous deux un jugement sur rien ;
 *   • « RDV ce mois » compte les rendez-vous NON annulés : un rendez-vous
 *     annulé n'a pas occupé le créneau ;
 *   • présence = 100 % − no-show, calculé sur les rendez-vous terminés.
 */

/** La hauteur d'une barre, en pourcentage du mois le plus chargé. */
function hauteurBarre(m: MoisRdv, maximum: number): number {
  if (maximum <= 0) return 2;
  // Un plancher visible : un mois à 1 rendez-vous sur un pic à 200 ne doit
  // pas disparaître, sinon la barre ment par absence.
  return Math.max(3, Math.round((m.total / maximum) * 100));
}

export default function StatistiquesMedecin() {
  const { medecin, medecinId } = useContextePro();
  const { mois, chargement } = useRdvMensuels(medecinId ?? undefined, 6);
  const { avis } = useAvisRecus();

  const medecinConnecte = medecin ?? {
    gradient: "var(--avatar-bleu)",
    initiales: "…",
    civilite: "Dr",
    prenom: "",
    nom: "",
    note: 0,
    specialite: "",
  };

  const courant = mois[mois.length - 1];
  const noShow = tauxNoShowMois(courant);
  const presence = noShow === null ? "—" : formatPourcent(1 - noShow);
  const rdvDuMois = courant ? courant.total - courant.annules : 0;
  const annulation =
    courant && courant.total > 0 ? formatPourcent(courant.annules / courant.total) : "—";

  const maximum = Math.max(0, ...mois.map((m) => m.total));
  const derniersAvis = avis.filter((a) => a.commentaire.trim()).slice(0, 3);

  /* Les quatre indicateurs, décrits une fois et rendus deux fois — la
     maquette mobile et la maquette web n'ont pas la même mise en page, mais
     elles doivent afficher les mêmes nombres. */
  const indicateurs = [
    { icone: "📅", valeur: chargement ? "…" : `${rdvDuMois}`, libelle: "RDV ce mois", teinte: "text-blue" },
    { icone: "✅", valeur: chargement ? "…" : presence, libelle: "Taux de présence", teinte: "text-green" },
    { icone: "✕", valeur: chargement ? "…" : annulation, libelle: "Taux d’annulation", teinte: "text-amber" },
    {
      icone: "⭐",
      valeur: formatNote(medecinConnecte.note),
      libelle: "Note moyenne",
      teinte: "text-teal",
    },
  ];

  return (
    <MedecinShell>
      {/* ===== Version mobile (écran « m-med-stats » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <EnTeteMobile retour="/espace-medecin/compte" titre="Statistiques" />
        <div className="pad">
          <div className="statcards inpad">
            <div className="sc b1">
              <b>{chargement ? "…" : rdvDuMois}</b>
              <small>RDV ce mois</small>
            </div>
            <div className="sc b2">
              <b>{chargement ? "…" : annulation}</b>
              <small>Annulation</small>
            </div>
            <Link href="/espace-medecin/suivi-absence" className="sc b3">
              <b>{chargement ? "…" : presence}</b>
              <small>Présence</small>
            </Link>
          </div>
          <div className="card2" style={{ marginTop: 12 }}>
            <h4>Rendez-vous par mois</h4>
            <div className="bars">
              {mois.map((m) => (
                <div key={m.mois} className="b" title={`${moisAbrege(m.mois)} : ${m.total} rendez-vous`}>
                  <div className="bar" style={{ height: `${hauteurBarre(m, maximum)}%` }} />
                  <small>{moisAbrege(m.mois)}</small>
                </div>
              ))}
            </div>
            {!chargement && maximum === 0 && (
              <p className="muted" style={{ fontSize: 12.5 }}>
                Aucun rendez-vous sur les six derniers mois.
              </p>
            )}
          </div>
          <div className="card2">
            <h4>Derniers avis</h4>
            {derniersAvis.map((a) => (
              <div key={a.id} className="setrow review">
                <div>
                  <b>
                    {"★".repeat(Math.round(a.note))}
                    {"☆".repeat(Math.max(0, 5 - Math.round(a.note)))}
                  </b>
                  <small>
                    « {a.commentaire} » — {a.auteur}
                  </small>
                </div>
              </div>
            ))}
            {derniersAvis.length === 0 && (
              <p className="muted" style={{ fontSize: 12.5 }}>
                Aucun avis commenté pour le moment.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ===== Version web ===== */}
      <div className="hidden md:block">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Statistiques</h2>
            <small className="text-[13px] text-muted">Vos chiffres du mois en cours</small>
          </div>
          <Link
            href="/espace-medecin/suivi-absence"
            className="pointer-coarse:py-[13px] rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
          >
            Suivi d’absence →
          </Link>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {indicateurs.map((i) => (
            <div key={i.libelle} className="rounded-2xl border border-line bg-white p-[18px]">
              <span className="text-lg" aria-hidden>
                {i.icone}
              </span>
              <b
                className={`mt-2 block text-[26px] font-extrabold tracking-[-0.6px] ${i.teinte}`}
              >
                {i.valeur}
              </b>
              <small className="text-xs font-semibold text-muted">{i.libelle}</small>
            </div>
          ))}
        </div>

        <div className="mb-4 rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-[14px] text-[15px] font-extrabold">Rendez-vous par mois</h3>
          <div className="flex h-[180px] items-end gap-[14px] px-1 pt-[10px]">
            {mois.map((m) => (
              <div
                key={m.mois}
                className="flex h-full flex-1 flex-col items-center justify-end gap-2"
              >
                <div
                  title={`${m.total} rendez-vous · ${m.honores} honorés · ${m.absents} non honorés · ${m.annules} annulés`}
                  className="w-full max-w-[46px] rounded-t-lg bg-[linear-gradient(180deg,var(--teal),var(--blue))]"
                  style={{ height: `${hauteurBarre(m, maximum)}%` }}
                />
                <small className="text-[11px] font-bold text-muted">{moisAbrege(m.mois)}</small>
              </div>
            ))}
          </div>
          {/* Un graphique n'est pas lisible au lecteur d'écran : la même
              information en texte, pour qui ne voit pas les barres. */}
          <ul className="sr-only">
            {mois.map((m) => (
              <li key={m.mois}>
                {moisAbrege(m.mois)} : {m.total} rendez-vous, dont {m.honores} honorés,{" "}
                {m.absents} non honorés et {m.annules} annulés.
              </li>
            ))}
          </ul>
          {!chargement && maximum === 0 && (
            <p className="text-[12.5px] text-muted">
              Aucun rendez-vous sur les six derniers mois.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-1 text-[15px] font-extrabold">Derniers avis patients</h3>
          {derniersAvis.map((a) => (
            <div key={a.id} className="border-b border-line py-[15px] last:border-b-0">
              <b className="block text-[13px] font-bold text-amber">
                {"★".repeat(Math.round(a.note))}
                {"☆".repeat(Math.max(0, 5 - Math.round(a.note)))}
                <span className="ml-2 font-semibold text-muted">
                  {a.creeLe ? formatDateCourte(a.creeLe.slice(0, 10)) : ""}
                </span>
              </b>
              <small className="text-[12.5px] text-ink-soft">
                « {a.commentaire} » — {a.auteur}
              </small>
            </div>
          ))}
          {derniersAvis.length === 0 && (
            <p className="py-3 text-[12.5px] text-muted">Aucun avis commenté pour le moment.</p>
          )}
        </div>
      </div>
    </MedecinShell>
  );
}
