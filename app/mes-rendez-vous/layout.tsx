import type { Metadata } from "next";
import CharteLocale from "@/components/site/CharteLocale";
import SuivreCharte from "@/components/site/SuivreCharte";

export const metadata: Metadata = {
  title: "Mes rendez-vous | Docteur 224",
};

/*
 * Cette page du patient est restée à la racine (/mes-rendez-vous) au lieu de
 * vivre sous /patient. Elle n'héritait donc pas de la charte posée par la mise
 * en page de /patient, et s'affichait en couleurs d'origine — ou, campagne en
 * cours, aux couleurs publiques. On lui pose ici la même charte que les autres
 * pages de l'espace : celle choisie par le titulaire du compte, posée avant le
 * premier affichage puis remise d'accord avec la base. La campagne publique,
 * elle, l'évite déjà (voir PREFIXES_ESPACE dans lib/charte-publique).
 */
export default function LayoutMesRendezVous({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CharteLocale />
      <SuivreCharte />
      {children}
    </>
  );
}
