"use client";

import { createContext, useContext } from "react";
import type { RoleInscription } from "@/lib/inscription-pro";

/** Infos du parcours fournies par le layout des étapes à chaque page. */
export interface InfosParcours {
  role: RoleInscription;
  /** Étape mémorisée en base (null = parcours terminé). */
  etape: string | null;
  etabId: string | null;
  recharger: () => void;
}

const Contexte = createContext<InfosParcours | null>(null);

export const FournisseurInscription = Contexte.Provider;

export function useInscription(): InfosParcours {
  const valeur = useContext(Contexte);
  if (!valeur) throw new Error("useInscription doit être appelé sous le layout des étapes.");
  return valeur;
}
