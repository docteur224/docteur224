"use client";

import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AvatarMedecin from "@/components/site/AvatarMedecin";
import Pagination, { usePagination } from "@/components/site/Pagination";
import { useCarte } from "@/components/site/use-carte";
import { formatNote } from "@/lib/format";
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
 * Vue jumelée du web : la liste à gauche, la carte collante à droite.
 *
 * Le téléphone bascule d'un écran à l'autre parce qu'il n'a la place que
 * pour un seul ; l'écran large n'a pas cette contrainte, et tout ce qui
 * rend une carte utile vient justement de la mise en regard — voir où
 * tombe un praticien SANS perdre de vue ce qu'on lisait de lui. Les deux
 * colonnes sont donc synchronisées dans les deux sens :
 *   - survoler une fiche fait ressortir son épingle ;
 *   - survoler une épingle éclaire sa fiche ;
 *   - cliquer l'une ou l'autre choisit le praticien, recentre la carte et
 *     ramène la fiche dans le champ.
 *
 * La liste n'est plus celle, paginée par le serveur, de la vue classique :
 * elle porte tout le résultat (comme la carte) et se pagine côté client, ce
 * qui est la seule façon d'avoir strictement les mêmes praticiens des deux
 * côtés — un compte qui diffère entre la liste et la carte est le premier
 * défaut qu'un utilisateur remarque.
 */

const PAR_PAGE = 10;

