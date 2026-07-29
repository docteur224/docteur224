/**
 * Formulaire de recherche de la page de résultats — permet d'affiner
 * spécialité / ville / nom sans repasser par l'accueil.
 *
 * Comme le bandeau d'accueil, c'est un <form action="/resultats"> en GET :
 * pas de JavaScript, la soumission construit l'URL elle-même. Les champs
 * sont pré-remplis avec la recherche en cours (defaultValue) pour que le
 * patient corrige une valeur au lieu de tout retaper.
 *
 * Les filtres actifs (assurance, établissement…) ne sont pas repris dans le
 * formulaire : une nouvelle recherche repart donc sans eux, ce qui évite
 * qu'un filtre oublié vide silencieusement les nouveaux résultats.
 */
export default function RechercheResultats({
  specialite,
  ville,
  q,
}: {
  specialite: string;
  ville: string;
  q: string;
}) {
  return (
    <form
      action="/resultats"
      className="mt-[14px] flex max-w-[780px] flex-col items-stretch gap-1 rounded-2xl border border-line bg-white p-2 shadow-[0_4px_14px_rgba(16,59,80,.06)] md:flex-row md:items-center"
    >
      <label className="flex flex-1 items-center gap-[10px] rounded-[11px] px-[14px] py-[9px] text-left">
        <span className="text-base text-teal" aria-hidden>
          🩺
        </span>
        <span className="block w-full">
          <b className="block text-[11px] font-bold text-ink">Spécialité</b>
          <input
            name="specialite"
            defaultValue={specialite}
            placeholder="Ex. Cardiologie"
            className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-muted"
          />
        </span>
      </label>
      <label className="flex flex-1 items-center gap-[10px] rounded-[11px] border-t border-line px-[14px] py-[9px] text-left md:border-l md:border-t-0">
        <span className="text-base text-teal" aria-hidden>
          📍
        </span>
        <span className="block w-full">
          <b className="block text-[11px] font-bold text-ink">Ville</b>
          <input
            name="ville"
            defaultValue={ville}
            placeholder="Ex. Kankan"
            className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-muted"
          />
        </span>
      </label>
      <label className="flex flex-1 items-center gap-[10px] rounded-[11px] border-t border-line px-[14px] py-[9px] text-left md:border-l md:border-t-0">
        <span className="text-base text-teal" aria-hidden>
          🔎
        </span>
        <span className="block w-full">
          <b className="block text-[11px] font-bold text-ink">Médecin ou établissement</b>
          <input
            name="q"
            defaultValue={q}
            placeholder="Ex. Dr Barry, Clinique A. Paré"
            className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-muted"
          />
        </span>
      </label>
      <button
        type="submit"
        className="flex-none rounded-[11px] bg-teal px-[22px] py-[11px] text-[13.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
      >
        🔎 Rechercher
      </button>
    </form>
  );
}

/** Variante mobile — reprend les classes .searchbox de la maquette mobile. */
export function RechercheResultatsMobile({
  specialite,
  ville,
  q,
}: {
  specialite: string;
  ville: string;
  q: string;
}) {
  return (
    <form action="/resultats" className="searchbox searchbox-compact">
      <label className="field">
        <span className="ic" aria-hidden>
          🩺
        </span>
        <input
          name="specialite"
          defaultValue={specialite}
          placeholder="Spécialité (ex. Pédiatrie)"
        />
      </label>
      <label className="field">
        <span className="ic" aria-hidden>
          📍
        </span>
        <input name="ville" defaultValue={ville} placeholder="Ville (ex. Conakry)" />
      </label>
      <label className="field">
        <span className="ic" aria-hidden>
          🔎
        </span>
        <input name="q" defaultValue={q} placeholder="Médecin ou établissement" />
      </label>
      <button type="submit" className="btn block">
        🔎 Rechercher
      </button>
    </form>
  );
}
