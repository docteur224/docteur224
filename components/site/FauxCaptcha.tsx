"use client";

import { useState } from "react";

/**
 * Encadré « Je ne suis pas un robot » — reproduit le .captcha des maquettes.
 * Simple simulation visuelle : le vrai reCAPTCHA viendra avec l'authentification.
 *
 * `onChange` remonte l'état pour que le formulaire puisse garder son bouton
 * principal désactivé tant que la case n'est pas cochée.
 */
export default function FauxCaptcha({ onChange }: { onChange?: (valide: boolean) => void }) {
  const [valide, setValide] = useState(false);

  return (
    <button
      type="button"
      aria-pressed={valide}
      onClick={() => {
        setValide(!valide);
        onChange?.(!valide);
      }}
      className="mb-4 flex w-full max-w-[300px] items-center justify-between rounded-lg border border-line px-[14px] py-[11px] text-left"
    >
      <span className="flex items-center gap-[11px] text-[13px] text-ink">
        <span
          aria-hidden
          className={`grid h-[22px] w-[22px] place-items-center rounded-[3px] border-2 text-sm font-extrabold ${
            valide ? "border-green bg-white text-green" : "border-[#c3c3c3] bg-white"
          }`}
        >
          {valide ? "✓" : ""}
        </span>
        Je ne suis pas un robot
      </span>
      <span className="text-center text-[10px] leading-[1.2] text-muted">reCAPTCHA</span>
    </button>
  );
}
