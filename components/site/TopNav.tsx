import Link from "next/link";

/**
 * Barre de navigation du site public — reproduit la .topnav de la maquette web
 * (hauteur 66px, fond blanc, liens gris, boutons à droite).
 * - `droite="compte"` : bouton « Mon compte » (écrans résultats / fiche médecin)
 * - `minimale` : logo + langue uniquement (écrans réservation / confirmation)
 */
export default function TopNav({
  lienActif,
  droite = "auth",
  minimale = false,
}: {
  lienActif?: "trouver";
  droite?: "auth" | "compte";
  minimale?: boolean;
}) {
  return (
    <nav className="sticky top-0 z-20 hidden h-[66px] items-center gap-[26px] border-b border-line bg-white px-4 md:flex md:px-[30px]">
      <Link href="/" className="flex items-center gap-[9px] text-[17px] font-extrabold">
        <span
          aria-hidden
          className="grid h-[30px] w-[30px] place-items-center rounded-[9px] bg-[linear-gradient(135deg,var(--teal),var(--blue))] text-[13px] font-extrabold text-white"
        >
          D
        </span>
        Docteur<span className="text-teal">224</span>
      </Link>
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
          <Link href="/espace-medecin" className="text-[13.5px] font-semibold text-muted hover:text-blue">
            Pour les médecins
          </Link>
        </div>
      )}
      <div className="ml-auto flex items-center gap-[14px]">
        <span className="hidden rounded-lg border border-line px-[10px] py-[6px] text-[12.5px] font-bold text-muted sm:inline">
          FR ⌄
        </span>
        {!minimale &&
          (droite === "compte" ? (
            <Link
              href="/mes-rendez-vous"
              className="rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
            >
              Mon compte
            </Link>
          ) : (
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
          ))}
      </div>
    </nav>
  );
}
