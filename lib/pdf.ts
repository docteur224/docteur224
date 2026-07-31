/*
 * Générateur PDF minimal, sans dépendance.
 *
 * Le besoin est étroit — une ordonnance est du texte mis en page — et les
 * bibliothèques du marché (jsPDF, pdfkit) pèsent plusieurs centaines de Ko
 * pour des fonctions dont rien ici ne se sert. On écrit donc directement un
 * PDF 1.4 avec les polices standard Helvetica, qu'aucun lecteur n'a besoin
 * d'embarquer.
 *
 * Limites assumées : texte seulement (pas d'image ni de vectoriel), polices
 * Helvetica et Helvetica-Bold, encodage WinAnsi (CP1252) — largement
 * suffisant pour le français.
 */

const A4 = { largeur: 595.28, hauteur: 841.89 };
const MARGE = 56; // ~2 cm

/* ---------- Encodage WinAnsi (CP1252) ---------- */

// Les seuls caractères où CP1252 diverge de Latin-1 : la plage 0x80–0x9F.
// Sans cette table, une apostrophe typographique « ’ » sortirait en « ? ».
const CP1252 = new Map<number, number>([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85],
  [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a],
  [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92],
  [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c],
  [0x017e, 0x9e], [0x0178, 0x9f],
]);

function versWinAnsi(texte: string): number[] {
  const octets: number[] = [];
  for (const caractere of texte) {
    const point = caractere.codePointAt(0)!;
    if (point < 0x100) octets.push(point);
    else octets.push(CP1252.get(point) ?? 0x3f); // « ? » pour l'inconnu
  }
  return octets;
}

/** Échappe puis encode une chaîne pour un littéral PDF « (…) ». */
function litteral(texte: string): number[] {
  const sortie: number[] = [0x28]; // (
  for (const octet of versWinAnsi(texte)) {
    if (octet === 0x28 || octet === 0x29 || octet === 0x5c) sortie.push(0x5c);
    sortie.push(octet);
  }
  sortie.push(0x29); // )
  return sortie;
}

/* ---------- Largeurs Helvetica (unités/1000) ---------- */

// Codes 32 à 126. Au-delà (lettres accentuées), 556 est la largeur de la
// très grande majorité des glyphes des deux graisses : l'approximation ne
// se voit pas sur une ligne de texte.
const LARGEURS_NORMAL = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const LARGEURS_GRAS = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

function largeurTexte(texte: string, taille: number, gras: boolean): number {
  const table = gras ? LARGEURS_GRAS : LARGEURS_NORMAL;
  let total = 0;
  for (const caractere of texte) {
    const point = caractere.codePointAt(0)!;
    total += point >= 32 && point <= 126 ? table[point - 32] : 556;
  }
  return (total * taille) / 1000;
}

/* ---------- Construction du document ---------- */

export interface OptionsTexte {
  gras?: boolean;
  taille?: number;
  /** Gris de 0 (noir) à 1 (blanc). */
  gris?: number;
  align?: "gauche" | "centre" | "droite";
  /** Interligne en multiples de la taille de police. */
  interligne?: number;
}

export class DocumentPdf {
  private pages: string[] = [];
  private courante: string[] = [];
  private y = A4.hauteur - MARGE;
  private readonly largeurUtile = A4.largeur - 2 * MARGE;

  private nouvellePage() {
    this.pages.push(this.courante.join("\n"));
    this.courante = [];
    this.y = A4.hauteur - MARGE;
  }

  /** Réserve la place demandée, en changeant de page si nécessaire. */
  private reserver(hauteur: number) {
    if (this.y - hauteur < MARGE + 40) this.nouvellePage();
  }

  /** Découpe un texte pour qu'aucune ligne ne dépasse la largeur utile. */
  private decouper(texte: string, taille: number, gras: boolean, largeur: number): string[] {
    const lignes: string[] = [];
    for (const paragraphe of texte.split("\n")) {
      if (paragraphe.trim() === "") {
        lignes.push("");
        continue;
      }
      let ligne = "";
      for (const mot of paragraphe.split(/\s+/)) {
        const essai = ligne ? `${ligne} ${mot}` : mot;
        if (largeurTexte(essai, taille, gras) <= largeur) {
          ligne = essai;
        } else {
          if (ligne) lignes.push(ligne);
          ligne = mot;
        }
      }
      lignes.push(ligne);
    }
    return lignes;
  }

