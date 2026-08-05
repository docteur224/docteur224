"use client";

import { useState } from "react";

/*
 * Champ mot de passe avec bouton œil.
 *
 * Un mot de passe saisi à l'aveugle sur mobile est la première cause
 * d'échec d'inscription ; l'œil laisse le relire avant de valider.
 *
 * Le composant porte ses propres classes (variante web ou mobile) plutôt
 * que de les recevoir : le bouton est positionné DANS le champ, ce qui
 * suppose de maîtriser la marge basse — sur mobile elle vit sur `.inp`,
 * elle est donc déplacée sur l'enveloppe.
 */

const CHAMP_WEB =
  "w-full rounded-xl border border-line bg-white p-[14px] pr-12 text-sm outline-none focus:border-teal";

export default function ChampMotDePasse({
  valeur,
  onChange,
  placeholder = "••••••••",
  ariaLabel,
  autoComplete = "new-password",
  mobile = false,
}: {
  valeur: string;
  onChange: (valeur: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  autoComplete?: string;
  mobile?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div
      className={mobile ? "relative" : "relative mb-3"}
      style={mobile ? { marginBottom: 11 } : undefined}
    >
      <input
        type={visible ? "text" : "password"}
        className={mobile ? "inp" : CHAMP_WEB}
        style={mobile ? { marginBottom: 0, paddingRight: 46 } : undefined}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete={autoComplete}
        value={valeur}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        title={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        className="absolute right-1 top-1 grid h-[calc(100%-8px)] w-10 place-items-center rounded-lg text-base text-muted hover:text-blue"
      >
        <span aria-hidden>{visible ? "🙈" : "👁️"}</span>
      </button>
    </div>
  );
}
