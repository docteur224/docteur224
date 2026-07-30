import Link from "next/link";
import BoutonsCompteWeb from "@/components/site/BoutonsCompteWeb";
import ClocheNotifications from "@/components/site/ClocheNotifications";
import Logo from "@/components/site/Logo";

/**
 * Barre de navigation du site public — reproduit la .topnav de la maquette web
 * (hauteur 66px, fond blanc, liens gris, boutons à droite).
 * - `minimale` : logo + langue uniquement (écrans réservation / confirmation)
 *
 * Le côté droit suit la session (voir BoutonsCompteWeb) : « Mon espace » pour
 * un compte connecté, « Se connecter / S'inscrire » sinon.
 */
export default function TopNav({
  lienActif,
  minimale = false,
}: {
  lienActif?: "trouver";
  minimale?: boolean;
}) {
  return (
    <nav className="sticky top-0 z-20 hidden h-[66px] items-center gap-[26px] border-b border-line bg-white px-4 md:flex md:px-[30px]">
      <Logo hauteur={38} priority className="flex items-center" />
      {!minimale && (
        <div className="ml-2 hidden gap-[22px] md:flex">
          <Link
            href="/resultats"
            className={`text-[13.5px] font-semibold hover:text-blue ${
              lienActif === "trouver" ? "text-blue" : "text-muted"
            }`}
          >
            Trouver un médecin
          </Link>
          <Link href="/#comment-ca-marche" className="text-[13.5px] font-semibold text-muted hover:text-blue">
            Comment ça marche
          </Link>
          {/* Destination : l'inscription professionnelle. L'espace médecin
              n'a de sens que pour un compte déjà créé et validé. */}
          <Link
            href="/inscription/professionnel"
            className="text-[13.5px] font-semibold text-muted hover:text-blue"
          >
            Pour les médecins
          </Link>
        </div>
      )}
      <div className="ml-auto flex items-center gap-[14px]">
        {/* Ne s'affiche que pour un compte connecté (voir le composant). */}
        <ClocheNotifications />
        <span className="hidden rounded-lg border border-line px-[10px] py-[6px] text-[12.5px] font-bold text-muted sm:inline">
          FR ⌄
        </span>
        {!minimale && <BoutonsCompteWeb />}
      </div>
    </nav>
  );
}
