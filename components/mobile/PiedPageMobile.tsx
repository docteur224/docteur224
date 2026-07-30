import Link from "next/link";
import Logo from "@/components/site/Logo";

/**
 * Pied de page mobile — version resserrée du pied de page web, réservée aux
 * écrans éditoriaux et à l'accueil : ce sont les seuls où l'on arrive au bout
 * du contenu. Sur les écrans d'application (agenda, résultats, rendez-vous),
 * il n'aurait fait que rallonger le défilement.
 */
const LIENS = [
  { href: "/resultats", label: "Trouver un médecin" },
  { href: "/a-propos", label: "À propos" },
  { href: "/conseils-sante", label: "Conseils santé" },
  { href: "/faq", label: "FAQ" },
  { href: "/inscription/professionnel", label: "Pour les médecins" },
  { href: "/connexion", label: "Se connecter" },
];

export default function PiedPageMobile() {
  return (
    <footer className="pied-mobile md:hidden">
      <Logo hauteur={34} surFonce />
      <p>
        La plateforme guinéenne de prise de rendez-vous médicaux. Simple, rapide et accessible
        depuis votre téléphone.
      </p>
      <nav aria-label="Liens du pied de page">
        {LIENS.map((l) => (
          <Link key={l.href} href={l.href}>
            {l.label}
          </Link>
        ))}
      </nav>
      <small>© 2026 Docteur 224 · Conakry, Guinée</small>
    </footer>
  );
}
