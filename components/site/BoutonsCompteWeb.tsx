"use client";

import Link from "next/link";
import { ESPACE_PAR_ROLE, type Role } from "@/lib/auth";
import { useProfilConnecte } from "@/lib/patient";

/**
 * Côté droit du TopNav, selon la session : « Mon espace » pour un compte
 * connecté, « Se connecter / S'inscrire » pour un visiteur.
 *
 * Le TopNav affichait jusqu'ici « Se connecter » à tout le monde, y compris
 * à un utilisateur déjà identifié — qui voyait donc sa cloche de
 * notifications à côté d'une invitation à se connecter.
 */
export default function BoutonsCompteWeb() {
  const { profil, chargement } = useProfilConnecte();

  // Réserve la largeur pendant la lecture de la session, pour que la barre ne
  // se réorganise pas sous les yeux.
  if (chargement) return <span className="h-[38px] w-[150px]" aria-hidden />;

  if (profil) {
    const espace = ESPACE_PAR_ROLE[profil.role as Role] ?? "/patient";
    return (
      <Link
        href={espace}
        className="rounded-[11px] border-[1.5px] border-line bg-white px-[16px] py-[9px] text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
      >
        Mon espace
      </Link>
    );
  }

  return (
    <>
      <Link href="/connexion" className="text-[13.5px] font-bold text-blue">
        Se connecter
      </Link>
      <Link
        href="/inscription"
        className="rounded-[11px] bg-teal px-[18px] py-[11px] text-[13.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
      >
        S&apos;inscrire
      </Link>
    </>
  );
}
