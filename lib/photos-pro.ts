"use client";

import { useEffect, useState } from "react";
import { creerClientNavigateur } from "@/lib/supabase/client";

/*
 * Galerie de photos d'un professionnel (médecin ou établissement).
 *
 * L'envoi passe par /api/galerie-photos : le secret Cloudinary reste au
 * serveur, et c'est lui qui vérifie que l'appelant est bien le propriétaire.
 * Ici on ne fait que lire et rafraîchir.
 */

export const MAX_PHOTOS = 10;
export const TAILLE_MAX_PHOTO = 1024 * 1024; // 1 Mo, comme annoncé à l'écran
export const TYPES_PHOTO = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const EXTENSIONS_PHOTO = "JPG, PNG, WEBP, GIF";

export interface PhotoPro {
  id: string;
  url: string;
  legende: string;
  position: number;
}

/** Photos d'un professionnel. `proprietaireId` null tant qu'il n'est pas connu. */
export function useGaleriePhotos(
  proprietaireId: string | undefined,
  type: "medecin" | "etablissement"
): { photos: PhotoPro[]; chargement: boolean; recharger: () => void } {
  const [etat, setEtat] = useState<{ cle: string; photos: PhotoPro[] }>({ cle: "", photos: [] });
  const [version, setVersion] = useState(0);
  const cle = proprietaireId ? `${type}:${proprietaireId}:${version}` : "";

  useEffect(() => {
    let actif = true;
    // Pas de setState correctif ici (le linter l'interdit) : la lecture
    // ci-dessous compare la clé et rend une galerie vide d'elle-même.
    if (!proprietaireId) return;
    (async () => {
      const colonne = type === "medecin" ? "medecin_id" : "etablissement_id";
      const { data } = await creerClientNavigateur()
        .from("photos_pro")
        .select("id, url, legende, position")
        .eq(colonne, proprietaireId)
        .order("position")
        .order("cree_le");
      if (!actif) return;
      setEtat({
        cle,
        photos: (data ?? []).map((p) => ({
          id: p.id,
          url: p.url,
          legende: p.legende ?? "",
          position: p.position,
        })),
      });
    })();
    return () => {
      actif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proprietaireId, type, version]);

  return {
    photos: etat.cle === cle ? etat.photos : [],
    chargement: !!proprietaireId && etat.cle !== cle,
    recharger: () => setVersion((v) => v + 1),
  };
}

export async function ajouterPhoto(fichier: File, legende: string): Promise<{ erreur?: string }> {
  const corps = new FormData();
  corps.append("photo", fichier);
  if (legende) corps.append("legende", legende);
  try {
    const reponse = await fetch("/api/galerie-photos", { method: "POST", body: corps });
    const donnees = await reponse.json();
    return reponse.ok ? {} : { erreur: donnees.erreur ?? "L'envoi a échoué." };
  } catch {
    return { erreur: "Connexion perdue. Réessayez." };
  }
}

export async function supprimerPhoto(id: string): Promise<{ erreur?: string }> {
  try {
    const reponse = await fetch(`/api/galerie-photos?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const donnees = await reponse.json();
    return reponse.ok ? {} : { erreur: donnees.erreur ?? "La suppression a échoué." };
  } catch {
    return { erreur: "Connexion perdue. Réessayez." };
  }
}
