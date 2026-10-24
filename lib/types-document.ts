/*
 * Les types de pièces remises à un patient, et ce qui les distingue À
 * L'USAGE.
 *
 * Module PUR, sans « use client » : la route de génération du PDF et la page
 * publique de vérification tournent sur le SERVEUR et ne peuvent pas puiser
 * dans `lib/documents.ts`. Chacune redéclarait donc sa propre table de
 * libellés — trois listes des mêmes types, dans trois fichiers, qu'il
 * fallait penser à compléter ensemble. Elles vivent ici désormais.
 *
 * Les propriétés ci-dessous remplacent les tests `type === "ordonnance"` qui
 * traînaient dans les écrans. Il y en avait douze, et ils confondaient trois
 * questions différentes : « le titre est-il calculé ? », « l'éditeur est-il
 * structuré ? », « le libellé est-il féminin ? ». Un type se décrit
 * maintenant ici, et nulle part ailleurs.
 */

export const TYPES_DOCUMENT = [
  {
    valeur: "ordonnance",
    // « médicale » depuis qu'il existe des ordonnances de biologie : sans
    // l'adjectif, le menu déroulant ne dit plus laquelle on choisit.
    libelle: "Ordonnance médicale",
    icone: "💊",
    /*
     * Nom que porte le titre calculé (« Ordonnance du JJ/MM/AAAA »), ou null
     * quand le médecin titre lui-même.
     *
     * DISTINCT de `libelle`, et à garder tel quel : `titreDocument`
     * recalcule le titre de toutes les pièces déjà remises, les plus
     * anciennes comprises. Renommer la ligne du menu déroulant ne doit pas
     * retitrer après coup ce qu'un patient a emporté.
     */
    titreAuto: "Ordonnance",
    /** Éditeur structuré à employer ; null = texte libre. */
    structure: "medicament",
    /** « Ordonnance remise », mais « Certificat remis ». */
    feminin: true,
    /** Glyphe du jeu d'icônes interne, dans les listes de l'espace médecin. */
    glyphe: "gelule",
    /** En-tête imprimé sur le PDF, en capitales. */
    pdf: "ORDONNANCE",
    /** Ce que lit le pharmacien ou l'employeur sur la page de vérification. */
    public: "Ordonnance",
  },
  {
    valeur: "ordonnance_biologie",
    libelle: "Ordonnance de biologie",
    icone: "🔬",
    titreAuto: "Ordonnance de biologie",
    structure: "acte",
    feminin: true,
    glyphe: "pouls",
    pdf: "ORDONNANCE DE BIOLOGIE MÉDICALE",
    public: "Ordonnance de biologie",
  },
  {
    valeur: "compte_rendu",
    libelle: "Compte rendu",
    icone: "📋",
    titreAuto: null,
    structure: null,
    feminin: false,
    glyphe: "document",
    pdf: "COMPTE RENDU DE CONSULTATION",
    public: "Compte rendu",
  },
  {
    valeur: "resultat",
    libelle: "Résultat d’examen",
    icone: "🧪",
    titreAuto: null,
    structure: null,
    feminin: false,
    glyphe: "document",
    pdf: "RÉSULTAT D’EXAMEN",
    public: "Résultat d’examen",
  },
  {
    valeur: "certificat",
    libelle: "Certificat",
    icone: "📄",
    titreAuto: null,
    structure: null,
    feminin: false,
    glyphe: "document",
    pdf: "CERTIFICAT MÉDICAL",
    public: "Certificat médical",
  },
  {
    valeur: "arret_travail",
    libelle: "Arrêt de travail",
    icone: "🗓️",
    titreAuto: null,
    structure: null,
    feminin: false,
    glyphe: "document",
    pdf: "AVIS D’ARRÊT DE TRAVAIL",
    public: "Arrêt de travail",
  },
  {
    valeur: "autre",
    libelle: "Autre",
    icone: "📎",
    titreAuto: null,
    structure: null,
    feminin: false,
    glyphe: "document",
    pdf: "DOCUMENT MÉDICAL",
    public: "Document médical",
  },
] as const;

export type TypeDocument = (typeof TYPES_DOCUMENT)[number]["valeur"];

/** Éditeur structuré d'un type de pièce. S'étendra à 'acte' avec la biologie. */
export type StructureDocument = (typeof TYPES_DOCUMENT)[number]["structure"];

const typeDoc = (t: string) => TYPES_DOCUMENT.find((x) => x.valeur === t);

export const libelleType = (t: string) => typeDoc(t)?.libelle ?? "Document";
export const iconeType = (t: string) => typeDoc(t)?.icone ?? "📎";

/** En-tête du PDF. Un type inconnu s'imprime « DOCUMENT MÉDICAL ». */
export const libellePdf = (t: string) => typeDoc(t)?.pdf ?? "DOCUMENT MÉDICAL";

/** Libellé de la page publique de vérification. */
export const libellePublic = (t: string) => typeDoc(t)?.public ?? "Document médical";

/** Le nom du titre calculé, ou null quand le titre est saisi par le médecin. */
export const titreAutoDe = (t: string): string | null => typeDoc(t)?.titreAuto ?? null;

/** L'éditeur structuré du type, ou null pour du texte libre. */
export const structureDe = (t: string): StructureDocument => typeDoc(t)?.structure ?? null;

/** « remise » plutôt que « remis ». */
export const estFeminin = (t: string) => typeDoc(t)?.feminin ?? false;

/**
 * Glyphe de la pièce dans les écrans médecin (jeu d'icônes interne, à ne pas
 * confondre avec `iconeType`, qui rend un emoji). Une pièce à lignes
 * structurées se repère d'un coup d'œil dans une liste ; les autres non.
 */
export const glypheType = (t: string) => typeDoc(t)?.glyphe ?? "document";

/**
 * Le référentiel d'actes qu'interroge ce type, ou null s'il n'en interroge
 * aucun. Seuls les types à `structure: "acte"` en ont un — c'est ce qui dit
 * à l'éditeur s'il cherche dans les analyses ou dans les examens
 * d'imagerie.
 */
export const domaineActeDe = (t: string): "biologie" | "imagerie" | null =>
  t === "ordonnance_biologie" ? "biologie" : t === "ordonnance_imagerie" ? "imagerie" : null;
