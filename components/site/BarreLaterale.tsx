"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import BasculeMode from "@/components/site/BasculeMode";
import ClocheNotifications from "@/components/site/ClocheNotifications";
import { seDeconnecter } from "@/lib/auth";
import {
  basculerPliage,
  instantanePliage,
  instantanePliageServeur,
  sAbonnerPliage,
} from "@/lib/pliage-menu";

/*
 * Barre latérale des cinq espaces connectés (patient, médecin, assistant,
 * établissement, administrateur). Elle était recopiée à l'identique dans
 * chaque coquille ; elle ne l'est plus qu'ici.
 *
 *  - ≥ lg (ordinateur) : la colonne du menu. Dépliée par défaut (236 px,
 *    icône à gauche, libellé à droite — le rendu historique), elle se plie
 *    sur un bouton discret en un rail étroit (84 px, icône au-dessus du
 *    libellé centré sur deux lignes). Le choix est global et mémorisé
 *    (lib/pliage-menu), la largeur transite en douceur (CSS .cadre-espace) ;
 *  - md → lg (tablette) : un bandeau compact — identité, cloche, bouton
 *    « Menu ». Le pliage ne s'y applique pas : il est propre à l'ordinateur.
 *    Ouvert, le menu se range sur deux colonnes ; il se referme au changement
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
  photo = null,
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
  /** Photo du professionnel (Cloudinary) : remplace la pastille si elle existe. */
  photo?: string | null;
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

  /* État plié/déplié (ordinateur seulement), lu sur l'attribut data-sidebar
     posé par le script PliageLocal — même mécanique que le mode clair/sombre.
     Au rendu serveur il vaut « déplié », puis React réaligne à l'hydratation. */
  const pliage = useSyncExternalStore(
    sAbonnerPliage,
    instantanePliage,
    instantanePliageServeur,
  );
  const plie = pliage === "plie";

  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEtat({ ouvert: false, chemin: pathname });
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [ouvert, pathname]);

  /* Un seul lien actif : le plus précis. Sans quoi « /patient » (Tableau de
     bord) restait surligné sur toutes les pages /patient/…, à côté de la
     page réellement ouverte. */
  const couvre = (href: string) => pathname === href || (sousRoutes && pathname.startsWith(`${href}/`));
  const lienActif = liens
    .filter((l) => couvre(l.href))
    .reduce<string | null>((meilleur, l) => (!meilleur || l.href.length > meilleur.length ? l.href : meilleur), null);
  const estActif = (href: string) => href === lienActif;

  const classeLigne =
    "flex items-center gap-[11px] rounded-[11px] px-3 py-[11px] text-[13.5px] transition-colors";
  /* Rail replié (≥ lg uniquement) : icône au-dessus, libellé centré sous elle.
     Classes toutes préfixées lg: — en tablette/mobile le bandeau reste intact. */
  const ligneRail = plie
    ? "lg:flex-col lg:items-center lg:justify-center lg:gap-1 lg:px-1 lg:py-2.5 lg:text-center"
    : "";
  const classeIcone = `text-base${plie ? " lg:text-[22px]" : ""}`;
  const classeLibelle = plie
    ? "lg:block lg:w-full lg:text-[10.5px] lg:font-semibold lg:leading-[1.15] lg:line-clamp-2"
    : undefined;

  return (
    <aside
      className={`hidden border-b border-line bg-white px-4 py-3 md:block lg:border-b-0 lg:border-r lg:py-[22px] ${
        plie ? "lg:px-2" : ""
      }`}
    >
      {/* Sur ordinateur, l'identité a sa ligne à elle et les commandes
          (clair/sombre, cloche) passent dessous : dans 236 px, les quatre côte
          à côte ne laissaient au nom qu'une trentaine de pixels — « Ma… Dia… ».
          Replié, tout se centre en colonne dans le rail. */}
      <div
        className={`flex items-center gap-[11px] px-1.5 lg:mb-[14px] lg:border-b lg:border-line lg:pb-[18px] ${
          plie ? "lg:flex-col lg:items-center lg:gap-2 lg:px-0" : "lg:flex-wrap"
        }`}
      >
        {photo ? (
          // Image Cloudinary déjà redimensionnée à l'envoi : next/image
          // n'apporterait rien (même choix qu'AvatarMedecin).
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="h-[42px] w-[42px] flex-none rounded-xl object-cover" />
        ) : (
          <span
            aria-hidden
            className={`grid h-[42px] w-[42px] flex-none place-items-center rounded-xl text-white ${
              avatarEmoji ? "text-lg" : "text-[15px] font-extrabold"
            }`}
            style={{ background: fondAvatar }}
          >
            {avatar}
          </span>
        )}
        {/* Identité masquée dans le rail replié (≥ lg) : illisible dans 84 px. */}
        <div className={`min-w-0 lg:flex-1 ${plie ? "lg:hidden" : ""}`}>
          <b className="block truncate text-[13.5px] font-extrabold leading-tight lg:line-clamp-2 lg:whitespace-normal lg:break-words">
            {nom}
          </b>
          <small className="mt-0.5 block truncate text-[11.5px] text-muted">{sousTitre}</small>
        </div>
        {/* La cloche vit ici sur web : la barre latérale est le seul en-tête
            permanent des espaces. */}
        <div
          className={`ml-auto flex flex-none items-center gap-2 ${
            plie
              ? "lg:ml-0 lg:mt-2 lg:w-full lg:flex-col lg:items-center lg:justify-center"
              : "lg:mt-3 lg:w-full lg:justify-end"
          }`}
        >
          {/* Bascule clair/sombre : la barre latérale est le seul en-tête
              permanent des espaces connectés (comme la cloche). */}
          <BasculeMode />
          <ClocheNotifications />
          {/* Plier / déplier — ordinateur seulement. En tablette le menu passe
              déjà par le tiroir « Menu » ci-dessous. */}
          <button
            type="button"
            onClick={basculerPliage}
            aria-label={plie ? "Déplier le menu" : "Plier le menu"}
            title={plie ? "Déplier le menu" : "Plier le menu"}
            className="hidden h-8 w-8 items-center justify-center rounded-[10px] border border-line bg-white text-[15px] font-bold text-muted transition-colors hover:bg-bg hover:text-blue lg:inline-flex"
          >
            <span aria-hidden>{plie ? "»" : "«"}</span>
          </button>
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
        } lg:mt-0 lg:flex lg:flex-col lg:border-t-0 lg:pt-0 ${plie ? "lg:gap-1.5" : "lg:gap-[3px]"}`}
      >
        {liens.map((lien) => {
          const actif = estActif(lien.href);
          return (
            <Link
              key={lien.href}
              href={lien.href}
              aria-current={actif ? "page" : undefined}
              title={plie ? lien.label : undefined}
              className={`${classeLigne} ${ligneRail} ${
                actif ? "bg-teal-soft font-bold text-blue" : "font-semibold text-muted hover:bg-bg"
              }`}
            >
              <span className={classeIcone} aria-hidden>
                {lien.icone}
              </span>
              <span className={classeLibelle}>{lien.label}</span>
            </Link>
          );
        })}
        {/* Vraie déconnexion, et non un lien vers l'accueil qui laissait la
            session ouverte. */}
        <button
          type="button"
          title={plie ? "Déconnexion" : undefined}
          onClick={async () => {
            await seDeconnecter();
            router.push("/");
          }}
          className={`${classeLigne} ${ligneRail} text-left font-semibold text-muted hover:bg-bg`}
        >
          <span className={classeIcone} aria-hidden>
            ↩️
          </span>
          <span className={classeLibelle}>Déconnexion</span>
        </button>
      </nav>
    </aside>
  );
}
