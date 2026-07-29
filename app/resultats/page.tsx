import type { Metadata } from "next";
import Link from "next/link";
import TopNav from "@/components/site/TopNav";
import AppBarMobile from "@/components/mobile/AppBarMobile";
import { FiltresWeb } from "@/components/site/FiltresResultats";
import FiltresAvances, { type BoutonFiltre } from "@/components/site/FiltresAvances";
import RechercheResultats, {
  RechercheResultatsMobile,
} from "@/components/site/RechercheResultats";
import AvatarMedecin from "@/components/site/AvatarMedecin";
import CarteResultatMobile from "@/components/site/CarteResultatMobile";
import PopupAvis from "@/components/site/PopupAvis";
import {
  construireGroupes,
  construireGroupesAvances,
  groupeDisponibilite,
  libelleValeur,
} from "@/lib/filtres";
import { formatNote } from "@/lib/format";
import { formatDateRelative, prochainsJours } from "@/lib/dates";
import {
  chargerAssurances,
  chargerEtablissements,
  chargerIndisponibilites,
  chargerLangues,
  chargerMedecins,
  chargerNomsRecherche,
  chargerSpecialites,
  chargerTypesEtablissement,
  chargerVilles,
  existeGenreRenseigne,
  existeMedecinNote,
  nomComplet,
  prochaineDisponibilite,
  type EtatCreneau,
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
  const genre = typeof sp.genre === "string" ? sp.genre : "";
  const typesEtab = versTableau(sp.type);
  const assurances = versTableau(sp.assurance);
  const langues = versTableau(sp.langue);
  const noteMin = typeof sp.note === "string" ? Number(sp.note) : 0;
  const tri = typeof sp.tri === "string" ? sp.tri : "";

  const [
    medecins,
    etablissements,
    refAssurances,
    refTypes,
    refLangues,
    refSpecialites,
    refVilles,
    refNoms,
    avecNotes,
    avecGenre,
  ] = await Promise.all([
    chargerMedecins({
      specialite,
      ville,
      q,
      dispo,
      assurances,
      langues,
      genre,
      noteMin: Number.isFinite(noteMin) ? noteMin : 0,
      tri,
    }),
    chargerEtablissements(),
    chargerAssurances(),
    chargerTypesEtablissement(),
    chargerLangues(),
    chargerSpecialites(),
    chargerVilles(),
    chargerNomsRecherche(),
    existeMedecinNote(),
    existeGenreRenseigne(),
  ]);
  const getEtablissement = (id: string) => etablissements.find((e) => e.id === id);

  // Options bâties sur le référentiel complet, pas sur la liste déjà filtrée :
  // sinon un filtre qui ne renvoie rien ferait disparaître sa propre case,
  // empêchant de le désactiver.
  const groupes = construireGroupes(refTypes, refAssurances, avecNotes);
  const groupesAvances = construireGroupesAvances(refLangues, avecGenre);
  const groupeDispo = groupeDisponibilite();
  const nomsSpecialites = refSpecialites.map((s) => s.nom);

  // Icônes par groupe, pour les boutons de la barre mobile (un bouton par
  // groupe : avec 20 assureurs par exemple, on ouvre un popup dédié plutôt
  // que de dérouler 20 pastilles à plat dans la barre).
  const ICONES_GROUPE: Record<string, string> = {
    Établissement: "🏥",
    "Assurance acceptée": "💳",
    Note: "⭐",
    "Trier par": "↕",
  };
  const boutonsMobile: BoutonFiltre[] = [
    { cle: "filtres", icone: "⚙", label: "Filtres", groupes: groupesAvances },
    { cle: "dispo", icone: "📅", label: "Disponibilités", groupes: [groupeDispo] },
    ...groupes.map((g) => ({
      cle: g.param,
      icone: ICONES_GROUPE[g.titre] ?? "🔎",
      label: g.titre,
      groupes: [g],
    })),
  ];

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

  // Prochaine disponibilité réelle de chaque médecin affiché : on lit les
  // créneaux déjà réservés (une requête par médecin, en parallèle) au lieu de
  // supposer la journée vide — sinon toutes les cartes proposent les mêmes
  // heures, y compris celles qui viennent d'être prises.
  const jours = prochainsJours([], 14);
  const disponibilites = new Map<string, { dateISO: string; heures: string[] } | null>(
    await Promise.all(
      liste.map(async (m) => {
        let etats: Map<string, EtatCreneau>;
        try {
          etats = await chargerIndisponibilites(m.id, jours[0]?.iso, jours.at(-1)?.iso);
        } catch {
          // Indisponibilités illisibles : on retombe sur les horaires-types
          // seuls plutôt que de faire échouer toute la page de résultats.
          etats = new Map();
        }
        const joursMedecin = jours.map((j) => ({
          iso: j.iso,
          ferme: m.joursFermes.includes(new Date(`${j.iso}T00:00:00`).getDay()),
        }));
        return [m.id, prochaineDisponibilite(m.plages, etats, joursMedecin, 4)] as const;
      })
    )
  );

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
        <RechercheResultatsMobile
          specialite={specialite}
          ville={ville}
          q={q}
          specialites={nomsSpecialites}
          villes={refVilles}
          nomsMedecins={refNoms}
        />
        {/* Tous les filtres en popups : chaque bouton n'ouvre que son
            groupe, pour ne jamais dérouler une longue liste (assureurs…)
            à plat dans la barre. */}
        <div className="px-[18px] pt-3">
          <FiltresAvances boutons={boutonsMobile} />
        </div>
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
                Essayez une autre spécialité, une autre ville, ou élargissez vos
                filtres.
              </p>
              <Link href="/resultats" className="btn block" style={{ marginTop: 14 }}>
                Voir tous les médecins
              </Link>
            </div>
          )}
          {liste.map((m) => {
            const etab = getEtablissement(m.etablissementId);
            return (
              <CarteResultatMobile
                key={m.id}
                id={m.id}
                photoUrl={m.photoUrl}
                initiales={m.initiales}
                gradient={m.gradient}
                nomComplet={nomComplet(m)}
                specialite={m.specialite}
                etablissementNom={etab?.nom ?? ""}
                ville={m.ville}
                note={m.note}
                nbAvis={m.nbAvis}
                dispoLabel={m.disponibilite.label}
                dispoAujourdhui={m.disponibilite.type === "aujourdhui"}
                premiereHeure={disponibilites.get(m.id)?.heures[0] ?? ""}
              />
            );
          })}
        </div>
      </div>

      {/* ================= VERSION WEB (inchangée) ================= */}
      <div className="hidden md:block">
      {/* En-tête : fil d'Ariane + titre + formulaire de recherche pré-rempli,
          puis la barre de filtres avancés (popups « Filtres » et
          « Disponibilités »). Le formulaire remplace les anciennes pastilles
          spécialité/ville, qui répétaient la recherche sans permettre de la
          modifier. */}
      <div className="border-b border-line bg-white px-[30px] py-[22px]">
        <div className="mx-auto max-w-[1020px]">
          <div className="text-xs font-semibold text-muted">
            <Link href="/">Accueil</Link> › Recherche
          </div>
          <h2 className="mt-1 text-xl font-extrabold">{titre}</h2>
          <RechercheResultats
            specialite={specialite}
            ville={ville}
            q={q}
            specialites={nomsSpecialites}
            villes={refVilles}
            nomsMedecins={refNoms}
          />
          <div className="mx-auto mt-[14px] flex w-full max-w-[860px] flex-wrap items-center gap-2">
            <FiltresAvances
              boutons={[
                { cle: "filtres", icone: "⚙", label: "Filtres", groupes: groupesAvances },
                { cle: "dispo", icone: "📅", label: "Disponibilités", groupes: [groupeDispo] },
              ]}
            />
            {dispo && (
              <span className="rounded-lg bg-teal-soft px-[9px] py-[6px] text-[11.5px] font-bold text-blue">
                📅 {libelleValeur([groupeDispo], "dispo", dispo)}
              </span>
            )}
            {genre && (
              <span className="rounded-lg bg-teal-soft px-[9px] py-[6px] text-[11.5px] font-bold text-blue">
                {libelleValeur(groupesAvances, "genre", genre)}
              </span>
            )}
            {langues.map((l) => (
              <span
                key={l}
                className="rounded-lg bg-teal-soft px-[9px] py-[6px] text-[11.5px] font-bold text-blue"
              >
                🗣 {l}
              </span>
            ))}
          </div>
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
                Essayez une autre spécialité, une autre ville, ou élargissez vos
                filtres.
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
            const dispoMedecin = disponibilites.get(m.id) ?? null;
            const minicreneaux = dispoMedecin?.heures ?? [];
            return (
              <div
                key={m.id}
                className="grid items-center gap-[18px] rounded-2xl border border-line bg-white p-[18px] transition-shadow hover:shadow-[0_10px_24px_rgba(16,59,80,.09)] sm:grid-cols-[auto_1fr] lg:grid-cols-[auto_1fr_auto]"
              >
                <AvatarMedecin
                  photoUrl={m.photoUrl}
                  initiales={m.initiales}
                  gradient={m.gradient}
                  taille={62}
                />
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
                    <PopupAvis
                      medecinId={m.id}
                      medecinNom={nomComplet(m)}
                      className="border-0 bg-transparent p-0 text-[12.5px] font-bold text-amber"
                    >
                      ★ {formatNote(m.note)} ({m.nbAvis} avis)
                    </PopupAvis>
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
                  {/* Pas de tarif ici : la réservation est gratuite, et un prix
                      affiché à côté du bouton laisse croire qu'on paie en
                      ligne. On annonce la prochaine disponibilité à la place. */}
                  <div className="mb-2 text-[13px] font-extrabold text-blue">
                    {dispoMedecin
                      ? `Prochain RDV · ${formatDateRelative(dispoMedecin.dateISO)}`
                      : "Aucun créneau en ligne"}
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
