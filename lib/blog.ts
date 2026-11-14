/**
 * Le blog — types, petits utilitaires et FILET DE REPLI.
 *
 * Ce module ne touche ni au navigateur ni au serveur : il est importé par les
 * pages publiques (rendu serveur), par l'écran d'administration (client) et
 * par les composants de partage. Aucune directive « use client », aucune
 * dépendance à Supabase.
 *
 * Le slug, la détection de HTML et le découpage en paragraphes sont partagés
 * avec les conseils santé (même logique, une seule source) — voir
 * `@/lib/conseils-sante`.
 *
 * Les `*_DEFAUT` servent UNIQUEMENT de repli : si la migration 0092 n'est pas
 * encore passée (tables absentes) ou si une lecture échoue, la page publique
 * montre ce contenu plutôt qu'un écran vide. Dès que les tables existent,
 * c'est elles qui font foi — le repli devient invisible.
 */

export { creerSlug, estHtml, paragraphes } from "@/lib/conseils-sante";

export type CategorieBlog = {
  id: string;
  slug: string;
  nom: string;
  description: string | null;
  emoji: string | null;
  position: number;
  cree_le?: string;
  maj_le?: string;
};

export type ArticleBlog = {
  id: string;
  slug: string;
  titre: string;
  extrait: string;
  contenu: string;
  categorie_id: string | null;
  tags: string[];
  auteur: string | null;
  couverture_url: string | null;
  couverture_id: string | null;
  vues: number;
  vedette: boolean;
  publie: boolean;
  publie_le: string;
  cree_le?: string;
  maj_le?: string;
  // Rempli à la lecture (jointure) : la catégorie résolue, pour l'affichage.
  categorie?: CategorieBlog | null;
};

export type ReseauBlog = {
  id: string;
  reseau: string;
  url: string;
  position: number;
  actif: boolean;
};

/** Signature par défaut d'un article sans auteur saisi. */
export const AUTEUR_DEFAUT = "L'équipe Docteur 224";

/** URL absolue du site, sans barre finale (pour le SEO, le RSS, le sitemap). */
export function urlSite(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://docteur224.com").replace(/\/+$/, "");
}

/** Colonnes lues côté public et admin — un seul jeu, pour ne pas diverger. */
export const COLONNES_ARTICLE =
  "id, slug, titre, extrait, contenu, categorie_id, tags, auteur, couverture_url, couverture_id, vues, vedette, publie, publie_le, cree_le, maj_le";
export const COLONNES_CATEGORIE = "id, slug, nom, description, emoji, position, cree_le, maj_le";
export const COLONNES_RESEAU = "id, reseau, url, position, actif";

/** Catégories proposées par défaut à la création (liste ouverte). */
export const EMOJIS_CATEGORIE_SUGGERES = ["📣", "🩺", "💬", "🧭", "🌿", "💡", "📊", "❤️", "👶", "🧪"];

/**
 * Temps de lecture estimé, en minutes (≈ 200 mots/minute, minimum 1).
 * On retire les balises pour ne compter que le texte réellement lu.
 */
export function tempsLecture(contenu: string, extrait = ""): number {
  const texte = `${extrait} ${contenu}`.replace(/<[^>]*>/g, " ");
  const mots = texte.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(mots / 200));
}

