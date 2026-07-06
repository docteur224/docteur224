/**
 * Panneau latéral bleu des écrans d'authentification — reproduit le .authside
 * de la maquette web : dégradé bleu, logo, points forts et statistiques.
 * Masqué sur mobile, où seul le formulaire s'affiche.
 */
export default function CoteAuth({
  titre,
  texte,
  points,
  stats,
}: {
  titre: React.ReactNode;
  texte: string;
  points: { icone: string; texte: string }[];
  stats?: { valeur: string; label: string }[];
}) {
  return (
    <div className="relative hidden overflow-hidden bg-[linear-gradient(160deg,var(--blue),var(--blue-deep))] px-[46px] py-[54px] text-white lg:flex lg:flex-col lg:justify-center">
      <span
        aria-hidden
        className="absolute -bottom-[90px] -right-[90px] h-[260px] w-[260px] rounded-full bg-[rgba(46,156,202,0.2)]"
      />
      <div
        aria-hidden
        className="relative mb-6 grid h-[46px] w-[46px] place-items-center rounded-[14px] bg-[linear-gradient(135deg,var(--teal),var(--blue))] text-[19px] font-extrabold"
      >
        D
      </div>
      <h2 className="relative text-[30px] font-extrabold leading-[1.18] tracking-[-0.6px]">
        {titre}
      </h2>
      <p className="relative mt-[14px] max-w-[340px] text-[14.5px] leading-relaxed opacity-90">
        {texte}
      </p>
      <div className="relative mt-[26px] flex flex-col gap-[13px]">
        {points.map((point) => (
          <div
            key={point.texte}
            className="flex items-center gap-[11px] text-[13.5px] opacity-95"
          >
            <span
              aria-hidden
              className="grid h-6 w-6 flex-none place-items-center rounded-full bg-white/[0.18] text-xs"
            >
              {point.icone}
            </span>
            {point.texte}
          </div>
        ))}
      </div>
      {stats && (
        <div className="relative mt-[30px] flex gap-6">
          {stats.map((stat) => (
            <div key={stat.label}>
              <b className="block text-xl font-extrabold">{stat.valeur}</b>
              <small className="text-[11.5px] opacity-85">{stat.label}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
