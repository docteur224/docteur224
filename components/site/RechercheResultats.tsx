"use client";

import ChampAutocomplete, { ChampMobile } from "@/components/site/ChampAutocomplete";

/**
 * Formulaire de recherche de la page de résultats — permet d'affiner
 * spécialité / ville / nom sans repasser par l'accueil.
 *
 * C'est un <form action="/resultats"> en GET : la soumission construit
 * l'URL elle-même, et le formulaire reste utilisable si le JavaScript
 * échoue. Les champs sont pré-remplis avec la recherche en cours pour que
 * le patient corrige une valeur au lieu de tout retaper.
 *
 * Spécialité et ville sont des champs saisissables avec liste de
 * suggestions issues du référentiel ; « Médecin ou établissement » propose
 * les noms réels au fil de la frappe (voir ChampAutocomplete, partagé avec
 * le bandeau de l'accueil).
 *
 * Les filtres actifs (assurance, disponibilité…) ne sont pas repris ici :
 * une nouvelle recherche repart sans eux, pour qu'un filtre oublié ne vide
 * pas silencieusement les nouveaux résultats.
 */
export default function RechercheResultats({
  specialite,
  ville,
  q,
  specialites,
  villes,
  nomsMedecins,
}: {
  specialite: string;
  ville: string;
  q: string;
  specialites: string[];
  villes: string[];
  nomsMedecins: string[];
}) {
  return (
    <form
      action="/resultats"
      className="mx-auto mt-[14px] flex w-full max-w-[860px] flex-col items-stretch gap-1 rounded-2xl border border-line bg-white p-2 shadow-[0_4px_14px_rgba(16,59,80,.06)] md:flex-row md:items-center"
    >
      <ChampAutocomplete
        nom="specialite"
        libelle="Spécialité"
        icone="🩺"
        placeholder="Toutes spécialités"
        valeurInitiale={specialite}
        suggestions={specialites}
      />
      <ChampAutocomplete
        nom="ville"
        libelle="Ville"
        icone="📍"
        placeholder="Toutes les villes"
        valeurInitiale={ville}
        suggestions={villes}
        className="border-t border-line md:border-l md:border-t-0"
      />
      <ChampAutocomplete
        nom="q"
        libelle="Médecin ou établissement"
        icone="🔎"
        placeholder="Ex. Dr Barry, Clinique A. Paré"
        valeurInitiale={q}
        suggestions={nomsMedecins}
        aLaFrappe
        className="border-t border-line md:border-l md:border-t-0"
      />
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
  specialites,
  villes,
  nomsMedecins,
}: {
  specialite: string;
  ville: string;
  q: string;
  specialites: string[];
  villes: string[];
  nomsMedecins: string[];
}) {
  return (
    <form action="/resultats" className="searchbox searchbox-compact">
      <ChampMobile
        nom="specialite"
        icone="🩺"
        placeholder="Spécialité (ex. Pédiatrie)"
        valeurInitiale={specialite}
        suggestions={specialites}
      />
      <ChampMobile
        nom="ville"
        icone="📍"
        placeholder="Ville (ex. Conakry)"
        valeurInitiale={ville}
        suggestions={villes}
      />
      <ChampMobile
        nom="q"
        icone="🔎"
        placeholder="Médecin ou établissement"
        valeurInitiale={q}
        suggestions={nomsMedecins}
        aLaFrappe
      />
      <button type="submit" className="btn block">
        🔎 Rechercher
      </button>
    </form>
  );
}
