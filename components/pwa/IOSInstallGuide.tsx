"use client";

/*
 * Guide d'installation iOS/Safari — qui n'expose pas `beforeinstallprompt`.
 * Même direction visuelle premium que la bannière Android : verre dépoli,
 * logo, illustration SVG légère des boutons Partager (⬆) et Ajouter (＋).
 * Apparition/disparition pilotées par la prop `visible` (transform + opacity).
 */
import { useEffect, useRef } from "react";
import type { TextesPwa } from "@/lib/pwa/i18n";

export default function IOSInstallGuide({
  visible,
  dir,
  t,
  onClose,
}: {
  visible: boolean;
  dir: "ltr" | "rtl";
  t: TextesPwa;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible) return;
    const conteneur = ref.current;
    if (!conteneur) return;
    conteneur.querySelector<HTMLButtonElement>("[data-focus-initial]")?.focus();

    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
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
  }, [visible, onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-label={t.ios_guide_title}
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
            {t.ios_guide_title}
          </p>
          <p className="mt-0.5 text-[13px] leading-snug text-start" style={{ color: "var(--muted)" }}>
            {t.ios_guide}
          </p>
        </div>
        <button
          type="button"
          data-focus-initial
          onClick={onClose}
          aria-label={t.dismiss}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full transition-transform active:scale-90"
          style={{ background: "var(--line)", color: "var(--ink)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      {/* Repères visuels : bouton Partager puis Sur l'écran d'accueil. */}
      <div className="mt-3.5 flex items-center justify-center gap-3 rounded-2xl p-3" style={{ background: "var(--teal-soft)" }}>
        <span className="flex items-center gap-2 text-[12px] font-semibold" style={{ color: "var(--blue-encre)" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 16V4" />
            <path d="M8 8l4-4 4 4" />
            <path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
          </svg>
          {t.ios_share}
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="rtl:-scale-x-100">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
        <span className="flex items-center gap-2 text-[12px] font-semibold" style={{ color: "var(--blue-encre)" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4" y="4" width="16" height="16" rx="4" />
            <path d="M12 8v8M8 12h8" />
          </svg>
          {t.ios_add}
        </span>
      </div>
    </div>
  );
}
