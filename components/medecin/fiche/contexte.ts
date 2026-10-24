import type { ComponentType } from "react";
import type { NomIcone } from "@/components/site/Icone";
import type { ContextePro, DossierPatient } from "@/lib/pro";

/*
 * Ce que la fiche patient transmet à chacun de ses modules.
 *
 * Un module ne relit ni l'URL ni la session : tout ce dont il a besoin pour
 * savoir QUI il affiche et COMMENT rendre compte d'un geste passe par ici.
 * C'est ce qui permet d'en ajouter un sans toucher à la page.
 */
export interface ContexteFiche {
  /** « c-<uuid> », « p-<uuid> » ou « s-<uuid> », tel que dans l'URL. */
  cle: string;
  /**
   * Destinataire possible d'un document ou d'un message. `undefined` pour une
   * fiche créée au cabinet : sans compte, le patient n'a pas d'espace où
   * recevoir quoi que ce soit.
   */
  pour: { patientId?: string; procheId?: string } | undefined;
  dossier: DossierPatient | null;
  nomComplet: string;
  medecinId: string | null;
  /** Le praticien connecté, pour pré-remplir certificats et arrêts de travail. */
  medecin: { nom: string; specialite: string } | null;
  role: ContextePro["role"];
  annoncer: (message: string) => void;
  signalerEchec: (message: string) => void;
  /**
   * Compteur de changements d'un module. Un module l'incrémente après une
   * écriture (`signalerChangement`) ; son compteur d'onglet, qui en dépend,
   * se recharge sans que la page ait à savoir ce qui a changé.
   */
  revision: (module: string) => number;
  signalerChangement: (module: string) => void;
}

export interface ModuleFiche {
  /** Identifiant stable : c'est lui qui paraît dans l'URL (`?tab=`). */
  id: string;
  libelle: string;
  /** Libellé de la puce sur téléphone, quand le libellé complet est long. */
  libelleCourt?: string;
  icone: NomIcone;
  /** Le contenu de l'onglet, chargé à la première ouverture. */
  Composant: ComponentType<{ ctx: ContexteFiche }>;
  /** Pastille chiffrée à côté du libellé ; ne rend rien tant qu'elle ne sait pas. */
  Compteur?: ComponentType<{ ctx: ContexteFiche }>;
  /** Le module n'est proposé qu'à qui y a droit (ex. : le médecin, pas l'assistant). */
  permission?: (ctx: ContexteFiche) => boolean;
}
