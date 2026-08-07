import type { Metadata } from "next";
import Link from "next/link";
import TopNav from "@/components/site/TopNav";
import PaginationLiens from "@/components/site/PaginationLiens";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import TabBarMobile from "@/components/mobile/TabBarMobile";
import { FiltresWeb } from "@/components/site/FiltresResultats";
import FiltresAvances, { type BoutonFiltre } from "@/components/site/FiltresAvances";
import RechercheResultats, {
  RechercheResultatsMobile,
} from "@/components/site/RechercheResultats";
import AvatarMedecin from "@/components/site/AvatarMedecin";
import CarteResultatMobile from "@/components/site/CarteResultatMobile";
import BandeauResultats from "@/components/mobile/BandeauResultats";
import CarteMedecins from "@/components/mobile/CarteMedecins";
import CarteResultatsWeb from "@/components/site/CarteResultatsWeb";
import PopupAvis from "@/components/site/PopupAvis";
import { positionMedecin, type PointCarte } from "@/lib/carte";
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
  chargerReferencesGeo,
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
  /* Liste ou carte — l'état vit dans l'URL : le bouton Retour du téléphone
     ramène à la liste, et une carte se partage par lien. */
  const vueCarte = sp.vue === "carte";

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
    referencesGeo,
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
    chargerReferencesGeo(),
  ]);
  const getEtablissement = (id: string) => etablissements.find((e) => e.id === id);

  // Options bâties sur le référentiel complet, pas sur la liste déjà filtrée :
  // sinon un filtre qui ne renvoie rien ferait disparaître sa propre case,
  // empêchant de le désactiver.
  const groupes = construireGroupes(refTypes, refAssurances, avecNotes);
  const groupesAvances = construireGroupesAvances(refLangues, avecGenre);
  const groupeDispo = groupeDisponibilite();
  const nomsSpecialites = refSpecialites.map((s) => s.nom);

  // Icônes des boutons restés seuls dans la barre mobile.
  const ICONES_GROUPE: Record<string, string> = {
    Note: "⭐",
    "Trier par": "↕",
  };
  /*
   * Barre mobile : trois boutons au lieu de six.
   *
   * « Disponibilités » avait son propre bouton alors que le popup « Filtres »
   * ouvre déjà ce groupe (construireGroupesAvances le place en tête) — deux
   * chemins vers le même filtre, dont l'un pouvait contredire l'autre à
   * l'écran. « Établissement » et « Assurance acceptée » le rejoignent : ce
   * sont des critères de tri de fond, pas des raccourcis, et six pastilles
   * sur trois rangées repoussaient les résultats sous la ligne de flottaison.
   *
   * « Note » et « Trier par » restent à part : ce sont les deux gestes qu'on
   * refait sans arrêt en comparant des praticiens.
   */
  const DANS_FILTRES = new Set(["type", "assurance"]);
  const boutonsMobile: BoutonFiltre[] = [
    {
      cle: "filtres",
      icone: "⚙",
      label: "Filtres",
      groupes: [...groupesAvances, ...groupes.filter((g) => DANS_FILTRES.has(g.param))],
    },
    ...groupes
      .filter((g) => !DANS_FILTRES.has(g.param))
      .map((g) => ({
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

  /* Pagination portée par l'URL. Elle ne sert pas qu'au confort de lecture :
     les disponibilités sont chargées médecin par médecin juste en dessous, et
     découper ici ramène ces requêtes au nombre de cartes réellement
     affichées au lieu de toute la liste filtrée. */
  const PAR_PAGE = 12;
  const pages = Math.max(1, Math.ceil(liste.length / PAR_PAGE));
  const pageDemandee = Number(typeof sp.page === "string" ? sp.page : 1);
  const page = Math.min(Math.max(Number.isFinite(pageDemandee) ? pageDemandee : 1, 1), pages);
  const listePage = liste.slice((page - 1) * PAR_PAGE, page * PAR_PAGE);

  // Les paramètres courants, sans `page` : les liens de pagination doivent
  // conserver les filtres, les perdre serait le défaut le plus visible.
  const parametresCourants = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(sp)) {
    if (cle === "page" || valeur === undefined) continue;
    if (Array.isArray(valeur)) valeur.forEach((v) => parametresCourants.append(cle, v));
    else parametresCourants.set(cle, valeur);
  }

  /* Bascule liste ↔ carte : mêmes filtres de part et d'autre, et `page` est
     abandonnée au passage — la carte porte tout le résultat, revenir à la
     liste sur la page 7 d'une recherche qu'on vient de recadrer n'aurait
     aucun sens. */
  const parametresCarte = new URLSearchParams(parametresCourants);
  parametresCarte.set("vue", "carte");
  const lienCarte = `/resultats?${parametresCarte.toString()}`;
  const parametresListe = new URLSearchParams(parametresCourants);
  parametresListe.delete("vue");
  const lienListe = parametresListe.toString()
    ? `/resultats?${parametresListe.toString()}`
    : "/resultats";

  /*
   * Repères de la carte, calculés ici pour toute la liste filtrée (et non
   * pour la seule page affichée) : la carte est justement l'écran où l'on
   * veut voir l'ensemble d'un coup. Les praticiens sans position — ni GPS,
   * ni commune ni ville connue du référentiel — sont comptés à part plutôt
   * que posés au hasard.
   */
  const emojiParSpecialite = new Map(refSpecialites.map((s) => [s.nom, s.emoji]));
  const pointsCarte: PointCarte[] = [];
  let sansPosition = 0;
  if (vueCarte) {
    for (const m of liste) {
      const position = positionMedecin(m, referencesGeo);
      if (!position) {
        sansPosition++;
        continue;
      }
      const etab = getEtablissement(m.etablissementId);
      const lieu = [m.quartier, m.commune].filter(Boolean).join(", ");
      pointsCarte.push({
        ...position,
        id: m.id,
        nom: nomComplet(m),
        specialite: m.specialite,
        emoji: emojiParSpecialite.get(m.specialite) ?? "🩺",
        photoUrl: m.photoUrl,
        initiales: m.initiales,
        gradient: m.gradient,
        adresse: [etab?.nom, lieu, m.ville].filter(Boolean).join(" · "),
        lieuApproximatif: m.commune || m.ville,
        note: m.note,
        nbAvis: m.nbAvis,
        anneesExperience: m.anneesExperience,
        dispoLabel: m.disponibilite.label,
        dispoAujourdhui: m.disponibilite.type === "aujourdhui",
      });
    }
  }

  // Prochaine disponibilité réelle de chaque médecin affiché : on lit les
  // créneaux déjà réservés (une requête par médecin, en parallèle) au lieu de
  // supposer la journée vide — sinon toutes les cartes proposent les mêmes
  // heures, y compris celles qui viennent d'être prises.
  // Inutile en vue carte : les vignettes n'affichent pas d'heure, et c'est
  // une requête par praticien qu'on s'épargne.
  const jours = prochainsJours([], 14);
  const disponibilites = new Map<string, { dateISO: string; heures: string[] } | null>(
    await Promise.all(
      (vueCarte ? [] : listePage).map(async (m) => {
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
      <TopNav lienActif="trouver" />

      {/* ================= VERSION MOBILE (écran « resultats » de la maquette mobile) ================= */}
      <div className="with-tabbar md:hidden">
        <EnTeteMobile
          retour={vueCarte ? lienListe : "/"}
          titre={`${specialite || "Médecins"} · ${ville || "Conakry"}`}
          sousTitre={`${liste.length} médecin${liste.length > 1 ? "s" : ""} disponible${
            liste.length > 1 ? "s" : ""
          }`}
        />
        {vueCarte ? (
          /* La carte est une couche fixe sous la barre haute : rien de ce
             qui suit ne serait visible, et le charger coûterait des requêtes
             pour rien. */
          <CarteMedecins
            points={pointsCarte}
            sansPosition={sansPosition}
            lienListe={lienListe}
          />
        ) : (
          <>
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
        <BandeauResultats total={liste.length} lienCarte={lienCarte} />
        <div className="pad" style={{ paddingTop: 10 }}>
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
          {listePage.map((m) => {
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
          <PaginationLiens
            page={page}
            pages={pages}
            total={liste.length}
            premier={liste.length === 0 ? 0 : (page - 1) * PAR_PAGE + 1}
            dernier={Math.min(liste.length, page * PAR_PAGE)}
            parametres={parametresCourants}
            libelle="médecins"
          />
        </div>
          </>
        )}
        {/* La tabbar manquait sur cet écran : on s'y retrouvait sans aucune
            navigation vers l'accueil, les RDV ou le compte. */}
        <TabBarMobile role="public" />
      </div>

      {/* ================= VERSION WEB ================= */}
      <div className="hidden md:block">
      {/* En-tête : fil d'Ariane + titre + formulaire de recherche pré-rempli,
          puis la barre de filtres avancés (popups « Filtres » et
          « Disponibilités »). Le formulaire remplace les anciennes pastilles
          spécialité/ville, qui répétaient la recherche sans permettre de la
          modifier.

          En vue jumelée, l'en-tête s'élargit avec les résultats pour garder
          le même bord gauche — le laisser à 1020 px le recentrait à 210 px
          quand la liste commence à 30. Le formulaire, lui, est centré dans
          son conteneur (`mx-auto` dans RechercheResultats) : on le borne
          donc à sa propre largeur, sinon il partait au milieu d'une bande
          vide, très loin du titre. */}
      <div className="border-b border-line bg-white px-[30px] py-[22px]">
        <div className={`mx-auto ${vueCarte ? "max-w-[1600px]" : "max-w-[1020px]"}`}>
          <div className="text-xs font-semibold text-muted">
            <Link href="/">Accueil</Link> › Recherche
          </div>
          <h2 className="mt-1 text-xl font-extrabold">{titre}</h2>
          <div className={vueCarte ? "max-w-[880px]" : ""}>
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
      </div>

      <div
        className={`mx-auto grid gap-6 px-[30px] py-[26px] lg:grid-cols-[244px_1fr] ${
          vueCarte ? "max-w-[1600px]" : "max-w-[1020px]"
        }`}
      >
        {/* Colonne de filtres — état porté par l'URL (voir FiltresResultats) */}
        <FiltresWeb groupes={groupes} />

        {vueCarte ? (
          /* Vue jumelée : la liste et la carte se répondent. Elle porte tout
             le résultat et se pagine côté client — voir le composant. */
          <CarteResultatsWeb
            points={pointsCarte}
            sansPosition={sansPosition}
            lienListe={lienListe}
          />
        ) : (
        /* Liste des résultats */
        <div className="flex flex-col gap-[14px]">
          <div className="flex flex-wrap items-center gap-3">
            <b className="text-[15px] font-extrabold">
              {liste.length} résultat{liste.length > 1 ? "s" : ""}
            </b>
            {liste.length > 0 && (
              <Link
                href={lienCarte}
                scroll={false}
                className="ml-auto inline-flex items-center gap-2 rounded-[11px] border-[1.5px] border-line bg-white px-[14px] py-[9px] text-[12.5px] font-bold text-blue transition-colors hover:bg-teal-soft"
              >
                <span aria-hidden>🗺️</span> Afficher la carte
              </Link>
            )}
          </div>
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

          {listePage.map((m) => {
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
          <PaginationLiens
            page={page}
            pages={pages}
            total={liste.length}
            premier={liste.length === 0 ? 0 : (page - 1) * PAR_PAGE + 1}
            dernier={Math.min(liste.length, page * PAR_PAGE)}
            parametres={parametresCourants}
            libelle="médecins"
          />
        </div>
        )}
      </div>
      </div>
    </div>
  );
}