export default function CarteResultatsWeb({
  points,
  sansPosition,
  lienListe,
}: {
  points: PointCarte[];
  /** Médecins du résultat qu'aucun repli n'a permis de placer. */
  sansPosition: number;
  /** Retour à la liste seule, filtres conservés. */
  lienListe: string;
}) {
  const refListe = useRef<HTMLDivElement>(null);
  /* La fiche ne défile que si la sélection vient de la carte : sinon, cliquer
     une fiche la ferait sauter sous le curseur. */
  const refOrigineSelection = useRef<"carte" | "liste">("carte");

  const [selection, setSelection] = useState<string | null>(null);
  const [survol, setSurvol] = useState<string | null>(null);
  const [zone, setZone] = useState<Emprise | null>(null);

  const vueInitiale = useMemo(() => emprise(points), [points]);

  const retenus = useMemo(
    () => (zone ? points.filter((p) => dansEmprise(p, zone)) : points),
    [points, zone]
  );

  const choisirDepuisCarte = useCallback((id: string) => {
    refOrigineSelection.current = "carte";
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
    survol,
    onChoisir: choisirDepuisCarte,
    onSurvol: setSurvol,
    emprisePreferee: vueInitiale,
    // Le nom au survol de l'épingle : à la souris on lit avant de cliquer.
    infobulles: true,
  });

  /* Distances : même règle que sur mobile — un kilométrage n'est écrit que
     s'il part d'une position que le patient a partagée. */
  const listeAffichee = useMemo(
    () =>
      retenus.map((p) => ({
        ...p,
        distanceAffichee: maPosition ? formatDistance(distanceKm(maPosition, p)) : "",
      })),
    [retenus, maPosition]
  );

  const pagination = usePagination(listeAffichee, PAR_PAGE);
  const { setPage } = pagination;

  /* Le praticien choisi doit être sur la page affichée, sinon la carte parle
     d'une fiche que la liste ne montre pas. */
  useEffect(() => {
    if (!selection) return;
    const rang = listeAffichee.findIndex((p) => p.id === selection);
    if (rang >= 0) setPage(Math.floor(rang / PAR_PAGE));
  }, [selection, listeAffichee, setPage]);

  /* Recentrage + remontée de la fiche, seulement depuis la carte. */
  useEffect(() => {
    if (!selection) return;
    const point = retenus.find((p) => p.id === selection);
    if (point) recentrer(point);
    if (refOrigineSelection.current !== "carte") return;
    refListe.current
      ?.querySelector<HTMLElement>(`[data-medecin="${selection}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selection, retenus, recentrer, pagination.page]);

  const chercherDansLaZone = useCallback(() => {
    if (!vue) return;
    setZone(vue.bornes);
    oublierDeplacement();
    setSelection(null);
    setPage(0);
  }, [vue, oublierDeplacement, setPage]);

  const toutRevoir = useCallback(() => {
    setZone(null);
    setSelection(null);
    setPage(0);
    ajuster(vueInitiale);
  }, [ajuster, vueInitiale, setPage]);

  const total = retenus.length;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(340px,400px)_1fr]">
      {/* ---------- Colonne de gauche : la liste ---------- */}
      <div ref={refListe} className="flex flex-col gap-[10px]">
        <div className="flex flex-wrap items-center gap-2">
          <b className="text-[15px] font-extrabold">
            {total} résultat{total > 1 ? "s" : ""}
          </b>
          {zone && (
            <span className="rounded-lg bg-teal-soft px-[9px] py-[5px] text-[11.5px] font-bold text-blue">
              dans la zone affichée
            </span>
          )}
          {!zone && sansPosition > 0 && (
            <span className="text-[11.5px] font-semibold text-muted">
              {sansPosition} sans adresse renseignée
            </span>
          )}
          <Link
            href={lienListe}
            scroll={false}
            className="ml-auto inline-flex items-center gap-2 rounded-[11px] border-[1.5px] border-line bg-white px-[13px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
          >
            ☰ Masquer la carte
          </Link>
        </div>

        {total === 0 && (
          <div className="rounded-2xl border border-line bg-white p-8 text-center">
            <div className="text-3xl" aria-hidden>
              🗺️
            </div>
            <b className="mt-3 block text-base font-extrabold">Aucun médecin dans cette zone</b>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              Élargissez la carte, ou revenez à l’ensemble de la recherche.
            </p>
            {zone && (
              <button
                type="button"
                onClick={toutRevoir}
                className="mt-4 rounded-[11px] bg-teal px-[18px] py-[11px] text-[13.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
              >
                Revoir toute la recherche
              </button>
            )}
          </div>
        )}

        {pagination.tranche.map((p) => (
          <FicheCarte
            key={p.id}
            point={p}
            actif={p.id === selection}
            eclaire={p.id === survol}
            onSurvol={setSurvol}
            onChoisir={(id) => {
              refOrigineSelection.current = "liste";
              setSelection(id);
            }}
          />
        ))}

        <Pagination
          page={pagination.page}
          pages={pagination.pages}
          total={pagination.total}
          premier={pagination.premier}
          dernier={pagination.dernier}
          onPage={pagination.setPage}
          libelle="médecins"
        />
      </div>

      {/* ---------- Colonne de droite : la carte ---------- */}
      <div className="relative hidden lg:block">
        {/* 82px = la barre de navigation collante (66) plus la respiration. */}
        <div className="sticky top-[82px] h-[calc(100vh-98px)]">
          <div className="relative h-full overflow-hidden rounded-2xl border border-line">
            <div
              ref={poserToile}
              className="h-full w-full"
              role="application"
              aria-label="Carte des médecins"
            />

            {erreurGeoloc ? (
              <p className="absolute left-1/2 top-3 z-[500] m-0 max-w-[80%] -translate-x-1/2 rounded-xl bg-white px-[13px] py-[10px] text-[12px] font-bold text-amber shadow-[0_6px_18px_rgba(16,59,80,.2)]">
                {erreurGeoloc}
              </p>
            ) : zoneDeplacee ? (
              <button
                type="button"
                onClick={chercherDansLaZone}
                className="absolute left-1/2 top-3 z-[500] -translate-x-1/2 rounded-full bg-blue px-[18px] py-[10px] text-[12.5px] font-bold text-white shadow-[0_6px_18px_rgba(16,59,80,.3)] transition-colors hover:bg-blue-deep"
              >
                🔄 Rechercher dans cette zone
              </button>
            ) : (
              zone && (
                <button
                  type="button"
                  onClick={toutRevoir}
                  className="absolute left-1/2 top-3 z-[500] -translate-x-1/2 rounded-full bg-blue px-[18px] py-[10px] text-[12.5px] font-bold text-white shadow-[0_6px_18px_rgba(16,59,80,.3)] transition-colors hover:bg-blue-deep"
                >
                  ✕ Revoir toute la recherche
                </button>
              )
            )}

            <button
              type="button"
              onClick={localiser}
              aria-label="Me localiser"
              className="absolute right-3 top-[106px] z-[500] grid h-[38px] w-[38px] place-items-center rounded-full border-0 bg-white text-base shadow-[0_4px_14px_rgba(16,59,80,.22)] transition-transform hover:scale-105"
            >
              📍
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Fiche de la colonne de gauche, jumelée à son épingle. */
function FicheCarte({
  point,
  actif,
  eclaire,
  onSurvol,
  onChoisir,
}: {
  point: PointCarte & { distanceAffichee: string };
  actif: boolean;
  eclaire: boolean;
  onSurvol: (id: string | null) => void;
  onChoisir: (id: string) => void;
}) {
  return (
    /*
     * La carte entière réagit au survol et au clic (elle choisit le
     * praticien), mais elle n'est pas elle-même un lien : le seul lien est
     * « Voir le profil ». Cliquer la fiche doit montrer où elle tombe sur la
     * carte, pas quitter la page — l'inverse enlèverait tout intérêt à la
     * vue jumelée.
     */
    <div
      data-medecin={point.id}
      onMouseEnter={() => onSurvol(point.id)}
      onMouseLeave={() => onSurvol(null)}
      onClick={() => onChoisir(point.id)}
      className={`cursor-pointer rounded-2xl border bg-white p-[14px] transition-shadow ${
        actif
          ? "border-teal shadow-[0_0_0_2px_var(--teal-soft),0_10px_24px_rgba(16,59,80,.12)]"
          : eclaire
            ? "border-line shadow-[0_10px_24px_rgba(16,59,80,.12)]"
            : "border-line"
      }`}
    >
      <div className="flex items-start gap-3">
        <AvatarMedecin
          photoUrl={point.photoUrl}
          initiales={point.initiales}
          gradient={point.gradient}
          taille={52}
        />
        <div className="min-w-0 flex-1">
          <Link
            href={`/medecin/${point.id}`}
            onClick={(e) => e.stopPropagation()}
            className="block truncate text-[15px] font-extrabold hover:text-blue"
          >
            {point.nom}
          </Link>
          <div className="text-[12.5px] font-bold text-teal">{point.specialite}</div>
          {/* Coupée faute de largeur dans une colonne de 400 px : l'adresse
              complète reste lisible au survol, et en entier sur la fiche. */}
          <div className="mt-1 truncate text-[12px] text-muted" title={point.adresse}>
            📍 {point.adresse}
          </div>
          <div className="text-[11px] font-semibold text-muted">
            {mentionPrecision(point.precision, point.lieuApproximatif)}
          </div>
        </div>
        <span
          className={`flex-none rounded-lg px-[9px] py-1 text-[10.5px] font-bold ${
            point.dispoAujourdhui ? "bg-green-soft text-green" : "bg-amber-soft text-amber"
          }`}
        >
          {point.dispoLabel}
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[12.5px] font-bold text-amber">
          ★ {formatNote(point.note)}{" "}
          <span className="font-semibold text-muted">({point.nbAvis} avis)</span>
        </span>
        {point.anneesExperience > 0 && (
          <span className="text-[12px] text-muted">· {point.anneesExperience} ans d’expérience</span>
        )}
        {point.distanceAffichee && (
          <span className="text-[12px] text-muted">· à {point.distanceAffichee} de vous</span>
        )}
        <Link
          href={`/medecin/${point.id}`}
          onClick={(e) => e.stopPropagation()}
          className="ml-auto rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
        >
          Voir le profil
        </Link>
      </div>
    </div>
  );
}
