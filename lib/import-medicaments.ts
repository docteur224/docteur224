/*
 * Import de la base de médicaments depuis un tableur : analyse PURE, sans
 * accès à la base (testée par node --test).
 *
 * Règles :
 *  - l'en-tête est reconnu par son libellé, sans casse ni accents, avec des
 *    synonymes (« Molécule » pour DCI, « Famille » pour classe…) — l'ordre
 *    des colonnes est libre ;
 *  - un médicament = DCI + dosage + forme (la même clé que l'index unique
 *    de la base) : une ligne du fichier qui retrouve sa clé MET À JOUR, une
 *    clé nouvelle CRÉE ;
 *  - un import ne SUPPRIME jamais : un médicament absent du fichier reste
 *    tel quel. Pour le retirer, on le marque inactif (colonne « Actif ») ;
 *  - chaque ligne fautive est rendue avec son numéro, rien n'est appliqué
 *    en silence.
 */

export interface MedicamentImport {
  dci: string;
  nom_commercial: string | null;
  dosage: string | null;
  forme: string | null;
  voie: string | null;
  classe: string | null;
  actif: boolean;
}

export interface MedicamentExistant extends MedicamentImport {
  id: string;
}

type Champ = keyof MedicamentImport;

/** Colonnes, dans l'ordre de l'export ; chacune avec ses intitulés reconnus. */
export const COLONNES: { champ: Champ; titre: string; synonymes: string[]; max: number }[] = [
  { champ: "dci", titre: "DCI", synonymes: ["dci", "denomination commune", "denomination commune internationale", "molecule", "principe actif"], max: 160 },
  { champ: "nom_commercial", titre: "Nom commercial", synonymes: ["nom commercial", "marque", "specialite"], max: 120 },
  { champ: "dosage", titre: "Dosage", synonymes: ["dosage", "concentration", "dose"], max: 60 },
  { champ: "forme", titre: "Forme", synonymes: ["forme", "forme galenique", "presentation"], max: 60 },
  { champ: "voie", titre: "Voie", synonymes: ["voie", "voie d administration", "administration"], max: 40 },
  { champ: "classe", titre: "Classe", synonymes: ["classe", "classe therapeutique", "famille", "classe pharmacologique"], max: 80 },
  { champ: "actif", titre: "Actif", synonymes: ["actif", "statut", "disponible", "en service"], max: 10 },
];

const sansAccents = (t: string) =>
  t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Clé d'unicité, alignée sur l'index de la base : lower(dci), lower(dosage), lower(forme). */
export const cle = (m: Pick<MedicamentImport, "dci" | "dosage" | "forme">) =>
  `${m.dci.trim().toLowerCase()}|${(m.dosage ?? "").trim().toLowerCase()}|${(m.forme ?? "").trim().toLowerCase()}`;

function lireActif(valeur: string): boolean | null {
  const v = sansAccents(valeur);
  if (v === "" || ["oui", "o", "1", "vrai", "true", "x", "actif", "yes"].includes(v)) return true;
  if (["non", "n", "0", "faux", "false", "inactif", "retire", "no"].includes(v)) return false;
  return null;
}

export interface Modification {
  id: string;
  ligne: number;
  libelle: string;
  champs: { champ: Champ; avant: string; apres: string }[];
  valeurs: MedicamentImport;
}

export interface AnalyseImport {
  colonnesReconnues: string[];
  erreurs: { ligne: number; message: string }[];
  creations: (MedicamentImport & { ligne: number })[];
  modifications: Modification[];
  inchanges: number;
}

const affiche = (v: string | boolean | null) => (v === null ? "—" : typeof v === "boolean" ? (v ? "oui" : "non") : v);

