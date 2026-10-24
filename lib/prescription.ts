/*
 * Ordonnance structurée : les lignes de prescription et le texte qui en est
 * tiré.
 *
 * Module PUR. Les lignes sont stockées telles quelles (documents_patient.
 * prescription, modeles_ordonnance.lignes) ; le TEXTE de l'ordonnance — ce
 * qu'imprime le PDF et ce que lit le pharmacien — en est dérivé ici, une
 * seule fois, pour que l'écran, le PDF et le modèle ne divergent pas.
 */

export interface LignePrescription {
  /** Référence dans la base de médicaments ; null pour un produit saisi à la main. */
  medicamentId: string | null;
  /** « Amoxicilline 500 mg — gélule » : ce qui s'imprime. */
  libelle: string;
  dci: string | null;
  classe: string | null;
  posologie: string;
  duree: string;
  quantite: string;
}

export const LIGNE_VIDE: LignePrescription = {
  medicamentId: null,
  libelle: "",
  dci: null,
  classe: null,
  posologie: "",
  duree: "",
  quantite: "",
};

export interface MedicamentRef {
  id: string;
  dci: string;
  nomCommercial: string | null;
  dosage: string | null;
  forme: string | null;
  classe: string | null;
}

/** « Amoxicilline 500 mg — gélule », nom commercial entre parenthèses s'il existe. */
export function libelleMedicament(m: Pick<MedicamentRef, "dci" | "nomCommercial" | "dosage" | "forme">): string {
  const base = [m.dci, m.dosage].filter(Boolean).join(" ");
  const marque = m.nomCommercial ? ` (${m.nomCommercial})` : "";
  return `${base}${marque}${m.forme ? ` — ${m.forme}` : ""}`;
}

/**
 * Ce que toute ligne d'ordonnance a en commun, qu'elle porte un médicament
 * ou un acte : le nom de ce qui est prescrit. Les fonctions ci-dessous ne
 * demandent que cela, et servent donc aussi aux ordonnances d'actes
 * (`lib/prescription-actes.ts`) — plutôt que d'en avoir deux jeux qui
 * divergeraient.
 */
export interface LigneNommee {
  libelle: string;
}

/** Une ligne compte quand elle nomme un produit ou un acte. */
export const ligneRemplie = (l: LigneNommee) => l.libelle.trim() !== "";

/**
 * Distingue une ligne de médicament d'une ligne d'acte : seule la première
 * porte une posologie. Les deux cohabitent dans
 * `documents_patient.prescription`, dont la forme suit le type de la pièce.
 */
export const estLigneMedicament = (l: LigneNommee): l is LignePrescription => "posologie" in l;

/**
 * Le texte de l'ordonnance. Le produit en capitales sur sa ligne — c'est
 * ce que le pharmacien cherche des yeux —, la posologie dessous.
 */
export function texteOrdonnance(lignes: LignePrescription[], remarques = ""): string {
  const blocs = lignes.filter(ligneRemplie).map((l) => {
    const [produit, ...forme] = l.libelle.split(" — ");
    const titre = `${produit.toUpperCase()}${forme.length ? ` — ${forme.join(" — ")}` : ""}`;
    const detail = [
      l.posologie.trim(),
      l.duree.trim() ? `pendant ${l.duree.trim()}` : "",
    ]
      .filter(Boolean)
      .join(", ");
    const quantite = l.quantite.trim() ? `Quantité : ${l.quantite.trim()}` : "";
    return [titre, [detail, quantite].filter(Boolean).join(". ")].filter(Boolean).join("\n");
  });
  const fin = remarques.trim() ? [`Remarques : ${remarques.trim()}`] : [];
  return [...blocs, ...fin].join("\n\n");
}

/**
 * « Amoxicilline 500 mg, Paracétamol 1 g », ou « NFS, Glycémie à jeun » :
 * de quoi distinguer deux ordonnances du même jour sans les ouvrir.
 */
export function resumePrescription(lignes: LigneNommee[] | null | undefined, max = 70): string {
  const texte = (lignes ?? [])
    .filter(ligneRemplie)
    .map((l) => l.libelle.split(" — ")[0].replace(/\s*\(.*\)$/, ""))
    .join(", ");
  return texte.length > max ? `${texte.slice(0, max - 1).trimEnd()}…` : texte;
}

/** Valide une prescription avant envoi : le message à afficher, ou null. */
export function problemePrescription(lignes: LignePrescription[]): string | null {
  const remplies = lignes.filter(ligneRemplie);
  if (remplies.length === 0) return "Ajoutez au moins un médicament.";
  const sansPosologie = remplies.find((l) => !l.posologie.trim());
  if (sansPosologie) return `Indiquez la posologie de ${sansPosologie.libelle.split(" — ")[0]}.`;
  return null;
}
