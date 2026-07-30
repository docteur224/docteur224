import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import PiedPageMobile from "@/components/mobile/PiedPageMobile";
import TabBarMobile from "@/components/mobile/TabBarMobile";
import TopNav from "@/components/site/TopNav";
import Footer from "@/components/site/Footer";

/**
 * Gabarit des pages éditoriales du site (À propos, Conseils santé, FAQ).
 *
 * Même chrome que le reste — barre haute et pied de page mobiles, TopNav et
 * pied de page web — pour que ces écrans ne soient pas des impasses. Le titre
 * est présenté dans un bandeau dégradé repris du héros de l'accueil, afin que
 * les trois pages forment visiblement une même famille.
 */
export default function PageContenu({
  titre,
  chapeau,
  emoji,
  children,
}: {
  titre: string;
  chapeau?: string;
  /** Pictogramme du bandeau — identifie la rubrique d'un coup d'œil. */
  emoji?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <TopNav />

      {/* ===================== MOBILE ===================== */}
      <div className="with-tabbar md:hidden">
        <EnTeteMobile retour="/" titre={titre} />
        <div className="bandeau-edito">
          {emoji && (
            <span className="em" aria-hidden>
              {emoji}
            </span>
          )}
          <h1>{titre}</h1>
          {chapeau && <p>{chapeau}</p>}
        </div>
        <div className="pad" style={{ paddingTop: 16 }}>
          {children}
        </div>
        <PiedPageMobile />
        <TabBarMobile role="public" />
      </div>

      {/* ====================== WEB ======================= */}
      <main className="hidden flex-1 md:block">
        <div className="bg-[linear-gradient(160deg,var(--blue)_0%,var(--blue-deep)_100%)] px-[30px] py-[46px] text-white">
          <div className="mx-auto max-w-[760px]">
            {emoji && (
              <span className="mb-3 block text-[34px]" aria-hidden>
                {emoji}
              </span>
            )}
            <h1 className="text-[34px] font-extrabold leading-tight tracking-[-0.7px]">{titre}</h1>
            {chapeau && (
              <p className="mt-3 max-w-[620px] text-[15px] leading-relaxed opacity-90">{chapeau}</p>
            )}
          </div>
        </div>
        <div className="mx-auto w-full max-w-[760px] px-[30px] py-[38px]">{children}</div>
      </main>

      <Footer />
    </div>
  );
}

/** Bloc titré, en carte — l'unité de composition des trois pages. */
export function Section({
  titre,
  icone,
  children,
}: {
  titre: string;
  icone?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-3 rounded-2xl border border-line bg-white p-[18px] md:mb-4 md:p-6">
      <h2 className="flex items-center gap-2.5 text-[15px] font-extrabold md:text-[17px]">
        {icone && (
          <span
            aria-hidden
            className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[10px] bg-teal-soft text-base"
          >
            {icone}
          </span>
        )}
        {titre}
      </h2>
      <div className="mt-2.5 text-[13px] leading-relaxed text-muted md:text-[14px]">{children}</div>
    </section>
  );
}

/** Intertitre entre deux groupes de sections. */
export function Rubrique({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2.5 mt-6 text-[12px] font-extrabold uppercase tracking-[0.1em] text-muted first:mt-0 md:mb-3 md:mt-9 md:text-[13px]">
      {children}
    </h2>
  );
}

/** Bandeau d'appel à l'action, en pied de page éditoriale. */
export function AppelAction({
  titre,
  texte,
  children,
}: {
  titre: string;
  texte: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6 rounded-2xl border border-[#cde6f2] bg-teal-soft p-[18px] md:mt-8 md:p-7">
      <b className="block text-[15px] font-extrabold text-blue md:text-[18px]">{titre}</b>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted md:text-[14px]">{texte}</p>
      <div className="mt-4 flex flex-wrap gap-2.5">{children}</div>
    </div>
  );
}
