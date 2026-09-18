import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import TopNav from "@/components/site/TopNav";

/*
 * Squelette de la page de résultats, affiché par Next pendant que le serveur
 * charge médecins et disponibilités (fallback Suspense de la route : aucune
 * donnée, aucune logique — uniquement des formes aux dimensions des cartes).
 *
 * Il remplace l'écran vide qui précédait chaque recherche : le patient voit
 * tout de suite la structure de la page qui arrive, sur téléphone comme sur
 * grand écran.
 */
export default function ChargementResultats() {
  return (
    <div className="min-h-screen bg-bg" aria-busy="true" aria-label="Chargement des résultats">
      <TopNav lienActif="trouver" />

      {/* ---- Mobile ---- */}
      <div className="with-tabbar md:hidden">
        <EnTeteMobile retour="/" titre="Recherche" sousTitre="Chargement des médecins…" />
        <div className="px-[18px] pt-3">
          <span className="ui-skeleton block h-[54px]" />
          <span className="ui-skeleton mt-3 block h-[36px] w-2/3" />
          <span className="ui-skeleton mt-[18px] block h-[20px] w-1/2" />
          {Array.from({ length: 4 }, (_, i) => (
            <span key={i} className="ui-skeleton mt-[11px] block h-[118px] rounded-2xl" />
          ))}
        </div>
      </div>

      {/* ---- Web ---- */}
      <div className="hidden md:block">
        <div className="border-b border-line bg-white px-[30px] py-[22px]">
          <div className="mx-auto max-w-[1020px]">
            <span className="ui-skeleton block h-[14px] w-[120px]" />
            <span className="ui-skeleton mt-2 block h-[26px] w-[360px]" />
            <span className="ui-skeleton mx-auto mt-[14px] block h-[62px] max-w-[860px] rounded-2xl" />
          </div>
        </div>
        <div className="mx-auto grid max-w-[1020px] gap-6 px-[30px] py-[26px] lg:grid-cols-[244px_1fr]">
          <span className="ui-skeleton hidden h-[420px] rounded-2xl lg:block" />
          <div className="flex flex-col gap-[14px]">
            <span className="ui-skeleton block h-[20px] w-[140px]" />
            {Array.from({ length: 4 }, (_, i) => (
              <span key={i} className="ui-skeleton block h-[132px] rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