export function analyserImport(lignes: string[][], existants: MedicamentExistant[]): AnalyseImport {
  const resultat: AnalyseImport = { colonnesReconnues: [], erreurs: [], creations: [], modifications: [], inchanges: 0 };
  if (lignes.length === 0) {
    resultat.erreurs.push({ ligne: 1, message: "Le fichier est vide." });
    return resultat;
  }

  // ---- En-tête ----
  const entete = lignes[0].map(sansAccents);
  const position = new Map<Champ, number>();
  for (const col of COLONNES) {
    const i = entete.findIndex((t) => col.synonymes.includes(t));
    if (i >= 0) {
      position.set(col.champ, i);
      resultat.colonnesReconnues.push(col.titre);
    }
  }
  if (!position.has("dci")) {
    resultat.erreurs.push({
      ligne: 1,
      message: "Colonne « DCI » introuvable dans la première ligne. Partez de l’export : ses intitulés sont reconnus.",
    });
    return resultat;
  }

  const parCle = new Map(existants.map((e) => [cle(e), e]));
  const vus = new Map<string, number>();

  lignes.slice(1).forEach((brute, k) => {
    const ligne = k + 2; // numéro tel qu'Excel l'affiche
    const lire = (champ: Champ) => {
      const i = position.get(champ);
      return i === undefined ? "" : (brute[i] ?? "").trim();
    };

    const dci = lire("dci");
    if (!dci) {
      resultat.erreurs.push({ ligne, message: "DCI manquante." });
      return;
    }
    const valeurs: MedicamentImport = {
      dci,
      nom_commercial: lire("nom_commercial") || null,
      dosage: lire("dosage") || null,
      forme: lire("forme") || null,
      voie: lire("voie") || null,
      classe: lire("classe") ? lire("classe").toLowerCase() : null,
      actif: true,
    };
    const actif = position.has("actif") ? lireActif(lire("actif")) : true;
    if (actif === null) {
      resultat.erreurs.push({ ligne, message: `« Actif » doit valoir oui ou non (lu : « ${lire("actif")} »).` });
      return;
    }
    valeurs.actif = actif;

    const tropLong = COLONNES.find((c) => c.champ !== "actif" && String(valeurs[c.champ] ?? "").length > c.max);
    if (tropLong) {
      resultat.erreurs.push({ ligne, message: `${tropLong.titre} trop long (${tropLong.max} caractères au maximum).` });
      return;
    }
    if (dci.length < 2) {
      resultat.erreurs.push({ ligne, message: "DCI trop courte." });
      return;
    }

    const c = cle(valeurs);
    if (vus.has(c)) {
      resultat.erreurs.push({ ligne, message: `Doublon de la ligne ${vus.get(c)} (même DCI, dosage et forme).` });
      return;
    }
    vus.set(c, ligne);

    const existant = parCle.get(c);
    if (!existant) {
      resultat.creations.push({ ...valeurs, ligne });
      return;
    }
    // Seules les colonnes PRÉSENTES dans le fichier comptent : un fichier sans
    // colonne « Classe » ne vide pas les classes de la base.
    const champs = COLONNES.filter((col) => position.has(col.champ))
      .map((col) => col.champ)
      .filter((champ) => (existant[champ] ?? null) !== (valeurs[champ] ?? null))
      .map((champ) => ({ champ, avant: affiche(existant[champ]), apres: affiche(valeurs[champ]) }));
    if (champs.length === 0) {
      resultat.inchanges++;
      return;
    }
    const fusion = { ...existant } as MedicamentImport;
    for (const { champ } of champs) (fusion as unknown as Record<string, unknown>)[champ] = valeurs[champ];
    resultat.modifications.push({
      id: existant.id,
      ligne,
      libelle: [existant.dci, existant.dosage, existant.forme].filter(Boolean).join(" · "),
      champs,
      valeurs: {
        dci: fusion.dci,
        nom_commercial: fusion.nom_commercial,
        dosage: fusion.dosage,
        forme: fusion.forme,
        voie: fusion.voie,
        classe: fusion.classe,
        actif: fusion.actif,
      },
    });
  });

  return resultat;
}