  /** Écrit un bloc de texte et avance le curseur. */
  texte(contenu: string, options: OptionsTexte = {}): this {
    const taille = options.taille ?? 10;
    const gras = options.gras ?? false;
    const gris = options.gris ?? 0;
    const interligne = (options.interligne ?? 1.35) * taille;

    for (const ligne of this.decouper(contenu, taille, gras, this.largeurUtile)) {
      this.reserver(interligne);
      if (ligne !== "") {
        const largeur = largeurTexte(ligne, taille, gras);
        const x =
          options.align === "centre"
            ? MARGE + (this.largeurUtile - largeur) / 2
            : options.align === "droite"
              ? A4.largeur - MARGE - largeur
              : MARGE;
        this.courante.push(
          `q ${gris} ${gris} ${gris} rg BT /${gras ? "F2" : "F1"} ${taille} Tf ` +
            `1 0 0 1 ${x.toFixed(2)} ${(this.y - taille).toFixed(2)} Tm ` +
            `${String.fromCharCode(...litteral(ligne))} Tj ET Q`
        );
      }
      this.y -= interligne;
    }
    return this;
  }

  /** Espace vertical. */
  saut(hauteur = 10): this {
    this.y -= hauteur;
    return this;
  }

  /** Filet horizontal pleine largeur. */
  filet(gris = 0.82): this {
    this.reserver(12);
    this.y -= 6;
    this.courante.push(
      `q 0.7 w ${gris} ${gris} ${gris} RG ${MARGE} ${this.y.toFixed(2)} m ` +
        `${(A4.largeur - MARGE).toFixed(2)} ${this.y.toFixed(2)} l S Q`
    );
    this.y -= 8;
    return this;
  }

  /**
   * Bloc en bas de la dernière page (mentions légales). Appelé en tout
   * dernier : il pose le texte à hauteur fixe, sans toucher au curseur.
   */
  piedDePage(contenu: string): this {
    const taille = 7.5;
    const lignes = this.decouper(contenu, taille, false, this.largeurUtile);
    let y = MARGE + lignes.length * taille * 1.3;
    for (const ligne of lignes) {
      this.courante.push(
        `q 0.45 0.45 0.45 rg BT /F1 ${taille} Tf 1 0 0 1 ${MARGE} ${y.toFixed(2)} Tm ` +
          `${String.fromCharCode(...litteral(ligne))} Tj ET Q`
      );
      y -= taille * 1.3;
    }
    return this;
  }

  /** Assemble le fichier PDF complet. */
  versOctets(): Uint8Array {
    const pages = [...this.pages, this.courante.join("\n")];
    const nbPages = pages.length;

    // Objets : 1 catalogue, 2 arbre de pages, 3..(2+n) pages,
    // (3+n)..(2+2n) flux de contenu, puis les deux polices.
    const idPage = (i: number) => 3 + i;
    const idContenu = (i: number) => 3 + nbPages + i;
    const idF1 = 3 + 2 * nbPages;
    const idF2 = idF1 + 1;

    const objets: string[] = [];
    objets.push(`<< /Type /Catalog /Pages 2 0 R >>`);
    objets.push(
      `<< /Type /Pages /Kids [${pages.map((_, i) => `${idPage(i)} 0 R`).join(" ")}] /Count ${nbPages} >>`
    );
    pages.forEach((_, i) => {
      objets.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.largeur} ${A4.hauteur}] ` +
          `/Resources << /Font << /F1 ${idF1} 0 R /F2 ${idF2} 0 R >> >> ` +
          `/Contents ${idContenu(i)} 0 R >>`
      );
    });
    pages.forEach((flux) => {
      // La longueur se compte en octets encodés, pas en caractères JS.
      const longueur = versWinAnsi(flux).length;
      objets.push(`<< /Length ${longueur} >>\nstream\n${flux}\nendstream`);
    });
    objets.push(
      `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`
    );
    objets.push(
      `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`
    );

    const octets: number[] = [];
    const ajouter = (texte: string) => octets.push(...versWinAnsi(texte));

    ajouter("%PDF-1.4\n");
    const decalages: number[] = [];
    objets.forEach((corps, i) => {
      decalages.push(octets.length);
      ajouter(`${i + 1} 0 obj\n${corps}\nendobj\n`);
    });

    const debutXref = octets.length;
    ajouter(`xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`);
    for (const decalage of decalages) {
      ajouter(`${String(decalage).padStart(10, "0")} 00000 n \n`);
    }
    ajouter(
      `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${debutXref}\n%%EOF\n`
    );

    return Uint8Array.from(octets);
  }
}
