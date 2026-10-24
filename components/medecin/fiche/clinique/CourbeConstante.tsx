"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { nombreFr, type Niveau } from "@/lib/normes-constantes";

/*
 * Courbe d'une constante dans le temps — SVG dessiné à la main, sans
 * bibliothèque (comme les barres de l'administration).
 *
 * Règles suivies :
 *  - UNE échelle verticale ; la tension a deux séries, mais la même unité ;
 *  - axe du temps proportionnel : deux pesées à trois mois d'écart ne sont
 *    pas « voisines » de deux pesées à trois jours ;
 *  - traits de 2 px, points de 8 px cerclés de blanc ; une valeur anormale
 *    prend la couleur d'état (ambre, rouge) ET son libellé dans l'info-bulle
 *    et le tableau des mesures — jamais la couleur seule ;
 *  - la zone de référence est un aplat neutre, pas un vert « tout va bien » ;
 *  - réticule + info-bulle au survol, au doigt ET au clavier (flèches) ; le
 *    tableau des mesures, sous la courbe, donne les mêmes valeurs sans survol.
 */

export interface PointCourbe {
  le: string;
  v: number;
  niveau?: Niveau;
  /** Libellé d'état (« Élevée ») ou de contexte, repris dans l'info-bulle. */
  note?: string;
}

export interface SerieCourbe {
  id: string;
  nom: string;
  couleur: string;
  points: PointCourbe[];
}

const COULEUR_ETAT: Record<Niveau, string | null> = {
  normal: null,
  attention: "var(--amber)",
  alerte: "var(--red)",
};

const MARGE = { haut: 14, droite: 14, bas: 28, gauche: 42 };

