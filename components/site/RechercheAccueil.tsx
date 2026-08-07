"use client";

import ChampAutocomplete, { ChampMobile } from "@/components/site/ChampAutocomplete";

/**
 * Bandeau de recherche du hero de l'accueil (spec C.1.1) — trois filtres
 * spécialité / ville / nom, en <form action="/resultats"> GET pour rester
 * utilisable sans JavaScript.
 *
 * Mêmes champs à liste déroulante que la barre de la page de résultats
 * (ChampAutocomplete) : le patient choisit une spécialité ou une ville du
 * référentiel plutôt que de la saisir de mémoire, ce qui évite les
 * recherches vides dues à une faute de frappe ou à un libellé approximatif.
 */
export default function RechercheAccueil({
  specialites,
  villes,
  nomsMedecins,
}: {
  specialites: string[];
  villes: string[];
  nomsMedecins: string[];
}) {
  /* 900 px plutôt que 780 : les trois champs et le bouton respirent —
     « Médecin ou établissement » repliait son libellé sur deux lignes — sans
     déborder la colonne de contenu de la page, calée à 1020 px. */
  return (
    <form
      action="/resultats"
      className="relative mx-auto mt-7 flex max-w-[900px] flex-col items-stretch gap-1 rounded-2xl bg-white p-2 text-ink shadow-[0_18px_40px_rgba(0,0,0,.22)] md:flex-row md:items-center"
    >
      <ChampAutocomplete
        nom="specialite"
        libelle="Spécialité"
        icone="🩺"
        placeholder="Ex. Cardiologie"
        valeurInitiale=""
        suggestions={specialites}
        taille="hero"
      />
      <ChampAutocomplete
        nom="ville"
        libelle="Ville"
        icone="📍"
        placeholder="Ex. Conakry"
        valeurInitiale=""
        suggestions={villes}
        taille="hero"
        className="border-t border-line md:border-l md:border-t-0"
      />
      <ChampAutocomplete
        nom="q"
        libelle="Médecin ou établissement"
        icone="🔎"
        placeholder="Ex. Dr Barry, Clinique A. Paré"
        valeurInitiale=""
        suggestions={nomsMedecins}
        aLaFrappe
        taille="hero"
        className="border-t border-line md:border-l md:border-t-0"
      />
      <button
        type="submit"
        className="flex-none rounded-[11px] bg-teal px-[26px] py-[15px] text-[15px] font-bold text-white transition-colors hover:bg-[#2790bc]"
      >
        🔎 Rechercher
      </button>
    </form>
  );
}

/** Variante mobile du hero — classes .searchbox de la maquette mobile. */
export function RechercheAccueilMobile({
  specialites,
  villes,
  nomsMedecins,
}: {
  specialites: string[];
  villes: string[];
  nomsMedecins: string[];
}) {
  return (
    <form action="/resultats" className="searchbox">
      <ChampMobile
        nom="specialite"
        icone="🩺"
        placeholder="Spécialité (ex. Pédiatrie)"
        valeurInitiale=""
        suggestions={specialites}
      />
      <ChampMobile
        nom="ville"
        icone="📍"
        placeholder="Ville (ex. Conakry)"
        valeurInitiale=""
        suggestions={villes}
      />
      <ChampMobile
        nom="q"
        icone="🔎"
        placeholder="Médecin ou établissement"
        valeurInitiale=""
        suggestions={nomsMedecins}
        aLaFrappe
      />
      <button type="submit" className="btn block">
        🔎 Rechercher
      </button>
    </form>
  );
}
