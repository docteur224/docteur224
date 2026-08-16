"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import AdminShell from "@/components/admin/AdminShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import PriseRdvCentreAppel from "@/components/admin/PriseRdvCentreAppel";
import AppelsTraites from "@/components/admin/AppelsTraites";

/*
 * Le centre d'appel, en deux vues : prendre un rendez-vous, et revenir sur
 * ceux qui ont été pris.
 *
 * La vue vit dans l'URL (`?vue=appels`) et non dans un état local : un
 * opérateur qui envoie « regarde ce rendez-vous » à un collègue doit pouvoir
 * lui passer un lien. C'est aussi la forme retenue pour /espace-medecin/
 * correspondance, et la seule que le linter accepte sans dupliquer l'état.
 *
 * Aucune permission n'est exigée : les dix permissions de la migration 0043
 * cloisonnent des sections de la console (finance, modération, équipe…),
 * alors que répondre au téléphone est le travail de toute l'équipe —
 * modérateurs et support compris. La base dit la même chose
 * (`creer_rdv_centre_appel` ne demande qu'`est_admin()`), donc l'écran ne
 * promet rien qu'elle refuserait.
 */
export default function NouveauRdvAdmin() {
  return (
    <AdminShell>
      {/* `useSearchParams` exige une frontière Suspense en rendu statique. */}
      <Suspense fallback={null}>
        <CentreAppel />
      </Suspense>
    </AdminShell>
  );
}

function CentreAppel() {
  const chemin = usePathname();
  const parametres = useSearchParams();
  const vue = parametres.get("vue") === "appels" ? "appels" : "prise";

  const onglet = (cle: "prise" | "appels", libelle: string) => (
    <Link
      href={cle === "prise" ? chemin : `${chemin}?vue=appels`}
      aria-current={vue === cle ? "page" : undefined}
      className={`rounded-[10px] px-[14px] py-2 text-[12.5px] font-bold transition-colors ${
        vue === cle ? "bg-teal text-white" : "border-[1.5px] border-line bg-white text-blue hover:bg-bg"
      }`}
    >
      {libelle}
    </Link>
  );

  return (
    <>
      <EnTeteMobile
        retour="/espace-admin"
        titre={vue === "appels" ? "Appels traités" : "Prise de rendez-vous"}
      />
      <div className="flex flex-wrap gap-2 px-[18px] pt-3 md:px-0 md:pt-0">
        {onglet("prise", "📞 Nouveau rendez-vous")}
        {onglet("appels", "🗂️ Appels traités")}
      </div>
      {vue === "appels" ? <AppelsTraites /> : <PriseRdvCentreAppel />}
    </>
  );
}
