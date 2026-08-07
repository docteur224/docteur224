"use client";

import "leaflet/dist/leaflet.css";
import Link from "next/link";
import type * as Leaflet from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatNote } from "@/lib/format";
import { recupererPositionActuelle } from "@/lib/geolocalisation";
import {
  CENTRE_DEFAUT,
  dansEmprise,
  distanceKm,
  emprise,
  formatDistance,
  mentionPrecision,
  type Emprise,
  type Point,
  type PointCarte,
} from "@/lib/carte";

/*
 * Carte des médecins — vue « ?vue=carte » de /resultats, mobile uniquement.
 *
 * Choix de fond de carte : Leaflet + tuiles OpenStreetMap. Aucune clé d'API,
 * aucun compte à ouvrir, et l'URL des tuiles passe par une variable
 * d'environnement — basculer vers un fournisseur payant le jour où le trafic
 * le justifie ne touchera pas ce fichier.
 *
 * Les repères ne sont PAS rechargés depuis la base : ils arrivent déjà
 * calculés de /resultats (composant serveur), avec exactement les filtres de
 * la liste. Deux chemins de données vers le même écran finiraient toujours
 * par afficher deux comptes différents.
 *
 * Le regroupement des repères est fait ici plutôt qu'avec un greffon : à
 * l'échelle de Conakry, où presque tous les praticiens tiennent dans quatre
 * communes, une grille en pixels écran suffit et se comporte de façon
 * prévisible — un repère ne change jamais de groupe sans qu'on ait zoomé.
 *
 * Aucun `ref` n'est lu pendant le rendu : l'état de la carte (emprise et
 * centre) est recopié dans un état React à chaque `moveend`, et tout ce que
 * l'écran affiche s'en déduit.
 */

const TUILES =
  process.env.NEXT_PUBLIC_TUILES_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

/** Côté d'une cellule de regroupement, en pixels écran. */
const CELLULE = 58;
/** Au-delà, la bande de vignettes du bas devient impossible à parcourir. */
const MAX_VIGNETTES = 30;
/** Durée pendant laquelle les `moveend` sont mis au compte du code. */
const MARGE_PROGRAMME = 900;

