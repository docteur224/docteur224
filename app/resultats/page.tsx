import type { Metadata } from "next";
import Link from "next/link";
import TopNav from "@/components/site/TopNav";
import AppBarMobile from "@/components/mobile/AppBarMobile";
import { FiltresMobile, FiltresWeb } from "@/components/site/FiltresResultats";
import { construireGroupes } from "@/lib/filtres";
import { formatGNF, formatNote } from "@/lib/format";
import { prochainsJours } from "@/lib/dates";
import {
  chargerAssurances,
  chargerEtablissements,
  chargerMedecins,
  chargerTypesEtablissement,
  existeMedecinNote,
  nomComplet,
  premiersCreneauxOuverts,
} from "@/lib/donnees";

export const metadata: Metadata = {
  title: "Résultats de recherche | Docteur 224",
};

/*
 * Page de résultats — reproduit l'écran « resultats » de la maquette web :
 * en-tête avec fil d'Ariane, colonne de filtres à gauche, cartes médecins
 * avec mini-créneaux réservables à droite. Alimentée par Supabase
 * (lib/donnees.ts — médecins validés uniquement, via RLS).
 */

/** Libellés de la pastille de disponibilité, alignés sur les valeurs d'URL. */
const LIBELLES_DISPO: Record<string, string> = {
  aujourdhui: "Aujourd'hui",
  semaine: "Cette semaine",
  weekend: "Week-end",
};

/** Un paramètre d'URL répété (?type=a&type=b) arrive en tableau ou en chaîne. */
function versTableau(valeur: string | string[] | undefined): string[] {
  if (Array.isArray(valeur)) return valeur;
  return typeof valeur === "string" && valeur ? [valeur] : [];
}

export default async function Resultats({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const specialite = typeof sp.specialite === "string" ? sp.specialite.trim() : "";
  const ville = typeof sp.ville === "string" ? sp.ville.trim() : "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const dispo = typeof sp.dispo === "string" ? sp.dispo : "";
  const typesEtab = versTableau(sp.type);
  const assurances = versTableau(sp.assurance);
  const noteMin = typeof sp.note === "string" ? Number(sp.note) : 0;

  const [medecins, etablissements, refAssurances, refTypes, avecNotes] = await Promise.all([
    chargerMedecins({
      specialite,
      ville,
      q,
      dispo,
      assurances,
      noteMin: Number.isFinite(noteMin) ? noteMin : 0,
    }),
    chargerEtablissements(),
    chargerAssurances(),
    chargerTypesEtablissement(),
    existeMedecinNote(),
  ]);
  const getEtablissement = (id: string) => etablissements.find((e) => e.id === id);

  // Options bâties sur le référentiel complet, pas sur la liste déjà filtrée :
  // sinon un filtre qui ne renvoie rien ferait disparaître sa propre case,
  // empêchant de le désactiver.
  const groupes = construireGroupes(refTypes, refAssurances, avecNotes);

  // Le type d'établissement vit dans la table etablissements : ce filtre-ci
  // s'applique après la jointure, une fois les deux listes chargées.
  const liste = typesEtab.length
    ? medecins.filter((m) => {
        const type = getEtablissement(m.etablissementId)?.type;
        return type ? typesEtab.includes(type) : false;
      })
    : medecins;

  const titre = `${specialite || "Médecins"} à ${ville || "Conakry"} — ${liste.length} résultat${
    liste.length > 1 ? "s" : ""
  }`;

  return (
    <div className="min-h-screen bg-bg">
      <TopNav lienActif="trouver" droite="compte" />

      {/* ================= VERSION MOBILE (écran « resultats » de la maquette mobile) ================= */}
      <div className="md:hidden">
        <AppBarMobile
          retour="/"
          titre={`${specialite || "Médecins"} · ${ville || "Conakry"}`}
          sousTitre={`${liste.length} médecin${liste.length > 1 ? "s" : ""} disponible${
            liste.length > 1 ? "s" : ""
          }`}
        />
        <FiltresMobile groupes={groupes} />
        <div className="pad" style={{ paddingTop: 14 }}>
          {liste.length === 0 && (
            <div className="card2" style={{ textAlign: "center", padding: 24 }}>
              <div style={{ fontSize: 30 }} aria-hidden>
                🔍
              </div>
              <b style={{ display: "block", marginTop: 10, fontSize: 15, fontWeight: 800 }}>
                Aucun médecin trouvé
              </b>
              <p className="muted" style={{ fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
                Aucun médecin de démonstration ne correspond à cette recherche. Essayez «
                Pédiatrie » ou « Médecine générale » à Conakry.
              </p>
              <Link href="/resultats" className="btn block" style={{ marginTop: 14 }}>
                Voir tous les médecins
              </Link>
            </div>
          )}
          {liste.map((m) => {
            const etab = getEtablissement(m.etablissementId);
            return (
              <Link key={m.id} href={`/medecin/${m.id}`} className="doc">
                <span className="av" aria-hidden style={{ background: m.gradient }}>
                  {m.initiales}
                </span>
                <span className="info">
                  <b>{nomComplet(m)}</b>
                  <span className="spec">{m.specialite}</span>
                  <span className="meta">
                    📍 {etab?.nom} · {m.ville}
                  </span>
                  <span className="row2">
                    <span className="stars">
                      ★ {formatNote(m.note)} ({m.nbAvis})
                    </span>
                    <span className="price">{formatGNF(m.tarifConsultation)}</span>
                  </span>
                  <span className="row2">
                    <span className={`pill ${m.disponibilite.type === "aujourdhui" ? "ok" : "soon"}`}>
                      {m.disponibilite.label}
                    </span>
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ================= VERSION WEB (inchangée) ================= */}
      <div className="hidden md:block">
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
          {dispo && (
            <span className="rounded-lg bg-teal-soft px-[9px] py-1 text-[11px] font-bold text-blue">
              📅 {LIBELLES_DISPO[dispo] ?? dispo}
            </span>
          )}
        </div>
      </div>

      <div className="mx-auto grid max-w-[1020px] gap-6 px-[30px] py-[26px] lg:grid-cols-[244px_1fr]">
        {/* Colonne de filtres — état porté par l'URL (voir FiltresResultats) */}
        <FiltresWeb groupes={groupes} />

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
              ? premiersCreneauxOuverts(m.plages, new Map(), premierJourOuvert, 4)
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
    </div>
  );
}
