"use client";

import MedecinShell from "@/components/medecin/MedecinShell";
import AppBarMobile from "@/components/mobile/AppBarMobile";
import { formatNote } from "@/lib/format";
import { medecinConnecte } from "@/lib/mock-data";

/*
 * Statistiques — reproduit l'écran « med-stats » de la maquette web :
 * 4 indicateurs, graphique « Rendez-vous par mois », derniers avis.
 * Chiffres de démonstration (les vraies statistiques viendront avec la base).
 */

const BARRES = [
  { mois: "Jan", hauteur: 62 },
  { mois: "Fév", hauteur: 72 },
  { mois: "Mar", hauteur: 67 },
  { mois: "Avr", hauteur: 85 },
  { mois: "Mai", hauteur: 94 },
  { mois: "Juin", hauteur: 100 },
];

const AVIS = [
  {
    titre: "★★★★★ Excellente pédiatre",
    texte: "« Très à l'écoute avec mon enfant. » — Fatou D.",
  },
  {
    titre: "★★★★★ Je recommande",
    texte: "« Rendez-vous à l'heure, explications claires. » — Ibrahim T.",
  },
];

export default function StatistiquesMedecin() {
  return (
    <MedecinShell>
      {/* ===== Version mobile (écran « m-med-stats » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <AppBarMobile retour="/espace-medecin/compte" titre="Statistiques" />
        <div className="pad">
          <div className="statcards inpad">
            <div className="sc b1">
              <b>142</b>
              <small>RDV ce mois</small>
            </div>
            <div className="sc b2">
              <b>4%</b>
              <small>Annulation</small>
            </div>
            <div className="sc b3">
              <b>96%</b>
              <small>Présence</small>
            </div>
          </div>
          <div className="card2" style={{ marginTop: 12 }}>
            <h4>Rendez-vous par mois</h4>
            <div className="bars">
              {BARRES.map((barre) => (
                <div key={barre.mois} className="b">
                  <div className="bar" style={{ height: `${barre.hauteur}%` }} />
                  <small>{barre.mois}</small>
                </div>
              ))}
            </div>
          </div>
          <div className="card2">
            <h4>Derniers avis</h4>
            {AVIS.map((avis) => (
              <div key={avis.titre} className="setrow review">
                <div>
                  <b>{avis.titre}</b>
                  <small>{avis.texte}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== Version web (inchangée) ===== */}
      <div className="hidden md:block">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Statistiques</h2>
          <small className="text-[13px] text-muted">Vos performances ce mois-ci</small>
        </div>
        <span className="rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-muted">
          Ce mois ⌄
        </span>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-line bg-white p-[18px]">
          <span className="text-lg" aria-hidden>
            📅
          </span>
          <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-blue">142</b>
          <small className="text-xs font-semibold text-muted">RDV ce mois</small>
        </div>
        <div className="rounded-2xl border border-line bg-white p-[18px]">
          <span className="text-lg" aria-hidden>
            ✅
          </span>
          <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-green">96%</b>
          <small className="text-xs font-semibold text-muted">Taux de présence</small>
        </div>
        <div className="rounded-2xl border border-line bg-white p-[18px]">
          <span className="text-lg" aria-hidden>
            ✕
          </span>
          <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-amber">4%</b>
          <small className="text-xs font-semibold text-muted">Taux d’annulation</small>
        </div>
        <div className="rounded-2xl border border-line bg-white p-[18px]">
          <span className="text-lg" aria-hidden>
            ⭐
          </span>
          <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-teal">
            {formatNote(medecinConnecte.note)}
          </b>
          <small className="text-xs font-semibold text-muted">Note moyenne</small>
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-[14px] text-[15px] font-extrabold">Rendez-vous par mois</h3>
        <div className="flex h-[180px] items-end gap-[14px] px-1 pt-[10px]">
          {BARRES.map((barre) => (
            <div key={barre.mois} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
              <div
                className="w-full max-w-[46px] rounded-t-lg bg-[linear-gradient(180deg,var(--teal),var(--blue))]"
                style={{ height: `${barre.hauteur}%` }}
              />
              <small className="text-[11px] font-bold text-muted">{barre.mois}</small>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">Derniers avis patients</h3>
        {AVIS.map((avis) => (
          <div key={avis.titre} className="border-b border-line py-[15px] last:border-b-0">
            <b className="block text-[13px] font-bold text-amber">{avis.titre}</b>
            <small className="text-[12.5px] text-[#3f5360]">{avis.texte}</small>
          </div>
        ))}
      </div>
      </div>
    </MedecinShell>
  );
}
