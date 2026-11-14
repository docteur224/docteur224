/// <reference lib="webworker" />
/*
 * Service worker « offline-first », pensé pour les connexions lentes ou
 * instables de Guinée. Stratégies de cache DIFFÉRENCIÉES selon la nature de la
 * ressource — c'est le cœur de la fiabilité réseau de la PWA.
 *
 * Règle de sécurité absolue : AUCUNE donnée sensible (authentification,
 * rendez-vous, dossiers patients) ne doit jamais entrer dans le cache. Ces
 * routes sont servies en `NetworkOnly`, sans exception. Les en-têtes
 * `Cache-Control: no-store` posés par next.config les protègent déjà côté
 * navigateur ; ici on ferme la porte aussi côté service worker.
 *
 * L'ordre des règles compte : Serwist retient la PREMIÈRE qui correspond. Le
 * sensible passe donc en tête.
 */
import {
  CacheableResponsePlugin,
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  type PrecacheEntry,
  Serwist,
  type SerwistGlobalConfig,
  StaleWhileRevalidate,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Manifeste de précache injecté au build par @serwist/next (JS/CSS de
    // l'app shell). Absent en développement.
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

// En contexte service worker, le global `self` est un ServiceWorkerGlobalScope.
// On évite de REDÉCLARER la variable globale `self` (ce qui entrerait en
// conflit avec la lib DOM du projet) : on la relit via un cast local typé.
const sw = self as unknown as ServiceWorkerGlobalScope;

const JOUR = 24 * 60 * 60;

/* Routes qui ne doivent JAMAIS être mises en cache : tout ce qui touche à
   l'authentification, aux rendez-vous et aux dossiers médicaux. */
const CHEMINS_SENSIBLES =
  /^\/(connexion|inscription|mot-de-passe-oublie|mes-rendez-vous|espace-[^/]+|patient|reservation|confirmation|desinscription|verifier|api)(\/|$)/;

/* Pages de contenu public : on les tente sur le réseau, avec repli cache puis
   page hors-ligne si le réseau manque. */
const serwist = new Serwist({
  precacheEntries: [
    ...(sw.__SW_MANIFEST ?? []),
    // La page hors-ligne doit rester disponible même sans réseau : on la
    // précharge explicitement pour qu'elle serve de repli de navigation.
    { url: "/offline", revision: null },
  ],
  // On ne prend JAMAIS la main sans l'accord de l'utilisateur : le passage à
  // une nouvelle version se fait via le toast (skipWaiting sur demande).
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // 1) Sensible (même origine) → réseau seul, jamais de cache.
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && CHEMINS_SENSIBLES.test(url.pathname),
      handler: new NetworkOnly(),
    },
    // 2) Supabase / toute origine d'authentification → réseau seul.
    {
      matcher: ({ url }) => url.hostname.endsWith(".supabase.co") || url.hostname.endsWith(".supabase.in"),
      handler: new NetworkOnly(),
    },
    // 3) Assets de build immuables (JS/CSS/polices hachés) → cache d'abord.
    {
      matcher: ({ url, sameOrigin, request }) =>
        sameOrigin &&
        (url.pathname.startsWith("/_next/static/") ||
          request.destination === "style" ||
          request.destination === "script" ||
          request.destination === "font"),
      handler: new CacheFirst({
        cacheName: "d224-statique",
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 365 * JOUR }),
        ],
      }),
    },
    // 4) Images (optimiseur next/image + Cloudinary) → sert le cache et
    //    rafraîchit en arrière-plan. 60 entrées, 30 jours.
    {
      matcher: ({ url, request }) =>
        request.destination === "image" ||
        url.pathname.startsWith("/_next/image") ||
        url.hostname === "res.cloudinary.com",
      handler: new StaleWhileRevalidate({
        cacheName: "d224-images",
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * JOUR }),
        ],
      }),
    },
    // 5) Navigations de contenu public → réseau d'abord (timeout 3 s), repli
    //    cache, puis page hors-ligne (voir `fallbacks`).
    {
      matcher: ({ request, sameOrigin }) => sameOrigin && request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: "d224-pages",
        networkTimeoutSeconds: 3,
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 7 * JOUR }),
        ],
      }),
    },
    // 6) Reste de même origine (données publiques, RSC) → réseau d'abord, court.
    {
      matcher: ({ sameOrigin }) => sameOrigin,
      handler: new NetworkFirst({
        cacheName: "d224-divers",
        networkTimeoutSeconds: 3,
        plugins: [new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: JOUR })],
      }),
    },
  ],
  // Repli de navigation : si une page publique est injoignable hors-ligne, on
  // sert la page de marque /offline (préchargée ci-dessus).
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();
