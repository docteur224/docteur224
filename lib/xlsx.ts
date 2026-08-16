import { deflateRawSync } from "node:zlib";

/*
 * Générateur de classeur Excel (.xlsx) minimal, sans dépendance.
 *
 * Même parti pris que `lib/pdf.ts` : le besoin est étroit — une feuille, un
 * en-tête, des colonnes de texte et de dates — et les bibliothèques du marché
 * (exceljs, xlsx) pèsent plusieurs mégaoctets pour des fonctions dont rien
 * ici ne se sert.
 *
 * Un .xlsx est une archive ZIP de fichiers XML. Node fournit la compression
 * (`zlib`), il ne reste qu'à écrire les en-têtes ZIP et les six parties
 * minimales qu'Excel exige. D'où l'`import node:zlib` : ce module ne
 * fonctionne QUE côté serveur.
 *
 * Pourquoi pas un simple CSV : un CSV n'a ni largeurs de colonnes, ni ligne
 * figée, ni filtre, ni vraies dates — et son séparateur dépend de la langue
 * d'Excel, ce qui vaut à l'utilisateur francophone une colonne unique
 * illisible une fois sur deux.
 *
 * Limites assumées : une seule feuille, pas de formule, pas de fusion de
 * cellules, deux formats de cellule (texte et date).
 */

/* ---------- Échappement XML ---------- */

// Les caractères de contrôle sont interdits en XML 1.0 : un motif de
// consultation collé depuis un autre logiciel peut en contenir, et Excel
// refuse alors d'ouvrir le fichier — sans dire pourquoi.
const CONTROLE = new RegExp("[\u0000-\u0008\u000B\u000C\u000E-\u001F]", "g");

function echapper(texte: string): string {
  return texte
    .replace(CONTROLE, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ---------- CRC32 (exigé par le format ZIP) ---------- */

const TABLE_CRC = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let valeur = i;
    for (let bit = 0; bit < 8; bit++) {
      valeur = valeur & 1 ? 0xedb88320 ^ (valeur >>> 1) : valeur >>> 1;
    }
    table[i] = valeur >>> 0;
  }
  return table;
})();