/** Pas « rond » (1, 2, 2,5, 5 × 10ⁿ) pour environ `n` graduations. */
function pasRond(etendue: number, n: number): number {
  const brut = etendue / n;
  const puissance = 10 ** Math.floor(Math.log10(brut));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * puissance >= brut) return m * puissance;
  return 10 * puissance;
}

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
function dateCourte(t: number, avecAnnee: boolean): string {
  const d = new Date(t);
  return avecAnnee ? `${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : `${d.getUTCDate()} ${MOIS[d.getUTCMonth()]}`;
}
function dateLongue(t: number): string {
  return new Date(t).toLocaleString("fr-FR", {
    timeZone: "Africa/Conakry",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CourbeConstante({
  titre,
  series,
  unite,
  decimales = 1,
  zone,
  hauteur = 220,
}: {
  titre: string;
  series: SerieCourbe[];
  unite: string;
  decimales?: number;
  /** Bande de référence (valeurs usuelles), dessinée en fond. */
  zone?: { min: number; max: number };
  hauteur?: number;
}) {
  const boite = useRef<HTMLDivElement>(null);
  const [largeur, setLargeur] = useState(0);
  const [index, setIndex] = useState<number | null>(null);

  // Largeur relevée dans le rappel de l'observateur (jamais dans le corps de
  // l'effet) : c'est aussi ce qui redessine au redimensionnement.
  useEffect(() => {
    const el = boite.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => setLargeur(Math.floor(e.contentRect.width)));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const plusieurs = series.length > 1;

  /* ---------- Échelles ---------- */
  const geo = useMemo(() => {
    const tous = series.flatMap((s) => s.points.map((p) => ({ t: Date.parse(p.le), v: p.v })));
    if (!tous.length || !largeur) return null;
    let tMin = Math.min(...tous.map((p) => p.t));
    let tMax = Math.max(...tous.map((p) => p.t));
    if (tMin === tMax) {
      tMin -= 86_400_000 * 3;
      tMax += 86_400_000 * 3;
    }
    const valeurs = tous.map((p) => p.v).concat(zone ? [zone.min, zone.max] : []);
    let vMin = Math.min(...valeurs);
    let vMax = Math.max(...valeurs);
    if (vMin === vMax) {
      vMin -= 1;
      vMax += 1;
    }
    const pas = pasRond(vMax - vMin, 4);
    vMin = Math.floor((vMin - pas * 0.3) / pas) * pas;
    vMax = Math.ceil((vMax + pas * 0.3) / pas) * pas;

    const droite = MARGE.droite + (plusieurs ? 34 : 0);
    const w = largeur - MARGE.gauche - droite;
    const h = hauteur - MARGE.haut - MARGE.bas;
    const x = (t: number) => MARGE.gauche + ((t - tMin) / (tMax - tMin)) * w;
    const y = (v: number) => MARGE.haut + (1 - (v - vMin) / (vMax - vMin)) * h;

    const graduationsY: number[] = [];
    for (let v = vMin; v <= vMax + pas / 2; v += pas) graduationsY.push(Math.round(v * 1000) / 1000);

    const span = tMax - tMin;
    const avecAnnee = span > 300 * 86_400_000;
    const nbX = largeur < 420 ? 3 : 4;
    const graduationsX = Array.from({ length: nbX }, (_, i) => tMin + (span * i) / (nbX - 1));

    // Les instants de mesure, communs à toutes les séries : ce que le
    // réticule parcourt.
    const instants = [...new Set(tous.map((p) => p.t))].sort((a, b) => a - b);
    return { x, y, w, h, droite, graduationsY, graduationsX, avecAnnee, instants };
  }, [series, largeur, hauteur, zone, plusieurs]);

  const instantActif = geo && index !== null ? geo.instants[Math.min(index, geo.instants.length - 1)] : null;

  function viser(e: PointerEvent<SVGRectElement>) {
    if (!geo) return;
    const rect = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    // Le SVG peut être mis à l'échelle (zoom de page) : on ramène le pointeur
    // dans le repère du dessin.
    const px = ((e.clientX - rect.left) / rect.width) * largeur;
    let meilleur = 0;
    let ecart = Infinity;
    geo.instants.forEach((t, i) => {
      const d = Math.abs(geo.x(t) - px);
      if (d < ecart) {
        ecart = d;
        meilleur = i;
      }
    });
    setIndex(meilleur);
  }

  function auClavier(e: KeyboardEvent<SVGRectElement>) {
    if (!geo) return;
    const dernier = geo.instants.length - 1;
    if (e.key === "ArrowRight") setIndex((i) => (i === null ? dernier : Math.min(dernier, i + 1)));
    else if (e.key === "ArrowLeft") setIndex((i) => (i === null ? dernier : Math.max(0, i - 1)));
    else if (e.key === "Home") setIndex(0);
    else if (e.key === "End") setIndex(dernier);
    else if (e.key === "Escape") setIndex(null);
    else return;
    e.preventDefault();
  }

  const lecture =
    instantActif === null
      ? []
      : series
          .map((s) => ({ s, p: s.points.find((p) => Date.parse(p.le) === instantActif) }))
          .filter((l): l is { s: SerieCourbe; p: PointCourbe } => !!l.p);

  return (
    <div className="w-full">
      {plusieurs && (
        // Légende : toujours présente dès deux séries, clé en trait comme la marque.
        <div className="mb-2 flex flex-wrap justify-end gap-3 text-[11.5px] font-semibold text-muted">
          {series.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-[2px] w-3.5 rounded" style={{ background: s.couleur }} />
              {s.nom}
            </span>
          ))}
        </div>
      )}

      <div ref={boite} className="relative w-full" style={{ height: hauteur }}>
      {geo && (
        <svg width={largeur} height={hauteur} role="group" aria-label={titre} className="block overflow-visible">
          {/* Zone de référence */}
          {zone && (
            <rect
              x={MARGE.gauche}
              width={geo.w}
              y={geo.y(zone.max)}
              height={Math.max(0, geo.y(zone.min) - geo.y(zone.max))}
              fill="var(--bg)"
              opacity={0.9}
            />
          )}

          {/* Grille et graduations */}
          {geo.graduationsY.map((v) => (
            <g key={v}>
              <line x1={MARGE.gauche} x2={MARGE.gauche + geo.w} y1={geo.y(v)} y2={geo.y(v)} stroke="var(--line)" strokeWidth={1} />
              <text
                x={MARGE.gauche - 8}
                y={geo.y(v)}
                dy="0.32em"
                textAnchor="end"
                fontSize={11}
                fill="var(--muted)"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {nombreFr(v, decimales)}
              </text>
            </g>
          ))}
          {geo.graduationsX.map((t, i) => (
            <text
              key={t}
              x={geo.x(t)}
              y={hauteur - 8}
              textAnchor={i === 0 ? "start" : i === geo.graduationsX.length - 1 ? "end" : "middle"}
              fontSize={11}
              fill="var(--muted)"
            >
              {dateCourte(t, geo.avecAnnee)}
            </text>
          ))}

          {/* Réticule */}
          {instantActif !== null && (
            <line
              x1={geo.x(instantActif)}
              x2={geo.x(instantActif)}
              y1={MARGE.haut}
              y2={MARGE.haut + geo.h}
              stroke="var(--muted)"
              strokeWidth={1}
            />
          )}

          {/* Séries */}
          {series.map((s) => {
            const pts = [...s.points].sort((a, b) => Date.parse(a.le) - Date.parse(b.le));
            const d = pts.map((p, i) => `${i ? "L" : "M"}${geo.x(Date.parse(p.le)).toFixed(1)},${geo.y(p.v).toFixed(1)}`).join(" ");
            const fin = pts[pts.length - 1];
            return (
              <g key={s.id}>
                {pts.length > 1 && (
                  <path d={d} fill="none" stroke={s.couleur} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                )}
                {pts.map((p) => {
                  const actif = Date.parse(p.le) === instantActif;
                  return (
                    <circle
                      key={p.le}
                      cx={geo.x(Date.parse(p.le))}
                      cy={geo.y(p.v)}
                      r={actif ? 5.5 : 4}
                      fill={(p.niveau && COULEUR_ETAT[p.niveau]) || s.couleur}
                      stroke="var(--card)"
                      strokeWidth={2}
                    />
                  );
                })}
                {/* Étiquette directe en bout de courbe, quand il y a plusieurs séries. */}
                {plusieurs && fin && (
                  <text
                    x={geo.x(Date.parse(fin.le)) + 9}
                    y={geo.y(fin.v)}
                    dy="0.32em"
                    fontSize={11}
                    fontWeight={700}
                    fill="var(--ink)"
                  >
                    {s.nom.slice(0, 3)}.
                  </text>
                )}
              </g>
            );
          })}

          {/* Zone de visée : toute la largeur, le pointeur n'a pas à toucher un point. */}
          <rect
            x={MARGE.gauche}
            y={0}
            width={geo.w}
            height={hauteur}
            fill="transparent"
            tabIndex={0}
            aria-label={`${titre} : flèches gauche et droite pour parcourir les mesures`}
            onPointerMove={viser}
            onPointerDown={viser}
            onPointerLeave={(e) => {
              if (e.pointerType === "mouse") setIndex(null);
            }}
            onKeyDown={auClavier}
            onBlur={() => setIndex(null)}
            className="cursor-crosshair outline-none focus-visible:outline-2 focus-visible:outline-teal"
          />
        </svg>
      )}

      {/* Info-bulle : la valeur d'abord, le nom de série ensuite. */}
      {geo && instantActif !== null && lecture.length > 0 && (
        <div
          className="pointer-events-none absolute z-10 min-w-[150px] rounded-xl border border-line bg-white px-3 py-2 text-[12px] shadow-card"
          style={{
            top: 4,
            // À droite du réticule s'il y a la place, à gauche sinon : collée
            // au bord, l'info-bulle masquait le point même qu'elle décrit.
            left:
              geo.x(instantActif) + 12 + 190 <= largeur
                ? geo.x(instantActif) + 12
                : Math.max(0, geo.x(instantActif) - 12 - 190),
          }}
        >
          <div className="mb-1 text-[11px] text-muted">{dateLongue(instantActif)}</div>
          {lecture.map(({ s, p }) => (
            <div key={s.id} className="flex items-center gap-2">
              <span aria-hidden className="inline-block h-[2px] w-3 rounded" style={{ background: s.couleur }} />
              <b className="text-[13px] font-extrabold" style={{ fontVariantNumeric: "tabular-nums" }}>
                {nombreFr(p.v, decimales)} {unite}
              </b>
              {plusieurs && <span className="text-muted">{s.nom}</span>}
            </div>
          ))}
          {lecture.some(({ p }) => p.note) && (
            <div className="mt-1 text-[11.5px] font-bold text-ink">
              {[...new Set(lecture.map(({ p }) => p.note).filter(Boolean))].join(" · ")}
            </div>
          )}
        </div>
      )}

      {/* Annonce pour les lecteurs d'écran quand on parcourt au clavier. */}
      <div aria-live="polite" className="sr-only">
        {instantActif !== null &&
          `${dateLongue(instantActif)} : ${lecture.map(({ s, p }) => `${s.nom} ${nombreFr(p.v, decimales)} ${unite}${p.note ? `, ${p.note}` : ""}`).join(" ; ")}`}
      </div>
      </div>
    </div>
  );
}
