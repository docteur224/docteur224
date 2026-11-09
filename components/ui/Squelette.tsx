"use client";

import type { CSSProperties } from "react";

/*
 * Primitives de SQUELETTE DE CHARGEMENT — formes grises animées affichées
 * pendant que les données arrivent, aux dimensions du contenu réel.
 *
 * Elles ne réinventent rien : elles s'appuient sur la classe `.ui-skeleton`
 * déjà présente dans globals.css, qui gère le dégradé (shimmer), le mode
 * clair/sombre et le mouvement réduit en un seul endroit. Ces composants ne
 * font qu'assembler des blocs aux bonnes tailles pour chaque écran.
 *
 * Règle d'emploi : un squelette ne s'affiche QUE pendant un vrai chargement
 * (flag `chargement` des hooks de données). Dès que les données sont là —
 * même vides — on montre le contenu réel ou l'état « aucune donnée », jamais
 * le squelette. En cas d'échec, voir `EtatErreur` : ne jamais laisser un
 * squelette tourner indéfiniment.
 */

/** Un bloc gris animé aux dimensions d'un contenu à venir. */
export function Squelette({
  className = "",
  style,
  rond = false,
}: {
  className?: string;
  style?: CSSProperties;
  /** Cercle (avatar, pastille) plutôt que coin arrondi. */
  rond?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={`ui-skeleton block ${className}`}
      style={rond ? { borderRadius: 9999, ...style } : style}
    />
  );
}

/**
 * Plusieurs lignes de texte simulées. La dernière est plus courte, comme la
 * fin d'un vrai paragraphe, pour éviter l'effet « pavé gris ».
 */
export function LignesSquelette({
  lignes = 3,
  className = "",
  hauteur = 12,
}: {
  lignes?: number;
  className?: string;
  hauteur?: number;
}) {
  return (
    <span className={`block ${className}`} aria-hidden>
      {Array.from({ length: lignes }, (_, i) => (
        <Squelette
          key={i}
          className={i > 0 ? "mt-2" : ""}
          style={{ height: hauteur, width: i === lignes - 1 ? "58%" : "100%" }}
        />
      ))}
    </span>
  );
}

/**
 * État d'ÉCHEC de chargement : message clair et, si une action de rechargement
 * est fournie, un bouton « Réessayer ». À ne jamais confondre avec « aucune
 * donnée » (succès, liste vide) : ici la requête a échoué.
 */
export function EtatErreur({
  message = "Le chargement a échoué. Vérifiez votre connexion.",
  onReessayer,
  className = "",
}: {
  message?: string;
  onReessayer?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`rounded-2xl border border-line bg-white p-6 text-center ${className}`}
    >
      <p className="text-[13.5px] leading-relaxed text-muted">{message}</p>
      {onReessayer && (
        <button
          type="button"
          onClick={onReessayer}
          className="ui-btn mt-3 inline-block rounded-[9px] bg-teal px-4 py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-teal-hover"
        >
          Réessayer
        </button>
      )}
    </div>
  );
}

/**
 * Enveloppe une région dont le contenu dépend des données : pose `aria-busy`
 * pendant le chargement pour les lecteurs d'écran, sans changer la mise en
 * page. À utiliser autour d'un bloc qui bascule squelette → contenu.
 */
export function RegionChargement({
  chargement,
  children,
  className = "",
}: {
  chargement: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div aria-busy={chargement || undefined} className={className}>
      {children}
    </div>
  );
}
