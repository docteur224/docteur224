import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import TabBarMobile from "@/components/mobile/TabBarMobile";
import TopNav from "@/components/site/TopNav";
import Footer from "@/components/site/Footer";

/**
 * Gabarit des pages éditoriales du site (À propos, FAQ, Blog) : même chrome
 * que le reste — barre haute mobile, TopNav et pied de page web — pour que
 * ces écrans ne soient pas des impasses.
 */
export default function PageContenu({
  titre,
  chapeau,
  children,
}: {
  titre: string;
  chapeau?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <TopNav />

      <div className="with-tabbar md:hidden">
        <EnTeteMobile retour="/" titre={titre} recherche />
        <div className="pad" style={{ paddingTop: 12 }}>
          {chapeau && (
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 6 }}>
              {chapeau}
            </p>
          )}
          {children}
        </div>
        <TabBarMobile role="public" />
      </div>

      <main className="mx-auto hidden w-full max-w-[760px] px-[30px] py-[38px] md:block">
        <h1 className="text-[30px] font-extrabold tracking-[-0.6px]">{titre}</h1>
        {chapeau && (
          <p className="mt-3 text-[14.5px] leading-relaxed text-muted">{chapeau}</p>
        )}
        <div className="mt-7">{children}</div>
      </main>

      <Footer />
    </div>
  );
}

/** Bloc de texte titré, mis en carte — commun aux trois pages. */
export function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="mb-3 rounded-2xl border border-line bg-white p-[18px] md:mb-4 md:p-6">
      <h2 className="text-[15px] font-extrabold md:text-[17px]">{titre}</h2>
      <div className="mt-2 text-[13px] leading-relaxed text-muted md:text-[14px]">{children}</div>
    </section>
  );
}
