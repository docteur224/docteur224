"use client";

import { useRef, useState } from "react";
import {
  ajouterPhoto,
  supprimerPhoto,
  useGaleriePhotos,
  EXTENSIONS_PHOTO,
  MAX_PHOTOS,
  TAILLE_MAX_PHOTO,
  TYPES_PHOTO,
} from "@/lib/photos-pro";

/*
 * Galerie de photos d'un professionnel.
 *
 * Remplace les trois vignettes écrites en dur (« Salle d'attente », « Salle
 * de soins », « Consultation ») qui s'affichaient à l'identique pour tout le
 * monde et dont le bouton « Ajouter » ne faisait rien.
 *
 * La validation (type, poids, nombre) est refaite côté serveur et en base :
 * celle d'ici sert à répondre tout de suite plutôt qu'après un aller-retour.
 */

export default function GaleriePhotos({
  proprietaireId,
  type,
  mobile = false,
}: {
  proprietaireId: string | undefined;
  type: "medecin" | "etablissement";
  mobile?: boolean;
}) {
  const { photos, recharger } = useGaleriePhotos(proprietaireId, type);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const champ = useRef<HTMLInputElement>(null);

  const complete = photos.length >= MAX_PHOTOS;

  async function envoyer(fichiers: FileList | null) {
    const fichier = fichiers?.[0];
    if (!fichier) return;
    setErreur(null);
    if (!TYPES_PHOTO.includes(fichier.type)) {
      return setErreur(`Format non accepté. Utilisez un ${EXTENSIONS_PHOTO}.`);
    }
    if (fichier.size > TAILLE_MAX_PHOTO) {
      return setErreur("Image trop lourde (1 Mo maximum).");
    }
    if (complete) return setErreur(`Galerie complète : ${MAX_PHOTOS} photos au maximum.`);

    const legende = window.prompt("Légende de la photo (facultatif) :")?.trim() ?? "";
    setEnvoi(true);
    const res = await ajouterPhoto(fichier, legende);
    setEnvoi(false);
    if (champ.current) champ.current.value = "";
    if (res.erreur) return setErreur(res.erreur);
    recharger();
  }

  async function retirer(id: string) {
    if (!window.confirm("Retirer cette photo de votre fiche ?")) return;
    setErreur(null);
    const res = await supprimerPhoto(id);
    if (res.erreur) return setErreur(res.erreur);
    recharger();
  }

  const champFichier = (
    <input
      ref={champ}
      type="file"
      accept={TYPES_PHOTO.join(",")}
      onChange={(e) => envoyer(e.target.files)}
      className="hidden"
      aria-label="Ajouter une photo"
    />
  );

  /* ---------- Rendu mobile (grille de la maquette) ---------- */
  if (mobile) {
    return (
      <>
        <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
          {photos.length}/{MAX_PHOTOS} photos · {EXTENSIONS_PHOTO} · 1 Mo max
        </p>
        {/* Classes .gallery / .gphoto / .gadd : celles de la maquette mobile,
            déjà stylées dans app/mobile.css. */}
        <div className="gallery">
          {photos.map((photo) => (
            <div key={photo.id} className="gphoto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={photo.legende || "Photo du cabinet"}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
              <button
                type="button"
                className="del"
                onClick={() => retirer(photo.id)}
                aria-label={`Retirer la photo ${photo.legende || ""}`.trim()}
              >
                ✕
              </button>
            </div>
          ))}
          {!complete && (
            <button
              type="button"
              onClick={() => champ.current?.click()}
              disabled={envoi}
              className="gadd"
            >
              {envoi ? "Envoi…" : "＋ Ajouter"}
            </button>
          )}
        </div>
        {champFichier}
        {erreur && (
          <p role="alert" style={{ color: "var(--red)", fontSize: 12.5, fontWeight: 700, marginTop: 6 }}>
            {erreur}
          </p>
        )}
      </>
    );
  }

  /* ---------- Rendu web ---------- */
  return (
    <>
      <p className="mb-3 text-[12.5px] text-muted">
        <b className="font-bold text-ink">
          {photos.length}/{MAX_PHOTOS} photos
        </b>{" "}
        · Formats acceptés : {EXTENSIONS_PHOTO} · Taille max : 1 Mo par photo. Elles sont
        affichées sur votre fiche publique.
      </p>
      <div className="flex flex-wrap gap-[10px]">
        {photos.map((photo) => (
          <div
            key={photo.id}
            className="relative h-[104px] w-[132px] overflow-hidden rounded-[11px] border border-line"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt={photo.legende || "Photo du cabinet"}
              className="h-full w-full object-cover"
            />
            {photo.legende && (
              <span className="absolute inset-x-0 bottom-0 truncate bg-black/45 px-1.5 py-1 text-[10.5px] font-semibold text-white">
                {photo.legende}
              </span>
            )}
            <button
              type="button"
              onClick={() => retirer(photo.id)}
              aria-label={`Retirer la photo ${photo.legende || ""}`.trim()}
              className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-white/90 text-[11px] font-bold text-red hover:bg-white"
            >
              ✕
            </button>
          </div>
        ))}
        {!complete && (
          <button
            type="button"
            onClick={() => champ.current?.click()}
            disabled={envoi}
            className="grid h-[104px] w-[132px] place-items-center rounded-[11px] border-[1.5px] border-dashed border-[#CDE6F2] bg-teal-soft px-2 text-center text-[12px] font-bold text-blue transition-colors hover:bg-[#DCEEF6] disabled:opacity-60"
          >
            {envoi ? "Envoi…" : "＋ Ajouter une photo"}
          </button>
        )}
      </div>
      {champFichier}
      {complete && (
        <p className="mt-2 text-[12.5px] text-muted">
          Galerie complète — retirez une photo pour en ajouter une autre.
        </p>
      )}
      {erreur && (
        <p role="alert" className="mt-2 text-[12.5px] font-semibold text-red">
          {erreur}
        </p>
      )}
    </>
  );
}
