import type { Metadata } from "next";
import CharteGraphique from "@/components/site/CharteGraphique";
import CharteLocale from "@/components/site/CharteLocale";

export const metadata: Metadata = {
  title: "Espace établissement | Docteur 224",
};

export default function LayoutEtablissement({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Sans couleurs passées, rend null : la charte Docteur 224 s'applique.
          Les couleurs du compte viendront en props avec la persistance. */}
      <CharteGraphique />
      <CharteLocale />
      {children}
    </>
  );
}
