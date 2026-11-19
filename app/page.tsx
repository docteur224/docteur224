import TopNav from "@/components/site/TopNav";
import Footer from "@/components/site/Footer";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import PiedPageMobile from "@/components/mobile/PiedPageMobile";
import TabBarMobile from "@/components/mobile/TabBarMobile";
import GrilleSpecialites from "@/components/site/GrilleSpecialites";
import MedecinsEnVedette from "@/components/site/MedecinsEnVedette";
import EtablissementsEnVedette from "@/components/site/EtablissementsEnVedette";
import CommentCaMarche from "@/components/site/CommentCaMarche";
import ProchainRendezVous from "@/components/mobile/ProchainRendezVous";
import RechercheAccueil, {
  RechercheAccueilMobile,
} from "@/components/site/RechercheAccueil";
import { formatNote } from "@/lib/format";
import { formatDateRelative, prochainsJours } from "@/lib/dates";
import {
  chargerEtablissements,
  chargerIndisponibilites,
  chargerMedecins,
  chargerNomsRecherche,
  chargerProchainesDispos,
  chargerSpecialites,
  chargerVilles,
  nomComplet,
  prochainsCreneaux,
  type EtatCreneau,
} from "@/lib/donnees";
import {
  compterParSpecialite,
  specialitesEnAvant,
  trierParDemande,
} from "@/lib/catalogue-specialites";

/** Les vedettes et référentiels sont relus au plus toutes les 60 s. */
export const revalidate = 60;

/**
 * Page d'accueil — reproduit l'écran « accueil » de la maquette web
 * (hero de recherche à 3 filtres, spécialités, comment ça marche, vedettes).
 * Les cartes sont alimentées par Supabase (lib/donnees.ts).
 */
