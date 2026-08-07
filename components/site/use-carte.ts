"use client";

import type * as Leaflet from "leaflet";
import { useCallback, useEffect, useRef, useState } from "react";
import { recupererPositionActuelle } from "@/lib/geolocalisation";
import { CENTRE_DEFAUT, emprise, type Emprise, type Point, type PointCarte } from "@/lib/carte";

/*
 * Mécanique Leaflet partagée par les deux cartes de médecins : la couche
 * mobile (feuille de vignettes, plein écran) et la vue jumelée du web
 * (liste à gauche, carte collante à droite).
 *
 * Ce qui vit ici : création de la carte, fond de tuiles, suivi du cadrage,
 * dessin et regroupement des repères, géolocalisation. Ce qui reste à
 * chaque écran : sa propre présentation. Les deux versions ont besoin
 * exactement des mêmes garde-fous Leaflet, et les dupliquer aurait garanti
 * qu'un correctif ne soit appliqué que d'un côté.
 */

const TUILES =
  process.env.NEXT_PUBLIC_TUILES_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

/** Côté d'une cellule de regroupement, en pixels écran. */
const CELLULE = 58;

/**
 * Durée pendant laquelle les `moveend` sont mis au compte du code.
 *
 * C'est un horodatage et non un drapeau à consommer : un `panTo` émet
 * tantôt un `moveend`, tantôt deux (animation), tantôt aucun (la carte y
 * était déjà). Un drapeau se désarmait donc trop tôt — « Rechercher dans
 * cette zone » ressortait au moindre clic sur un repère — ou restait armé
 * et avalait le geste suivant de l'utilisateur.
 */
const MARGE_PROGRAMME = 900;

export interface VueCarte {
  bornes: Emprise;
  centre: Point;
  zoom: number;
}

export interface OptionsCarte {
  /** Repères à dessiner, déjà filtrés par l'appelant. */
  points: PointCarte[];
  /** Repère choisi : agrandi, passé en bleu nuit, au premier plan. */
  selection: string | null;
  /** Repère survolé dans la liste (web) : agrandi, mais pas choisi. */
  survol?: string | null;
  /** L'utilisateur a cliqué un repère isolé. */
  onChoisir: (id: string) => void;
  /** L'utilisateur survole un repère (web : pour éclairer sa carte). */
  onSurvol?: (id: string | null) => void;
  /** Cadrage d'ouverture, et cadrage du bouton « revoir toute la recherche ». */
  emprisePreferee: Emprise | null;
  /** Nom du praticien au survol du repère — utile au web, bruyant au doigt. */
  infobulles?: boolean;
  /** Commandes de zoom « + / − » : inutiles là où l'on pince. */
  boutonsZoom?: boolean;
}

export interface Carte {
  /*
   * Fonction à poser sur `ref` du conteneur, et non un objet ref.
   * `react-hooks/refs` interdit qu'un ref sorte d'un hook : tout accès à une
   * propriété de l'objet rendu passerait alors pour une lecture de ref
   * pendant le rendu, et les deux écrans devenaient illisibles à coups
   * d'erreurs. L'élément est gardé dans un état, ce qui déclenche
   * naturellement la création de la carte au moment où il existe.
   */
  poserToile: (element: HTMLDivElement | null) => void;
  /** Cadrage courant, recopié à chaque `moveend`. null tant que non prête. */
  vue: VueCarte | null;
  /** L'utilisateur a bougé la carte depuis la dernière recherche de zone. */
  zoneDeplacee: boolean;
  oublierDeplacement: () => void;
  maPosition: Point | null;
  erreurGeoloc: string;
  localiser: () => void;
  /** Recentrage silencieux (ne compte pas comme un geste de l'utilisateur). */
  recentrer: (p: Point, zoom?: number) => void;
  ajuster: (e: Emprise | null) => void;
}

