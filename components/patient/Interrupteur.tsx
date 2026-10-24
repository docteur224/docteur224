"use client";

/** Interrupteur à bascule — reproduit le .sw des maquettes (46 × 27 px). */
export default function Interrupteur({
  actif,
  onChange,
  label,
}: {
  actif: boolean;
  onChange: (valeur: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={actif}
      aria-label={label}
      onClick={() => onChange(!actif)}
      // Zone de clic de 45px de haut (pseudo-élément) : la pastille garde ses
      // 27px de maquette, le doigt dispose de la hauteur réglementaire.
      className={`relative h-[27px] w-[46px] flex-none cursor-pointer rounded-full transition-colors after:absolute after:inset-x-0 after:-inset-y-[9px] ${
        actif ? "bg-teal" : "bg-[#CBD8E0]"
      }`}
    >
      <span
        className={`absolute top-[3px] h-[21px] w-[21px] rounded-full bg-white transition-[left] ${
          actif ? "left-[22px]" : "left-[3px]"
        }`}
      />
    </button>
  );
}
