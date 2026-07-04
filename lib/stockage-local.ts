import { useSyncExternalStore } from "react";

/*
 * Petit magasin réactif au-dessus de localStorage, pour la phase « mocks ».
 * - `useMagasinLocal` lit la valeur via useSyncExternalStore : compatible
 *   SSR/hydratation, et chaque écriture re-rend automatiquement les écrans.
 * - Quand la base de données sera branchée, ces magasins seront remplacés
 *   par de vraies requêtes sans changer la forme des données.
 */

export interface MagasinLocal<T> {
  /** Instantané courant (mis en cache pour garder une référence stable). */
  lire: () => T;
  /** Instantané utilisé pendant le rendu serveur. */
  lireServeur: () => T;
  ecrire: (valeur: T) => void;
  sAbonner: (ecouteur: () => void) => () => void;
}

export function creerMagasinLocal<T>(
  cle: string,
  valeurServeur: T,
  interpreter: (json: unknown) => T
): MagasinLocal<T> {
  let cache: { brut: string | null; valeur: T } | undefined;
  const ecouteurs = new Set<() => void>();

  const lire = (): T => {
    if (typeof window === "undefined") return valeurServeur;
    const brut = window.localStorage.getItem(cle);
    if (!cache || cache.brut !== brut) {
      let json: unknown = null;
      if (brut !== null) {
        try {
          json = JSON.parse(brut);
        } catch {
          json = null;
        }
      }
      cache = { brut, valeur: interpreter(json) };
    }
    return cache.valeur;
  };

  return {
    lire,
    lireServeur: () => valeurServeur,
    ecrire(valeur: T) {
      window.localStorage.setItem(cle, JSON.stringify(valeur));
      cache = { brut: window.localStorage.getItem(cle), valeur };
      ecouteurs.forEach((ecouteur) => ecouteur());
    },
    sAbonner(ecouteur: () => void) {
      ecouteurs.add(ecouteur);
      return () => ecouteurs.delete(ecouteur);
    },
  };
}

/** Lecture réactive d'un magasin local (à utiliser dans les composants client). */
export function useMagasinLocal<T>(magasin: MagasinLocal<T>): T {
  return useSyncExternalStore(magasin.sAbonner, magasin.lire, magasin.lireServeur);
}