export function useCarte({
  points,
  selection,
  survol = null,
  onChoisir,
  onSurvol,
  emprisePreferee,
  infobulles = false,
  boutonsZoom = true,
}: OptionsCarte): Carte {
  const [toile, setToile] = useState<HTMLDivElement | null>(null);
  const poserToile = useCallback((element: HTMLDivElement | null) => setToile(element), []);
  const refCarte = useRef<Leaflet.Map | null>(null);
  const refL = useRef<typeof Leaflet | null>(null);
  const refCouche = useRef<Leaflet.LayerGroup | null>(null);
  const refMouvementProgramme = useRef(0);
  /* Dernier cadrage connu — sert à reconnaître un `moveend` qui n'a rien
     déplacé (remesure du conteneur, chargement de tuiles). */
  const refDerniereVue = useRef<{ lat: number; lon: number; zoom: number } | null>(null);

  const [vue, setVue] = useState<VueCarte | null>(null);
  const [mesurable, setMesurable] = useState(false);
  const [zoneDeplacee, setZoneDeplacee] = useState(false);
  const [maPosition, setMaPosition] = useState<Point | null>(null);
  const [erreurGeoloc, setErreurGeoloc] = useState("");

  /*
   * Surveillance du conteneur, à deux titres.
   *
   * 1. Une carte ne doit naître que dans un conteneur mesurable. Les écrans
   *    de ce projet rendent TOUJOURS les deux versions d'un écran, l'une
   *    masquée par `md:hidden` ou `hidden md:block` — sans ce test, ouvrir
   *    /resultats?vue=carte sur un ordinateur créait deux cartes Leaflet,
   *    dont une dans un bloc `display:none` : tuiles téléchargées pour
   *    rien, et une carte de taille nulle qui répondait aux sélecteurs
   *    avant la vraie.
   * 2. Leaflet mesure son conteneur à la création ; si la mise en page bouge
   *    ensuite (bascule de colonne, barre qui se fige), il faut le lui dire.
   *
   * Aucun appel synchrone dans le corps de l'effet : ResizeObserver livre
   * de lui-même une première mesure dès `observe()`, ce qui évite le
   * `setState` en tête d'effet que le linter interdit ici.
   */
  useEffect(() => {
    if (!toile) return;
    const observateur = new ResizeObserver(() => {
      setMesurable(toile.clientWidth > 0 && toile.clientHeight > 0);
      refCarte.current?.invalidateSize();
    });
    observateur.observe(toile);
    return () => observateur.disconnect();
  }, [toile]);

  /* ---------------- Création ---------------- */
  useEffect(() => {
    let annule = false;
    if (!toile || !mesurable) return;

    import("leaflet").then((mod) => {
      const L = (mod.default ?? mod) as typeof Leaflet;
      if (annule || refCarte.current) return;
      const carte = L.map(toile, { zoomControl: false, attributionControl: false });
      L.tileLayer(TUILES, { maxZoom: 19, minZoom: 5 }).addTo(carte);
      L.control
        .attribution({ position: "bottomleft", prefix: false })
        .addAttribution('© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>')
        .addTo(carte);
      if (boutonsZoom) L.control.zoom({ position: "topright" }).addTo(carte);

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
         * Trois sources émettent `moveend` : le geste de l'utilisateur, le
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
      if (emprisePreferee) {
        carte.fitBounds(
          [
            [emprisePreferee.sud, emprisePreferee.ouest],
            [emprisePreferee.nord, emprisePreferee.est],
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
  }, [toile, mesurable, emprisePreferee, boutonsZoom]);

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
    const aPlacer = points.filter((p) => bornes.contains([p.lat, p.lon]));

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
        const eclaire = actif || p.id === survol;
        const marqueur = L.marker([p.lat, p.lon], {
          icon: L.divIcon({
            className: "carte-icone",
            html: `<span class="carte-pin${actif ? " on" : ""}${eclaire ? " gros" : ""}${
              p.precision === "gps" ? "" : " approx"
            }"><i>${p.emoji}</i></span>`,
            iconSize: [34, 42],
            iconAnchor: [17, 42],
          }),
          keyboard: false,
          zIndexOffset: actif ? 1000 : eclaire ? 500 : 0,
        });
        if (infobulles) {
          marqueur.bindTooltip(`${p.nom} · ${p.specialite}`, {
            direction: "top",
            offset: [0, -38],
            opacity: 1,
            className: "carte-bulle",
          });
        }
        marqueur.on("click", () => onChoisir(p.id));
        if (onSurvol) {
          marqueur.on("mouseover", () => onSurvol(p.id));
          marqueur.on("mouseout", () => onSurvol(null));
        }
        marqueur.addTo(couche);
        continue;
      }

      const lat = groupe.reduce((s, p) => s + p.lat, 0) / groupe.length;
      const lon = groupe.reduce((s, p) => s + p.lon, 0) / groupe.length;
      const taille = groupe.length > 20 ? 50 : groupe.length > 8 ? 44 : 38;
      const contient = groupe.some((p) => p.id === selection || p.id === survol);
      const grappe = L.marker([lat, lon], {
        icon: L.divIcon({
          className: "carte-icone",
          html: `<span class="carte-grappe${
            contient ? " on" : ""
          }" style="width:${taille}px;height:${taille}px">${groupe.length}</span>`,
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
        // choisit le premier plutôt que de laisser le clic sans effet.
        if (e.nord - e.sud < 1e-6 && e.est - e.ouest < 1e-6) {
          if (carte.getZoom() >= carte.getMaxZoom()) {
            onChoisir(groupe[0].id);
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
  }, [vue, points, selection, survol, onChoisir, onSurvol, infobulles]);

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

  /* ---------------- Commandes ---------------- */
  const recentrer = useCallback((p: Point, zoom?: number) => {
    const carte = refCarte.current;
    if (!carte) return;
    refMouvementProgramme.current = Date.now();
    if (zoom === undefined) carte.panTo([p.lat, p.lon], { animate: true });
    else carte.setView([p.lat, p.lon], zoom);
  }, []);

  const ajuster = useCallback((e: Emprise | null) => {
    const carte = refCarte.current;
    if (!carte || !e) return;
    refMouvementProgramme.current = Date.now();
    carte.fitBounds(
      [
        [e.sud, e.ouest],
        [e.nord, e.est],
      ],
      { padding: [46, 46], maxZoom: 15 }
    );
  }, []);

  const localiser = useCallback(async () => {
    setErreurGeoloc("");
    const { position, erreur } = await recupererPositionActuelle();
    if (erreur || !position) {
      setErreurGeoloc(erreur ?? "Localisation impossible pour le moment.");
      return;
    }
    setMaPosition({ lat: position.latitude, lon: position.longitude });
    recentrer({ lat: position.latitude, lon: position.longitude }, 14);
  }, [recentrer]);

  const oublierDeplacement = useCallback(() => setZoneDeplacee(false), []);

  return {
    poserToile,
    vue,
    zoneDeplacee,
    oublierDeplacement,
    maPosition,
    erreurGeoloc,
    localiser,
    recentrer,
    ajuster,
  };
}
