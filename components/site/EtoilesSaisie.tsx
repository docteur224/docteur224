"use client";

import { useState } from "react";

/*
 * Saisie d'une note de 1 à 5 étoiles.
 *
 * Implémenté en groupe de radios plutôt qu'en boutons : le clavier (flèches),
 * le lecteur d'écran et la validation de formulaire fonctionnent alors sans
 * code supplémentaire. Les radios sont masquées visuellement, l'étoile sert
 * de label.
 */

const LIBELLES = ["Très décevant", "Décevant", "Correct", "Bien", "Excellent"];

export default function EtoilesSaisie({
  note,
  onChange,
  nom = "note",
  taille = 30,
}: {
  note: number;
  onChange: (note: number) => void;
  nom?: string;
  taille?: number;
}) {
  // Aperçu au survol : l'utilisateur voit ce qu'il s'apprête à choisir.
  const [survol, setSurvol] = useState(0);
  const affichee = survol || note;

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Votre note"
        className="flex items-center gap-1"
        onMouseLeave={() => setSurvol(0)}
      >
        {[1, 2, 3, 4, 5].map((valeur) => (
          <label
            key={valeur}
            onMouseEnter={() => setSurvol(valeur)}
            className="cursor-pointer leading-none transition-transform hover:scale-110"
            style={{ fontSize: taille }}
          >
            <input
              type="radio"
              name={nom}
              value={valeur}
              checked={note === valeur}
              onChange={() => onChange(valeur)}
              className="sr-only"
            />
            <span
              aria-hidden
              className={valeur <= affichee ? "text-[#E8A33D]" : "text-[#D6DEE4]"}
            >
              ★
            </span>
            <span className="sr-only">
              {valeur} étoile{valeur > 1 ? "s" : ""} — {LIBELLES[valeur - 1]}
            </span>
          </label>
        ))}
        <span className="ml-2 text-[13px] font-bold text-muted">
          {affichee ? LIBELLES[affichee - 1] : "Choisissez une note"}
        </span>
      </div>
    </div>
  );
}
