/**
 * Moteur de charte graphique : deux couleurs choisies par l'utilisateur
 * (principale foncée, accent clair) donnent l'ensemble des tokens d'interface.
 *
 * Tout passe par OKLCH plutôt que par HSL. En HSL, deux couleurs de même
 * « luminosité » n'ont pas du tout la même clarté perçue — un jaune à 50 %
 * éblouit là où un bleu à 50 % reste sombre. OKLCH, lui, est aligné sur la
 * perception : conserver L, c'est conserver le contraste réellement vu, donc
 * la lisibilité. C'est ce qui permet de changer la teinte d'un fond sans que
 * le texte posé dessus devienne illisible.
 *
 * Les recettes ne sont pas écrites à la main : elles sont déduites au
 * chargement de la palette actuelle (PALETTE_DEFAUT). Conséquence utile —
 * reconstruire la charte à partir des deux couleurs d'origine redonne
 * exactement la palette d'aujourd'hui, au chiffre près. C'est ce qui garantit
 * que « revenir à la charte par défaut » restitue l'apparence actuelle.
 */

export type Oklch = { L: number; C: number; H: number };

/* ------------------------------------------------------------------ */
/* Conversions                                                         */
/* ------------------------------------------------------------------ */

const versLineaire = (v: number) =>
  v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
const versSrgb = (v: number) =>
  v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;

/**
 * Ramène une saisie à la forme « #rrggbb » minuscule, ou rend null.
 *
 * Tout ce qui entre dans le moteur passe par ici. Les couleurs finissent
 * injectées dans une feuille de style : une chaîne reprise telle quelle
 * laisserait écrire `red;}html{display:none` et détourner la page entière.
 * Ici rien ne ressort qui ne soit six chiffres hexadécimaux.
 */
export function normaliserHex(valeur: string): string | null {
  const v = String(valeur).trim().toLowerCase();
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v);
  if (!m) return null;
  const c = m[1];
  return "#" + (c.length === 3 ? c.split("").map((x) => x + x).join("") : c);
}

export function hexVersRgb(hex: string): [number, number, number] {
  const p = (normaliserHex(hex) ?? "#000000").slice(1);
  return [0, 2, 4].map((i) => parseInt(p.slice(i, i + 2), 16) / 255) as
    [number, number, number];
}

export function hexVersOklch(hex: string): Oklch {
  const [r8, g8, b8] = hexVersRgb(hex);
  const r = versLineaire(r8), g = versLineaire(g8), b = versLineaire(b8);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  const C = Math.hypot(a, bb);
  // Teinte indéfinie pour un gris : on la fixe à 0 plutôt que de laisser NaN
  // se propager dans les calculs.
  const H = C < 1e-6 ? 0 : ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
  return { L, C, H };
}