interface VueCarte {
  bornes: Emprise;
  centre: Point;
  zoom: number;
}

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
  const refToile = useRef<HTMLDivElement>(null);
  const refCarte = useRef<Leaflet.Map | null>(null);
  const refL = useRef<typeof Leaflet | null>(null);
  const refCouche = useRef<Leaflet.LayerGroup | null>(null);
  const refBande = useRef<HTMLDivElement>(null);
  /*
   * Un déplacement déclenché par le code (recentrage sur un repère,
   * géolocalisation, ouverture d'une grappe) ne doit pas faire apparaître
   * « Rechercher dans cette zone » : ce bouton ne répond qu'à un geste de
   * l'utilisateur.
   *
   * C'est un horodatage et non un drapeau : un `panTo` émet tantôt un
   * `moveend`, tantôt deux (animation), tantôt aucun (la carte y était
   * déjà). Un drapeau à consommer se désarmait donc trop tôt — le bouton
   * ressortait au moindre clic sur un repère — ou restait armé et avalait
   * le geste suivant. Une fenêtre de temps se referme toute seule.
   */
  const refMouvementProgramme = useRef(0);
  /* Empêche l'aller-retour « la bande défile → la sélection change → la bande
     redéfile » : on ne repositionne la bande que sur un clic de repère. */
  const refOrigineSelection = useRef<"repere" | "bande">("repere");
  /* Dernier cadrage connu — sert à reconnaître un `moveend` qui n'a rien
     déplacé (remesure du conteneur, chargement de tuiles). */
  const refDerniereVue = useRef<{ lat: number; lon: number; zoom: number } | null>(null);

  const [vue, setVue] = useState<VueCarte | null>(null);
  const [selection, setSelection] = useState<string | null>(null);
  const [zoneDeplacee, setZoneDeplacee] = useState(false);
  const [zone, setZone] = useState<Emprise | null>(null);
  const [maPosition, setMaPosition] = useState<Point | null>(null);
  const [erreurGeoloc, setErreurGeoloc] = useState("");

  const vueInitiale = useMemo(() => emprise(points), [points]);

  /* ---------------- Création de la carte ---------------- */
  useEffect(() => {
    let annule = false;
    const toile = refToile.current;
    if (!toile) return;

    import("leaflet").then((mod) => {
      const L = (mod.default ?? mod) as typeof Leaflet;
      if (annule || refCarte.current) return;
      const carte = L.map(toile, { zoomControl: false, attributionControl: false });
      L.tileLayer(TUILES, { maxZoom: 19, minZoom: 5 }).addTo(carte);
      L.control
        .attribution({ position: "bottomleft", prefix: false })
        .addAttribution('© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>')
        .addTo(carte);
      L.control.zoom({ position: "topright" }).addTo(carte);

      const relever = () => {
        const b = carte.getBounds();
        const c = carte.getCenter();
        setVue({
          bornes: { sud: b.getSouth(), ouest: b.getWest(), nord: b.getNorth(), est: b.getEast() },
          centre: { lat: c.lat, lon: c.lng },
          zoom: carte.getZoom(),
        });
      };
      /* `moveend` seul : un zoom émet `zoomend` PUIS `moveend`, écouter les
         deux ferait compter un même geste pour deux. */
      carte.on("moveend", () => {
        const c = carte.getCenter();
        const zoom = carte.getZoom();
        const precedent = refDerniereVue.current;
        /*
         * Trois sources émettent `moveend` : le doigt de l'utilisateur, le
         * code (recentrage, géolocalisation) et Leaflet lui-même quand le
         * conteneur est remesuré. Seule la première doit proposer
         * « Rechercher dans cette zone » — sans ce tri, le bouton
         * s'affichait dès l'ouverture de l'écran, avant tout geste.
         */
        const immobile =
          precedent !== null &&
          precedent.zoom === zoom &&
          Math.abs(precedent.lat - c.lat) < 1e-7 &&
          Math.abs(precedent.lon - c.lng) < 1e-7;
        refDerniereVue.current = { lat: c.lat, lon: c.lng, zoom };
        const programme = Date.now() - refMouvementProgramme.current < MARGE_PROGRAMME;
        if (!programme && !immobile) setZoneDeplacee(true);
        relever();
      });

      refMouvementProgramme.current = Date.now();
      if (vueInitiale) {
        carte.fitBounds(
          [
            [vueInitiale.sud, vueInitiale.ouest],
            [vueInitiale.nord, vueInitiale.est],
          ],
          { padding: [46, 46], maxZoom: 15 }
        );
      } else {
        carte.setView([CENTRE_DEFAUT.lat, CENTRE_DEFAUT.lon], 12);
      }

      refL.current = L;
      refCarte.current = carte;
      refCouche.current = L.layerGroup().addTo(carte);
      relever();
    });

    return () => {
      annule = true;
      refCarte.current?.remove();
      refCarte.current = null;
      refCouche.current = null;
    };
  }, [vueInitiale]);

  /* Leaflet mesure son conteneur à la création : si l'écran s'ouvre pendant
     une transition (barre haute qui se fige, clavier qui se referme), la carte
     reste dimensionnée sur zéro et n'affiche qu'un fond gris. */
  useEffect(() => {
    const toile = refToile.current;
    if (!vue || !toile) return;
    /* Pas de drapeau « mouvement programmé » ici : une remesure qui ne
       déplace rien n'émet aucun `moveend`, le drapeau resterait armé et
       avalerait le geste suivant de l'utilisateur. La comparaison de
       cadrage faite au moveend suffit à l'ignorer. */
    const observateur = new ResizeObserver(() => refCarte.current?.invalidateSize());
    observateur.observe(toile);
    return () => observateur.disconnect();
  }, [vue]);

  /* ---------------- Sélections dérivées ---------------- */

  /** Repères retenus : ceux de la zone recherchée, sinon tout le résultat. */
  const retenus = useMemo(
    () => (zone ? points.filter((p) => dansEmprise(p, zone)) : points),
    [points, zone]
  );

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
      .map((p) => ({ ...p, distanceAffichee: maPosition ? formatDistance(p.distance) : "" }));
  }, [vue, retenus, maPosition]);

  /* ---------------- Dessin des repères ---------------- */
  useEffect(() => {
    const L = refL.current;
    const carte = refCarte.current;
    const couche = refCouche.current;
    if (!vue || !L || !carte || !couche) return;

    couche.clearLayers();

    // Marge : un repère juste hors cadre doit déjà être groupé avec ses
    // voisins, sinon il apparaît seul en glissant dans le champ.
    const bornes = carte.getBounds().pad(0.25);
    const aPlacer = retenus.filter((p) => bornes.contains([p.lat, p.lon]));

    const cellules = new Map<string, PointCarte[]>();
    for (const p of aPlacer) {
      const ecran = carte.latLngToContainerPoint([p.lat, p.lon]);
      const cle = `${Math.floor(ecran.x / CELLULE)}:${Math.floor(ecran.y / CELLULE)}`;
      const groupe = cellules.get(cle);
      if (groupe) groupe.push(p);
      else cellules.set(cle, [p]);
    }

    for (const groupe of cellules.values()) {
      if (groupe.length === 1) {
        const p = groupe[0];
        const actif = p.id === selection;
        const marqueur = L.marker([p.lat, p.lon], {
          icon: L.divIcon({
            className: "carte-icone",
            html: `<span class="carte-pin${actif ? " on" : ""}${
              p.precision === "gps" ? "" : " approx"
            }"><i>${p.emoji}</i></span>`,
            iconSize: [34, 42],
            iconAnchor: [17, 42],
          }),
          keyboard: false,
          zIndexOffset: actif ? 1000 : 0,
        });
        marqueur.on("click", () => {
          refOrigineSelection.current = "repere";
          refMouvementProgramme.current = Date.now();
          carte.panTo([p.lat, p.lon], { animate: true });
          setSelection(p.id);
        });
        marqueur.addTo(couche);
        continue;
      }

      const lat = groupe.reduce((s, p) => s + p.lat, 0) / groupe.length;
      const lon = groupe.reduce((s, p) => s + p.lon, 0) / groupe.length;
      const taille = groupe.length > 20 ? 50 : groupe.length > 8 ? 44 : 38;
      const grappe = L.marker([lat, lon], {
        icon: L.divIcon({
          className: "carte-icone",
          html: `<span class="carte-grappe" style="width:${taille}px;height:${taille}px">${groupe.length}</span>`,
          iconSize: [taille, taille],
          iconAnchor: [taille / 2, taille / 2],
        }),
        keyboard: false,
      });
      grappe.on("click", () => {
        const e = emprise(groupe);
        if (!e) return;
        refMouvementProgramme.current = Date.now();
        // Des repères confondus au millionième de degré ne se sépareront
        // jamais par fitBounds : on zoome d'un cran, et au zoom maximal on
        // laisse la bande du bas les départager.
        if (e.nord - e.sud < 1e-6 && e.est - e.ouest < 1e-6) {
          if (carte.getZoom() >= carte.getMaxZoom()) {
            refOrigineSelection.current = "repere";
            setSelection(groupe[0].id);
            return;
          }
          carte.setView([lat, lon], Math.min(carte.getZoom() + 2, carte.getMaxZoom()));
        } else {
          carte.fitBounds(
            [
              [e.sud, e.ouest],
              [e.nord, e.est],
            ],
            { padding: [56, 56], maxZoom: 17 }
          );
        }
      });
      grappe.addTo(couche);
    }
  }, [vue, retenus, selection]);

  /* Repère « vous êtes ici », posé hors de la couche des médecins pour ne pas
     disparaître au prochain redessin. */
  useEffect(() => {
    const L = refL.current;
    const carte = refCarte.current;
    if (!vue || !L || !carte || !maPosition) return;
    const marqueur = L.marker([maPosition.lat, maPosition.lon], {
      icon: L.divIcon({
        className: "carte-icone",
        html: '<span class="carte-moi"></span>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
      interactive: false,
      zIndexOffset: -500,
    }).addTo(carte);
    return () => {
      marqueur.remove();
    };
    // `vue` sert seulement à attendre que la carte existe.
  }, [vue, maPosition]);

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
    const point = visibles.find((p) => p.id === id);
    if (point && refCarte.current) {
      refMouvementProgramme.current = Date.now();
      refCarte.current.panTo([point.lat, point.lon], { animate: true });
    }
  }, [selection, visibles]);

  const meLocaliser = useCallback(async () => {
    setErreurGeoloc("");
    const { position, erreur } = await recupererPositionActuelle();
    if (erreur || !position) {
      setErreurGeoloc(erreur ?? "Localisation impossible pour le moment.");
      return;
    }
    setMaPosition({ lat: position.latitude, lon: position.longitude });
    refMouvementProgramme.current = Date.now();
    refCarte.current?.setView([position.latitude, position.longitude], 14);
  }, []);

  const chercherDansLaZone = useCallback(() => {
    if (!vue) return;
    setZone(vue.bornes);
    setZoneDeplacee(false);
    setSelection(null);
  }, [vue]);

  const toutRevoir = useCallback(() => {
    setZone(null);
    setSelection(null);
    if (!vueInitiale || !refCarte.current) return;
    refMouvementProgramme.current = Date.now();
    refCarte.current.fitBounds(
      [
        [vueInitiale.sud, vueInitiale.ouest],
        [vueInitiale.nord, vueInitiale.est],
      ],
      { padding: [46, 46], maxZoom: 15 }
    );
  }, [vueInitiale]);

  const total = retenus.length;

  return (
    <div className="carte-hote md:hidden">
      <div ref={refToile} className="carte-toile" role="application" aria-label="Carte des médecins" />

      {/* Compteur — la carte ignore la pagination de la liste : elle porte
          tout le résultat, ce que le compteur doit dire sans ambiguïté. */}
      <div className="carte-compteur">
        <b>
          {total} médecin{total > 1 ? "s" : ""}
        </b>
        {zone ? (
          <span className="carte-etiq">dans cette zone</span>
        ) : (
          sansPosition > 0 && (
            <span className="carte-etiq">
              {sansPosition} sans adresse renseignée
            </span>
          )
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

      <button type="button" className="carte-rond" onClick={meLocaliser} aria-label="Me localiser">
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
