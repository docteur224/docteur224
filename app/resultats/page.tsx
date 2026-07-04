import type { Metadata } from "next";
import Link from "next/link";
import TopNav from "@/components/site/TopNav";
import { formatGNF, formatNote } from "@/lib/format";
import { prochainsJours } from "@/lib/dates";
import { premiersCreneauxOuverts } from "@/lib/mock-creneaux";
import { getEtablissement, medecins, nomComplet } from "@/lib/mock-data";

export const metadata: Metadata = {
  title: "Résultats de recherche | Docteur 224",
};

/*
 * Page de résultats — reproduit l'écran « resultats » de la maquette web :
 * en-tête avec fil d'Ariane, colonne de filtres à gauche, cartes médecins
 * avec mini-créneaux réservables à droite. Alimentée par lib/mock-data.ts.
 */

/** Fait correspondre les libellés courts des chips d'accueil aux spécialités. */
const ALIAS_SPECIALITES: Record<string, string> = {
  généraliste: "médecine générale",
  generaliste: "médecine générale",
  "ophtalmo.": "ophtalmologie",
  ophtalmo: "ophtalmologie",
  cardio: "cardiologie",
};

function normaliser(texte: string): string {
  return texte.trim().toLowerCase();
}

const GROUPES_FILTRES: { titre: string; options: string[] }[] = [
  { titre: "Disponibilité", options: ["Aujourd'hui", "Cette semaine", "Week-end"] },
  { titre: "Établissement", options: ["Hôpital public", "Clinique privée", "Centre de santé"] },
  { titre: "Assurance acceptée", options: ["NSIA", "SUNU", "Ascoma"] },
  { titre: "Note", options: ["4★ et plus", "4,5★ et plus"] },
];

