"use client";

/*
 * Page de repli hors-ligne, servie par le service worker quand une page
 * publique est injoignable. De marque, centrée, compatible mode clair/sombre
 * (tokens --bg/--ink/--card hérités) et RTL (langue détectée côté client).
 *
 * Aucune dépendance réseau : le logo vient de /icons/icon-192.png, précaché.
 */
import { directionDe, textes } from "@/lib/pwa/i18n";
import { usePwaLangue } from "@/hooks/usePwaLangue";

export default function PageHorsLigne() {
  const langue = usePwaLangue();
  const t = textes(langue);
  const dir = directionDe(langue);

  return (
    <main
      dir={dir}
      className="flex min-h-[100dvh] flex-col items-center justify-center gap-5 px-6 text-center"
      style={{
        background: "var(--bg)",
        color: "var(--ink)",
        paddingTop: "max(env(safe-area-inset-top), 24px)",
        paddingBottom: "max(env(safe-area-inset-bottom), 24px)",
      }}
    >
      <div
        className="grid h-24 w-24 place-items-center rounded-3xl"
        style={{ background: "#ffffff", boxShadow: "var(--shadow)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- hors-ligne :
            l'optimiseur next/image est injoignable, on sert l'asset précaché. */}
        <img src="/icons/icon-192.png" alt="Docteur 224" width={72} height={72} className="rounded-2xl" />
      </div>

      <div
        className="grid h-12 w-12 place-items-center rounded-full"
        style={{ background: "var(--teal-soft)", color: "var(--teal)" }}
        aria-hidden="true"
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 1l22 22" />
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
          <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
      </div>

      <h1 className="text-xl font-extrabold" style={{ color: "var(--blue-encre)" }}>
        {t.offline_title}
      </h1>
      <p className="max-w-xs text-sm" style={{ color: "var(--muted)" }}>
        {t.offline_body}
      </p>

      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-1 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition-transform active:scale-95"
        style={{ background: "var(--blue)" }}
      >
        {t.offline_retry}
      </button>
    </main>
  );
}