function crc32(donnees: Buffer): number {
  let crc = 0xffffffff;
  for (const octet of donnees) crc = TABLE_CRC[(crc ^ octet) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/* ---------- Archive ZIP ---------- */

interface EntreeZip {
  nom: string;
  donnees: Buffer;
}

function archiver(entrees: EntreeZip[]): Buffer {
  const maintenant = new Date();
  const heureDos =
    (maintenant.getHours() << 11) | (maintenant.getMinutes() << 5) | (maintenant.getSeconds() >> 1);
  const dateDos =
    ((maintenant.getFullYear() - 1980) << 9) |
    ((maintenant.getMonth() + 1) << 5) |
    maintenant.getDate();

  const locaux: Buffer[] = [];
  const repertoire: Buffer[] = [];
  let decalage = 0;

  for (const entree of entrees) {
    const nom = Buffer.from(entree.nom, "utf8");
    const compresse = deflateRawSync(entree.donnees, { level: 9 });
    const crc = crc32(entree.donnees);

    const enTete = Buffer.alloc(30);
    enTete.writeUInt32LE(0x04034b50, 0); // signature d'en-tête local
    enTete.writeUInt16LE(20, 4); // version minimale : 2.0
    enTete.writeUInt16LE(0x0800, 6); // drapeau « nom de fichier en UTF-8 »
    enTete.writeUInt16LE(8, 8); // méthode : deflate
    enTete.writeUInt16LE(heureDos, 10);
    enTete.writeUInt16LE(dateDos, 12);
    enTete.writeUInt32LE(crc, 14);
    enTete.writeUInt32LE(compresse.length, 18);
    enTete.writeUInt32LE(entree.donnees.length, 22);
    enTete.writeUInt16LE(nom.length, 26);
    enTete.writeUInt16LE(0, 28); // pas de champ « extra »
    locaux.push(enTete, nom, compresse);

    const fiche = Buffer.alloc(46);
    fiche.writeUInt32LE(0x02014b50, 0); // signature de répertoire central
    fiche.writeUInt16LE(20, 4); // version d'écriture
    fiche.writeUInt16LE(20, 6); // version minimale de lecture
    fiche.writeUInt16LE(0x0800, 8);
    fiche.writeUInt16LE(8, 10);
    fiche.writeUInt16LE(heureDos, 12);
    fiche.writeUInt16LE(dateDos, 14);
    fiche.writeUInt32LE(crc, 16);
    fiche.writeUInt32LE(compresse.length, 20);
    fiche.writeUInt32LE(entree.donnees.length, 24);
    fiche.writeUInt16LE(nom.length, 28);
    fiche.writeUInt16LE(0, 30); // extra
    fiche.writeUInt16LE(0, 32); // commentaire
    fiche.writeUInt16LE(0, 34); // disque de départ
    fiche.writeUInt16LE(0, 36); // attributs internes
    fiche.writeUInt32LE(0, 38); // attributs externes
    fiche.writeUInt32LE(decalage, 42);
    repertoire.push(fiche, nom);

    decalage += 30 + nom.length + compresse.length;
  }

  const corps = Buffer.concat(locaux);
  const central = Buffer.concat(repertoire);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(0, 4); // numéro de ce disque
  fin.writeUInt16LE(0, 6); // disque du répertoire central
  fin.writeUInt16LE(entrees.length, 8);
  fin.writeUInt16LE(entrees.length, 10);
  fin.writeUInt32LE(central.length, 12);
  fin.writeUInt32LE(corps.length, 16);
  fin.writeUInt16LE(0, 20); // pas de commentaire d'archive

  return Buffer.concat([corps, central, fin]);
}

/* ---------- Feuille de calcul ---------- */

export interface ColonneFeuille {
  titre: string;
  /** Largeur de colonne, en largeurs de caractère (unité d'Excel). */
  largeur: number;
  /** « date » attend une valeur « AAAA-MM-JJ » et produit une vraie date. */
  type?: "texte" | "date";
}

/** Index de colonne (0) → référence Excel (« A », « Z », « AA »…). */
function lettreColonne(index: number): string {
  let reste = index;
  let lettres = "";
  do {
    lettres = String.fromCharCode(65 + (reste % 26)) + lettres;
    reste = Math.floor(reste / 26) - 1;
  } while (reste >= 0);
  return lettres;
}

/**
 * « 2026-08-20 » → numéro de série Excel.
 *
 * L'origine est le 30/12/1899 et non le 31/12 : Excel tient 1900 pour
 * bissextile, erreur héritée de Lotus 1-2-3 que le décalage d'un jour compense
 * pour toute date postérieure au 01/03/1900 — donc pour tout ce qui nous
 * concerne.
 */
function serieExcel(iso: string): number | null {
  const [annee, mois, jour] = iso.split("-").map(Number);
  if (!annee || !mois || !jour) return null;
  const origine = Date.UTC(1899, 11, 30);
  return Math.round((Date.UTC(annee, mois - 1, jour) - origine) / 86400000);
}

/** Nom de feuille accepté par Excel : 31 caractères, sans []:*?/\ */
function nomFeuilleValide(nom: string): string {
  const propre = nom.replace(/[[\]:*?/\\]/g, " ").trim();
  return (propre || "Feuille1").slice(0, 31);
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>
<fonts count="2">
<font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF15506B"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/**
 * Construit un classeur d'une feuille : en-tête coloré et figé, filtre
 * automatique, largeurs de colonnes fixées.
 *
 * Une cellule vaut `null` quand la donnée manque : la cellule est alors
 * absente du XML, ce qu'Excel lit comme « vide » — et non comme la chaîne
 * « null » ni comme un zéro.
 */
export function construireClasseur(options: {
  nomFeuille: string;
  colonnes: ColonneFeuille[];
  lignes: (string | null)[][];
}): Uint8Array {
  const { colonnes } = options;
  const nomFeuille = nomFeuilleValide(options.nomFeuille);
  const derniereColonne = lettreColonne(Math.max(colonnes.length - 1, 0));
  const nbLignes = options.lignes.length + 1;

  const cellules = (valeurs: (string | null)[], numeroLigne: number, entete: boolean) =>
    valeurs
      .map((valeur, i) => {
        if (valeur === null || valeur === "") return "";
        const reference = `${lettreColonne(i)}${numeroLigne}`;
        if (entete) {
          return `<c r="${reference}" s="1" t="inlineStr"><is><t>${echapper(valeur)}</t></is></c>`;
        }
        if (colonnes[i]?.type === "date") {
          const serie = serieExcel(valeur);
          if (serie !== null) return `<c r="${reference}" s="2"><v>${serie}</v></c>`;
        }
        return `<c r="${reference}" s="0" t="inlineStr"><is><t xml:space="preserve">${echapper(valeur)}</t></is></c>`;
      })
      .join("");

  const rangees = [
    `<row r="1" ht="22" customHeight="1">${cellules(
      colonnes.map((c) => c.titre),
      1,
      true
    )}</row>`,
    ...options.lignes.map(
      (ligne, i) => `<row r="${i + 2}">${cellules(ligne, i + 2, false)}</row>`
    ),
  ].join("");

  const largeurs = colonnes
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.largeur}" customWidth="1"/>`)
    .join("");

  const feuille =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<dimension ref="A1:${derniereColonne}${Math.max(nbLignes, 1)}"/>` +
    // Ligne d'en-tête figée : sur trois semaines d'agenda, savoir quelle
    // colonne on lit est ce qui manque le plus vite.
    `<sheetViews><sheetView workbookViewId="0">` +
    `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>` +
    `</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    `<cols>${largeurs}</cols>` +
    `<sheetData>${rangees}</sheetData>` +
    `<autoFilter ref="A1:${derniereColonne}${Math.max(nbLignes, 1)}"/>` +
    `</worksheet>`;

  const classeur =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="${echapper(nomFeuille)}" sheetId="1" r:id="rId1"/></sheets>` +
    `</workbook>`;

  const rel = (id: string, type: string, cible: string) =>
    `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/${type}" Target="${cible}"/>`;

  return archiver([
    {
      nom: "[Content_Types].xml",
      donnees: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
          `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
          `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
          `</Types>`,
        "utf8"
      ),
    },
    {
      nom: "_rels/.rels",
      donnees: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          rel("rId1", "officeDocument/2006/relationships/officeDocument", "xl/workbook.xml") +
          `</Relationships>`,
        "utf8"
      ),
    },
    { nom: "xl/workbook.xml", donnees: Buffer.from(classeur, "utf8") },
    {
      nom: "xl/_rels/workbook.xml.rels",
      donnees: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          rel("rId1", "officeDocument/2006/relationships/worksheet", "worksheets/sheet1.xml") +
          rel("rId2", "officeDocument/2006/relationships/styles", "styles.xml") +
          `</Relationships>`,
        "utf8"
      ),
    },
    { nom: "xl/styles.xml", donnees: Buffer.from(STYLES, "utf8") },
    { nom: "xl/worksheets/sheet1.xml", donnees: Buffer.from(feuille, "utf8") },
  ]);
}
