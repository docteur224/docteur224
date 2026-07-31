"use client";

import { useState } from "react";

/*
 * Pagination partagée par tous les écrans à liste.
 *
 * Découpage côté client : les données sont déjà chargées par les hooks
 * existants, et le but est ici de rendre une longue liste parcourable, pas
 * d'alléger la requête. Les deux seuls écrans où le volume menaçait vraiment
 * la base — les patients d'un médecin et d'un assistant — paginent en SQL
 * (RPC `patients_du_medecin`) et n'utilisent donc pas ce hook.
 */

export function usePagination<T>(
  elements: T[],
  parPage = 10
): {
  page: number;
  pages: number;
  setPage: (p: number) => void;
  tranche: T[];
  total: number;
  premier: number;
  dernier: number;
} {
  const [pageDemandee, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(elements.length / parPage));
  /* Borné à la LECTURE et non corrigé par un effet : quand un filtre réduit
     la liste, la page courante peut sortir des clous. Recadrer ici évite un
     setState dans un effet, que le linter React interdit dans ce projet. */
  const page = Math.min(Math.max(pageDemandee, 0), pages - 1);
  const debut = page * parPage;

  return {
    page,
    pages,
    setPage,
    tranche: elements.slice(debut, debut + parPage),
    total: elements.length,
    premier: elements.length === 0 ? 0 : debut + 1,
    dernier: Math.min(elements.length, debut + parPage),
  };
}

export default function Pagination({
  page,
  pages,
  total,
  premier,
  dernier,
  onPage,
  /** Nom de ce qui est compté, au pluriel : « rendez-vous », « avis »… */
  libelle = "éléments",
}: {
  page: number;
  pages: number;
  total: number;
  premier: number;
  dernier: number;
  onPage: (p: number) => void;
  libelle?: string;
}) {
  // Une seule page tient à l'écran : le compteur n'apprendrait rien.
  if (total === 0 || pages <= 1) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
      <span className="text-[11.5px] text-muted">
        {premier}–{dernier} sur {total} {libelle}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page === 0}
          className="rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue transition-colors hover:bg-bg disabled:cursor-not-allowed disabled:opacity-40"
        >
          ‹ Précédent
        </button>
        <span className="text-[11.5px] font-bold text-muted">
          {page + 1} / {pages}
        </span>
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= pages - 1}
          className="rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue transition-colors hover:bg-bg disabled:cursor-not-allowed disabled:opacity-40"
        >
          Suivant ›
        </button>
      </div>
    </div>
  );
}