export default async function Accueil() {
  const [tousMedecins, tousEtablissements, specialites, villes, nomsRecherche] =
    await Promise.all([
      chargerMedecins(),
      chargerEtablissements(),
      chargerSpecialites(),
      chargerVilles(),
      chargerNomsRecherche(),
    ]);
  // Suggestions du bandeau de recherche : le référentiel complet, pas
  // seulement les vedettes affichées plus bas.
  const nomsSpecialites = specialites.map((s) => s.nom);
  // La grille « Trouvez le bon spécialiste » ne montre que les spécialités
  // où un professionnel est inscrit, les plus consultées d'abord : le
  // référentiel entier y ferait un mur de vignettes dont la plupart mènent
  // à une page de résultats vide.
  const specialitesVedette = specialitesEnAvant(
    specialites,
    compterParSpecialite(tousMedecins)
  );
  // L'écran plein « Toutes les spécialités » liste le référentiel réel (ce que
  // l'admin a ouvert), trié A–Z côté base : chaque entrée mène à une vraie
  // page de résultats, contrairement au catalogue d'aide à la saisie.
  const catalogueSpecialites = specialites.map((s) => ({
    nom: s.nom,
    emoji: s.emoji,
  }));
  const getEtablissement = (id: string) => tousEtablissements.find((e) => e.id === id);

  // ===== Établissements (vedette + annuaire) =====
  // Les plus pourvus d'abord : « 4 médecins » attire plus que « 1 médecin »,
  // et c'est aussi là que le patient a le plus de chances de trouver un RDV.
  const etabTries = [...tousEtablissements].sort(
    (a, b) => b.nbMedecins - a.nbMedecins || a.nom.localeCompare(b.nom, "fr")
  );
  const versEtabVedette = (e: (typeof tousEtablissements)[number]) => ({
    id: e.id,
    nom: e.nom,
    type: e.type,
    lieu: [e.quartier, e.ville].filter(Boolean).join(" · "),
    note: formatNote(e.note),
    nbMedecins: e.nbMedecins,
    gradient: e.gradient,
  });
  const etablissementsVedette = etabTries.slice(0, 6).map(versEtabVedette);
  const annuaireEtablissements = etabTries.map(versEtabVedette);

  const joursDispo = prochainsJours([], 14);

  // Premier créneau réservable de CHAQUE praticien, en un seul appel groupé
  // (RPC ouverte au public par la migration 0093). Sert deux fois : à choisir
  // la vitrine, et à renseigner l'heure du prochain RDV dans l'écran plein.
  const dispoAnnuaire = await chargerProchainesDispos(
    tousMedecins.map((m) => m.id),
    14
  );

  // ===== Médecins en vedette : d'abord ceux qui ont des créneaux =====
  // La liste arrive déjà triée par note décroissante. On la retrie de façon
  // STABLE pour faire remonter ceux qui ont réellement un créneau à proposer :
  // une carte « Médecins en vedette » qui annonce « Aucun créneau en ligne »
  // dessert la section. L'ordre par note est préservé au sein de chaque groupe.
  const medecinsEnVedette = [...tousMedecins]
    .sort((a, b) => Number(dispoAnnuaire.has(b.id)) - Number(dispoAnnuaire.has(a.id)))
    .slice(0, 3);

  // ===== Leurs VRAIS prochains créneaux (trois, pas un) =====
  // Une requête d'indisponibilités par praticien mis en avant, en parallèle,
  // exactement comme /resultats : l'appel groupé ci-dessus ne donne que le
  // premier créneau, la carte en montre trois.
  const creneauxVedette = new Map(
    await Promise.all(
      medecinsEnVedette.map(async (m) => {
        let etats: Map<string, EtatCreneau>;
        try {
          etats = await chargerIndisponibilites(
            m.id,
            joursDispo[0]?.iso,
            joursDispo.at(-1)?.iso
          );
        } catch {
          // Indisponibilités illisibles : on retombe sur les horaires-types
          // seuls plutôt que de faire tomber toute la page d'accueil.
          etats = new Map();
        }
        const joursMedecin = joursDispo.map((j) => ({
          iso: j.iso,
          ferme: m.joursFermes.includes(new Date(`${j.iso}T00:00:00`).getDay()),
        }));
        return [m.id, prochainsCreneaux(m.plages, etats, joursMedecin, 3)] as const;
      })
    )
  );

  const lieuDe = (m: (typeof tousMedecins)[number]) =>
    [getEtablissement(m.etablissementId)?.nom, m.ville].filter(Boolean).join(" · ");

  // Statut de disponibilité propre à chaque médecin, déduit de son VRAI
  // premier créneau : il remplace le libellé statique « Prochains créneaux à
  // partir de maintenant », identique partout et faux dès que le créneau est
  // à plusieurs jours. Calculé ici, avec la date du serveur.
  const statutDispo = (creneaux: { dateISO: string }[]) => {
    const premier = creneaux[0];
    if (!premier) return null;
    const aujourdhui = premier.dateISO === joursDispo[0]?.iso;
    const demain = premier.dateISO === joursDispo[1]?.iso;
    const texte = aujourdhui
      ? "Disponible aujourd’hui"
      : demain
        ? "Disponible dès demain"
        : `Disponible dès ${formatDateRelative(premier.dateISO).toLowerCase()}`;
    return { texte, aujourdhui };
  };

  const vedettes = medecinsEnVedette.map((m) => {
    const creneaux = (creneauxVedette.get(m.id) ?? []).map((c) => ({
      dateISO: c.dateISO,
      heure: c.heure,
      // Formaté ici, côté serveur : aucune date n'est calculée au navigateur.
      jour: formatDateRelative(c.dateISO),
    }));
    return {
      id: m.id,
      nom: nomComplet(m),
      initiales: m.initiales,
      photoUrl: m.photoUrl,
      gradient: m.gradient,
      specialite: m.specialite,
      lieu: lieuDe(m),
      note: formatNote(m.note),
      creneaux,
      dispo: statutDispo(creneaux),
    };
  });

  // ===== Annuaire de l'écran plein « Tous les médecins » =====
  // Réutilise `dispoAnnuaire` (calculé plus haut) : l'heure du prochain
  // créneau sans un second passage en base.
  const annuaireMedecins = tousMedecins.map((m) => {
    const prochain = dispoAnnuaire.get(m.id);
    return {
      id: m.id,
      nom: nomComplet(m),
      initiales: m.initiales,
      photoUrl: m.photoUrl,
      gradient: m.gradient,
      specialite: m.specialite,
      lieu: lieuDe(m),
      note: formatNote(m.note),
      // Champs du panneau de filtres (web) : volontairement légers — une
      // chaîne, un nombre, une date. Les critères coûteux (assurances,
      // langues, type d'établissement) restent sur /resultats plutôt que
      // d'alourdir le HTML de l'accueil pour tous les visiteurs.
      ville: m.ville,
      genre: m.genre,
      noteNum: m.note,
      prochainISO: prochain?.jour ?? null,
      prochain: prochain
        ? `${formatDateRelative(prochain.jour)} · ${prochain.heure}`
        : m.disponibilite.label,
    };
  });
  // Bornes du filtre « Disponibilité », calculées ici : la date du jour ne
  // doit pas dépendre de l'horloge du navigateur.
  const bornesDispo = {
    aujourdhui: joursDispo[0]?.iso ?? "",
    semaine: joursDispo[6]?.iso ?? joursDispo.at(-1)?.iso ?? "",
  };
  // Puces de filtre : seulement les spécialités réellement représentées, du
  // motif le plus consulté au plus rare — un filtre qui ne renvoie rien n'a
  // rien à faire dans la barre.
  const specialitesAnnuaire = trierParDemande(
    [...new Set(tousMedecins.map((m) => m.specialite).filter(Boolean))],
    (nom) => nom
  );
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <TopNav lienActif="trouver" />

      {/* ================= VERSION MOBILE (écran « accueil » de la maquette mobile) ================= */}
      <div className="with-tabbar md:hidden">
        {/* La barre doit rester le frère immédiat du héros : c'est ce qui
            permet au dégradé de remonter dessous (.topbar.hero + .hero). */}
        <EnTeteMobile variante="hero" />
        <div className="hero">
          <div className="hi">Bonjour 👋</div>
          <h2>
            Trouvez un médecin
            <br />
            et prenez rendez-vous
          </h2>
          <RechercheAccueilMobile
            specialites={nomsSpecialites}
            villes={villes}
            nomsMedecins={nomsRecherche}
          />
        </div>
        <div className="pad">
          {/* Carte personnelle : ne s'affiche que pour un patient connecté
              ayant un RDV à venir (île cliente, le reste de la page reste
              statique). Invisible sinon. */}
          <ProchainRendezVous />

          <GrilleSpecialites
            specialites={specialitesVedette}
            catalogue={catalogueSpecialites}
            variante="mobile"
          />

          <CommentCaMarche variante="mobile" />

          <MedecinsEnVedette
            vedettes={vedettes}
            annuaire={annuaireMedecins}
            specialites={specialitesAnnuaire}

            bornesDispo={bornesDispo}
            variante="mobile"
          />

          <EtablissementsEnVedette
            vedettes={etablissementsVedette}
            annuaire={annuaireEtablissements}
            variante="mobile"
          />
        </div>
        <PiedPageMobile />
        <TabBarMobile role="public" />
      </div>

      {/* ================= VERSION WEB (inchangée) ================= */}
      <div className="hidden md:block">
      {/* ===== HERO ===== */}
      {/* Pas d'overflow-hidden sur la section : la liste de suggestions du
          bandeau de recherche doit pouvoir déborder sous le héros. Seuls les
          cercles décoratifs sont rognés, par leur propre conteneur. */}
      <section className="relative bg-[linear-gradient(150deg,var(--blue)_0%,var(--blue-deep)_100%)] px-[30px] pb-16 pt-[54px] text-center text-white">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <span className="absolute -right-20 -top-20 block h-[280px] w-[280px] rounded-full bg-[rgba(46,156,202,.22)]" />
          <span className="absolute -bottom-[110px] -left-[60px] block h-60 w-60 rounded-full bg-[rgba(46,156,202,.14)]" />
        </span>
        <span className="relative inline-block rounded-[30px] bg-white/12 px-[14px] py-[6px] text-[13px] font-bold tracking-[.04em] opacity-85">
          🇬🇳 La santé accessible en Guinée
        </span>
        <h1 className="relative mx-auto mb-[10px] mt-4 text-[30px] font-extrabold leading-[1.12] tracking-[-1px] md:text-[40px]">
          Trouvez un médecin et
          <br />
          prenez rendez-vous en ligne
        </h1>
        <p className="relative mx-auto max-w-[560px] text-base opacity-90">
          Recherchez par spécialité, ville ou établissement. Réservez en quelques clics et recevez
          votre confirmation par SMS.
        </p>

        {/* Bandeau de recherche à 3 filtres (spec C.1.1) */}
        <RechercheAccueil
          specialites={nomsSpecialites}
          villes={villes}
          nomsMedecins={nomsRecherche}
        />

        <div className="relative mt-[30px] flex justify-center gap-[42px]">
          <div>
            <b className="block text-2xl font-extrabold">200+</b>
            <small className="text-xs font-semibold opacity-80">Médecins inscrits</small>
          </div>
          <div>
            {/* Compté sur le référentiel : une ville ajoutée dans l'espace
                admin se voit ici, au lieu d'un chiffre figé qui dérive. */}
            <b className="block text-2xl font-extrabold">{villes.length}</b>
            <small className="text-xs font-semibold opacity-80">Villes couvertes</small>
          </div>
          <div>
            <b className="block text-2xl font-extrabold">500+</b>
            <small className="text-xs font-semibold opacity-80">Patients accompagnés</small>
          </div>
        </div>
      </section>

      {/* ===== SPÉCIALITÉS ===== */}
      <section className="py-[46px]">
        <div className="mx-auto max-w-[1200px] px-[30px]">
          <h2 className="text-center text-2xl font-extrabold tracking-[-0.4px]">
            Trouvez le bon spécialiste
          </h2>
          <p className="mt-[7px] text-center text-sm text-muted">
            Accédez directement aux spécialités les plus demandées.
          </p>
          <GrilleSpecialites
            specialites={specialitesVedette}
            catalogue={catalogueSpecialites}
            variante="web"
          />
        </div>
      </section>

      {/* ===== COMMENT ÇA MARCHE ===== */}
      <section id="comment-ca-marche" className="border-y border-line bg-white py-[46px]">
        <div className="mx-auto max-w-[1200px] px-[30px]">
          <CommentCaMarche variante="web" />
        </div>
      </section>

      {/* ===== MÉDECINS EN VEDETTE ===== */}
      <section className="py-[46px]">
        <div className="mx-auto max-w-[1200px] px-[30px]">
          <MedecinsEnVedette
            vedettes={vedettes}
            annuaire={annuaireMedecins}
            specialites={specialitesAnnuaire}

            bornesDispo={bornesDispo}
            variante="web"
          />
        </div>
      </section>

      {/* ===== ÉTABLISSEMENTS EN VEDETTE ===== */}
      <section className="border-t border-line bg-white py-[46px]">
        <div className="mx-auto max-w-[1200px] px-[30px]">
          <EtablissementsEnVedette
            vedettes={etablissementsVedette}
            annuaire={annuaireEtablissements}
            variante="web"
          />
        </div>
      </section>
      </div>

      <Footer />
    </div>
  );
}
