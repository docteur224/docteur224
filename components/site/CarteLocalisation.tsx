import { estCoordonnees } from "@/lib/geolocalisation";

/**
 * Bloc « Localisation » de la fiche médecin — reproduit la .mapwrap de la
 * maquette web : carte décorative SVG avec épingle animée, carte d'identité
 * de l'établissement et boutons itinéraire / appel.
 *
 * Quand le praticien a relevé sa position GPS (étape « Lieu d'exercice »
 * du parcours d'inscription), l'itinéraire vise ces coordonnées plutôt
 * qu'une recherche par nom : c'est précisément à cela que sert le relevé,
 * et une recherche textuelle tombe souvent sur le mauvais quartier.
 */
export default function CarteLocalisation({
  etablissementNom,
  quartier,
  ville,
  telephone,
  localisation = "",
}: {
  etablissementNom: string;
  quartier: string;
  ville: string;
  telephone: string;
  /** « lat, lon » relevé au GPS, ou lien Google Maps collé par le médecin. */
  localisation?: string;
}) {
  const coordonnees = estCoordonnees(localisation);
  const lienItineraire = coordonnees
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(localisation.trim())}`
    : localisation.startsWith("http")
      ? localisation
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          `${etablissementNom} ${quartier} ${ville}`
        )}`;
  return (
    <div className="mt-2 overflow-hidden rounded-2xl border border-line bg-white">
      <div className="relative h-[248px] bg-[#E6EDE9]">
        {/* Fond de carte décoratif (identique à la maquette) */}
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 800 250"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden
        >
          <rect width="800" height="250" fill="#E6EDE9" />
          <path
            d="M0,188 Q140,174 260,196 T520,198 T800,186 L800,250 L0,250 Z"
            fill="#CFE3EC"
          />
          <rect x="40" y="28" width="150" height="60" rx="8" fill="#DCEAD8" />
          <g fill="#DBE3E9">
            <rect x="520" y="30" width="120" height="52" rx="6" />
            <rect x="660" y="98" width="104" height="60" rx="6" />
            <rect x="70" y="120" width="130" height="52" rx="6" />
            <rect x="470" y="130" width="96" height="44" rx="6" />
            <rect x="250" y="34" width="90" height="40" rx="6" />
          </g>
          <g stroke="#D3DCE1" strokeWidth="20" fill="none" strokeLinecap="round">
            <path d="M-20,100 H820" />
            <path d="M400,-20 V270" />
            <path d="M-20,168 Q320,138 820,156" />
          </g>
          <g stroke="#fff" strokeWidth="12" fill="none" strokeLinecap="round">
            <path d="M-20,100 H820" />
            <path d="M400,-20 V270" />
            <path d="M-20,168 Q320,138 820,156" />
          </g>
          <path d="M-20,100 H820" stroke="#E7C66B" strokeWidth="2.5" strokeDasharray="12 12" />
        </svg>

        {/* Épingle animée */}
        <div className="absolute left-1/2 top-[42%] z-[3] -translate-x-1/2 -translate-y-full">
          <span className="absolute -bottom-[3px] left-1/2 -z-10 h-[22px] w-[22px] -translate-x-1/2 animate-ping rounded-full bg-[rgba(46,156,202,.4)]" />
          <svg
            viewBox="0 0 24 32"
            className="h-12 w-[38px] drop-shadow-[0_5px_7px_rgba(16,59,80,.35)]"
            aria-hidden
          >
            <path
              d="M12 0C5.4 0 0 5.3 0 11.9 0 20.6 12 32 12 32s12-11.4 12-20.1C24 5.3 18.6 0 12 0z"
              fill="#15506B"
            />
            <circle cx="12" cy="11.5" r="4.6" fill="#fff" />
          </svg>
        </div>

        {/* Carte d'identité de l'établissement */}
        <div className="absolute bottom-[14px] left-[14px] z-[4] flex max-w-[300px] items-center gap-3 rounded-[13px] bg-white px-[15px] py-3 shadow-[0_8px_20px_rgba(16,59,80,.16)]">
          <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[10px] bg-teal-soft text-base">
            🏥
          </span>
          <div>
            <b className="block text-[13.5px] font-extrabold">{etablissementNom}</b>
            <small className="text-xs text-muted">
              {quartier} · {ville}
            </small>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-[11px] border-t border-line px-4 py-[14px]">
        <a
          href={lienItineraire}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center justify-center gap-2 rounded-[11px] bg-teal px-[18px] py-[11px] text-[13.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
        >
          🧭 Voir l’itinéraire
        </a>
        <a
          href={`tel:${telephone.replace(/\s/g, "")}`}
          className="inline-flex items-center justify-center gap-2 rounded-[11px] border-[1.5px] border-line bg-white px-[18px] py-[11px] text-[13.5px] font-bold text-blue transition-colors hover:bg-bg"
        >
          📞 Appeler le secrétariat
        </a>
        <span className="ml-auto flex items-center text-xs text-muted">
          {coordonnees ? "📍 Position GPS relevée par le praticien" : "🚗 à ~12 min du centre-ville"}
        </span>
      </div>
    </div>
  );
}
