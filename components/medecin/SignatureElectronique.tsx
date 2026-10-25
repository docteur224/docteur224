"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { enregistrerSignature, supprimerSignature, useSignature, type Traits } from "@/lib/medicaments";

/*
 * Signature électronique du médecin : tracée au doigt ou à la souris, puis
 * apposée sur les documents qu'il génère (ordonnances, certificats…).
 *
 * Le tracé est gardé en VECTEURS, en coordonnées relatives (0 à 1) dans un
 * cadre de proportion fixe : le PDF le redessine net à toute taille, et la
 * même signature sert sur un téléphone comme sur un écran large.
 *
 * Ce n'est pas une signature qualifiée : c'est le code de vérification
 * imprimé à côté qui rend le document contrôlable. L'écran le dit.
 */

const RATIO = 3; // largeur / hauteur du cadre
const BTN =
  "inline-flex min-h-11 items-center justify-center rounded-[10px] px-3.5 text-[12.5px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-45";

/** Aperçu d'une signature enregistrée, en SVG. */
export function ApercuSignature({ traits, ratio = RATIO, className = "" }: { traits: Traits; ratio?: number; className?: string }) {
  return (
    <svg viewBox={`0 0 ${ratio * 100} 100`} className={className} role="img" aria-label="Votre signature enregistrée">
      {traits.map((t, i) => (
        <polyline
          key={i}
          points={t.map(([x, y]) => `${(x * ratio * 100).toFixed(1)},${(y * 100).toFixed(1)}`).join(" ")}
          fill="none"
          stroke="#14244d"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

export default function SignatureElectronique({ onChange }: { onChange?: (message: string) => void }) {
  const [revision, setRevision] = useState(0);
  const { signature, chargement } = useSignature(revision);
  const [edition, setEdition] = useState(false);
  const [nbTraits, setNbTraits] = useState(0);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const toile = useRef<HTMLCanvasElement>(null);
  const traits = useRef<Traits>([]);
  const enTrace = useRef(false);

  /** Redessine tous les traits à la résolution réelle de l'écran. */
  function dessiner() {
    const c = toile.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.lineWidth = Math.max(2, c.width / 260);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#14244d";
    for (const t of traits.current) {
      ctx.beginPath();
      t.forEach(([x, y], i) => (i ? ctx.lineTo(x * c.width, y * c.height) : ctx.moveTo(x * c.width, y * c.height)));
      if (t.length === 1) ctx.lineTo(t[0][0] * c.width + 1, t[0][1] * c.height);
      ctx.stroke();
    }
  }

  // Résolution du canevas calée sur sa taille affichée (et la densité de
  // l'écran), sinon le trait est flou sur un téléphone.
  useEffect(() => {
    const c = toile.current;
    if (!edition || !c) return;
    const obs = new ResizeObserver(() => {
      const r = c.getBoundingClientRect();
      const d = window.devicePixelRatio || 1;
      c.width = Math.round(r.width * d);
      c.height = Math.round(r.height * d);
      dessiner();
    });
    obs.observe(c);
    return () => obs.disconnect();
  }, [edition]);

  const point = (e: PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [
      Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    ];
  };

  function debut(e: PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    enTrace.current = true;
    traits.current.push([point(e)]);
    dessiner();
  }
  function suite(e: PointerEvent<HTMLCanvasElement>) {
    if (!enTrace.current) return;
    const t = traits.current[traits.current.length - 1];
    const p = point(e);
    const [px, py] = t[t.length - 1];
    // Un point tous les ~0,4 % de la largeur : assez pour une courbe lisse,
    // pas de quoi alourdir la base de milliers de points identiques.
    if (Math.hypot((p[0] - px) * RATIO, p[1] - py) > 0.012) {
      t.push(p);
      dessiner();
    }
  }
  function fin() {
    if (!enTrace.current) return;
    enTrace.current = false;
    setNbTraits(traits.current.length);
  }

  function effacer() {
    traits.current = [];
    setNbTraits(0);
    dessiner();
  }

  async function enregistrer() {
    if (!traits.current.length || enCours) return;
    setEnCours(true);
    setErreur(null);
    const res = await enregistrerSignature(traits.current, RATIO);
    setEnCours(false);
    if (res.erreur) {
      setErreur(res.erreur);
      return;
    }
    setEdition(false);
    setRevision((r) => r + 1);
    onChange?.("Signature enregistrée — elle sera apposée sur vos prochains documents");
  }

  async function retirer() {
    setEnCours(true);
    const res = await supprimerSignature();
    setEnCours(false);
    if (res.erreur) {
      setErreur(res.erreur);
      return;
    }
    setRevision((r) => r + 1);
    onChange?.("Signature retirée — vos documents porteront la mention « non enregistrée »");
  }

  if (chargement) return <div className="h-[120px] animate-pulse rounded-xl bg-bg" aria-hidden />;

  return (
    <div className="grid gap-3">
      {edition ? (
        <>
          <div className="relative w-full max-w-[480px] rounded-xl border-2 border-dashed border-blue-line bg-white" style={{ aspectRatio: `${RATIO}` }}>
            <canvas
              ref={toile}
              aria-label="Zone de signature : tracez votre signature au doigt ou à la souris"
              onPointerDown={debut}
              onPointerMove={suite}
              onPointerUp={fin}
              onPointerCancel={fin}
              className="absolute inset-0 h-full w-full cursor-crosshair touch-none rounded-xl"
            />
            {nbTraits === 0 && (
              <span className="pointer-events-none absolute inset-0 grid place-items-center text-[12.5px] text-muted">
                Signez ici
              </span>
            )}
            <span aria-hidden className="pointer-events-none absolute bottom-[22%] left-[6%] right-[6%] border-b border-line" />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={enregistrer} disabled={!nbTraits || enCours} className={`${BTN} bg-teal text-white hover:bg-blue`}>
              {enCours ? "Enregistrement…" : "Enregistrer la signature"}
            </button>
            <button type="button" onClick={effacer} disabled={!nbTraits} className={`${BTN} border border-line bg-white text-ink hover:border-muted`}>
              Effacer
            </button>
            <button
              type="button"
              onClick={() => {
                effacer();
                setEdition(false);
              }}
              className={`${BTN} border border-line bg-white text-ink hover:border-muted`}
            >
              Annuler
            </button>
          </div>
        </>
      ) : signature ? (
        <>
          <div className="w-full max-w-[360px] rounded-xl border border-line bg-white p-2">
            <ApercuSignature traits={signature.traits} ratio={signature.ratio} className="h-auto w-full" />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                traits.current = [];
                setNbTraits(0);
                setEdition(true);
              }}
              className={`${BTN} border border-blue-line bg-white text-blue hover:bg-teal-soft`}
            >
              Refaire ma signature
            </button>
            <button type="button" onClick={retirer} disabled={enCours} className={`${BTN} border border-red-line bg-white text-red hover:bg-red-soft`}>
              Retirer
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[12.5px] text-muted">Aucune signature enregistrée : vos documents portent la mention « signature non enregistrée ».</p>
          <button type="button" onClick={() => setEdition(true)} className={`${BTN} bg-teal text-white hover:bg-blue`}>
            Créer ma signature
          </button>
        </div>
      )}
      {erreur && (
        <p role="alert" className="text-[12.5px] font-bold text-red">
          {erreur}
        </p>
      )}
      <p className="text-[11.5px] leading-relaxed text-muted">
        Signature électronique simple. Chaque document émis porte aussi un code et un QR de vérification : c’est ce qui
        permet à un pharmacien ou à un employeur de s’assurer qu’il vient bien de vous.
      </p>
    </div>
  );
}