/** Date lisible en français : « 14 novembre 2026 ». */
export function dateLisible(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

/** Réseaux connus de l'affichage : libellé, couleur de marque et tracé d'icône (24×24). */
export const RESEAUX_CONNUS: Record<
  string,
  { libelle: string; couleur: string; chemin: string }
> = {
  facebook: {
    libelle: "Facebook",
    couleur: "#1877F2",
    chemin:
      "M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.9h2.54V9.85c0-2.52 1.49-3.9 3.78-3.9 1.1 0 2.24.19 2.24.19v2.47h-1.26c-1.24 0-1.63.78-1.63 1.57v1.88h2.78l-.44 2.9h-2.34V22c4.78-.79 8.44-4.94 8.44-9.94Z",
  },
  x: {
    libelle: "X",
    couleur: "#0f1419",
    chemin:
      "M18.24 2.25h3.3l-7.2 8.23L22.8 21.75h-6.6l-5.17-6.76-5.92 6.76H1.8l7.71-8.8L1.2 2.25h6.78l4.67 6.17 5.59-6.17Zm-1.16 17.52h1.83L7.01 4.13H5.04l12.04 15.64Z",
  },
  instagram: {
    libelle: "Instagram",
    couleur: "#E4405F",
    chemin:
      "M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16Zm0 1.98c-3.14 0-3.52.01-4.76.07-.9.04-1.39.19-1.71.32-.43.17-.74.37-1.06.69-.32.32-.52.63-.69 1.06-.13.32-.28.81-.32 1.71-.06 1.24-.07 1.62-.07 4.76s.01 3.52.07 4.76c.04.9.19 1.39.32 1.71.17.43.37.74.69 1.06.32.32.63.52 1.06.69.32.13.81.28 1.71.32 1.24.06 1.62.07 4.76.07s3.52-.01 4.76-.07c.9-.04 1.39-.19 1.71-.32.43-.17.74-.37 1.06-.69.32-.32.52-.63.69-1.06.13-.32.28-.81.32-1.71.06-1.24.07-1.62.07-4.76s-.01-3.52-.07-4.76c-.04-.9-.19-1.39-.32-1.71a2.85 2.85 0 0 0-.69-1.06 2.85 2.85 0 0 0-1.06-.69c-.32-.13-.81-.28-1.71-.32-1.24-.06-1.62-.07-4.76-.07Zm0 3.37a4.49 4.49 0 1 1 0 8.98 4.49 4.49 0 0 1 0-8.98Zm0 1.98a2.51 2.51 0 1 0 0 5.02 2.51 2.51 0 0 0 0-5.02Zm5.72-2.2a1.05 1.05 0 1 1-2.1 0 1.05 1.05 0 0 1 2.1 0Z",
  },
  linkedin: {
    libelle: "LinkedIn",
    couleur: "#0A66C2",
    chemin:
      "M4.98 3.5A2.5 2.5 0 1 0 5 8.5a2.5 2.5 0 0 0-.02-5ZM3 9.75h4V21H3V9.75ZM9.5 9.75h3.83v1.54h.05c.53-.96 1.84-1.97 3.78-1.97 4.04 0 4.79 2.5 4.79 5.74V21h-4v-4.98c0-1.19-.02-2.72-1.76-2.72-1.76 0-2.03 1.3-2.03 2.64V21h-4V9.75Z",
  },
  youtube: {
    libelle: "YouTube",
    couleur: "#FF0000",
    chemin:
      "M23.5 6.5a3.02 3.02 0 0 0-2.12-2.14C19.5 3.85 12 3.85 12 3.85s-7.5 0-9.38.51A3.02 3.02 0 0 0 .5 6.5 31.3 31.3 0 0 0 0 12a31.3 31.3 0 0 0 .5 5.5 3.02 3.02 0 0 0 2.12 2.14c1.88.51 9.38.51 9.38.51s7.5 0 9.38-.51a3.02 3.02 0 0 0 2.12-2.14A31.3 31.3 0 0 0 24 12a31.3 31.3 0 0 0-.5-5.5ZM9.6 15.57V8.43L15.82 12 9.6 15.57Z",
  },
  tiktok: {
    libelle: "TikTok",
    couleur: "#010101",
    chemin:
      "M16.6 5.82a4.28 4.28 0 0 1-1.02-2.82h-3.1v12.3a2.59 2.59 0 1 1-2.59-2.59c.27 0 .53.04.78.12V9.66a5.7 5.7 0 0 0-.78-.05 5.69 5.69 0 1 0 5.69 5.69V9.01a7.35 7.35 0 0 0 4.3 1.38V7.28a4.28 4.28 0 0 1-3.28-1.46Z",
  },
  whatsapp: {
    libelle: "WhatsApp",
    couleur: "#25D366",
    chemin:
      "M12.04 2a9.9 9.9 0 0 0-8.46 15.04L2 22l5.1-1.34A9.9 9.9 0 1 0 12.04 2Zm0 1.8a8.1 8.1 0 0 1 5.73 13.82 8.1 8.1 0 0 1-9.84 1.2l-.35-.2-3.02.79.81-2.94-.23-.37A8.1 8.1 0 0 1 12.04 3.8Zm-2.6 4.3c-.18 0-.47.07-.72.34-.25.27-.95.93-.95 2.26 0 1.33.97 2.62 1.1 2.8.14.18 1.9 2.9 4.6 3.96 2.26.89 2.72.71 3.21.67.49-.05 1.58-.65 1.8-1.27.22-.62.22-1.15.16-1.27-.07-.1-.25-.17-.52-.3-.27-.14-1.58-.78-1.82-.87-.25-.09-.43-.13-.6.14-.18.27-.7.87-.86 1.05-.16.18-.32.2-.59.07-.27-.14-1.13-.42-2.15-1.33-.79-.71-1.33-1.58-1.49-1.85-.16-.27-.02-.42.12-.55.12-.12.27-.32.4-.48.14-.16.18-.27.27-.46.09-.18.05-.34-.02-.48-.07-.14-.6-1.46-.84-2-.22-.52-.44-.45-.6-.46h-.52Z",
  },
};

/** Ordre et clés proposés à l'administration pour les liens « Suivez-nous ». */
export const RESEAUX_PROPOSES = [
  "facebook",
  "x",
  "instagram",
  "linkedin",
  "youtube",
  "tiktok",
  "whatsapp",
] as const;

/* ------------------------------------------------------------------ */
/*                               Repli                                 */
/* ------------------------------------------------------------------ */

export const CATEGORIES_DEFAUT: CategorieBlog[] = [
  { id: "cat-actualites", slug: "actualites", nom: "Actualités", description: "Les nouveautés de la plateforme Docteur 224.", emoji: "📣", position: 1 },
  { id: "cat-sante-publique", slug: "sante-publique", nom: "Santé publique", description: "Prévention, campagnes et grands enjeux de santé en Guinée.", emoji: "🩺", position: 2 },
  { id: "cat-temoignages", slug: "temoignages", nom: "Témoignages", description: "Patients et professionnels racontent.", emoji: "💬", position: 3 },
  { id: "cat-conseils-pratiques", slug: "conseils-pratiques", nom: "Conseils pratiques", description: "Bien utiliser la plateforme et préparer ses rendez-vous.", emoji: "🧭", position: 4 },
];

export const ARTICLES_DEFAUT: ArticleBlog[] = [
  {
    id: "art-lancement",
    slug: "docteur224-lance-son-blog",
    titre: "Docteur 224 lance son blog",
    extrait:
      "Un nouvel espace pour suivre l’actualité de la plateforme, la prévention et les conseils qui vous aident à mieux vous soigner au quotidien.",
    contenu:
      "<p>Nous sommes heureux d’ouvrir le blog de Docteur 224. Vous y trouverez l’actualité de la plateforme, des dossiers de prévention alignés sur les recommandations de santé publique, des témoignages de patients et de professionnels, et des conseils pratiques pour tirer le meilleur de vos rendez-vous.</p><h2>Pourquoi un blog ?</h2><p>Nos fiches « Conseils santé » restent des repères de prévention, courts et stables. Le blog, lui, vit au rythme de l’actualité : il raconte, explique et donne la parole. Les deux se complètent.</p><p>Bonne lecture — et n’hésitez pas à partager les articles autour de vous.</p>",
    categorie_id: "cat-actualites",
    tags: ["plateforme", "nouveauté"],
    auteur: AUTEUR_DEFAUT,
    couverture_url: null,
    couverture_id: null,
    vues: 0,
    vedette: true,
    publie: true,
    publie_le: new Date().toISOString(),
    categorie: CATEGORIES_DEFAUT[0],
  },
  {
    id: "art-premier-rdv",
    slug: "preparer-son-premier-rendez-vous-en-ligne",
    titre: "Préparer son premier rendez-vous en ligne",
    extrait:
      "Quelques gestes simples pour arriver serein : documents utiles, antécédents à noter, questions à préparer. Tout se joue avant la consultation.",
    contenu:
      "<p>Un rendez-vous bien préparé, c’est une consultation plus utile. Voici comment vous y prendre.</p><h2>Rassemblez vos documents</h2><p>Carnet de vaccination, ordonnances en cours, résultats d’examens récents : apportez tout ce qui éclaire votre situation.</p><h2>Notez vos antécédents</h2><p>Maladies connues, allergies, traitements réguliers. Ces informations font gagner un temps précieux au médecin.</p><h2>Préparez vos questions</h2><p>Écrivez à l’avance ce qui vous préoccupe. On oublie souvent l’essentiel une fois dans le cabinet.</p>",
    categorie_id: "cat-conseils-pratiques",
    tags: ["rendez-vous", "consultation"],
    auteur: AUTEUR_DEFAUT,
    couverture_url: null,
    couverture_id: null,
    vues: 0,
    vedette: false,
    publie: true,
    publie_le: new Date(Date.now() - 3 * 86400000).toISOString(),
    categorie: CATEGORIES_DEFAUT[3],
  },
  {
    id: "art-prevention",
    slug: "la-prevention-commence-par-un-geste",
    titre: "La prévention commence par un geste",
    extrait:
      "Se laver les mains, dormir sous moustiquaire, faire contrôler sa tension : les petits gestes qui changent une vie de santé, rappelés simplement.",
    contenu:
      "<p>La santé ne se joue pas seulement dans le cabinet du médecin. Elle se construit chaque jour, par des gestes simples et réguliers.</p><h2>Des gestes à la portée de tous</h2><ul><li>Se laver les mains au savon avant de manger.</li><li>Dormir sous une moustiquaire imprégnée, toute l’année.</li><li>Faire contrôler sa tension une fois par an à partir de 40 ans.</li></ul><p>Aucun de ces gestes ne coûte cher. Tous protègent, vous et vos proches. Retrouvez le détail dans nos <em>Conseils santé</em>.</p>",
    categorie_id: "cat-sante-publique",
    tags: ["prévention", "hygiène"],
    auteur: AUTEUR_DEFAUT,
    couverture_url: null,
    couverture_id: null,
    vues: 0,
    vedette: false,
    publie: true,
    publie_le: new Date(Date.now() - 7 * 86400000).toISOString(),
    categorie: CATEGORIES_DEFAUT[1],
  },
];
