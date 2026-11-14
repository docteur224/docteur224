/**
 * Lecture du blog côté serveur (pages publiques), en rendu ISR.
 *
 * On passe par le client PUBLIC anonyme SANS cookie (`creerClientPublic`) : les
 * pages du blog sont pré-rendues puis revalidées, elles ne doivent pas lire la
 * requête. La RLS (0092) n'ouvre en lecture que les articles publiés et les
 * catégories / réseaux — un anonyme ne voit rien d'autre.
 *
 * Toute erreur (tables absentes avant la migration, réseau) bascule sur les
 * `*_DEFAUT` : la page ne tombe jamais en panne pour du contenu éditorial. On
 * ne distingue pas « vide » d'« en panne » : montrer le contenu d'amorce vaut
 * mieux qu'un écran blanc.
 */

import { creerClientPublic } from "@/lib/supabase/public";
import {
  ARTICLES_DEFAUT,
  CATEGORIES_DEFAUT,
  COLONNES_ARTICLE,
  COLONNES_CATEGORIE,
  COLONNES_RESEAU,
  type ArticleBlog,
  type CategorieBlog,
  type ReseauBlog,
} from "@/lib/blog";

/** Rattache à chaque article sa catégorie résolue (ou null). */
function rattacherCategories(
  articles: ArticleBlog[],
  categories: CategorieBlog[]
): ArticleBlog[] {
  const parId = new Map(categories.map((c) => [c.id, c]));
  return articles.map((a) => ({ ...a, categorie: a.categorie_id ? parId.get(a.categorie_id) ?? null : null }));
}

export async function lireCategories(): Promise<CategorieBlog[]> {
  try {
    const supabase = creerClientPublic();
    const { data, error } = await supabase
      .from("blog_categories")
      .select(COLONNES_CATEGORIE)
      .order("position", { ascending: true })
      .order("nom", { ascending: true });
    if (error) throw error;
    const liste = (data ?? []) as CategorieBlog[];
    return liste.length ? liste : CATEGORIES_DEFAUT;
  } catch {
    return CATEGORIES_DEFAUT;
  }
}

export async function lireReseauxActifs(): Promise<ReseauBlog[]> {
  try {
    const supabase = creerClientPublic();
    const { data, error } = await supabase
      .from("blog_reseaux")
      .select(COLONNES_RESEAU)
      .eq("actif", true)
      .order("position", { ascending: true });
    if (error) throw error;
    return (data ?? []) as ReseauBlog[];
  } catch {
    return [];
  }
}

export async function lireArticlesPublies(): Promise<ArticleBlog[]> {
  try {
    const supabase = creerClientPublic();
    const [{ data, error }, categories] = await Promise.all([
      supabase
        .from("blog_articles")
        .select(COLONNES_ARTICLE)
        .eq("publie", true)
        .order("publie_le", { ascending: false }),
      lireCategories(),
    ]);
    if (error) throw error;
    const liste = (data ?? []) as ArticleBlog[];
    return liste.length ? rattacherCategories(liste, categories) : ARTICLES_DEFAUT;
  } catch {
    return ARTICLES_DEFAUT;
  }
}

export async function lireArticlePublie(slug: string): Promise<ArticleBlog | null> {
  try {
    const supabase = creerClientPublic();
    const { data, error } = await supabase
      .from("blog_articles")
      .select(COLONNES_ARTICLE)
      .eq("slug", slug)
      .eq("publie", true)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      const categories = await lireCategories();
      return rattacherCategories([data as ArticleBlog], categories)[0];
    }
  } catch {
    // On retombe sur le repli ci-dessous.
  }
  return ARTICLES_DEFAUT.find((a) => a.slug === slug) ?? null;
}

/** Les articles les plus lus (section « Articles populaires »). */
export async function lireArticlesPopulaires(limite = 4): Promise<ArticleBlog[]> {
  try {
    const supabase = creerClientPublic();
    const { data, error } = await supabase
      .from("blog_articles")
      .select(COLONNES_ARTICLE)
      .eq("publie", true)
      .order("vues", { ascending: false })
      .order("publie_le", { ascending: false })
      .limit(limite);
    if (error) throw error;
    const liste = (data ?? []) as ArticleBlog[];
    if (!liste.length) return ARTICLES_DEFAUT.slice(0, limite);
    const categories = await lireCategories();
    return rattacherCategories(liste, categories);
  } catch {
    return ARTICLES_DEFAUT.slice(0, limite);
  }
}

/** Slugs publiés, pour `generateStaticParams`. */
export async function slugsArticlesPublies(): Promise<string[]> {
  try {
    const supabase = creerClientPublic();
    const { data, error } = await supabase
      .from("blog_articles")
      .select("slug")
      .eq("publie", true);
    if (error) throw error;
    const liste = (data ?? []) as { slug: string }[];
    return liste.length ? liste.map((a) => a.slug) : ARTICLES_DEFAUT.map((a) => a.slug);
  } catch {
    return ARTICLES_DEFAUT.map((a) => a.slug);
  }
}

export async function slugsCategories(): Promise<string[]> {
  const categories = await lireCategories();
  return categories.map((c) => c.slug);
}
