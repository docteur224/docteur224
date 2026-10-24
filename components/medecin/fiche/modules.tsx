"use client";

import dynamic from "next/dynamic";
import { useNombreDocuments } from "@/lib/documents";
import type { ContexteFiche, ModuleFiche } from "./contexte";
import ModuleEnPreparation from "./ModuleEnPreparation";
import { SqueletteModule } from "./ui";

/*
 * LES MODULES DE LA FICHE PATIENT — configuration unique.
 *
 * Ajouter un onglet = ajouter une entrée ici. La barre d'onglets (desktop),
 * les puces (téléphone), l'URL (`?tab=<id>`), le chargement à la demande et
 * le squelette suivent sans autre modification.
 *
 * Chaque `Composant` passe par `dynamic()` : son code n'est téléchargé qu'à
 * la première ouverture de l'onglet. Le premier écran de la fiche ne paie
 * que pour l'onglet affiché.
 *
 * L'ordre du tableau est l'ordre d'affichage ; le premier est l'onglet par
 * défaut.
 */

const charger = () => <SqueletteModule />;

const ModuleDossierClinique = dynamic(() => import("./clinique/ModuleDossierClinique"), { loading: charger });
const ModuleDocuments = dynamic(() => import("./ModuleDocuments"), { loading: charger });

/** Pastille de l'onglet Documents : le nombre de pièces en cours au dossier. */
function CompteurDocuments({ ctx }: { ctx: ContexteFiche }) {
  const n = useNombreDocuments(ctx.pour, ctx.revision("documents"));
  return n ? <>{n}</> : null;
}

/* Contenu d'attente, remplacé à l'étape 4 de la livraison. */
function RelationEnPreparation() {
  return (
    <ModuleEnPreparation
      icone="message"
      titre="Relation patient"
      texte="Messagerie avec le patient, rappels de rendez-vous par SMS ou WhatsApp et, plus tard, téléconsultation."
    />
  );
}

const seulementMedecin = (ctx: ContexteFiche) => ctx.role === "medecin";

export const MODULES: ModuleFiche[] = [
  {
    id: "dossier",
    libelle: "Dossier clinique",
    libelleCourt: "Clinique",
    icone: "pouls",
    Composant: ModuleDossierClinique,
    permission: seulementMedecin,
  },
  {
    id: "documents",
    libelle: "Ordonnances et documents",
    libelleCourt: "Ordonnances",
    icone: "gelule",
    Composant: ModuleDocuments,
    Compteur: CompteurDocuments,
    permission: seulementMedecin,
  },
  {
    id: "relation",
    libelle: "Relation patient",
    libelleCourt: "Relation",
    icone: "message",
    Composant: RelationEnPreparation,
    permission: seulementMedecin,
  },
];

export const MODULE_PAR_DEFAUT = MODULES[0].id;
