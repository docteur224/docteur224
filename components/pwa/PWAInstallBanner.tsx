"use client";

/*
 * Bannière d'installation personnalisée (Android/Chromium). Ancrée en bas,
 * verre dépoli léger, logo de marque. Apparition ET disparition slide + fade
 * (transform + opacity, GPU) pilotées par la prop `visible` — pas de state
 * interne. Position fixe → aucun décalage de mise en page (CLS = 0).
 *
 * Accessibilité : role="dialog", `inert` quand masquée (hors tabulation et
 * hors lecteur d'écran), focus initial + focus piégé, fermeture par Échap.
 */
import { useEffect, useRef } from "react";
import type { TextesPwa } from "@/lib/pwa/i18n";

export default function PWAInstallBanner({
  visible,
  dir,
  t,
  onInstall,
  onLater,
}: {
  visible: boolean;
  dir: "ltr" | "rtl";
  t: TextesPwa;
  onInstall: () => void;
  onLater: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Focus initial + piège à focus + Échap — seulement quand la bannière est
  // affichée.
  useEffect(() => {
    if (!visible) return;
    const conteneur = ref.current;
    if (!conteneur) return;

    conteneur.querySelector<HTMLButtonElement>("[data-focus-initial]")?.focus();

    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onLater();
        return;
      }
      if (e.key !== "Tab") return;
      const cibles = conteneur.querySelectorAll<HTMLElement>(
        'button, [href], input, [tabindex]:not([tabindex="-1"])'
      );
      if (cibles.length === 0) return;
      const debut = cibles[0];
      const fin = cibles[cibles.length - 1];
      if (e.shiftKey && document.activeElement === debut) {
        e.preventDefault();
        fin.focus();
      } else if (!e.shiftKey && document.activeElement === fin) {
        e.preventDefault();
        debut.focus();
      }
    };
    document.addEventListener("keydown", surTouche);
    return () => document.removeEventListener("keydown", surTouche);
  }, [visible, onLater]);

  const installer = () => {
    // Retour haptique léger si le navigateur le permet.
    try {
      navigator.vibrate?.(12);
    } catch {
      /* non supporté : sans effet */
    }
    onInstall();
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-label={t.install_title}
      aria-hidden={!visible}
      inert={!visible}
      dir={dir}
      className="pwa-fixed-bottom fixed z-[70] mx-auto w-[min(440px,calc(100%-24px))] rounded-3xl p-4 shadow-[0_20px_50px_rgba(16,59,80,0.3)] transition-[transform,opacity] duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform motion-reduce:transition-none"
      style={{
        insetInline: 0,
        bottom: "max(env(safe-area-inset-bottom), 16px)",
        transform: visible ? "translateY(0)" : "translateY(140%)",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        background: "color-mix(in srgb, var(--card) 88%, transparent)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        border: "1px solid var(--line)",
        color: "var(--ink)",
      }}
    >
      <div className="flex items-start gap-3.5">
        <span
          className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl"
          style={{ background: "#ffffff", boxShadow: "0 4px 14px rgba(16,59,80,0.14)" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- petite icône statique */}
          <img src="/icons/icon-192.png" alt="" width={44} height={44} className="rounded-xl" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-extrabold text-start" style={{ color: "var(--blue-encre)" }}>
            {t.install_title}
          </p>
          <p className="mt-0.5 text-[13px] leading-snug text-start" style={{ color: "var(--muted)" }}>
            {t.install_body}
          </p>
        </div>
      </div>

      <div className="mt-3.5 flex items-center gap-2.5">
        <button
          type="button"
          data-focus-initial
          onClick={installer}
          className="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-transform active:scale-[0.97]"
          style={{ background: "var(--blue)" }}
        >
          {t.install_cta}
        </button>
        <button
          type="button"
          onClick={onLater}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold transition-transform active:scale-[0.97]"
          style={{ background: "var(--teal-soft)", color: "var(--blue-encre)" }}
        >
          {t.later}
        </button>
      </div>
    </div>
  );
}
