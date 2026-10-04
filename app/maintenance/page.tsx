import type { Metadata } from "next";
import Logo from "@/components/site/Logo";
import CompteARebours from "@/components/site/CompteARebours";
import { creerClientServeur } from "@/lib/supabase/server";

/*
 * Page de maintenance — servie par le proxy (proxy.ts) à la place de tout
 * écran public quand l'interrupteur « Mode maintenance » est actif. Les
 * espaces professionnels et la connexion restent accessibles : l'équipe doit
 * pouvoir travailler et, surtout, rouvrir la plateforme.
 *
 * Le message et l'échéance sont ceux saisis dans /espace-admin/parametres ;
 * à défaut, un texte neutre s'affiche. Tout est lu à la requête : couper la
 * maintenance doit se voir sans redéploiement.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Maintenance en cours — Docteur 224",
  description: "La plateforme est momentanément indisponible pour maintenance.",
  robots: { index: false, follow: false },
};

const MESSAGE_DEFAUT =
  "Notre plateforme est momentanément en maintenance pour vous offrir un meilleur service. " +
  "Merci de votre patience — nous serons de retour très bientôt.";

async function lireMaintenance(): Promise<{ message: string; jusqua: string }> {
  try {
    const supabase = await creerClientServeur();
    // `select("*")` : résiste à un déploiement qui précéderait la migration
    // 0062 (colonnes message/jusqua encore absentes).
    const { data } = await supabase
      .from("parametres_plateforme")
      .select("*")
      .eq("cle", "mode_maintenance")
      .maybeSingle();
    const ligne = data as { message?: string | null; jusqua?: string | null } | null;
    return { message: ligne?.message?.trim() || "", jusqua: ligne?.jusqua || "" };
  } catch {
    return { message: "", jusqua: "" };
  }
}

export default async function Maintenance() {
  const { message, jusqua } = await lireMaintenance();

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[linear-gradient(150deg,var(--blue)_0%,var(--blue-deep)_100%)] px-4 py-6 text-center sm:px-5 sm:py-12">
      {/* Cercles décoratifs, repris du héros de l'accueil. */}
      <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <span className="absolute -right-24 -top-24 block h-[320px] w-[320px] rounded-full bg-[rgba(46,156,202,0.20)]" />
        <span className="absolute -bottom-32 -left-20 block h-72 w-72 rounded-full bg-[rgba(46,156,202,0.12)]" />
      </span>

      <div className="relative w-full max-w-[520px] rounded-[20px] border border-white/10 bg-white p-5 shadow-[0_24px_70px_rgba(14,59,80,0.45)] sm:rounded-[26px] sm:p-10">
        <div className="mb-3 flex justify-center sm:mb-6">
          <Logo variante="compact" hauteur={62} lien={null} priority />
        </div>

        <span
          aria-hidden
          className="mx-auto mb-3 grid h-[52px] w-[52px] place-items-center rounded-2xl bg-teal-soft text-[26px] sm:mb-5 sm:h-[66px] sm:w-[66px] sm:text-[30px]"
        >
          🛠️
        </span>

        <span className="inline-block rounded-full bg-amber-soft px-3.5 py-1.5 text-[11.5px] font-bold uppercase tracking-[0.05em] text-amber sm:text-[12px]">
          Maintenance en cours
        </span>

        <h1 className="mt-2.5 text-balance text-[22px] font-extrabold leading-tight tracking-[-0.4px] text-ink sm:mt-4 sm:text-[28px]">
          Nous revenons très vite
        </h1>

        <p className="mx-auto mt-2 max-w-[420px] whitespace-pre-line text-[13.5px] leading-snug text-muted sm:mt-3 sm:text-[14.5px] sm:leading-relaxed">
          {message || MESSAGE_DEFAUT}
        </p>

        {jusqua && <CompteARebours jusqua={jusqua} />}

        <div className="mt-5 border-t border-line pt-4 text-[12px] leading-snug text-muted sm:mt-8 sm:pt-5 sm:text-[12.5px] sm:leading-relaxed">
          Besoin d’aide urgente ? Écrivez-nous à{" "}
          <a href="mailto:contact@docteur224.com" className="font-bold text-teal hover:underline">
            contact@docteur224.com
          </a>
          .
          <br />
          Docteur 224 — la plateforme guinéenne de prise de rendez-vous médicaux.
        </div>
      </div>
    </main>
  );
}
