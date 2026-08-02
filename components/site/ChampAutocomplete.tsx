"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Champs de recherche saisissables avec liste déroulante de suggestions,
 * partagés par le bandeau de l'accueil et celui de la page de résultats :
 * les deux formulaires doivent se comporter à l'identique (mêmes
 * référentiels, même filtrage au fil de la frappe, même navigation clavier).
 */

/** Minuscules sans accents : « pediatrie » doit trouver « Pédiatrie ». */
function normaliser(texte: string) {
  return texte
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Filtre commun : sous-chaîne insensible à la casse et aux accents, liste
 * plafonnée. Les doublons sont retirés — deux établissements peuvent porter
 * le même nom, et proposer deux fois la même ligne n'aide personne (en plus
 * de créer des clés React identiques).
 */
function filtrerSuggestions(
  valeur: string,
  suggestions: string[],
  aLaFrappe: boolean,
  maximum: number
) {
  const saisie = normaliser(valeur.trim());
  if (aLaFrappe && !saisie) return [];
  const liste = saisie
    ? suggestions.filter((s) => normaliser(s).includes(saisie))
    : suggestions;
  return [...new Set(liste)].slice(0, maximum);
}

/** Referme la liste au clic hors du champ (sinon elle flotte sur la page). */
function useFermetureAuClicExterieur(
  conteneur: React.RefObject<HTMLDivElement | null>,
  fermer: () => void
) {
  useEffect(() => {
    function auClic(e: MouseEvent) {
      if (!conteneur.current?.contains(e.target as Node)) fermer();
    }
    document.addEventListener("mousedown", auClic);
    return () => document.removeEventListener("mousedown", auClic);
    // `fermer` est un setter stable, le conteneur une ref : effet monté une fois.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Champ texte web avec liste de suggestions filtrées au fil de la frappe. */
export default function ChampAutocomplete({
  nom,
  libelle,
  icone,
  placeholder,
  valeurInitiale,
  suggestions,
  /** true : n'affiche les suggestions qu'à partir d'un caractère saisi. */
  aLaFrappe = false,
  /** "hero" : bandeau plus haut de l'accueil ; "compact" : barre des résultats. */
  taille = "compact",
  className = "",
}: {
  nom: string;
  libelle: string;
  icone: string;
  placeholder: string;
  valeurInitiale: string;
  suggestions: string[];
  aLaFrappe?: boolean;
  taille?: "compact" | "hero";
  className?: string;
}) {
  const [valeur, setValeur] = useState(valeurInitiale);
  const [ouvert, setOuvert] = useState(false);
  const [survole, setSurvole] = useState(-1);
  const conteneur = useRef<HTMLDivElement>(null);

  useFermetureAuClicExterieur(conteneur, () => setOuvert(false));

  const filtrees = useMemo(
    () => filtrerSuggestions(valeur, suggestions, aLaFrappe, 8),
    [valeur, suggestions, aLaFrappe]
  );

  function choisir(s: string) {
    setValeur(s);
    setOuvert(false);
    setSurvole(-1);
  }

  const hero = taille === "hero";

  return (
    <div ref={conteneur} className={`relative flex-1 ${className}`}>
      <label
        className={`flex items-center gap-[10px] rounded-[11px] px-[14px] text-left ${
          hero ? "py-3" : "py-[9px]"
        }`}
      >
        <span className="text-base text-teal" aria-hidden>
          {icone}
        </span>
        <span className="block w-full">
          <b className={`block font-bold text-ink ${hero ? "text-xs" : "text-[11px]"}`}>
            {libelle}
          </b>
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

/** Champ mobile (.field) avec la même autocomplétion. */
export function ChampMobile({
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

  useFermetureAuClicExterieur(conteneur, () => setOuvert(false));

  const filtrees = useMemo(
    () => filtrerSuggestions(valeur, suggestions, aLaFrappe, 6),
    [valeur, suggestions, aLaFrappe]
  );

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
