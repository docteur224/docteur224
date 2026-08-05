"use client";

import { useEffect, useState } from "react";
import {
  ajouterCommune,
  retirerCommune,
  useCommunesAdmin,
} from "@/lib/admin";
import { creerClientNavigateur } from "@/lib/supabase/client";

/*
 * Communes couvertes, par ville.
 *
 * Les autres référentiels de /espace-admin/parametres sont des listes
 * plates (spécialités, villes, assurances) et se contentent d'une carte
 * générique. Une commune n'existe pas seule : elle appartient à une ville,
 * d'où cet écran à part, avec un sélecteur de ville en tête.
 *
 * Le retrait est proposé ici alors qu'il ne l'est pas sur les autres
 * listes : le référentiel des communes se construit au fil de l'eau et une
 * faute de frappe doit pouvoir se corriger. Retirer une commune n'efface
 * rien chez les professionnels — `medecins.commune` est du texte libre,
 * pas une clé étrangère.
 */

export default function CommunesCouvertes() {
  const [villes, setVilles] = useState<{ id: string; nom: string }[]>([]);
  const [villeId, setVilleId] = useState("");
  const [nouvelle, setNouvelle] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let actif = true;
    creerClientNavigateur()
      .from("villes")
      .select("id, nom")
      .order("nom")
      .then(({ data }) => {
        if (actif) setVilles(data ?? []);
      });
    return () => {
      actif = false;
    };
  }, []);

  // La première ville sert de valeur par défaut sans passer par un effet
  // correctif (le linter interdit setState dans un effet). C'est bien
  // ELLE qu'il faut interroger, et non l'état brut `villeId` : celui-ci
  // vaut "" au premier rendu, et la carte restait vide tant que l'admin
  // n'avait pas changé la ville à la main.
  const villeCourante = villeId || villes[0]?.id || "";
  const { communes, recharger } = useCommunesAdmin(villeCourante || undefined);

  async function ajouter() {
    const nom = nouvelle.trim();
    setErreur(null);
    if (!nom) return;
    if (!villeCourante) return setErreur("Choisissez d’abord une ville.");
    const res = await ajouterCommune(villeCourante, nom);
    if (res.erreur) return setErreur(res.erreur);
    setNouvelle("");
    recharger();
  }

  async function retirer(id: string, nom: string) {
    if (!window.confirm(`Retirer « ${nom} » du référentiel ?`)) return;
    setErreur(null);
    const res = await retirerCommune(id, nom);
    if (res.erreur) return setErreur(res.erreur);
    recharger();
  }

  const contenu = (
    <>
      <select
        aria-label="Ville"
        value={villeCourante}
        onChange={(e) => setVilleId(e.target.value)}
        className="mb-3 w-full max-w-[280px] rounded-[11px] border border-line bg-white px-[13px] py-2.5 text-[13px] outline-none focus:border-teal"
      >
        {villes.map((v) => (
          <option key={v.id} value={v.id}>
            {v.nom}
          </option>
        ))}
      </select>

      <div className="flex flex-wrap gap-2">
        {communes.length === 0 && (
          <p className="text-[12.5px] text-muted">
            Aucune commune référencée pour cette ville — les professionnels y saisiront leur
            commune en texte libre.
          </p>
        )}
        {communes.map((commune) => (
          <button
            key={commune.id}
            type="button"
            title="Retirer"
            onClick={() => retirer(commune.id, commune.nom)}
            className="rounded-full border border-[#CDE6F2] bg-teal-soft px-[14px] py-2 text-xs font-bold text-blue transition-colors hover:border-red hover:text-red"
          >
            {commune.nom} ✕
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={nouvelle}
          onChange={(e) => setNouvelle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              ajouter();
            }
          }}
          placeholder="Commune à ajouter"
          aria-label="Commune à ajouter"
          className="w-full max-w-[280px] rounded-[11px] border border-line bg-white px-[13px] py-2.5 text-[13px] outline-none focus:border-teal"
        />
        <button
          type="button"
          onClick={ajouter}
          className="rounded-full border border-[#DCE4EA] bg-[#EEF2F5] px-[14px] py-2 text-xs font-bold text-[#3A4A55] transition-colors hover:bg-bg"
        >
          + Ajouter
        </button>
      </div>
      {erreur && (
        <p role="alert" className="mt-2 text-[12.5px] font-semibold text-red">
          {erreur}
        </p>
      )}
    </>
  );

  return (
    <>
      <div className="card2 md:hidden">
        <h4>Communes couvertes</h4>
        {contenu}
      </div>
      <div className="mb-4 hidden rounded-2xl border border-line bg-white p-5 md:block">
        <h3 className="mb-1 text-[15px] font-extrabold">Communes couvertes</h3>
        <p className="mb-3 text-[12.5px] text-muted">
          Proposées aux professionnels dans le menu « Commune » de leur adresse, pour la ville
          sélectionnée.
        </p>
        {contenu}
      </div>
    </>
  );
}
