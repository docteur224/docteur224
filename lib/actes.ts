"use client";

import { creerClientNavigateur } from "@/lib/supabase/client";
import { normaliserRecherche, type ActeRef, type DomaineActe } from "@/lib/prescription-actes";

/*
 * Référentiel des actes prescriptibles (migration 0068) : ce que le médecin
 * trouve en rédigeant une ordonnance de biologie ou d'imagerie.
 *
 * Lecture sous la RLS — tout compte connecté y a accès, il n'y a pas de
 * filtre à poser ici. Les modèles d'ordonnance, eux, vivent dans
 * `lib/modeles-ordonnance.ts`, commun aux trois domaines.
 */

interface LigneActeRef {
  id: string;
  domaine: DomaineActe;
  libelle: string;
  categorie: string | null;
}

/**
 * Actes actifs du domaine dont le libellé, le code ou l'un des synonymes
 * contient la saisie.
 *
 * DEUX caractères suffisent, là où la base de médicaments en demande trois :
 * les analyses s'appellent « VS », « TP », « LH », « CRP ». Attendre le
 * troisième caractère les rendrait introuvables.
 *
 * La recherche porte sur la colonne `recherche`, que la base tient à jour
 * (libellé + code + synonymes, sans accents ni casse) : c'est ce qui permet
 * de trouver « NFS (hémogramme) » en tapant « hemogramme ».
 */
export async function rechercherActes(domaine: DomaineActe, saisie: string): Promise<ActeRef[]> {
  const q = normaliserRecherche(saisie);
  if (q.length < 2) return [];
  // Les caractères spéciaux du filtre PostgREST (virgule, parenthèses)
  // casseraient la requête : on les retire de la saisie.
  const propre = q.replace(/[,()%*]/g, " ").trim();
  if (propre.length < 2) return [];
  const { data } = await creerClientNavigateur()
    .from("actes_prescriptibles")
    .select("id, domaine, libelle, categorie")
    .eq("domaine", domaine)
    .eq("actif", true)
    .ilike("recherche", `%${propre}%`)
    .order("libelle")
    .limit(12);
  return ((data ?? []) as LigneActeRef[]).map((a) => ({
    id: a.id,
    domaine: a.domaine,
    libelle: a.libelle,
    categorie: a.categorie,
  }));
}