function oklchVersRgbBrut({ L, C, H }: Oklch): [number, number, number] {
  const rad = (H * Math.PI) / 180;
  const a = C * Math.cos(rad), b = C * Math.sin(rad);

  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const dansLeGamut = (rgb: number[]) =>
  rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/**
 * Conversion vers un hex affichable. Une teinte très saturée peut sortir du
 * gamut sRGB : on réduit alors la saturation jusqu'à ce qu'elle y rentre,
 * plutôt que de rogner les canaux — rogner décale la teinte et la clarté,
 * ce qui ferait dériver le contraste qu'on cherche justement à maîtriser.
 */
export function oklchVersHex(couleur: Oklch): string {
  let { C } = couleur;
  const { L, H } = couleur;
  if (!dansLeGamut(oklchVersRgbBrut(couleur))) {
    let bas = 0, haut = C;
    for (let i = 0; i < 24; i++) {
      const milieu = (bas + haut) / 2;
      if (dansLeGamut(oklchVersRgbBrut({ L, C: milieu, H }))) bas = milieu;
      else haut = milieu;
    }
    C = bas;
  }
  const octet = (v: number) =>
    Math.round(Math.min(1, Math.max(0, versSrgb(v))) * 255)
      .toString(16)
      .padStart(2, "0");
  return "#" + oklchVersRgbBrut({ L, C, H }).map(octet).join("");
}

/* ------------------------------------------------------------------ */
/* Contraste (WCAG 2.1)                                                */
/* ------------------------------------------------------------------ */

export function luminance(hex: string): number {
  const [r, g, b] = hexVersRgb(hex).map(versLineaire);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rapport de contraste entre deux couleurs, de 1 (identiques) à 21. */
export function contraste(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/* ------------------------------------------------------------------ */
/* Palette de référence                                                */
/* ------------------------------------------------------------------ */

/** Les deux couleurs que l'utilisateur choisit. */
export const CHARTE_DEFAUT = { principale: "#15506b", accent: "#2e9cca" };

/**
 * La palette actuelle, reprise de globals.css. Elle sert de double référence :
 * valeurs affichées quand aucune charte n'est choisie, et modèle dont les
 * recettes de dérivation sont déduites.
 */
const PALETTE_DEFAUT = {
  "blue": "#15506b",
  "blue-deep": "#0e3b50",
  "blue-line": "#bfd3f6",
  "teal": "#2e9cca",
  "teal-hover": "#2790bc",
  "teal-soft": "#e3f1f8",
  "teal-line": "#cde6f2",
  "bg": "#eaf1f6",
  "ink": "#16242e",
  "ink-soft": "#3f5360",
  "muted": "#647a89",
  "muted-soft": "#9aa8b2",
  "line": "#e2ebf0",
} as const;

export type NomToken = keyof typeof PALETTE_DEFAUT;

/**
 * Comment chaque token se rattache à l'une des deux couleurs choisies.
 *
 * - « littéral » : la couleur choisie, telle quelle.
 * - « suit »     : garde son écart de clarté avec son ancre. Une principale
 *                  plus claire donne un blue-deep plus clair. Réservé aux
 *                  aplats francs, dont c'est le rôle de bouger.
 * - « teinte »   : garde sa clarté d'origine et n'emprunte que la teinte.
 *                  Indispensable pour les fonds et les textes : un fond de
 *                  page doit rester très clair et une encre très sombre,
 *                  quelles que soient les couleurs choisies. Sans cela, un
 *                  accent sombre rendrait illisible tout texte posé sur les
 *                  aplats clairs.
 */
const ANCRAGE: Record<NomToken, { de: "principale" | "accent"; mode: "litteral" | "suit" | "teinte" }> = {
  "blue": { de: "principale", mode: "litteral" },
  "blue-deep": { de: "principale", mode: "suit" },
  "teal": { de: "accent", mode: "litteral" },
  "teal-hover": { de: "accent", mode: "suit" },
  "blue-line": { de: "principale", mode: "teinte" },
  "teal-soft": { de: "accent", mode: "teinte" },
  "teal-line": { de: "accent", mode: "teinte" },
  "bg": { de: "principale", mode: "teinte" },
  "ink": { de: "principale", mode: "teinte" },
  "ink-soft": { de: "principale", mode: "teinte" },
  "muted": { de: "principale", mode: "teinte" },
  "muted-soft": { de: "principale", mode: "teinte" },
  "line": { de: "principale", mode: "teinte" },
};

/** Écarts mesurés sur la palette actuelle, une fois pour toutes. */
const RECETTES = (() => {
  const ancres = {
    principale: hexVersOklch(CHARTE_DEFAUT.principale),
    accent: hexVersOklch(CHARTE_DEFAUT.accent),
  };
  const sortie = {} as Record<NomToken, {
    de: "principale" | "accent"; mode: "litteral" | "suit" | "teinte";
    L: number; dL: number; ratioC: number; dH: number;
  }>;
  for (const nom of Object.keys(PALETTE_DEFAUT) as NomToken[]) {
    const { de, mode } = ANCRAGE[nom];
    const token = hexVersOklch(PALETTE_DEFAUT[nom]);
    const ancre = ancres[de];
    sortie[nom] = {
      de, mode,
      L: token.L,
      dL: token.L - ancre.L,
      ratioC: ancre.C < 1e-6 ? 0 : token.C / ancre.C,
      dH: token.H - ancre.H,
    };
  }
  return sortie;
})();

/* ------------------------------------------------------------------ */
/* Construction d'une charte                                           */
/* ------------------------------------------------------------------ */

/**
 * Construit la palette complète à partir des deux couleurs choisies.
 * Passer les couleurs par défaut redonne exactement PALETTE_DEFAUT.
 */
export function construireCharte(
  principaleSaisie: string,
  accentSaisie: string,
): Record<NomToken | "sur-principale" | "sur-accent" | "blue-lisible", string> {
  // Une saisie illisible retombe sur la charte Docteur 224 : mieux vaut les
  // couleurs d'origine qu'une page à moitié peinte.
  const principale = normaliserHex(principaleSaisie) ?? CHARTE_DEFAUT.principale;
  const accent = normaliserHex(accentSaisie) ?? CHARTE_DEFAUT.accent;

  const ancres = {
    principale: hexVersOklch(principale),
    accent: hexVersOklch(accent),
  };
  const palette = {} as Record<string, string>;

  for (const nom of Object.keys(RECETTES) as NomToken[]) {
    const r = RECETTES[nom];
    const ancre = ancres[r.de];
    if (r.mode === "litteral") {
      palette[nom] = r.de === "principale" ? principale : accent;
      continue;
    }
    palette[nom] = oklchVersHex({
      // « suit » décale la clarté comme l'ancre ; « teinte » la conserve.
      L: Math.min(1, Math.max(0, r.mode === "suit" ? ancre.L + r.dL : r.L)),
      C: Math.max(0, ancre.C * r.ratioC),
      H: (ancre.H + r.dH + 360) % 360,
    });
  }

  // Ce qui se pose SUR les aplats : blanc ou encre, selon ce qui se lit le
  // mieux. C'est ce calcul qui remplacera les « #fff » écrits en dur, et qui
  // alimentera le verdict de lisibilité montré à l'utilisateur.
  palette["sur-principale"] = surFond(principale, palette["ink"]);
  palette["sur-accent"] = surFond(accent, palette["ink"]);

  // Variante CLAIRE de la couleur principale, pour le texte d'emphase en mode
  // SOMBRE : le bleu profond (--blue) y devient illisible, mais sa teinte est
  // l'identité choisie. On garde la teinte, on monte seulement la clarté — la
  // valeur enregistrée, elle, ne bouge pas. Consommée par le remap .text-blue
  // en mode sombre (globals.css) ; inutilisée en clair.
  palette["blue-lisible"] = oklchVersHex({
    L: 0.74,
    C: Math.min(0.11, Math.max(0.05, ancres.principale.C)),
    H: ancres.principale.H,
  });

  return palette as Record<
    NomToken | "sur-principale" | "sur-accent" | "blue-lisible",
    string
  >;
}

/**
 * Ce qu'on écrit sur un aplat : du blanc, sauf si le blanc devient illisible.
 *
 * On ne prend pas « le meilleur des deux » : sur le teal actuel, le blanc
 * donne 3,12:1 et l'encre 5,07:1, donc le meilleur choix basculerait tous les
 * boutons de la plateforme en texte foncé — un changement d'allure que
 * personne n'a demandé. Le blanc sur aplat coloré est l'identité de
 * Docteur 224 ; on la garde tant qu'elle reste lisible, et l'écran de
 * personnalisation avertit quand le contraste faiblit, au lieu de décider à
 * la place de l'utilisateur.
 *
 * Le seuil de 3:1 est le minimum WCAG pour du gros texte et pour les éléments
 * d'interface. En dessous, le blanc ne se lit plus du tout : on bascule.
 */
export function surFond(fond: string, encre: string = PALETTE_DEFAUT.ink): string {
  return contraste(fond, "#ffffff") >= 3 ? "#ffffff" : encre;
}

/** La palette sous forme de déclarations CSS, prêtes à être injectées. */
export function charteVersCss(principale: string, accent: string): string {
  const palette = construireCharte(principale, accent);
  return Object.entries(palette)
    .map(([nom, valeur]) => `--${nom}:${valeur}`)
    .join(";");
}
