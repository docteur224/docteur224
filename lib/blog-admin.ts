"use client";

/**
 * Le blog, côté administration (lecture ET écriture).
 *
 * Écritures faites par la session de l'administrateur : la RLS (0092) n'ouvre
 * les tables qu'à la permission « Paramètres ». L'écran s'appuie dessus plutôt
 * que sur une route serveur — comme les conseils santé. Seule la couverture
 * passe par une route (/api/admin/blog/image), le temps de l'envoyer à
 * Cloudinary et d'en récupérer l'URL.
 *
 * Après chaque écriture, on demande la revalidation des pages publiques
 * (/api/admin/blog/revalidate) pour que le changement paraisse tout de suite,
 * sans attendre l'expiration de l'ISR ni un redéploiement.
 *
 * Le slug est FIGÉ à la création : on ne le régénère jamais à l'édition, pour
 * ne pas casser un lien déjà partagé.
 */

import { creerClientNavigateur } from "@/lib/supabase/client";
import {
  COLONNES_ARTICLE,
  COLONNES_CATEGORIE,
  COLONNES_RESEAU,
  creerSlug,
  type ArticleBlog,
  type CategorieBlog,
  type ReseauBlog,
} from "@/lib/blog";

const T_ARTICLES = "blog_articles";
const T_CATEGORIES = "blog_categories";
const T_RESEAUX = "blog_reseaux";

/** Les champs qu'un administrateur rédige pour un article. */
export type BrouillonArticle = {
  titre: string;
  extrait: string;
  contenu: string;
  categorie_id: string | null;
  tags: string[];
  auteur: string;
  couverture_url: string | null;
  couverture_id: string | null;
  vedette: boolean;
  publie: boolean;
};

/** Demande la revalidation des pages publiques du blog (best effort). */
async function revaliderBlog(slug?: string): Promise<void> {
  try {
    await fetch("/api/admin/blog/revalidate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(slug ? { slug } : {}),
    });
  } catch {
    // La revalidation ratée n'est pas bloquante : l'ISR rattrapera au pire.
  }
}

/* ------------------------------- Articles ------------------------------- */

