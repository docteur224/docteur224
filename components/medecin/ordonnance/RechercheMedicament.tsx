"use client";

import { useEffect, useId, useState } from "react";
import { rechercherMedicaments } from "@/lib/medicaments";
import { libelleMedicament, type MedicamentRef } from "@/lib/prescription";

/*
 * Recherche d'un médicament dans la base (DCI ou nom commercial), avec repli
 * sur la saisie libre : un produit absent de la base reste prescriptible —
 * il ne bénéficie simplement pas de l'alerte par classe.
 *
 * Motif ARIA « combobox » : flèches pour parcourir, Entrée pour choisir,
 * Échap pour refermer.
 */

export interface ChoixMedicament {
  medicamentId: string | null;
  libelle: string;
  dci: string | null;
  classe: string | null;
}

export default function RechercheMedicament({
  idChamp,
  onChoisir,
  autoFocus,
}: {
  idChamp: string;
  onChoisir: (choix: ChoixMedicament) => void;
  autoFocus?: boolean;
}) {
  const liste = useId();
  const [saisie, setSaisie] = useState("");
  const [resultat, setResultat] = useState<{ pour: string; items: MedicamentRef[] } | null>(null);
  const [actif, setActif] = useState(0);
  const [ouvert, setOuvert] = useState(false);

  // Recherche temporisée (300 ms) : pas une requête par frappe.
  useEffect(() => {
    const q = saisie.trim();
    if (q.length < 3) return;
    let vivant = true;
    const minuteur = setTimeout(async () => {
      const items = await rechercherMedicaments(q);
      if (vivant) setResultat({ pour: q, items });
    }, 300);
    return () => {
      vivant = false;
      clearTimeout(minuteur);
    };
  }, [saisie]);

  const q = saisie.trim();
  const items = q.length >= 3 && resultat?.pour === q ? resultat.items : [];
  const enAttente = q.length >= 3 && resultat?.pour !== q;
  // Dernière option : le produit tel que tapé.
  const options: ChoixMedicament[] = [
    ...items.map((m) => ({ medicamentId: m.id, libelle: libelleMedicament(m), dci: m.dci, classe: m.classe })),
    ...(q.length >= 2 ? [{ medicamentId: null, libelle: q, dci: null, classe: null }] : []),
  ];
  const visible = ouvert && options.length > 0;

  function choisir(o: ChoixMedicament) {
    onChoisir(o);
    setSaisie("");
    setOuvert(false);
  }

  return (
    <div className="relative">
      <input
        id={idChamp}
        role="combobox"
        aria-expanded={visible}
        aria-controls={liste}
        aria-autocomplete="list"
        aria-activedescendant={visible ? `${liste}-${actif}` : undefined}
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder="Rechercher : amoxicilline, paracétamol…"
        value={saisie}
        onChange={(e) => {
          setSaisie(e.target.value);
          setActif(0);
          setOuvert(true);
        }}
        onFocus={() => setOuvert(true)}
        onBlur={() => setTimeout(() => setOuvert(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOuvert(true);
            setActif((i) => Math.min(options.length - 1, i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActif((i) => Math.max(0, i - 1));
          } else if (e.key === "Enter" && visible) {
            e.preventDefault();
            choisir(options[Math.min(actif, options.length - 1)]);
          } else if (e.key === "Escape") {
            setOuvert(false);
          }
        }}
        className="w-full rounded-[11px] border border-line bg-white px-[13px] py-2.5 text-[13.5px] outline-none focus:border-teal pointer-coarse:min-h-11"
      />
      {visible && (
        <ul
          id={liste}
          role="listbox"
          className="ui-dropdown-in absolute left-0 right-0 top-full z-30 mt-1 max-h-[min(50vh,320px)] overflow-auto rounded-xl border border-line bg-white py-1 shadow-[0_10px_26px_rgba(16,59,80,.14)]"
        >
          {options.map((o, i) => (
            <li
              key={`${o.medicamentId ?? "libre"}-${i}`}
              id={`${liste}-${i}`}
              role="option"
              aria-selected={i === actif}
              // mousedown et non click : le clic arrive après le blur du champ,
              // qui aurait déjà refermé la liste.
              onMouseDown={(e) => {
                e.preventDefault();
                choisir(o);
              }}
              onMouseEnter={() => setActif(i)}
              className={`flex min-h-11 cursor-pointer flex-col justify-center px-3 py-1.5 text-[13px] ${i === actif ? "bg-teal-soft" : ""}`}
            >
              {o.medicamentId ? (
                <>
                  <b className="font-bold">{o.libelle}</b>
                  {o.classe && <small className="text-[11px] text-muted">{o.classe}</small>}
                </>
              ) : (
                <span>
                  Prescrire « <b className="font-bold">{o.libelle}</b> »{" "}
                  <small className="text-muted">(hors base : sans alerte par classe)</small>
                </span>
              )}
            </li>
          ))}
          {enAttente && <li className="px-3 py-2 text-[12px] text-muted">Recherche…</li>}
        </ul>
      )}
    </div>
  );
}
