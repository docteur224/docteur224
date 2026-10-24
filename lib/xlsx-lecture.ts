import { inflateRawSync } from "node:zlib";

/*
 * Lecture d'un classeur Excel (.xlsx), sans dépendance — le pendant de
 * `lib/xlsx.ts`, qui en écrit.
 *
 * Un .xlsx est une archive ZIP de fichiers XML. On lit le répertoire central
 * de l'archive, on décompresse (zlib, fourni par Node) les trois parties
 * utiles — le classeur, ses relations, les chaînes partagées — et la
 * PREMIÈRE feuille, qu'on rend en tableau de lignes de texte.
 *
 * Limites assumées : première feuille seulement ; formules lues par leur
 * dernière valeur calculée (ce qu'Excel enregistre) ; dates rendues en
 * nombre de série, comme toute autre valeur numérique — l'import des
 * médicaments n'en a pas.
 *
 * SERVEUR UNIQUEMENT (node:zlib).
 */

/* ---------- ZIP ---------- */

interface Entree {
  nom: string;
  methode: number;
  tailleCompressee: number;
  decalageLocal: number;
}

function entreesZip(o: Buffer): Entree[] {
  // Fin du répertoire central : signature 0x06054b50, cherchée depuis la fin
  // (un commentaire d'archive peut la suivre).
  let fin = -1;
  for (let i = o.length - 22; i >= Math.max(0, o.length - 65_557); i--) {
    if (o.readUInt32LE(i) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new Error("Ce fichier n’est pas un classeur Excel (.xlsx) valide.");
  const nb = o.readUInt16LE(fin + 10);
  let p = o.readUInt32LE(fin + 16);
  const entrees: Entree[] = [];
  for (let i = 0; i < nb; i++) {
    if (o.readUInt32LE(p) !== 0x02014b50) throw new Error("Archive Excel endommagée.");
    const methode = o.readUInt16LE(p + 10);
    const tailleCompressee = o.readUInt32LE(p + 20);
    const longNom = o.readUInt16LE(p + 28);
    const longExtra = o.readUInt16LE(p + 30);
    const longComm = o.readUInt16LE(p + 32);
    const decalageLocal = o.readUInt32LE(p + 42);
    const nom = o.toString("utf8", p + 46, p + 46 + longNom);
    entrees.push({ nom, methode, tailleCompressee, decalageLocal });
    p += 46 + longNom + longExtra + longComm;
  }
  return entrees;
}

function lireEntree(o: Buffer, e: Entree): string {
  const p = e.decalageLocal;
  if (o.readUInt32LE(p) !== 0x04034b50) throw new Error("Archive Excel endommagée.");
  const debut = p + 30 + o.readUInt16LE(p + 26) + o.readUInt16LE(p + 28);
  const donnees = o.subarray(debut, debut + e.tailleCompressee);
  if (e.methode === 0) return donnees.toString("utf8");
  if (e.methode === 8) return inflateRawSync(donnees).toString("utf8");
  throw new Error("Compression non prise en charge dans ce classeur.");
}

/* ---------- XML ---------- */

function decoder(texte: string): string {
  return texte
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

/** Texte d'un nœud <si> ou <is> : la concaténation de tous ses <t>. */
const texteRiche = (xml: string) =>
  [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decoder(m[1])).join("");

/** « AB » → 27 (base 1). */
function indexColonne(lettres: string): number {
  let n = 0;
  for (const c of lettres) n = n * 26 + (c.charCodeAt(0) - 64);
  return n;
}

/**
 * Lignes de la première feuille, cellules en texte (chaîne vide si absente).
 * Les lignes entièrement vides sont omises.
 */
export function lireClasseur(octets: Buffer): string[][] {
  const entrees = entreesZip(octets);
  const trouver = (nom: string) => entrees.find((e) => e.nom === nom);
  const lire = (nom: string) => {
    const e = trouver(nom);
    return e ? lireEntree(octets, e) : null;
  };

  // Première feuille : celle que désigne le classeur, via ses relations.
  let cheminFeuille = "xl/worksheets/sheet1.xml";
  const classeur = lire("xl/workbook.xml");
  const relations = lire("xl/_rels/workbook.xml.rels");
  const rid = classeur?.match(/<sheet\b[^>]*r:id="([^"]+)"/)?.[1];
  if (rid && relations) {
    const cible = relations.match(new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`))?.[1]
      ?? relations.match(new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`))?.[1];
    if (cible) cheminFeuille = cible.startsWith("/") ? cible.slice(1) : `xl/${cible}`;
  }
  const feuille = lire(cheminFeuille);
  if (!feuille) throw new Error("Le classeur ne contient aucune feuille lisible.");

  const partagees = [...(lire("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    texteRiche(m[1])
  );

  const lignes: string[][] = [];
  for (const rangee of feuille.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cellules: string[] = [];
    for (const c of rangee[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributs = c[1];
      const corps = c[2] ?? "";
      const ref = attributs.match(/\br="([A-Z]+)\d+"/)?.[1];
      const type = attributs.match(/\bt="([^"]+)"/)?.[1];
      const v = corps.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let valeur = "";
      if (type === "s" && v !== undefined) valeur = partagees[Number(v)] ?? "";
      else if (type === "inlineStr") valeur = texteRiche(corps);
      else if (v !== undefined) valeur = decoder(v);
      const i = ref ? indexColonne(ref) - 1 : cellules.length;
      while (cellules.length < i) cellules.push("");
      cellules[i] = valeur.trim();
    }
    if (cellules.some((x) => x !== "")) lignes.push(cellules);
  }
  return lignes;
}

/**
 * Lignes d'un CSV (séparateur « ; » ou « , », deviné sur l'en-tête),
 * guillemets doubles gérés. Pour ceux qui exportent depuis un tableur sans
 * passer par .xlsx.
 */
export function lireCsv(texte: string): string[][] {
  const propre = texte.replace(/^﻿/, "");
  const premiere = propre.split(/\r?\n/, 1)[0] ?? "";
  const sep = (premiere.match(/;/g)?.length ?? 0) >= (premiere.match(/,/g)?.length ?? 0) ? ";" : ",";
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let champ = "";
  let guillemets = false;
  for (let i = 0; i < propre.length; i++) {
    const c = propre[i];
    if (guillemets) {
      if (c === '"' && propre[i + 1] === '"') {
        champ += '"';
        i++;
      } else if (c === '"') guillemets = false;
      else champ += c;
    } else if (c === '"') guillemets = true;
    else if (c === sep) {
      ligne.push(champ.trim());
      champ = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && propre[i + 1] === "\n") i++;
      ligne.push(champ.trim());
      if (ligne.some((x) => x !== "")) lignes.push(ligne);
      ligne = [];
      champ = "";
    } else champ += c;
  }
  ligne.push(champ.trim());
  if (ligne.some((x) => x !== "")) lignes.push(ligne);
  return lignes;
}
