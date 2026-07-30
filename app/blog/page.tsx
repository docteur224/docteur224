import type { Metadata } from "next";
import Link from "next/link";
import PageContenu from "@/components/site/PageContenu";

export const metadata: Metadata = {
  title: "Blog | Docteur 224",
  description:
    "Conseils santé et actualités de la plateforme Docteur 224. Les premiers articles arrivent bientôt.",
};

/*
 * Blog — la rubrique existe (elle est annoncée dans le menu), mais aucun
 * article n'est encore publié. On l'affiche honnêtement plutôt que d'inventer
 * du contenu : il n'y a pas de table `articles` dans la base.
 */
export default function Blog() {
  return (
    <PageContenu
      titre="Blog"
      chapeau="Conseils santé, prévention et actualités de la plateforme."
    >
      <div className="rounded-2xl border border-line bg-white p-7 text-center md:p-10">
        <div className="text-[32px]" aria-hidden>
          📰
        </div>
        <b className="mt-3 block text-[15px] font-extrabold md:text-[17px]">
          Les premiers articles arrivent bientôt
        </b>
        <p className="mx-auto mt-2 max-w-[420px] text-[13px] leading-relaxed text-muted md:text-[14px]">
          Cette rubrique accueillera des conseils de prévention rédigés avec des professionnels de
          santé, ainsi que les nouveautés de Docteur 224. En attendant, vous pouvez déjà chercher
          un praticien et réserver en ligne.
        </p>
        <Link
          href="/resultats"
          className="mt-5 inline-block rounded-[11px] bg-teal px-[18px] py-[11px] text-[13.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
        >
          Trouver un médecin
        </Link>
      </div>
    </PageContenu>
  );
}
