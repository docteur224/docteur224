"use client";

import { useState } from "react";

/**
 * Case à cocher des formulaires d'inscription — reproduit le .chkrow des maquettes.
 *
 * L'état reste interne (les appelants n'ont pas tous besoin de le connaître)
 * mais `onChange` le remonte, ce qui permet de conditionner le bouton
 * « Continuer » à l'acceptation des conditions.
 */
export default function CaseCocher({
  texte,
  onChange,
}: {
  texte: string;
  onChange?: (cochee: boolean) => void;
}) {
  const [cochee, setCochee] = useState(false);

  return (
    <label className="mb-4 mt-1 flex cursor-pointer items-start gap-[9px] text-[12.5px] text-muted">
      <input
        type="checkbox"
        checked={cochee}
        onChange={(e) => {
          setCochee(e.target.checked);
          onChange?.(e.target.checked);
        }}
        className="sr-only"
      />
      <span
        aria-hidden
        className={`mt-[1px] grid h-[18px] w-[18px] flex-none place-items-center rounded-[5px] border-[1.5px] text-[11px] font-extrabold text-white ${
          cochee ? "border-teal bg-teal" : "border-line bg-white"
        }`}
      >
        {cochee ? "✓" : ""}
      </span>
      <span>{texte}</span>
    </label>
  );
}
