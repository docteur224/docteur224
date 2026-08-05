"use client";

import { useEffect, useState } from "react";
import { creerClientNavigateur } from "@/lib/supabase/client";

/*
 * Commune du lieu d'exercice.
 *
 * Menu déroulant quand la ville a un découpage référencé (migration 0023 :
 * Conakry), saisie libre sinon — un référentiel incomplet ne doit jamais
 * empêcher un praticien de terminer son inscription. L'option
 * « Autre » rouvre le champ texte pour la même raison.
 *
 * La valeur remontée est le LIBELLÉ de la commune, pas un identifiant :
 * `medecins.commune` est une colonne texte, comme `quartier`.
 */

const AUTRE = "__autre__";

const CHAMP_WEB =
  "mb-3 w-full rounded-xl border border-line bg-white p-[14px] text-sm outline-none focus:border-teal";

export default function ChampCommune({
  villeId,
  valeur,
  onChange,
  mobile = false,
}: {
  /** Ville sélectionnée ; sans elle on ne sait pas quoi proposer. */
  villeId: string | undefined;
  valeur: string;
  onChange: (commune: string) => void;
  mobile?: boolean;
}) {
  const [communes, setCommunes] = useState<{ cle: string; noms: string[] }>({ cle: "", noms: [] });
  const [libre, setLibre] = useState(false);

  useEffect(() => {
    if (!villeId) return;
    let actif = true;
    creerClientNavigateur()
      .from("communes")
      .select("nom")
      .eq("ville_id", villeId)
      .order("nom")
      .then(({ data }) => {
        if (actif) setCommunes({ cle: villeId, noms: (data ?? []).map((c) => c.nom) });
      });
    return () => {
      actif = false;
    };
  }, [villeId]);

  const noms = communes.cle === villeId ? communes.noms : [];
  // Une commune déjà enregistrée mais absente du référentiel (ancienne
  // saisie, ville non découpée) doit rester affichée telle quelle.
  const horsListe = valeur !== "" && !noms.includes(valeur);
  const saisieLibre = noms.length === 0 || libre || horsListe;

  if (saisieLibre) {
    return (
      <>
        <input
          className={mobile ? "inp" : CHAMP_WEB}
          placeholder="Ex. Ratoma, Matoto…"
          aria-label="Commune"
          value={valeur}
          onChange={(e) => onChange(e.target.value)}
        />
        {noms.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setLibre(false);
              onChange("");
            }}
            className="-mt-1.5 mb-3 block text-[11.5px] font-bold text-teal underline underline-offset-2"
          >
            Choisir dans la liste
          </button>
        )}
      </>
    );
  }

  return (
    <select
      className={mobile ? "selm" : CHAMP_WEB}
      aria-label="Commune"
      value={valeur}
      onChange={(e) => {
        if (e.target.value === AUTRE) {
          setLibre(true);
          onChange("");
        } else {
          onChange(e.target.value);
        }
      }}
    >
      <option value="">— Choisir —</option>
      {noms.map((nom) => (
        <option key={nom} value={nom}>
          {nom}
        </option>
      ))}
      <option value={AUTRE}>Autre (préciser)…</option>
    </select>
  );
}
