import { creerMagasinLocal, useMagasinLocal } from "@/lib/stockage-local";

/*
 * Préférences locales du patient (notifications, sécurité) — mock des futurs
 * réglages en base.
 */

export interface ParametresLocaux {
  rappelsSms: boolean;
  rappelsEmail: boolean;
  offres: boolean;
  deuxFacteurs: boolean;
}

export const PARAMETRES_DEFAUT: ParametresLocaux = {
  rappelsSms: true,
  rappelsEmail: true,
  offres: false,
  deuxFacteurs: false,
};

const magasinParametres = creerMagasinLocal<ParametresLocaux>(
  "docteur224.parametres",
  PARAMETRES_DEFAUT,
  (json) =>
    json && typeof json === "object"
      ? { ...PARAMETRES_DEFAUT, ...(json as Partial<ParametresLocaux>) }
      : PARAMETRES_DEFAUT
);

/** Lecture réactive des préférences. */
export function useParametresLocaux(): ParametresLocaux {
  return useMagasinLocal(magasinParametres);
}

export function enregistrerParametresLocaux(parametres: ParametresLocaux): void {
  magasinParametres.ecrire(parametres);
}
