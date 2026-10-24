/*
 * Import du référentiel d'actes depuis un tableur : analyse PURE, sans accès
 * à la base (testée par node --test).
 *
 * Mêmes règles que l'import des médicaments, dont ce module est le pendant :
 *  - l'en-tête est reconnu par son libellé, sans casse ni accents, avec des
 *    synonymes — l'ordre des colonnes est libre ;
 *  - un acte = un DOMAINE + un LIBELLÉ (la même clé que l'index unique de la
 *    base) : une ligne du fichier qui retrouve sa clé MET À JOUR, une clé
 *    nouvelle CRÉE ;
 *  - un import ne SUPPRIME jamais : un acte absent du fichier reste tel
 *    quel. Pour le retirer, on le marque inactif (colonne « Actif ») ;
 *  - chaque ligne fautive est rendue avec son numéro, rien n'est appliqué
 *    en silence.
 *
 * La différence tient au DOMAINE, obligatoire : biologie et imagerie
 * partagent une table, et une ligne sans domaine ne saurait pas où aller.
 */

export type DomaineActe = "biologie" | "imagerie";

export interface ActeImport {
  domaine: DomaineActe;
  libelle: string;
  synonymes: string[];
  code: string | null;
  categorie: string | null;
  actif: boolean;
}

export interface ActeExistant extends ActeImport {
  id: string;
}

type Champ = keyof ActeImport;

/** Colonnes, dans l'ordre de l'export ; chacune avec ses intitulés reconnus. */
export const COLONNES: { champ: Champ; titre: string; synonymes: string[]; max: number }[] = [
  { champ: "domaine", titre: "Domaine", synonymes: ["domaine", "type", "famille"], max: 20 },
  { champ: "libelle", titre: "Libellé", synonymes: ["libelle", "acte", "examen", "analyse", "intitule", "nom"], max: 160 },
  {
    champ: "synonymes",
    titre: "Synonymes",
    synonymes: ["synonymes", "synonyme", "abreviations", "abreviation", "autres noms", "alias"],
    max: 400,
  },
  { champ: "code", titre: "Code", synonymes: ["code", "nomenclature", "code acte"], max: 40 },
  { champ: "categorie", titre: "Catégorie", synonymes: ["categorie", "groupe", "section", "chapitre"], max: 80 },
  { champ: "actif", titre: "Actif", synonymes: ["actif", "statut", "disponible", "en service"], max: 10 },
];

const sansAccents = (t: string) =>
  t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Clé d'unicité, alignée sur l'index de la base : domaine + lower(libelle). */
export const cle = (a: Pick<ActeImport, "domaine" | "libelle">) =>
  `${a.domaine}|${a.libelle.trim().toLowerCase()}`;

/*
 * Les synonymes tiennent dans UNE cellule. Le point-virgule les sépare, et
 * non la virgule : beaucoup d'intitulés en contiennent une (« Widal et
 * Félix, sérodiagnostic »), et un export CSV l'aurait de toute façon
 * confondue avec son propre séparateur.
 */
export const lireSynonymes = (valeur: string): string[] =>
  valeur
    .split(/[;|]/)
    .map((s) => s.trim())
    .filter(Boolean);

export const ecrireSynonymes = (synonymes: string[]) => synonymes.join(" ; ");

function lireActif(valeur: string): boolean | null {
  const v = sansAccents(valeur);
  if (v === "" || ["oui", "o", "1", "vrai", "true", "x", "actif", "yes"].includes(v)) return true;
  if (["non", "n", "0", "faux", "false", "inactif", "retire", "no"].includes(v)) return false;
  return null;
}

function lireDomaine(valeur: string): DomaineActe | null {
  const v = sansAccents(valeur);
  if (["biologie", "bio", "analyse", "analyses", "laboratoire", "labo"].includes(v)) return "biologie";
  if (["imagerie", "image", "radiologie", "radio"].includes(v)) return "imagerie";
  return null;
}

export interface Modification {
  id: string;
  ligne: number;
  libelle: string;
  champs: { champ: Champ; avant: string; apres: string }[];
  valeurs: ActeImport;
}

export interface AnalyseImport {
  colonnesReconnues: string[];
  erreurs: { ligne: number; message: string }[];
  creations: (ActeImport & { ligne: number })[];
  modifications: Modification[];
  inchanges: number;
}

