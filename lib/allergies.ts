/*
 * Alerte allergie : un médicament prescrit correspond-il à une allergie
 * déclarée du patient ?
 *
 * Module PUR (testé par node --test). Les allergies sont du texte libre
 * (« Pénicilline », « aspirine », « sulfamides ») ; les médicaments ont une
 * DCI et une CLASSE. La comparaison se fait sur les trois, sans accents ni
 * casse, et passe par une table de synonymes — « allergique à la
 * pénicilline » doit alerter sur l'amoxicilline, qui ne contient pas le mot.
 *
 * C'est une AIDE : une allergie mal orthographiée, ou une molécule absente
 * de la base, passera. L'écran le dit.
 */

export interface MedicamentCompare {
  libelle: string;
  dci?: string | null;
  classe?: string | null;
}

export interface CorrespondanceAllergie {
  allergie: string;
  /** Pourquoi : même molécule, ou même classe (nommée). */
  raison: string;
}

/** Sans accents, en minuscules, ponctuation ramenée à des espaces. */
export function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Singulier approximatif : « pénicillines » et « pénicilline » se rejoignent. */
const racine = (mot: string) => (mot.length > 4 ? mot.replace(/[sx]$/, "") : mot);

/*
 * Ce qu'une allergie déclarée désigne, au-delà de son propre libellé.
 * Clés et valeurs normalisées. Une valeur est une classe (comparée à la
 * classe du médicament) ou une molécule (comparée à sa DCI).
 */
const SYNONYMES: Record<string, { classes?: string[]; molecules?: string[] }> = {
  penicilline: { classes: ["penicillines"] },
  "beta lactamine": { classes: ["penicillines", "cephalosporines"] },
  betalactamine: { classes: ["penicillines", "cephalosporines"] },
  cephalosporine: { classes: ["cephalosporines"] },
  sulfamide: { classes: ["sulfamides"] },
  sulfa: { classes: ["sulfamides"] },
  bactrim: { molecules: ["sulfamethoxazole"] },
  cotrimoxazole: { molecules: ["sulfamethoxazole"] },
  aspirine: { molecules: ["acide acetylsalicylique"], classes: ["ains"] },
  ains: { classes: ["ains"] },
  "anti inflammatoire": { classes: ["ains"] },
  "anti inflammatoires non steroidien": { classes: ["ains"] },
  macrolide: { classes: ["macrolides"] },
  quinolone: { classes: ["fluoroquinolones"] },
  fluoroquinolone: { classes: ["fluoroquinolones"] },
  cycline: { classes: ["tetracyclines"] },
  tetracycline: { classes: ["tetracyclines"] },
  aminoside: { classes: ["aminosides"] },
  morphine: { classes: ["opioides"] },
  opiace: { classes: ["opioides"] },
  opioide: { classes: ["opioides"] },
  codeine: { classes: ["opioides"] },
  iode: { classes: ["antiseptiques iodes"] },
  quinine: { molecules: ["quinine"] },
  artemisinine: { molecules: ["artemether", "artesunate", "dihydroartemisinine"] },
  iec: { classes: ["iec"] },
};

/** Les allergies déclarées qui concernent ce médicament, avec la raison. */
export function allergiesConcernees(
  medicament: MedicamentCompare,
  allergies: string[]
): CorrespondanceAllergie[] {
  const dci = normaliser(medicament.dci ?? "");
  const libelle = normaliser(medicament.libelle);
  const classe = normaliser(medicament.classe ?? "");
  const molecule = `${dci} ${libelle}`;
  const resultats: CorrespondanceAllergie[] = [];

  for (const brute of allergies) {
    const allergie = normaliser(brute);
    if (allergie.length < 3) continue;
    const r = allergie.split(" ").map(racine).join(" ");

    // 1. La molécule elle-même, nommée dans l'allergie ou l'inverse.
    if (molecule.includes(allergie) || molecule.split(" ").map(racine).join(" ").includes(r)) {
      resultats.push({ allergie: brute, raison: "même molécule" });
      continue;
    }

    // 2. La classe nommée telle quelle (« pénicillines », « AINS »).
    if (classe && (racine(classe) === r || classe.split(" ").map(racine).join(" ") === r)) {
      resultats.push({ allergie: brute, raison: `même classe : ${medicament.classe}` });
      continue;
    }

    // 3. Les synonymes : l'allergie désigne une classe ou une molécule.
    const synonyme = SYNONYMES[allergie] ?? SYNONYMES[r];
    if (synonyme) {
      if (synonyme.classes?.some((c) => racine(c) === racine(classe))) {
        resultats.push({ allergie: brute, raison: `même classe : ${medicament.classe}` });
        continue;
      }
      if (synonyme.molecules?.some((m) => molecule.includes(m))) {
        resultats.push({ allergie: brute, raison: "même molécule" });
      }
    }
  }
  return resultats;
}
