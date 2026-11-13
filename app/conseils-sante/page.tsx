import type { Metadata } from "next";
import Link from "next/link";
import PageContenu, { AppelAction, Rubrique } from "@/components/site/PageContenu";
import CarteConseil, { Illustration } from "@/components/site/CarteConseil";
import PartageSocial from "@/components/site/PartageSocial";
import { URGENCES } from "@/lib/conseils-sante";
import { lireConseilsPublies } from "@/lib/conseils-sante-serveur";

export const metadata: Metadata = {
  title: "Conseils santé | Docteur 224",
  description:
    "Prévention du paludisme, eau et hygiène, suivi de grossesse, tension et diabète, vaccination des enfants : les gestes qui protègent, et les signes qui doivent amener à consulter.",
};

/*
 * Conseils santé — prévention d'ordre général, alignée sur les recommandations
 * de santé publique. Aucune posologie, aucun traitement : chaque fiche se
 * termine par « quand consulter ». L'avertissement en tête n'est pas décoratif.
 *
 * Le contenu vient de la base (table `conseils_sante`, migration 0091), rédigé
 * depuis l'administration (Paramètres → Conseils santé). Si la migration n'est
 * pas encore passée, `lireConseilsPublies` retombe sur les fiches d'origine.
 *
 * Ce n'est pas un blog : chaque carte renvoie vers « En savoir plus », la page
 * détaillée de la fiche, et non vers un article daté.
 */

// Contenu éditorial géré en base : on relit à chaque visite plutôt que de figer
// la page au build, pour qu'une fiche publiée apparaisse sans redéploiement.
export const dynamic = "force-dynamic";

export default async function ConseilsSante() {
  const conseils = await lireConseilsPublies();
  const vedette = conseils.find((c) => c.vedette) ?? conseils[0] ?? null;
  const reste = conseils.filter((c) => c.id !== vedette?.id);

  return (
    <PageContenu
      titre="Conseils santé"
      emoji="🌿"
      large
      chapeau="Les gestes de prévention qui comptent au quotidien, et surtout : les signes qui doivent amener à consulter sans attendre."
    >
      <div className="mb-5 flex items-start gap-3 rounded-2xl border border-[#f0dcbe] bg-amber-soft p-[16px] md:p-5">
        <span className="text-[18px] leading-none" aria-hidden>
          ⚠️
        </span>
        <p className="text-[12.5px] leading-relaxed text-[#7a5320] md:text-[13.5px]">
          Ces conseils sont d’ordre général et ne remplacent pas l’avis d’un professionnel de
          santé. En cas de doute sur votre état ou celui d’un proche, consultez.
        </p>
      </div>

      {/* ===================== Mise en avant ===================== */}
      {vedette && (
        <Link
          href={`/conseils-sante/${vedette.slug}`}
          className="group mb-6 grid overflow-hidden rounded-[22px] border border-line bg-white transition-all hover:border-teal-line hover:shadow-[0_26px_60px_-30px_rgba(21,80,107,0.5)] md:mb-8 md:grid-cols-2"
        >
          <div className="md:order-2">
            <Illustration conseil={vedette} hauteur="aspect-[16/10] md:aspect-auto md:h-full md:min-h-[300px]" />
          </div>
          <div className="flex flex-col justify-center p-[20px] md:order-1 md:p-9">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-teal px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.06em] text-white">
              ★ À la une{vedette.categorie ? ` · ${vedette.categorie}` : ""}
            </span>
            <h2 className="mt-3 text-[22px] font-extrabold leading-tight tracking-[-0.3px] text-ink md:text-[28px]">
              {vedette.titre}
            </h2>
            <p className="mt-3 text-[13.5px] leading-relaxed text-muted md:text-[15px]">
              {vedette.resume}
            </p>
            <span className="mt-5 inline-flex w-fit items-center gap-2 rounded-[11px] bg-teal px-[18px] py-[11px] text-[13.5px] font-bold text-white transition-colors group-hover:bg-teal-hover">
              En savoir plus
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M5 12h14M13 6l6 6-6 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </div>
        </Link>
      )}

      {/* ===================== Grille des fiches ===================== */}
      {reste.length > 0 && (
        <>
          <Rubrique>Tous les conseils</Rubrique>
          <div className="grid gap-3.5 sm:grid-cols-2 md:grid-cols-3 md:gap-5">
            {reste.map((c) => (
              <CarteConseil key={c.id} conseil={c} />
            ))}
          </div>
        </>
      )}

      {/* ===================== Partage ===================== */}
      <div className="mt-6 md:mt-8">
        <PartageSocial titre="Conseils santé — Docteur 224" />
      </div>

      {/* ===================== Urgences ===================== */}
      <Rubrique>Consulter sans attendre</Rubrique>
      <div className="rounded-2xl border border-[#f0cdc7] bg-red-soft p-[18px] md:p-6">
        <b className="text-[14px] font-extrabold text-red md:text-[16px]">
          Ces signes imposent une consultation immédiate
        </b>
        <ul className="mt-3 grid gap-1.5 md:grid-cols-2">
          {URGENCES.map((u) => (
            <li
              key={u}
              className="flex gap-2 text-[12.5px] leading-relaxed text-[#7b332a] md:text-[13.5px]"
            >
              <span aria-hidden>•</span>
              {u}
            </li>
          ))}
        </ul>
        <p className="mt-3.5 text-[12px] leading-relaxed text-[#7b332a] md:text-[13px]">
          N’attendez pas un rendez-vous en ligne : rendez-vous au service d’urgences le plus proche
          ou appelez les secours.
        </p>
      </div>

      <AppelAction
        titre="Un doute sur un symptôme ?"
        texte="Un médecin généraliste est le bon premier interlocuteur : il oriente ensuite vers le spécialiste s’il y a lieu."
      >
        <Link
          href="/resultats?specialite=M%C3%A9decine%20g%C3%A9n%C3%A9rale"
          className="pointer-coarse:py-3 rounded-[11px] bg-teal px-[18px] py-[11px] text-[13.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
        >
          Trouver un généraliste
        </Link>
        <Link
          href="/faq"
          className="rounded-[11px] border-[1.5px] border-line bg-white px-[18px] py-[11px] text-[13.5px] font-bold text-blue transition-colors hover:bg-bg"
        >
          Questions fréquentes
        </Link>
      </AppelAction>
    </PageContenu>
  );
}
