import Link from "next/link";

/*
 * Pagination par liens, pour les écrans rendus côté serveur.
 *
 * La page de résultats est un composant serveur : le hook `usePagination`
 * n'y a pas sa place. Porter la page dans l'URL y est de toute façon
 * préférable — un lien vers la page 3 d'une recherche reste partageable, et
 * les moteurs peuvent suivre la pagination d'un annuaire public.
 *
 * Les autres paramètres de recherche sont conservés tels quels : perdre les
 * filtres en changeant de page serait le défaut le plus visible.
 */
export default function PaginationLiens({
  page,
  pages,
  total,
  premier,
  dernier,
  parametres,
  chemin = "/resultats",
  libelle = "résultats",
}: {
  /** Page courante, à partir de 1. */
  page: number;
  pages: number;
  total: number;
  premier: number;
  dernier: number;
  /** Paramètres de recherche courants, hors `page`. */
  parametres: URLSearchParams;
  chemin?: string;
  libelle?: string;
}) {
  if (total === 0 || pages <= 1) return null;

  const lien = (n: number) => {
    const p = new URLSearchParams(parametres);
    if (n <= 1) p.delete("page");
    else p.set("page", String(n));
    const requete = p.toString();
    return requete ? `${chemin}?${requete}` : chemin;
  };

  const classe =
    "rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue transition-colors hover:bg-bg";
  const inactif = "rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-muted opacity-40";

  return (
    <nav
      aria-label="Pagination des résultats"
      className="flex flex-wrap items-center justify-between gap-3 pt-4"
    >
      <span className="text-[11.5px] text-muted">
        {premier}–{dernier} sur {total} {libelle}
      </span>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={lien(page - 1)} rel="prev" className={classe}>
            ‹ Précédent
          </Link>
        ) : (
          <span className={inactif}>‹ Précédent</span>
        )}
        <span className="text-[11.5px] font-bold text-muted">
          {page} / {pages}
        </span>
        {page < pages ? (
          <Link href={lien(page + 1)} rel="next" className={classe}>
            Suivant ›
          </Link>
        ) : (
          <span className={inactif}>Suivant ›</span>
        )}
      </div>
    </nav>
  );
}
