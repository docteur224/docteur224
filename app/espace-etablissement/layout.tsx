import type { Metadata } from "next";
import CharteLocale from "@/components/site/CharteLocale";
import SuivreCharte from "@/components/site/SuivreCharte";

export const metadata: Metadata = {
  title: "Espace établissement | Docteur 224",
};

export default function LayoutEtablissement({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Couleurs choisies par le titulaire du compte : posées avant le
          premier affichage depuis l'avance locale, puis remises d'accord
          avec la base. Sans choix enregistré, la charte Docteur 224 vaut. */}
      <CharteLocale />
      <SuivreCharte />
      {children}
    </>
  );
}
