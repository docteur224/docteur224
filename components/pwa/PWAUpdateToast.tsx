"use client";

/*
 * Toast discret « Nouvelle version disponible ». Apparition ET disparition par
 * transform + opacity (GPU, 60 fps), pilotées par la prop `visible` via une
 * transition CSS — aucun state interne, donc aucun rendu en cascade. Position
 * fixe → zéro décalage de mise en page (CLS = 0). Jamais de rechargement
 * silencieux : l'utilisateur garde la main.
 */
import type { TextesPwa } from "@/lib/pwa/i18n";

export default function PWAUpdateToast({
  visible,
  dir,
  t,
  onRefresh,
}: {
  visible: boolean;
  dir: "ltr" | "rtl";
  t: TextesPwa;
  onRefresh: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-hidden={!visible}
      inert={!visible}
      dir={dir}
      className="pwa-fixed-bottom fixed z-[70] mx-auto flex w-[min(420px,calc(100%-28px))] items-center gap-3 rounded-2xl px-4 py-3 shadow-[0_16px_40px_rgba(16,59,80,0.28)] transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform motion-reduce:transition-none"
      style={{
        insetInline: 0,
        bottom: "max(env(safe-area-inset-bottom), 16px)",
        transform: visible ? "translateY(0)" : "translateY(140%)",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        background: "color-mix(in srgb, var(--card) 86%, transparent)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid var(--line)",
        color: "var(--ink)",
      }}
    >
      <span
        aria-hidden="true"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
        style={{ background: "var(--teal-soft)", color: "var(--teal)" }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 2v6h-6" />
          <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
          <path d="M3 22v-6h6" />
          <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        </svg>
      </span>
      <p className="min-w-0 flex-1 text-[13px] font-semibold text-start">{t.update_available}</p>
      <button
        type="button"
        onClick={onRefresh}
        className="shrink-0 rounded-xl px-3.5 py-2 text-[13px] font-bold text-white transition-transform active:scale-95"
        style={{ background: "var(--blue)" }}
      >
        {t.refresh}
      </button>
    </div>
  );
}
