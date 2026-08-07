"use client";

import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatNote } from "@/lib/format";
import { useCarte } from "@/components/site/use-carte";
import {
  dansEmprise,
  distanceKm,
  emprise,
  formatDistance,
  mentionPrecision,
  type Emprise,
  type PointCarte,
} from "@/lib/carte";

/*
 * Carte des médecins — vue « ?vue=carte » de /resultats, mobile uniquement.
 *
 * La mécanique Leaflet (fond de tuiles, cadrage, regroupement des repères,
 * géolocalisation) vit dans `useCarte`, partagée avec la vue jumelée du
 * web. Ne reste ici que la présentation propre au téléphone : carte plein
 * écran, et bande de vignettes que l'on parcourt au doigt.
 *
 * Les repères ne sont PAS rechargés depuis la base : ils arrivent déjà
 * calculés de /resultats (composant serveur), avec exactement les filtres de
 * la liste. Deux chemins de données vers le même écran finiraient toujours
 * par afficher deux comptes différents.
 */

/** Au-delà, la bande de vignettes du bas devient impossible à parcourir. */
const MAX_VIGNETTES = 30;

export default function CarteMedecins({
  points,
  sansPosition,
  lienListe,
}: {
  points: PointCarte[];
  /** Médecins du résultat qu'aucun repli n'a permis de placer. */
  sansPosition: number;
  /** Retour à la liste, filtres conservés. */
  lienListe: string;
}) {
  const refBande = useRef<HTMLDivElement>(null);
  /* Empêche l'aller-retour « la bande défile → la sélection change → la bande
     redéfile » : on ne repositionne la bande que sur un clic de repère. */
  const refOrigineSelection = useRef<"repere" | "bande">("repere");

  const [selection, setSelection] = useState<string | null>(null);
  const [zone, setZone] = useState<Emprise | null>(null);

  const vueInitiale = useMemo(() => emprise(points), [points]);

  /** Repères retenus : ceux de la zone recherchée, sinon tout le résultat. */
  const retenus = useMemo(
    () => (zone ? points.filter((p) => dansEmprise(p, zone)) : points),
    [points, zone]
  );

  const choisirRepere = useCallback((id: string) => {
    refOrigineSelection.current = "repere";
    setSelection(id);
  }, []);

  /* Tout est extrait d'un coup : `react-hooks/refs` refuse qu'on lise une
     propriété de l'objet rendu par le hook pendant le rendu. */
  const {
    poserToile,
    vue,
    zoneDeplacee,
    oublierDeplacement,
    maPosition,
    erreurGeoloc,
    localiser,
    recentrer,
    ajuster,
  } = useCarte({
    points: retenus,
    selection,
    onChoisir: choisirRepere,
    emprisePreferee: vueInitiale,
  });

  /* Le repère choisi vient au centre — sinon la vignette parle d'un praticien
     dont l'épingle est cachée sous la bande. */
  useEffect(() => {
    if (!selection) return;
    const point = retenus.find((p) => p.id === selection);
    if (point) recentrer(point);
  }, [selection, retenus, recentrer]);

  /*
   * Vignettes du bas : les repères réellement à l'écran, du plus proche du
   * centre au plus lointain — ou de la position du patient s'il l'a
   * partagée, qui est alors la seule référence qui l'intéresse.
   */
  const visibles = useMemo(() => {
    if (!vue) return [];
    const origine = maPosition ?? vue.centre;
    return retenus
      .filter((p) => dansEmprise(p, vue.bornes))
      .map((p) => ({ ...p, distance: distanceKm(origine, p) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, MAX_VIGNETTES)
      /*
       * Le tri par distance au centre de la carte est un ordre commode,
       * pas une information : « à 11 km » du milieu d'un écran que le
       * patient vient de faire glisser ne veut rien dire. La distance n'est
       * donc écrite que lorsqu'elle part d'une position qu'il a partagée.
       */
      .map((p) => ({
        ...p,
        distanceAffichee: maPosition ? formatDistance(p.distance) : "",
      }));
  }, [vue, retenus, maPosition]);

  /* La bande suit le repère choisi — et seulement dans ce sens-là. */
  useEffect(() => {
    if (!selection || refOrigineSelection.current !== "repere") return;
    const vignette = refBande.current?.querySelector<HTMLElement>(`[data-medecin="${selection}"]`);
    vignette?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [selection, visibles]);

  const surDefilementBande = useCallback(() => {
    const bande = refBande.current;
    if (!bande) return;
    const milieu = bande.scrollLeft + bande.clientWidth / 2;
    let plusProche: HTMLElement | undefined;
    let ecart = Infinity;
    for (const enfant of Array.from(bande.children) as HTMLElement[]) {
      const centre = enfant.offsetLeft + enfant.offsetWidth / 2;
      if (Math.abs(centre - milieu) < ecart) {
        ecart = Math.abs(centre - milieu);
        plusProche = enfant;
      }
    }
    const id = plusProche?.dataset.medecin;
    if (!id || id === selection) return;
    refOrigineSelection.current = "bande";
    setSelection(id);
  }, [selection]);

  const chercherDansLaZone = useCallback(() => {
    if (!vue) return;
    setZone(vue.bornes);
    oublierDeplacement();
    setSelection(null);
  }, [vue, oublierDeplacement]);

  const toutRevoir = useCallback(() => {
    setZone(null);
    setSelection(null);
    ajuster(vueInitiale);
  }, [ajuster, vueInitiale]);

  const total = retenus.length;

  return (
    <div className="carte-hote md:hidden">
      <div
        ref={poserToile}
        className="carte-toile"
        role="application"
        aria-label="Carte des médecins"
      />

      {/* Compteur — la carte ignore la pagination de la liste : elle porte
          tout le résultat, ce que le compteur doit dire sans ambiguïté. */}
      <div className="carte-compteur">
        <b>
          {total} médecin{total > 1 ? "s" : ""}
        </b>
        {zone ? (
          <span className="carte-etiq">dans cette zone</span>
        ) : (
          sansPosition > 0 && <span className="carte-etiq">{sansPosition} sans adresse renseignée</span>
        )}
      </div>

      {/* Un seul bandeau à cet emplacement : l'échec de géolocalisation passe
          devant, c'est le seul des trois qui appelle une décision. */}
      {erreurGeoloc ? (
        <p className="carte-erreur">{erreurGeoloc}</p>
      ) : zoneDeplacee ? (
        <button type="button" className="carte-zone" onClick={chercherDansLaZone}>
          🔄 Rechercher dans cette zone
        </button>
      ) : (
        zone && (
          <button type="button" className="carte-zone" onClick={toutRevoir}>
            ✕ Revoir toute la recherche
          </button>
        )
      )}

      <button type="button" className="carte-rond" onClick={localiser} aria-label="Me localiser">
        📍
      </button>

      <Link href={lienListe} className="carte-bascule" scroll={false}>
        ☰ Afficher la liste
      </Link>

      {selection && visibles.length > 0 && (
        <div
          className="carte-bande"
          ref={refBande}
          onScroll={surDefilementBande}
          aria-label="Médecins affichés sur la carte"
        >
          {visibles.map((p) => (
            <VignetteMedecin key={p.id} point={p} actif={p.id === selection} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Vignette du bas : ce que le patient doit voir avant d'ouvrir la fiche. */
function VignetteMedecin({
  point,
  actif,
}: {
  point: PointCarte & { distanceAffichee: string };
  actif: boolean;
}) {
  return (
    <Link
      href={`/medecin/${point.id}`}
      data-medecin={point.id}
      className={`carte-vignette${actif ? " on" : ""}`}
    >
      <div className="carte-vignette-tete">
        {point.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- vignette de 46px servie déjà dimensionnée par Cloudinary
          <img src={point.photoUrl} alt="" className="carte-photo" />
        ) : (
          <span className="carte-photo" style={{ background: point.gradient }}>
            {point.initiales}
          </span>
        )}
        <div className="carte-vignette-txt">
          <b>{point.nom}</b>
          <small>{point.specialite}</small>
        </div>
        <span className={`carte-dispo${point.dispoAujourdhui ? " on" : ""}`}>
          {point.dispoLabel}
        </span>
      </div>
      <div className="carte-vignette-pied">
        <span className="carte-adresse">{point.adresse}</span>
        <span className="carte-precision">
          {mentionPrecision(point.precision, point.lieuApproximatif)}
        </span>
        <span className="carte-meta">
          <b>★ {formatNote(point.note)}</b> ({point.nbAvis} avis)
          {point.distanceAffichee ? ` · à ${point.distanceAffichee} de vous` : ""}
        </span>
      </div>
      <span className="carte-cta">Voir le profil →</span>
    </Link>
  );
}
