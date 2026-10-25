import type { Metadata } from "next";
import CharteLocale from "@/components/site/CharteLocale";
import SuivreCharte from "@/components/site/SuivreCharte";

export const metadata: Metadata = {
  title: "Espace assistant(e) | Docteur 224",
};

export default function LayoutAssistant({ children }: { children: React.ReactNode }) {
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
