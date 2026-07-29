"use client";

import { useRef, useState } from "react";

/*
 * Photo de profil du médecin : aperçu, envoi vers Cloudinary (via
 * /api/photo-medecin) et retrait. Tant qu'aucune photo n'est enregistrée,
 * l'avatar à initiales reste affiché — c'est le repli de toute l'application.
 *
 * La validation (type, poids) est refaite côté serveur : celle d'ici sert
 * seulement à donner un message immédiat plutôt qu'un aller-retour inutile.
 */

const TAILLE_MAX = 5 * 1024 * 1024;
const TYPES_ACCEPTES = ["image/jpeg", "image/png", "image/webp"];

export default function PhotoProfil({
  photoUrl,
  initiales,
  gradient,
  taille = 72,
  onChangement,
}: {
  photoUrl: string | null;
  initiales: string;
  gradient: string;
  taille?: number;
  /** Notifie le parent après un envoi ou un retrait réussi. */
  onChangement?: (url: string | null) => void;
}) {
  const [url, setUrl] = useState(photoUrl);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const champ = useRef<HTMLInputElement>(null);

  async function envoyer(fichier: File) {
    setErreur(null);
    if (!TYPES_ACCEPTES.includes(fichier.type)) {
      setErreur("Utilisez un JPEG, un PNG ou un WebP.");
      return;
    }
    if (fichier.size > TAILLE_MAX) {
      setErreur("Image trop lourde (5 Mo maximum).");
      return;
    }
    setEnvoi(true);
    try {
      const corps = new FormData();
      corps.append("photo", fichier);
      const reponse = await fetch("/api/photo-medecin", { method: "POST", body: corps });
      const donnees = await reponse.json();
      if (!reponse.ok) {
        setErreur(donnees.erreur ?? "L'envoi a échoué.");
        return;
      }
      setUrl(donnees.photoUrl);
      onChangement?.(donnees.photoUrl);
    } catch {
      setErreur("Connexion perdue. Réessayez.");
    } finally {
      setEnvoi(false);
      // Permet de re-sélectionner le même fichier après une erreur.
      if (champ.current) champ.current.value = "";
    }
  }

  async function retirer() {
    setErreur(null);
    setEnvoi(true);
    try {
      const reponse = await fetch("/api/photo-medecin", { method: "DELETE" });
      const donnees = await reponse.json();
      if (!reponse.ok) {
        setErreur(donnees.erreur ?? "Le retrait a échoué.");
        return;
      }
      setUrl(null);
      onChangement?.(null);
    } catch {
      setErreur("Connexion perdue. Réessayez.");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      {url ? (
        // URL Cloudinary externe, déjà redimensionnée à l'envoi (400×400) :
        // next/image n'apporterait rien et imposerait de déclarer le domaine.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt="Votre photo de profil"
          width={taille}
          height={taille}
          className="flex-none rounded-[20px] object-cover"
          style={{ width: taille, height: taille }}
        />
      ) : (
        <span
          aria-hidden
          className="grid flex-none place-items-center rounded-[20px] font-extrabold text-white"
          style={{ width: taille, height: taille, background: gradient, fontSize: taille / 3 }}
        >
          {initiales}
        </span>
      )}

      <div>
        <input
          ref={champ}
          type="file"
          accept={TYPES_ACCEPTES.join(",")}
          className="hidden"
          onChange={(e) => {
            const fichier = e.target.files?.[0];
            if (fichier) envoyer(fichier);
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={envoi}
            onClick={() => champ.current?.click()}
            className="rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue transition-colors hover:border-teal disabled:cursor-not-allowed disabled:opacity-50"
          >
            {envoi ? "Envoi…" : url ? "Changer la photo" : "Ajouter une photo"}
          </button>
          {url && !envoi && (
            <button
              type="button"
              onClick={retirer}
              className="rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-muted transition-colors hover:border-[#E08E45] hover:text-[#C0392B]"
            >
              Retirer
            </button>
          )}
        </div>
        {erreur ? (
          <p className="mt-1.5 text-[11.5px] font-bold text-[#C0392B]">{erreur}</p>
        ) : (
          <p className="mt-1.5 text-[11.5px] text-muted">JPEG, PNG ou WebP · 5 Mo maximum</p>
        )}
      </div>
    </div>
  );
}
