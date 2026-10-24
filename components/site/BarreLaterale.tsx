"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import ClocheNotifications from "@/components/site/ClocheNotifications";
import { seDeconnecter } from "@/lib/auth";

/*
 * Barre latérale des cinq espaces connectés (patient, médecin, assistant,
 * établissement, administrateur). Elle était recopiée à l'identique dans
 * chaque coquille ; elle ne l'est plus qu'ici.
 *
 *  - ≥ lg (ordinateur) : la colonne de 236 px, menu toujours déplié ;
 *  - md → lg (tablette) : un bandeau compact — identité, cloche, bouton
 *    « Menu ». Déplié en permanence, le menu empilait près de 600 px de
 *    liens au-dessus de chaque page avant qu'on en voie le premier mot.
 *    Ouvert, il se range sur deux colonnes ; il se referme au changement
 *    de page et à Échap ;
 *  - < md (téléphone) : absente, la barre haute et la barre d'onglets
 *    mobiles prennent le relais.
 */

export interface LienEspace {
  href: string;
  icone: string;
  label: string;
}

export default function BarreLaterale({
  avatar,
  fondAvatar,
  avatarEmoji = false,
  nom,
  sousTitre,
  liens,
  sousRoutes = false,
}: {
  /** Initiales ou emoji affichés dans la pastille. */
  avatar: ReactNode;
  fondAvatar: string;
  /** Emoji plutôt qu'initiales : taille de glyphe différente. */
  avatarEmoji?: boolean;
  nom: ReactNode;
  sousTitre: ReactNode;
  liens: LienEspace[];
  /** Surligne aussi un lien sur ses sous-pages (ex. /mes-rendez-vous/[id]). */
  sousRoutes?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  /* Le chemin est porté dans l'état : le menu n'est ouvert que sur la page
     où on l'a ouvert. Changer de page le referme sans effet correctif — le
     linter interdit un setState en tête d'effet. */
  const [etat, setEtat] = useState({ ouvert: false, chemin: pathname });
  const ouvert = etat.ouvert && etat.chemin === pathname;

  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEtat({ ouvert: false, chemin: pathname });
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [ouvert, pathname]);

  const estActif = (href: string) =>
    pathname === href || (sousRoutes && pathname.startsWith(`${href}/`));

  const classeLigne =
    "flex items-center gap-[11px] rounded-[11px] px-3 py-[11px] text-[13.5px] transition-colors";

  return (
    <aside className="hidden border-b border-line bg-white px-4 py-3 md:block lg:border-b-0 lg:border-r lg:py-[22px]">
      <div className="flex items-center gap-[11px] px-1.5 lg:mb-[14px] lg:border-b lg:border-line lg:pb-[18px]">
        <span
          aria-hidden
          className={`grid h-[42px] w-[42px] flex-none place-items-center rounded-xl text-white ${
            avatarEmoji ? "text-lg" : "text-[15px] font-extrabold"
          }`}
          style={{ background: fondAvatar }}
        >
          {avatar}
        </span>
        <div className="min-w-0">
          <b className="block truncate text-[13.5px] font-extrabold lg:whitespace-normal">{nom}</b>
          <small className="block truncate text-[11.5px] text-muted">{sousTitre}</small>
        </div>
        {/* La cloche vit ici sur web : la barre latérale est le seul en-tête
            permanent des espaces. */}
        <div className="ml-auto flex flex-none items-center gap-2">
          <ClocheNotifications />
          <button
            type="button"
            aria-expanded={ouvert}
            aria-controls="menu-espace"
            onClick={() => setEtat({ ouvert: !ouvert, chemin: pathname })}
            className="inline-flex min-h-11 items-center gap-2 rounded-[11px] border border-line bg-white px-3.5 text-[13px] font-bold text-blue transition-colors hover:bg-bg lg:hidden"
          >
            {/* Trois traits dessinés : ils suivent la couleur du texte. */}
            <span aria-hidden className="grid gap-[3px]">
              <span className="block h-[2px] w-4 rounded bg-current" />
              <span className="block h-[2px] w-4 rounded bg-current" />
              <span className="block h-[2px] w-4 rounded bg-current" />
            </span>
            {ouvert ? "Fermer" : "Menu"}
          </button>
        </div>
      </div>

      <nav
        id="menu-espace"
        aria-label="Menu de l’espace"
        className={`${
          ouvert ? "mt-3 grid grid-cols-2 gap-[3px] border-t border-line pt-3" : "hidden"
        } lg:mt-0 lg:flex lg:flex-col lg:gap-[3px] lg:border-t-0 lg:pt-0`}
      >
        {liens.map((lien) => {
          const actif = estActif(lien.href);
          return (
            <Link
              key={lien.href}
              href={lien.href}
              aria-current={actif ? "page" : undefined}
              className={`${classeLigne} ${
                actif ? "bg-teal-soft font-bold text-blue" : "font-semibold text-muted hover:bg-bg"
              }`}
            >
              <span className="text-base" aria-hidden>
                {lien.icone}
              </span>
              {lien.label}
            </Link>
          );
        })}
        {/* Vraie déconnexion, et non un lien vers l'accueil qui laissait la
            session ouverte. */}
        <button
          type="button"
          onClick={async () => {
            await seDeconnecter();
            router.push("/");
          }}
          className={`${classeLigne} text-left font-semibold text-muted hover:bg-bg`}
        >
          <span className="text-base" aria-hidden>
            ↩️
          </span>
          Déconnexion
        </button>
      </nav>
    </aside>
  );
}
