"use client";

import { useRef } from "react";

/*
 * Saisie case par case d'un code (6 chiffres reçus, ou PIN à 4 chiffres).
 *
 * La valeur est une suite CONTIGUË de chiffres : on ne peut pas remplir la
 * quatrième case en laissant la deuxième vide. Cliquer une case plus loin
 * renvoie à la première libre, l'effacement retire le dernier chiffre. C'est
 * ce qui permet au collage (« 482913 ») et au remplissage automatique du code
 * SMS (`one-time-code`, qui verse tout dans la première case) de se répartir
 * sans trou.
 *
 * Masquée (PIN), chaque case est un champ mot de passe : le chiffre n'est
 * jamais lisible par-dessus l'épaule.
 */

export default function ChiffresCode({
  longueur,
  valeur,
  onChange,
  libelle,
  masque = false,
  onValider,
  autoFocus = false,
}: {
  longueur: number;
  valeur: string;
  onChange: (v: string) => void;
  /** Nom du champ, pour les lecteurs d'écran (« Code PIN »). */
  libelle: string;
  masque?: boolean;
  /** Entrée au clavier. */
  onValider?: () => void;
  autoFocus?: boolean;
}) {
  const cases = useRef<(HTMLInputElement | null)[]>([]);
  /*
   * Le focus avance tout de suite, dans le même événement que la frappe : une
   * frappe rapide arrive ainsi toujours dans la case suivante. Mais la case
   * atteinte n'a pas encore été rendue avec la nouvelle valeur, et son
   * `onFocus` — qui renvoie un clic trop lointain à la première case libre —
   * la jugerait trop loin et ramènerait le focus en arrière. D'où ce drapeau :
   * le renvoi ne concerne que le focus donné par l'utilisateur.
   */
  const deplacement = useRef(false);
  const focaliser = (i: number) => {
    deplacement.current = true;
    cases.current[Math.min(i, longueur - 1)]?.focus();
    deplacement.current = false;
  };

  function saisir(i: number, brut: string, avant: string) {
    let chiffres = brut.replace(/\D/g, "");
    // La case contenait déjà un chiffre : ne garder que la frappe nouvelle.
    if (avant && chiffres.length > 1) {
      chiffres = chiffres.startsWith(avant) ? chiffres.slice(1) : chiffres.slice(0, -1);
    }
    if (!chiffres) return;
    const suite = (valeur.slice(0, i) + chiffres).slice(0, longueur);
    onChange(suite);
    focaliser(suite.length);
  }

  return (
    <div
      role="group"
      aria-label={libelle}
      className="mx-auto mb-3 grid gap-2"
      style={{
        gridTemplateColumns: `repeat(${longueur}, minmax(0, 1fr))`,
        maxWidth: longueur > 4 ? 360 : 248,
      }}
    >
      {Array.from({ length: longueur }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            cases.current[i] = el;
          }}
          type={masque ? "password" : "text"}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={masque ? "off" : i === 0 ? "one-time-code" : "off"}
          autoFocus={autoFocus && i === 0}
          aria-label={`${libelle} — chiffre ${i + 1} sur ${longueur}`}
          value={valeur[i] ?? ""}
          onFocus={() => {
            if (!deplacement.current && i > valeur.length) focaliser(valeur.length);
          }}
          onChange={(e) => saisir(i, e.target.value, valeur[i] ?? "")}
          onPaste={(e) => {
            e.preventDefault();
            saisir(i, e.clipboardData.getData("text"), "");
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace") {
              e.preventDefault();
              const suite = valeur.slice(0, Math.max(0, Math.min(i + 1, valeur.length) - 1));
              onChange(suite);
              focaliser(suite.length);
            } else if (e.key === "Enter") {
              onValider?.();
            }
          }}
          className="aspect-square w-full min-w-0 rounded-xl border-[1.5px] border-line bg-card text-center text-[22px] font-extrabold text-ink outline-none transition-colors focus:border-teal"
        />
      ))}
    </div>
  );
}
