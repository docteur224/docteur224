"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Icone from "@/components/site/Icone";

/*
 * Palette d'actions — lanceur rapide des actions d'un écran.
 *
 * Volontairement générique et sans navigation ni recherche de données : elle
 * reçoit une liste d'actions prêtes à l'emploi et se contente de les filtrer
 * et de les exécuter. Aujourd'hui, seule la fiche patient s'en sert, pour ses
 * propres gestes (changer de section, nouveau RDV, appeler…).
 *
 * Ouverte au clavier (Ctrl/Cmd + K) ou au clic sur la pastille ; flèches +
 * Entrée pour exécuter, Échap ou clic extérieur pour fermer. Pastille côté
 * bureau (`hidden md:…`).
 */

export type ActionPalette = {
  id: string;
  /** En-tête sous lequel l'action est rangée (ordre d'apparition conservé). */
  groupe: string;
  icone?: ReactNode;
  label: string;
  sous?: string;
  run: () => void;
};

export default function PaletteCommandes({
  actions,
  libelleBouton = "Rechercher une action…",
}: {
  actions: ActionPalette[];
  libelleBouton?: string;
}) {
  const [ouvert, setOuvert] = useState(false);

  // Raccourci global : Ctrl/Cmd + K ouvre ou ferme.
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOuvert((v) => !v);
      }
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        className="hidden w-full max-w-[560px] items-center gap-2.5 rounded-xl border border-line bg-white px-3.5 py-2.5 text-left text-[13px] text-muted shadow-sm transition-colors hover:border-muted md:flex"
      >
        <Icone nom="loupe" taille={16} className="flex-none" />
        <span className="flex-1">{libelleBouton}</span>
        <kbd className="flex-none rounded-md border border-line bg-bg px-1.5 py-0.5 font-sans text-[11px] font-bold text-muted">
          Ctrl K
        </kbd>
      </button>

      {ouvert && <Panneau actions={actions} libelleBouton={libelleBouton} onFermer={() => setOuvert(false)} />}
    </>
  );
}

function Panneau({
  actions,
  libelleBouton,
  onFermer,
}: {
  actions: ActionPalette[];
  libelleBouton: string;
  onFermer: () => void;
}) {
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const champRef = useRef<HTMLInputElement>(null);
  const listeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    champRef.current?.focus();
  }, []);

  const lancer = (a: ActionPalette) => {
    onFermer();
    a.run();
  };

  const qlc = q.trim().toLowerCase();
  const filtrees = actions.filter(
    (a) => !qlc || a.label.toLowerCase().includes(qlc) || a.groupe.toLowerCase().includes(qlc)
  );

  // Regroupe en conservant l'ordre d'apparition des groupes.
  const groupes: { titre: string; items: ActionPalette[] }[] = [];
  for (const a of filtrees) {
    let g = groupes.find((x) => x.titre === a.groupe);
    if (!g) {
      g = { titre: a.groupe, items: [] };
      groupes.push(g);
    }
    g.items.push(a);
  }

  const plats = groupes.flatMap((g) => g.items);
  const actif = Math.min(index, Math.max(0, plats.length - 1));

  const surTouche = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onFermer();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, plats.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const a = plats[actif];
      if (a) lancer(a);
    }
  };

  useEffect(() => {
    listeRef.current
      ?.querySelector<HTMLElement>(`[data-actif="true"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [actif]);

  let compteur = -1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Actions"
      className="fixed inset-0 z-[1000] flex items-start justify-center bg-ink/40 p-4 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFermer();
      }}
    >
      <div
        className="flex max-h-[70vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border border-line bg-bg shadow-xl"
        onKeyDown={surTouche}
      >
        <div className="flex items-center gap-2.5 border-b border-line bg-white px-3.5 py-3">
          <Icone nom="loupe" taille={17} className="flex-none text-muted" />
          <input
            ref={champRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIndex(0);
            }}
            placeholder={libelleBouton}
            aria-label="Rechercher une action"
            className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted"
          />
          <kbd className="flex-none rounded-md border border-line bg-bg px-1.5 py-0.5 text-[11px] font-bold text-muted">
            Échap
          </kbd>
        </div>

        <div ref={listeRef} className="min-h-0 flex-1 overflow-y-auto p-2">
          {plats.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-muted">
              Aucune action pour « {q.trim()} ».
            </p>
          ) : (
            groupes.map((g) => (
              <div key={g.titre} className="mb-1.5 last:mb-0">
                <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.04em] text-muted">
                  {g.titre}
                </div>
                {g.items.map((it) => {
                  compteur += 1;
                  const position = compteur;
                  const estActif = position === actif;
                  return (
                    <button
                      key={it.id}
                      type="button"
                      data-actif={estActif}
                      onMouseMove={() => setIndex(position)}
                      onClick={() => lancer(it)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                        estActif ? "bg-teal-soft" : "hover:bg-white"
                      }`}
                    >
                      <span aria-hidden className="grid h-5 w-5 flex-none place-items-center text-muted">
                        {it.icone}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold text-ink">{it.label}</span>
                        {it.sous && <span className="block truncate text-[11.5px] text-muted">{it.sous}</span>}
                      </span>
                      {estActif && (
                        <kbd className="flex-none rounded-md border border-line bg-white px-1.5 py-0.5 text-[10.5px] font-bold text-muted">
                          ↵
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
