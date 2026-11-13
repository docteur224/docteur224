"use client";

/**
 * Les conseils santé, côté administration (lecture ET écriture).
 *
 * Écritures faites par la session de l'administrateur : la RLS (0091) n'ouvre
 * la table qu'à la permission « Paramètres ». L'écran s'appuie dessus plutôt
 * que sur une route serveur — comme la charte publique (charte-publique-compte).
 * Seule l'image passe par une route (/api/admin/conseils-sante/image), le temps
 * de l'envoyer à Cloudinary et d'en récupérer l'URL.
 *
 * Le slug est FIGÉ à la création : on ne le régénère jamais à l'édition, pour
 * ne pas casser un lien déjà partagé.
 */

import { creerClientNavigateur } from "@/lib/supabase/client";
import { COLONNES_CONSEIL, creerSlug, type ConseilSante } from "@/lib/conseils-sante";

const TABLE = "conseils_sante";

/** Les champs qu'un administrateur rédige. Le reste (id, slug, dates) est géré ici. */
export type BrouillonConseil = {
  emoji: string;
  categorie: string;
  titre: string;
  resume: string;
  contenu: string;
  gestes: string[];
  quand_consulter: string;
  image_url: string | null;
  image_id: string | null;
  vedette: boolean;
  publie: boolean;
};

/** Toutes les fiches, brouillons compris (la RLS les ouvre à l'admin). */
export async function listerConseils(): Promise<ConseilSante[]> {
  const supabase = creerClientNavigateur();
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLONNES_CONSEIL)
    .order("position", { ascending: true })
    .order("cree_le", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ConseilSante[];
}

function nettoyer(b: BrouillonConseil) {
  return {
    emoji: b.emoji.trim() || null,
    categorie: b.categorie.trim() || null,
    titre: b.titre.trim(),
    resume: b.resume.trim(),
    contenu: b.contenu.trim(),
    gestes: b.gestes.map((g) => g.trim()).filter(Boolean),
    quand_consulter: b.quand_consulter.trim() || null,
    image_url: b.image_url,
    image_id: b.image_id,
    vedette: b.vedette,
    publie: b.publie,
  };
}

/**
 * Crée une fiche. Le slug dérive du titre ; en cas de collision (deux titres
 * identiques), on réessaie une fois avec un suffixe court — rare, mais la base
 * refuserait sinon l'enregistrement sur la contrainte d'unicité.
 */
export async function creerConseil(b: BrouillonConseil): Promise<{ ok: boolean; erreur?: string }> {
  const supabase = creerClientNavigateur();
  const champs = nettoyer(b);
  if (!champs.titre || !champs.resume) {
    return { ok: false, erreur: "Le titre et le résumé sont obligatoires." };
  }

  // Position en fin de liste : la nouvelle fiche ne bouscule pas l'ordre existant.
  const { data: derniere } = await supabase
    .from(TABLE)
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = ((derniere?.position as number | undefined) ?? 0) + 1;

  for (let essai = 0; essai < 2; essai++) {
    const slug =
      essai === 0
        ? creerSlug(champs.titre)
        : `${creerSlug(champs.titre)}-${Math.random().toString(36).slice(2, 6)}`;
    const { error } = await supabase.from(TABLE).insert({ ...champs, slug, position });
    if (!error) return { ok: true };
    if (error.code !== "23505") return { ok: false, erreur: error.message };
  }
  return { ok: false, erreur: "Impossible de générer une adresse unique pour cette fiche." };
}

/** Modifie une fiche existante. Le slug n'est pas touché. */
export async function modifierConseil(
  id: string,
  b: BrouillonConseil
): Promise<{ ok: boolean; erreur?: string }> {
  const supabase = creerClientNavigateur();
  const champs = nettoyer(b);
  if (!champs.titre || !champs.resume) {
    return { ok: false, erreur: "Le titre et le résumé sont obligatoires." };
  }
  const { error } = await supabase
    .from(TABLE)
    .update({ ...champs, maj_le: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, erreur: error.message };
  return { ok: true };
}

/** Bascule un drapeau (publié / vedette) sans ouvrir le formulaire. */
export async function basculerDrapeau(
  id: string,
  champ: "publie" | "vedette",
  valeur: boolean
): Promise<boolean> {
  const supabase = creerClientNavigateur();
  const { error } = await supabase
    .from(TABLE)
    .update({ [champ]: valeur, maj_le: new Date().toISOString() })
    .eq("id", id);
  return !error;
}

/** Échange la position de deux fiches (flèches monter / descendre). */
export async function echangerPositions(a: ConseilSante, b: ConseilSante): Promise<boolean> {
  const supabase = creerClientNavigateur();
  const { error: e1 } = await supabase.from(TABLE).update({ position: b.position }).eq("id", a.id);
  const { error: e2 } = await supabase.from(TABLE).update({ position: a.position }).eq("id", b.id);
  return !e1 && !e2;
}

/** Supprime une fiche, puis l'image Cloudinary qui ne sert plus à personne. */
export async function supprimerConseil(conseil: ConseilSante): Promise<boolean> {
  const supabase = creerClientNavigateur();
  const { error } = await supabase.from(TABLE).delete().eq("id", conseil.id);
  if (error) return false;
  if (conseil.image_id) {
    await fetch(`/api/admin/conseils-sante/image?public_id=${encodeURIComponent(conseil.image_id)}`, {
      method: "DELETE",
    }).catch(() => {});
  }
  return true;
}

/** Envoie une image à Cloudinary et rend {url, public_id} à ranger dans la fiche. */
export async function televerserImage(
  fichier: File
): Promise<{ url: string; public_id: string } | { erreur: string }> {
  const corps = new FormData();
  corps.append("image", fichier);
  try {
    const reponse = await fetch("/api/admin/conseils-sante/image", { method: "POST", body: corps });
    const donnees = await reponse.json();
    if (!reponse.ok) return { erreur: donnees.erreur ?? "L'envoi a échoué." };
    return { url: donnees.url, public_id: donnees.public_id };
  } catch {
    return { erreur: "Connexion perdue. Réessayez." };
  }
}