export async function listerArticles(): Promise<ArticleBlog[]> {
  const supabase = creerClientNavigateur();
  const { data, error } = await supabase
    .from(T_ARTICLES)
    .select(COLONNES_ARTICLE)
    .order("publie_le", { ascending: false })
    .order("cree_le", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ArticleBlog[];
}

function nettoyerArticle(b: BrouillonArticle) {
  return {
    titre: b.titre.trim(),
    extrait: b.extrait.trim(),
    contenu: b.contenu.trim(),
    categorie_id: b.categorie_id || null,
    tags: b.tags.map((t) => t.trim()).filter(Boolean),
    auteur: b.auteur.trim() || null,
    couverture_url: b.couverture_url,
    couverture_id: b.couverture_id,
    vedette: b.vedette,
    publie: b.publie,
  };
}

export async function creerArticle(
  b: BrouillonArticle
): Promise<{ ok: boolean; erreur?: string }> {
  const supabase = creerClientNavigateur();
  const champs = nettoyerArticle(b);
  if (!champs.titre || !champs.extrait) {
    return { ok: false, erreur: "Le titre et l’extrait sont obligatoires." };
  }

  for (let essai = 0; essai < 2; essai++) {
    const slug =
      essai === 0
        ? creerSlug(champs.titre)
        : `${creerSlug(champs.titre)}-${Math.random().toString(36).slice(2, 6)}`;
    const { error } = await supabase.from(T_ARTICLES).insert({ ...champs, slug });
    if (!error) {
      await revaliderBlog();
      return { ok: true };
    }
    if (error.code !== "23505") return { ok: false, erreur: error.message };
  }
  return { ok: false, erreur: "Impossible de générer une adresse unique pour cet article." };
}

export async function modifierArticle(
  id: string,
  b: BrouillonArticle
): Promise<{ ok: boolean; erreur?: string }> {
  const supabase = creerClientNavigateur();
  const champs = nettoyerArticle(b);
  if (!champs.titre || !champs.extrait) {
    return { ok: false, erreur: "Le titre et l’extrait sont obligatoires." };
  }
  const { data, error } = await supabase
    .from(T_ARTICLES)
    .update({ ...champs, maj_le: new Date().toISOString() })
    .eq("id", id)
    .select("slug")
    .maybeSingle();
  if (error) return { ok: false, erreur: error.message };
  await revaliderBlog((data as { slug?: string } | null)?.slug);
  return { ok: true };
}

export async function basculerDrapeauArticle(
  id: string,
  champ: "publie" | "vedette",
  valeur: boolean
): Promise<boolean> {
  const supabase = creerClientNavigateur();
  const { data, error } = await supabase
    .from(T_ARTICLES)
    .update({ [champ]: valeur, maj_le: new Date().toISOString() })
    .eq("id", id)
    .select("slug")
    .maybeSingle();
  if (!error) await revaliderBlog((data as { slug?: string } | null)?.slug);
  return !error;
}

export async function supprimerArticle(article: ArticleBlog): Promise<boolean> {
  const supabase = creerClientNavigateur();
  const { error } = await supabase.from(T_ARTICLES).delete().eq("id", article.id);
  if (error) return false;
  if (article.couverture_id) {
    await fetch(
      `/api/admin/blog/image?public_id=${encodeURIComponent(article.couverture_id)}`,
      { method: "DELETE" }
    ).catch(() => {});
  }
  await revaliderBlog(article.slug);
  return true;
}

export async function televerserCouverture(
  fichier: File
): Promise<{ url: string; public_id: string } | { erreur: string }> {
  const corps = new FormData();
  corps.append("image", fichier);
  try {
    const reponse = await fetch("/api/admin/blog/image", { method: "POST", body: corps });
    const donnees = await reponse.json();
    if (!reponse.ok) return { erreur: donnees.erreur ?? "L'envoi a échoué." };
    return { url: donnees.url, public_id: donnees.public_id };
  } catch {
    return { erreur: "Connexion perdue. Réessayez." };
  }
}

/* ------------------------------ Catégories ------------------------------ */

export type BrouillonCategorie = {
  nom: string;
  description: string;
  emoji: string;
};

export async function listerCategories(): Promise<CategorieBlog[]> {
  const supabase = creerClientNavigateur();
  const { data, error } = await supabase
    .from(T_CATEGORIES)
    .select(COLONNES_CATEGORIE)
    .order("position", { ascending: true })
    .order("nom", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CategorieBlog[];
}

export async function creerCategorie(
  b: BrouillonCategorie
): Promise<{ ok: boolean; erreur?: string }> {
  const supabase = creerClientNavigateur();
  const nom = b.nom.trim();
  if (!nom) return { ok: false, erreur: "Le nom de la catégorie est obligatoire." };

  const { data: derniere } = await supabase
    .from(T_CATEGORIES)
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = ((derniere?.position as number | undefined) ?? 0) + 1;

  for (let essai = 0; essai < 2; essai++) {
    const slug =
      essai === 0 ? creerSlug(nom) : `${creerSlug(nom)}-${Math.random().toString(36).slice(2, 6)}`;
    const { error } = await supabase.from(T_CATEGORIES).insert({
      slug,
      nom,
      description: b.description.trim() || null,
      emoji: b.emoji.trim() || null,
      position,
    });
    if (!error) {
      await revaliderBlog();
      return { ok: true };
    }
    if (error.code !== "23505") return { ok: false, erreur: error.message };
  }
  return { ok: false, erreur: "Impossible de générer une adresse unique pour cette catégorie." };
}

export async function modifierCategorie(
  id: string,
  b: BrouillonCategorie
): Promise<{ ok: boolean; erreur?: string }> {
  const supabase = creerClientNavigateur();
  const nom = b.nom.trim();
  if (!nom) return { ok: false, erreur: "Le nom de la catégorie est obligatoire." };
  const { error } = await supabase
    .from(T_CATEGORIES)
    .update({
      nom,
      description: b.description.trim() || null,
      emoji: b.emoji.trim() || null,
      maj_le: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, erreur: error.message };
  await revaliderBlog();
  return { ok: true };
}

/**
 * Supprime une catégorie. Les articles qui la portaient ne sont pas supprimés :
 * la contrainte `on delete set null` les laisse « sans catégorie ».
 */
export async function supprimerCategorie(id: string): Promise<boolean> {
  const supabase = creerClientNavigateur();
  const { error } = await supabase.from(T_CATEGORIES).delete().eq("id", id);
  if (!error) await revaliderBlog();
  return !error;
}

export async function echangerPositionsCategorie(
  a: CategorieBlog,
  b: CategorieBlog
): Promise<boolean> {
  const supabase = creerClientNavigateur();
  const { error: e1 } = await supabase.from(T_CATEGORIES).update({ position: b.position }).eq("id", a.id);
  const { error: e2 } = await supabase.from(T_CATEGORIES).update({ position: a.position }).eq("id", b.id);
  if (!e1 && !e2) await revaliderBlog();
  return !e1 && !e2;
}

/* ------------------------------- Réseaux -------------------------------- */

export async function listerReseaux(): Promise<ReseauBlog[]> {
  const supabase = creerClientNavigateur();
  const { data, error } = await supabase
    .from(T_RESEAUX)
    .select(COLONNES_RESEAU)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ReseauBlog[];
}

/**
 * Remplace la liste des liens « Suivez-nous » par celle fournie. Les entrées
 * sans URL sont ignorées. On vide puis réinsère : la table est minuscule, et
 * cela garde l'ordre voulu sans jongler avec les identifiants existants.
 */
export async function remplacerReseaux(
  entrees: { reseau: string; url: string }[]
): Promise<{ ok: boolean; erreur?: string }> {
  const supabase = creerClientNavigateur();
  const propres = entrees
    .map((e, i) => ({ reseau: e.reseau.trim(), url: e.url.trim(), position: i, actif: true }))
    .filter((e) => e.reseau && e.url);

  // Purge totale (filtre toujours vrai) puis réinsertion.
  const { error: eDel } = await supabase.from(T_RESEAUX).delete().not("id", "is", null);
  if (eDel) return { ok: false, erreur: eDel.message };
  if (propres.length) {
    const { error: eIns } = await supabase.from(T_RESEAUX).insert(propres);
    if (eIns) return { ok: false, erreur: eIns.message };
  }
  await revaliderBlog();
  return { ok: true };
}