const affiche = (v: string | string[] | boolean | null) =>
  v === null ? "—" : Array.isArray(v) ? (v.length ? ecrireSynonymes(v) : "—") : typeof v === "boolean" ? (v ? "oui" : "non") : v;

/** Deux listes de synonymes sont égales si elles portent les mêmes entrées, dans le même ordre. */
const memesSynonymes = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

export function analyserImport(lignes: string[][], existants: ActeExistant[]): AnalyseImport {
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
  for (const requise of ["domaine", "libelle"] as Champ[]) {
    if (!position.has(requise)) {
      const titre = COLONNES.find((c) => c.champ === requise)!.titre;
      resultat.erreurs.push({
        ligne: 1,
        message: `Colonne « ${titre} » introuvable dans la première ligne. Partez de l’export : ses intitulés sont reconnus.`,
      });
      return resultat;
    }
  }

  const parCle = new Map(existants.map((e) => [cle(e), e]));
  const vus = new Map<string, number>();

  lignes.slice(1).forEach((brute, k) => {
    const ligne = k + 2; // numéro tel qu'Excel l'affiche
    const lire = (champ: Champ) => {
      const i = position.get(champ);
      return i === undefined ? "" : (brute[i] ?? "").trim();
    };

    const libelle = lire("libelle");
    if (!libelle) {
      resultat.erreurs.push({ ligne, message: "Libellé manquant." });
      return;
    }
    const domaine = lireDomaine(lire("domaine"));
    if (domaine === null) {
      resultat.erreurs.push({
        ligne,
        message: `« Domaine » doit valoir biologie ou imagerie (lu : « ${lire("domaine")} »).`,
      });
      return;
    }
    const actif = position.has("actif") ? lireActif(lire("actif")) : true;
    if (actif === null) {
      resultat.erreurs.push({ ligne, message: `« Actif » doit valoir oui ou non (lu : « ${lire("actif")} »).` });
      return;
    }

    const valeurs: ActeImport = {
      domaine,
      libelle,
      synonymes: lireSynonymes(lire("synonymes")),
      code: lire("code") || null,
      categorie: lire("categorie") ? lire("categorie").toLowerCase() : null,
      actif,
    };

    if (libelle.length < 2) {
      resultat.erreurs.push({ ligne, message: "Libellé trop court." });
      return;
    }
    const tropLong = COLONNES.find((c) => {
      if (c.champ === "actif" || c.champ === "domaine") return false;
      const v = valeurs[c.champ];
      return (Array.isArray(v) ? ecrireSynonymes(v) : String(v ?? "")).length > c.max;
    });
    if (tropLong) {
      resultat.erreurs.push({ ligne, message: `${tropLong.titre} trop long (${tropLong.max} caractères au maximum).` });
      return;
    }

    const c = cle(valeurs);
    if (vus.has(c)) {
      resultat.erreurs.push({ ligne, message: `Doublon de la ligne ${vus.get(c)} (même domaine et même libellé).` });
      return;
    }
    vus.set(c, ligne);

    const existant = parCle.get(c);
    if (!existant) {
      resultat.creations.push({ ...valeurs, ligne });
      return;
    }
    // Seules les colonnes PRÉSENTES dans le fichier comptent : un fichier sans
    // colonne « Catégorie » ne vide pas les catégories de la base.
    const champs = COLONNES.filter((col) => position.has(col.champ))
      .map((col) => col.champ)
      .filter((champ) =>
        champ === "synonymes"
          ? !memesSynonymes(existant.synonymes ?? [], valeurs.synonymes)
          : (existant[champ] ?? null) !== (valeurs[champ] ?? null)
      )
      .map((champ) => ({ champ, avant: affiche(existant[champ]), apres: affiche(valeurs[champ]) }));
    if (champs.length === 0) {
      resultat.inchanges++;
      return;
    }
    const fusion = { ...existant } as ActeImport;
    for (const { champ } of champs) (fusion as unknown as Record<string, unknown>)[champ] = valeurs[champ];
    resultat.modifications.push({
      id: existant.id,
      ligne,
      libelle: existant.libelle,
      champs,
      valeurs: {
        domaine: fusion.domaine,
        libelle: fusion.libelle,
        synonymes: fusion.synonymes,
        code: fusion.code,
        categorie: fusion.categorie,
        actif: fusion.actif,
      },
    });
  });

  return resultat;
}
