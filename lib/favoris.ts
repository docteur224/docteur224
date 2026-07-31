"use client";

import { useCallback, useEffect, useState } from "react";
import { creerClientNavigateur } from "@/lib/supabase/client";

/*
 * Médecins favoris (migration 0014). Table strictement privée : le médecin
 * ne sait pas qui l'a mis de côté.
 *
 * L'ensemble des identifiants favoris vit dans un cache de module partagé :
 * un cœur est monté sur chaque carte de résultat, et il serait absurde que
 * chacun interroge la base — comme pour les notifications.
 */

export interface MedecinFavori {
  id: string;
  nom: string;
  civilite: string;
  specialite: string;
  ville: string;
  etablissement: string;
  note: number | null;
  nbAvis: number;
  tarif: number | null;
  photo: string | null;
  ajouteLe: string;
}

interface LigneFavori {
  medecin_id: string;
  cree_le: string;
  medecins: {
    civilite: string | null;
    tarif_consultation: number | null;
    note_moyenne: number | null;
    nb_avis: number | null;
    photo_url: string | null;
    utilisateurs: { nom: string | null; prenom: string | null } | null;
    specialites: { nom: string } | null;
    villes: { nom: string } | null;
    etablissements: { nom: string } | null;
  } | null;
}

const SELECTION = `
  medecin_id, cree_le,
  medecins (
    civilite, tarif_consultation, note_moyenne, nb_avis, photo_url,
    utilisateurs ( nom, prenom ),
    specialites ( nom ),
    villes ( nom ),
    etablissements ( nom )
  )
`;

function versFavori(l: LigneFavori): MedecinFavori {
  const m = l.medecins;
  return {
    id: l.medecin_id,
    civilite: m?.civilite === "Pr" ? "Pr" : "Dr",
    nom: `${m?.utilisateurs?.prenom ?? ""} ${m?.utilisateurs?.nom ?? ""}`.trim(),
    specialite: m?.specialites?.nom ?? "",
    ville: m?.villes?.nom ?? "",
    etablissement: m?.etablissements?.nom ?? "Cabinet",
    note: m?.note_moyenne ?? null,
    nbAvis: m?.nb_avis ?? 0,
    tarif: m?.tarif_consultation ?? null,
    photo: m?.photo_url ?? null,
    ajouteLe: l.cree_le,
  };
}

/* ----- Cache partagé des identifiants favoris ----- */

let cacheIds: Set<string> | undefined;
let chargementEnCours: Promise<void> | null = null;
const ecouteurs = new Set<(ids: Set<string>) => void>();

function diffuser(ids: Set<string>) {
  cacheIds = ids;
  ecouteurs.forEach((e) => e(new Set(ids)));
}

async function chargerIds(): Promise<void> {
  const supabase = creerClientNavigateur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    diffuser(new Set());
    return;
  }
  const { data } = await supabase.from("favoris").select("medecin_id");
  diffuser(new Set((data ?? []).map((l) => l.medecin_id as string)));
}

/** À appeler après une connexion ou une déconnexion. */
export function oublierFavoris() {
  cacheIds = undefined;
  chargementEnCours = null;
}

/**
 * `estFavori` et l'action de bascule, pour le cœur d'une fiche ou d'une carte.
 * `pret` reste faux tant que la liste n'est pas connue : sans ça, le cœur
 * s'afficherait vide une fraction de seconde sur un médecin déjà favori.
 */
export function useFavori(medecinId: string): {
  estFavori: boolean;
  pret: boolean;
  basculer: () => Promise<{ erreur?: string }>;
} {
  const [ids, setIds] = useState<Set<string> | undefined>(cacheIds);

  useEffect(() => {
    ecouteurs.add(setIds);
    if (cacheIds === undefined && !chargementEnCours) {
      chargementEnCours = chargerIds();
    }
    return () => {
      ecouteurs.delete(setIds);
    };
  }, []);

  const basculer = useCallback(async () => {
    const supabase = creerClientNavigateur();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { erreur: "non_connecte" };
    const actuels = cacheIds ?? new Set<string>();
    const etait = actuels.has(medecinId);

    // Optimiste : le cœur ne doit pas attendre l'aller-retour réseau.
    const suivants = new Set(actuels);
    if (etait) suivants.delete(medecinId);
    else suivants.add(medecinId);
    diffuser(suivants);

    const { error } = etait
      ? await supabase
          .from("favoris")
          .delete()
          .eq("patient_id", auth.user.id)
          .eq("medecin_id", medecinId)
      : await supabase.from("favoris").insert({ patient_id: auth.user.id, medecin_id: medecinId });

    if (error) {
      diffuser(actuels); // retour en arrière
      return { erreur: error.message };
    }
    return {};
  }, [medecinId]);

  return { estFavori: ids?.has(medecinId) ?? false, pret: ids !== undefined, basculer };
}

/** La liste complète, avec les informations d'affichage des médecins. */
export function useMesFavoris(): {
  favoris: MedecinFavori[];
  chargement: boolean;
  recharger: () => void;
} {
  const [favoris, setFavoris] = useState<MedecinFavori[]>([]);
  const [chargement, setChargement] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let actif = true;
    creerClientNavigateur()
      .from("favoris")
      .select(SELECTION)
      .order("cree_le", { ascending: false })
      .then(({ data }) => {
        if (!actif) return;
        setFavoris(((data ?? []) as unknown as LigneFavori[]).map(versFavori));
        setChargement(false);
      });
    return () => {
      actif = false;
    };
  }, [version]);

  return { favoris, chargement, recharger: () => setVersion((v) => v + 1) };
}
