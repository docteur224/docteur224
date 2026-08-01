"use client";

import Link from "next/link";
import { useInscription } from "@/components/inscription/ContexteInscription";
import { ESPACE_PAR_ROLE } from "@/lib/auth";

/*
 * Écran terminal du parcours : le dossier est transmis (statut en_attente),
 * l'essai gratuit est actif. `etape_inscription` est déjà à null, l'espace
 * pro est donc accessible.
 */
export default function EtapeConfirmation() {
  const { role } = useInscription();
  const espace = ESPACE_PAR_ROLE[role];

  return (
    <div className="mx-auto w-full max-w-[600px] px-4 py-6 md:py-10">
      <div className="rounded-2xl border border-line bg-white p-6 text-center md:p-10">
        <div
          aria-hidden
          className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-green-soft text-3xl"
        >
          ✅
        </div>
        <h1 className="mt-4 text-[21px] font-extrabold tracking-[-0.3px]">
          Votre dossier est transmis !
        </h1>
        <p className="mx-auto mt-2 max-w-[440px] text-[13px] leading-relaxed text-muted">
          Merci pour votre inscription sur Docteur 224. Votre essai gratuit est actif dès
          maintenant : vous pouvez déjà préparer votre espace.
        </p>

        <div className="mt-6 grid gap-2 text-left">
          {[
            {
              icone: "🔍",
              titre: "Vérification sous 24–48 h",
              texte: "Notre équipe examine vos documents. Vous serez notifié de la décision.",
            },
            {
              icone: "👀",
              titre: "Visibilité après validation",
              texte: "Votre fiche apparaîtra aux patients dès que votre compte sera validé.",
            },
            {
              icone: "⚙️",
              titre: "Votre espace est prêt",
              texte: "Profil, disponibilités, équipe : tout ce que vous avez saisi est déjà en place.",
            },
          ].map((item) => (
            <div
              key={item.titre}
              className="flex items-start gap-3 rounded-xl border border-line px-4 py-3"
            >
              <span aria-hidden className="text-xl">
                {item.icone}
              </span>
              <span>
                <b className="block text-[13px]">{item.titre}</b>
                <small className="text-[12px] leading-relaxed text-muted">{item.texte}</small>
              </span>
            </div>
          ))}
        </div>

        <Link
          href={espace}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-[11px] bg-teal px-6 py-[14px] text-[15px] font-bold text-white transition-colors hover:bg-[#2790bc]"
        >
          Accéder à mon espace →
        </Link>
      </div>
    </div>
  );
}
