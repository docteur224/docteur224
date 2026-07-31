"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFavori } from "@/lib/favoris";

/*
 * Cœur « mettre ce médecin de côté ». Rendu sur la fiche publique, donc
 * aussi devant un visiteur non connecté : dans ce cas le clic n'échoue pas
 * en silence, il emmène vers la connexion en gardant l'adresse de retour.
 */
export default function BoutonFavori({
  medecinId,
  nom,
  mobile = false,
}: {
  medecinId: string;
  nom: string;
  mobile?: boolean;
}) {
  const router = useRouter();
  const { estFavori, pret, basculer } = useFavori(medecinId);
  const [enCours, setEnCours] = useState(false);

  async function cliquer() {
    if (enCours) return;
    setEnCours(true);
    const res = await basculer();
    setEnCours(false);
    if (res.erreur === "non_connecte") {
      router.push(`/connexion?retour=${encodeURIComponent(window.location.pathname)}`);
    }
  }

  const libelle = estFavori ? `Retirer ${nom} de mes favoris` : `Ajouter ${nom} à mes favoris`;

  if (mobile) {
    return (
      <button
        type="button"
        onClick={cliquer}
        aria-pressed={estFavori}
        aria-label={libelle}
        title={libelle}
        className="btnm gh"
        style={{
          opacity: pret ? 1 : 0.5,
          color: estFavori ? "#c0392b" : undefined,
          borderColor: estFavori ? "#f3c9c2" : undefined,
        }}
      >
        {estFavori ? "♥ Favori" : "♡ Favori"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={cliquer}
      aria-pressed={estFavori}
      aria-label={libelle}
      title={libelle}
      className={`flex items-center gap-1.5 rounded-[9px] border-[1.5px] px-3 py-1.5 text-[11.5px] font-bold transition-colors ${
        estFavori
          ? "border-[#F3C9C2] bg-red-soft text-red"
          : "border-line bg-white text-blue hover:bg-bg"
      } ${pret ? "" : "opacity-50"}`}
    >
      <span aria-hidden className="text-[13px] leading-none">
        {estFavori ? "♥" : "♡"}
      </span>
      {estFavori ? "En favori" : "Favori"}
    </button>
  );
}
