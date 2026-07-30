"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Logo from "@/components/site/Logo";
import { seDeconnecter } from "@/lib/auth";
import { useProfilConnecte } from "@/lib/patient";

/**
 * Menu ☰ de la barre haute mobile — la navigation du *site* (pages
 * publiques), là où le tiroir de l'avatar porte celle du *compte*.
 *
 * Il est offert à tout le monde, connecté ou non : un visiteur n'a ni avatar
 * ni tabbar, c'était donc sa seule porte d'entrée vers À propos, la FAQ ou
 * l'inscription.
 */
const LIENS = [
  { href: "/", icone: "🏠", label: "Accueil" },
  { href: "/a-propos", icone: "ℹ️", label: "À propos" },
  { href: "/faq", icone: "❓", label: "FAQ" },
  { href: "/blog", icone: "📰", label: "Blog" },
];

export default function MenuPublic() {
  const { profil } = useProfilConnecte();
  const pathname = usePathname();
  const router = useRouter();

  // L'écran d'ouverture est porté par l'état : le menu se referme de lui-même
  // au changement d'URL, sans effet qui appellerait setState (interdit par
  // react-hooks/set-state-in-effect).
  const [etat, setEtat] = useState({ ouvert: false, chemin: pathname });
  const ouvert = etat.ouvert && etat.chemin === pathname;
  const fermer = useCallback(
    () => setEtat({ ouvert: false, chemin: pathname }),
    [pathname]
  );

  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") fermer();
    };
    document.addEventListener("keydown", surTouche);
    const debordement = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", surTouche);
      document.body.style.overflow = debordement;
    };
  }, [ouvert, fermer]);

  // Réservé aux visiteurs et aux patients : dans un espace professionnel, le
  // tiroir du compte tient déjà ce rôle, et une quatrième action surchargerait
  // la barre.
  if (profil && profil.role !== "patient") return null;

  return (
    <>
      <button
        type="button"
        className="tb-btn"
        aria-label="Menu du site"
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        onClick={() => setEtat({ ouvert: true, chemin: pathname })}
      >
        <span className="tb-tirets" aria-hidden />
      </button>

      <div className={`tiroir-hote md:hidden${ouvert ? " ouvert" : ""}`} aria-hidden={!ouvert}>
        <button
          type="button"
          className="tiroir-voile"
          aria-label="Fermer le menu"
          tabIndex={ouvert ? 0 : -1}
          onClick={() => fermer()}
        />
        <div className="tiroir" role="dialog" aria-modal={ouvert} aria-label="Menu du site">
          <div className="tiroir-tete">
            <Logo hauteur={30} lien={null} />
            <button
              type="button"
              className="tb-btn"
              style={{ marginLeft: "auto" }}
              aria-label="Fermer le menu"
              tabIndex={ouvert ? 0 : -1}
              onClick={() => fermer()}
            >
              ✕
            </button>
          </div>

          <nav className="tiroir-liens" aria-label="Navigation du site">
            {LIENS.map((l) => {
              const actif = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={actif ? "on" : undefined}
                  aria-current={actif ? "page" : undefined}
                  tabIndex={ouvert ? 0 : -1}
                >
                  <span className="i" aria-hidden>
                    {l.icone}
                  </span>
                  {l.label}
                </Link>
              );
            })}

            {/* Classe dédiée : `.tiroir-liens a` l'emporterait sur `.btn`
                (spécificité) et le bouton perdrait sa couleur. */}
            <Link href="/resultats" className="tiroir-cta" tabIndex={ouvert ? 0 : -1}>
              📅 Prendre rendez-vous
            </Link>

            <div className="tiroir-separateur" role="presentation" />

            {profil ? (
              <button
                type="button"
                className="tiroir-quitter"
                tabIndex={ouvert ? 0 : -1}
                onClick={async () => {
                  fermer();
                  await seDeconnecter();
                  router.push("/");
                }}
              >
                <span className="i" aria-hidden>
                  ↩️
                </span>
                Se déconnecter
              </button>
            ) : (
              <Link href="/connexion" tabIndex={ouvert ? 0 : -1}>
                <span className="i" aria-hidden>
                  🔐
                </span>
                Se connecter
              </Link>
            )}
          </nav>
        </div>
      </div>
    </>
  );
}
