"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
 * les noms réels au fil de la frappe.
 *
 * Les filtres actifs (assurance, disponibilité…) ne sont pas repris ici :
 * une nouvelle recherche repart sans eux, pour qu'un filtre oublié ne vide
 * pas silencieusement les nouveaux résultats.
 */

/** Champ texte avec liste de suggestions filtrées au fil de la frappe. */
function ChampAutocomplete({
  nom,
  libelle,
  icone,
  placeholder,
  valeurInitiale,
  suggestions,
  /** true : n'affiche les suggestions qu'à partir d'un caractère saisi. */
  aLaFrappe = false,
  className = "",
}: {
  nom: string;
  libelle: string;
  icone: string;
  placeholder: string;
  valeurInitiale: string;
  suggestions: string[];
  aLaFrappe?: boolean;
  className?: string;
}) {
  const [valeur, setValeur] = useState(valeurInitiale);
  const [ouvert, setOuvert] = useState(false);
  const [survole, setSurvole] = useState(-1);
  const conteneur = useRef<HTMLDivElement>(null);

  // Un clic hors du champ referme la liste (sinon elle resterait ouverte
  // par-dessus les résultats).
  useEffect(() => {
    function auClic(e: MouseEvent) {
      if (!conteneur.current?.contains(e.target as Node)) setOuvert(false);
    }
    document.addEventListener("mousedown", auClic);
    return () => document.removeEventListener("mousedown", auClic);
  }, []);

  const filtrees = useMemo(() => {
    const saisie = valeur.trim().toLowerCase();
    if (aLaFrappe && !saisie) return [];
    const liste = saisie
      ? suggestions.filter((s) => s.toLowerCase().includes(saisie))
      : suggestions;
    return liste.slice(0, 8);
  }, [valeur, suggestions, aLaFrappe]);

  function choisir(s: string) {
    setValeur(s);
    setOuvert(false);
    setSurvole(-1);
  }

  return (
    <div ref={conteneur} className={`relative flex-1 ${className}`}>
      <label className="flex items-center gap-[10px] rounded-[11px] px-[14px] py-[9px] text-left">
        <span className="text-base text-teal" aria-hidden>
          {icone}
        </span>
        <span className="block w-full">
          <b className="block text-[11px] font-bold text-ink">{libelle}</b>
          <input
            name={nom}
            value={valeur}
            autoComplete="off"
            placeholder={placeholder}
            onChange={(e) => {
              setValeur(e.target.value);
              setOuvert(true);
              setSurvole(-1);
            }}
            onFocus={() => setOuvert(true)}
            onKeyDown={(e) => {
              if (!ouvert || filtrees.length === 0) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSurvole((i) => (i + 1) % filtrees.length);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSurvole((i) => (i <= 0 ? filtrees.length - 1 : i - 1));
              } else if (e.key === "Enter" && survole >= 0) {
                // Choisir une suggestion ne doit pas soumettre le formulaire.
                e.preventDefault();
                choisir(filtrees[survole]);
              } else if (e.key === "Escape") {
                setOuvert(false);
              }
            }}
            className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-muted"
          />
        </span>
      </label>
      {ouvert && filtrees.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-[240px] overflow-auto rounded-xl border border-line bg-white py-1 shadow-[0_10px_26px_rgba(16,59,80,.14)]">
          {filtrees.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choisir(s)}
                onMouseEnter={() => setSurvole(i)}
                className={`block w-full px-[14px] py-2 text-left text-[13px] transition-colors ${
                  i === survole ? "bg-teal-soft text-blue" : "text-ink hover:bg-teal-soft"
                }`}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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

/** Champ mobile (.field) avec la même autocomplétion. */
function ChampMobile({
  nom,
  icone,
  placeholder,
  valeurInitiale,
  suggestions,
  aLaFrappe = false,
}: {
  nom: string;
  icone: string;
  placeholder: string;
  valeurInitiale: string;
  suggestions: string[];
  aLaFrappe?: boolean;
}) {
  const [valeur, setValeur] = useState(valeurInitiale);
  const [ouvert, setOuvert] = useState(false);
  const conteneur = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function auClic(e: MouseEvent) {
      if (!conteneur.current?.contains(e.target as Node)) setOuvert(false);
    }
    document.addEventListener("mousedown", auClic);
    return () => document.removeEventListener("mousedown", auClic);
  }, []);

  const filtrees = useMemo(() => {
    const saisie = valeur.trim().toLowerCase();
    if (aLaFrappe && !saisie) return [];
    const liste = saisie
      ? suggestions.filter((s) => s.toLowerCase().includes(saisie))
      : suggestions;
    return liste.slice(0, 6);
  }, [valeur, suggestions, aLaFrappe]);

  return (
    <div ref={conteneur} style={{ position: "relative" }}>
      <label className="field">
        <span className="ic" aria-hidden>
          {icone}
        </span>
        <input
          name={nom}
          value={valeur}
          autoComplete="off"
          placeholder={placeholder}
          onChange={(e) => {
            setValeur(e.target.value);
            setOuvert(true);
          }}
          onFocus={() => setOuvert(true)}
        />
      </label>
      {ouvert && filtrees.length > 0 && (
        <ul className="autolist">
          {filtrees.map((s) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setValeur(s);
                  setOuvert(false);
                }}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
