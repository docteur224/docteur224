"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import Footer from "@/components/site/Footer";
import TopNav from "@/components/site/TopNav";
import Stepper from "@/components/inscription/Stepper";
import { FournisseurInscription } from "@/components/inscription/ContexteInscription";
import { etapesPour, useParcoursInscription } from "@/lib/inscription-pro";
import { ESPACE_PAR_ROLE } from "@/lib/auth";

/*
 * Layout des étapes connectées du parcours d'inscription professionnel.
 * Garde d'accès : il faut être connecté avec un compte medecin ou
 * etablissement ; un parcours déjà terminé renvoie vers l'espace
 * (sauf sur l'écran de confirmation, terminal par nature).
 */
export default function LayoutEtapes({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const parcours = useParcoursInscription();
  const segment = pathname.split("/").filter(Boolean).pop() ?? "";

  useEffect(() => {
    if (parcours.chargement) return;
    if (!parcours.connecte || !parcours.role) {
      router.replace("/inscription/professionnel");
      return;
    }
    if (parcours.etape === null && segment !== "confirmation") {
      router.replace(ESPACE_PAR_ROLE[parcours.role]);
    }
  }, [parcours.chargement, parcours.connecte, parcours.role, parcours.etape, segment, router]);

  const pret =
    !parcours.chargement &&
    parcours.connecte &&
    parcours.role !== null &&
    (parcours.etape !== null || segment === "confirmation");

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <TopNav />
      <div className="md:hidden">
        <EnTeteMobile retour="/inscription" titre="Inscription professionnelle" actions={false} />
      </div>
      {pret && parcours.role ? (
        <>
          <Stepper etapes={etapesPour(parcours.role)} courante={segment} />
          <main className="flex-1">
            <FournisseurInscription
              value={{
                role: parcours.role,
                etape: parcours.etape,
                etabId: parcours.etabId,
                recharger: parcours.recharger,
              }}
            >
              {children}
            </FournisseurInscription>
          </main>
        </>
      ) : (
        <main className="flex-1">
          <p className="py-16 text-center text-[13px] text-muted">Chargement…</p>
        </main>
      )}
      <Footer />
    </div>
  );
}