export default async function Resultats({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const specialite = typeof sp.specialite === "string" ? sp.specialite.trim() : "";
  const ville = typeof sp.ville === "string" ? sp.ville.trim() : "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  let liste = medecins;
  if (specialite) {
    const cible = ALIAS_SPECIALITES[normaliser(specialite)] ?? normaliser(specialite);
    liste = liste.filter((m) => normaliser(m.specialite).includes(cible));
  }
  if (ville) {
    liste = liste.filter((m) => normaliser(m.ville).includes(normaliser(ville)));
  }
  if (q) {
    liste = liste.filter((m) => {
      const etab = getEtablissement(m.etablissementId);
      return (
        normaliser(nomComplet(m)).includes(normaliser(q)) ||
        normaliser(etab?.nom ?? "").includes(normaliser(q))
      );
    });
  }

  const titre = `${specialite || "Médecins"} à ${ville || "Conakry"} — ${liste.length} résultat${
    liste.length > 1 ? "s" : ""
  }`;

  return (
    <div className="min-h-screen bg-bg">
      <TopNav lienActif="trouver" droite="compte" />

      {/* En-tête de page : fil d'Ariane + titre + pastilles de recherche */}
      <div className="border-b border-line bg-white px-[30px] py-[22px]">
        <div className="text-xs font-semibold text-muted">
          <Link href="/">Accueil</Link> › Recherche
        </div>
        <h2 className="mt-1 text-xl font-extrabold">{titre}</h2>
        <div className="mt-[14px] flex flex-wrap gap-2">
          <span className="rounded-lg bg-green-soft px-[9px] py-1 text-[11px] font-bold text-green">
            {specialite || "Toutes spécialités"}
          </span>
          <span className="rounded-lg bg-teal-soft px-[9px] py-1 text-[11px] font-bold text-blue">
            📍 {ville || "Conakry"}
          </span>
          <span className="rounded-lg bg-teal-soft px-[9px] py-1 text-[11px] font-bold text-blue">
            📅 Cette semaine
          </span>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1020px] gap-6 px-[30px] py-[26px] lg:grid-cols-[244px_1fr]">
        {/* Colonne de filtres (visuelle pour l'instant — la recherche passe par le bandeau d'accueil) */}
        <aside className="hidden h-fit rounded-2xl border border-line bg-white p-5 lg:sticky lg:top-[86px] lg:block">
          {GROUPES_FILTRES.map((groupe, i) => (
            <div
              key={groupe.titre}
              className={`py-[14px] ${i === 0 ? "pt-0" : ""} ${
                i === GROUPES_FILTRES.length - 1 ? "border-b-0 pb-0" : "border-b border-line"
              }`}
            >
              <div className="mb-[10px] text-xs font-extrabold uppercase tracking-[.05em] text-ink">
                {groupe.titre}
              </div>
              {groupe.options.map((option) => (
                <div
                  key={option}
                  className="flex items-center gap-[9px] py-[5px] text-[13px] text-muted"
                >
                  <span className="h-[17px] w-[17px] rounded-[5px] border-[1.5px] border-line bg-white" />
                  {option}
                </div>
              ))}
            </div>
          ))}
        </aside>

        {/* Liste des résultats */}
        <div className="flex flex-col gap-[14px]">
          {liste.length === 0 && (
            <div className="rounded-2xl border border-line bg-white p-8 text-center">
              <div className="text-3xl" aria-hidden>
                🔍
              </div>
              <b className="mt-3 block text-base font-extrabold">Aucun médecin trouvé</b>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">
                Aucun médecin de démonstration ne correspond à cette recherche. Essayez «
                Pédiatrie » ou « Médecine générale » à Conakry.
              </p>
              <Link
                href="/resultats"
                className="mt-4 inline-block rounded-[11px] bg-teal px-[18px] py-[11px] text-[13.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
              >
                Voir tous les médecins
              </Link>
            </div>
          )}

          {liste.map((m) => {
            const etab = getEtablissement(m.etablissementId);
            const premierJourOuvert =
              prochainsJours(m.joursFermes, 6).find((j) => !j.ferme)?.iso ?? "";
            const minicreneaux = premierJourOuvert
              ? premiersCreneauxOuverts(m.id, premierJourOuvert, 4)
              : [];
            return (
              <div
                key={m.id}
                className="grid items-center gap-[18px] rounded-2xl border border-line bg-white p-[18px] transition-shadow hover:shadow-[0_10px_24px_rgba(16,59,80,.09)] sm:grid-cols-[auto_1fr] lg:grid-cols-[auto_1fr_auto]"
              >
                <span
                  aria-hidden
                  className="grid h-[62px] w-[62px] place-items-center rounded-2xl text-xl font-extrabold text-white"
                  style={{ background: m.gradient }}
                >
                  {m.initiales}
                </span>
                <div>
                  <Link href={`/medecin/${m.id}`} className="block text-base font-extrabold hover:text-blue">
                    {nomComplet(m)}
                  </Link>
                  <div className="mb-1.5 mt-0.5 text-[13px] font-bold text-teal">{m.specialite}</div>
                  <div className="text-[12.5px] leading-relaxed text-muted">
                    📍 {etab?.nom} · {etab?.quartier}, {m.ville} · {m.anneesExperience} ans
                    d’expérience
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-[10px]">
                    <span className="text-[12.5px] font-bold text-amber">
                      ★ {formatNote(m.note)} ({m.nbAvis} avis)
                    </span>
                    <span
                      className={`rounded-lg px-[9px] py-1 text-[11px] font-bold ${
                        m.disponibilite.type === "aujourdhui"
                          ? "bg-green-soft text-green"
                          : "bg-amber-soft text-amber"
                      }`}
                    >
                      {m.disponibilite.label}
                    </span>
                  </div>
                </div>
                <div className="min-w-[168px] text-right sm:col-span-2 lg:col-span-1">
                  <div className="mb-2 text-[13px] font-extrabold">
                    {formatGNF(m.tarifConsultation)}
                  </div>
                  <div className="mb-[9px] grid grid-cols-2 gap-1.5">
                    {minicreneaux.map((heure) => (
                      <Link
                        key={heure}
                        href={`/medecin/${m.id}`}
                        className="rounded-lg bg-teal-soft py-2 text-center text-[12.5px] font-bold text-blue transition-colors hover:bg-[#c9e6f3]"
                      >
                        {heure}
                      </Link>
                    ))}
                  </div>
                  <Link
                    href={`/medecin/${m.id}`}
                    className="block w-full rounded-[9px] bg-teal px-[14px] py-2 text-center text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
                  >
                    Voir le profil
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
