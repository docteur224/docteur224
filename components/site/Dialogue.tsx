"use client";

/**
 * Enveloppe de dialogue : feuille montante sur téléphone, carte centrée à
 * partir de `md`. Même forme que celle de DialoguePaiement, extraite le jour
 * où les écrans « Équipe admin » et « Mes assistant(e)s » ont eu besoin
 * exactement du même cadre.
 *
 * Le corps défile, l'en-tête et le pied restent visibles : sur un téléphone,
 * un bouton « Enregistrer » sous la ligne de flottaison ne se trouve pas.
 * D'où `pied`, plutôt qu'un simple `children` où les boutons partiraient
 * avec le défilement.
 */
export default function Dialogue({
  titre,
  icone,
  sousTitre,
  onFermer,
  pied,
  children,
}: {
  titre: string;
  icone: React.ReactNode;
  sousTitre?: string;
  onFermer: () => void;
  /** Boutons d'action, hors du défilement. */
  pied?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titre}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 md:items-center md:overflow-y-auto md:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onFermer();
      }}
    >
      <div className="flex max-h-[94vh] w-full flex-col rounded-t-2xl border border-line bg-white md:max-h-[90vh] md:max-w-[480px] md:rounded-2xl md:shadow-xl">
        <div className="flex items-start gap-3 border-b border-line p-4">
          <span aria-hidden className="text-[17px]">
            {icone}
          </span>
          <h4 className="flex-1 text-[15.5px] font-extrabold">
            {titre}
            {sousTitre && (
              <span className="mt-0.5 block text-[12px] font-semibold text-muted">{sousTitre}</span>
            )}
          </h4>
          <button
            type="button"
            onClick={onFermer}
            aria-label="Fermer"
            className="flex-none rounded-lg px-2 py-1 text-lg text-muted hover:bg-bg"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {pied && <div className="flex flex-wrap gap-2.5 border-t border-line p-4">{pied}</div>}
      </div>
    </div>
  );
}
