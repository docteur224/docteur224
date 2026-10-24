"use client";

import dynamic from "next/dynamic";
import { useNonLus } from "@/lib/conversations";
import { useNombreDocuments } from "@/lib/documents";
import { lirePatientCle } from "@/lib/pro";
import type { ContexteFiche, ModuleFiche } from "./contexte";
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
const ModuleRelation = dynamic(() => import("./relation/ModuleRelation"), { loading: charger });

/** Pastille de l'onglet Documents : le nombre de pièces en cours au dossier. */
function CompteurDocuments({ ctx }: { ctx: ContexteFiche }) {
  const n = useNombreDocuments(ctx.pour, ctx.revision("documents"));
  return n ? <>{n}</> : null;
}

/**
 * Pastille de l'onglet Relation patient : les messages non lus du patient.
 * Pour la fiche d'un proche, la conversation est celle du titulaire : pas de
 * pastille (il faudrait d'abord lire qui il est).
 */
function CompteurRelation({ ctx }: { ctx: ContexteFiche }) {
  const { type, id } = lirePatientCle(ctx.cle);
  const n = useNonLus(type === "compte" ? id : null, ctx.medecinId, ctx.revision("relation"));
  return n ? <>{n}</> : null;
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
    Composant: ModuleRelation,
    Compteur: CompteurRelation,
    permission: seulementMedecin,
  },
];

export const MODULE_PAR_DEFAUT = MODULES[0].id;
