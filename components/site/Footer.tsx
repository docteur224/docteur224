import Link from "next/link";

/** Pied de page du site public — reproduit le .footer de la maquette web. */
export default function Footer() {
  return (
    <footer className="mt-[10px] bg-blue-deep px-[30px] py-10 text-white">
      <div className="mx-auto flex max-w-[1020px] flex-wrap gap-[50px]">
        <div className="max-w-[260px]">
          <div className="flex items-center gap-[9px] text-base font-extrabold">
            <span
              aria-hidden
              className="grid h-7 w-7 place-items-center rounded-[9px] bg-[linear-gradient(135deg,var(--teal),var(--blue))] text-xs font-extrabold text-white"
            >
              D
            </span>
            Docteur 224
          </div>
          <p className="mt-[10px] text-[12.5px] leading-relaxed opacity-75">
            La plateforme guinéenne de prise de rendez-vous médicaux. Simple, rapide et accessible
            depuis votre téléphone.
          </p>
        </div>
        <div>
          <b className="mb-3 block text-[13px] font-extrabold">Patients</b>
          <Link href="/resultats" className="mb-2 block text-[13px] opacity-80">
            Trouver un médecin
          </Link>
          <a href="#comment-ca-marche" className="mb-2 block text-[13px] opacity-80">
            Comment ça marche
          </a>
          <Link href="/connexion" className="mb-2 block text-[13px] opacity-80">
            Mes rendez-vous
          </Link>
        </div>
        <div>
          <b className="mb-3 block text-[13px] font-extrabold">Médecins</b>
          <Link href="/inscription" className="mb-2 block text-[13px] opacity-80">
            Rejoindre la plateforme
          </Link>
          <Link href="/connexion" className="mb-2 block text-[13px] opacity-80">
            Gérer mon agenda
          </Link>
          <Link href="/inscription" className="mb-2 block text-[13px] opacity-80">
            Tarifs
          </Link>
        </div>
        <div>
          <b className="mb-3 block text-[13px] font-extrabold">Aide</b>
          <a className="mb-2 block cursor-pointer text-[13px] opacity-80">Centre d&apos;assistance</a>
          <a className="mb-2 block cursor-pointer text-[13px] opacity-80">WhatsApp · Messenger</a>
          <a className="mb-2 block cursor-pointer text-[13px] opacity-80">Nous contacter</a>
        </div>
      </div>
      <div className="mx-auto mt-7 max-w-[1020px] border-t border-white/15 pt-[18px] text-xs opacity-70">
        © 2026 Docteur 224 · Conakry, Guinée · Tous droits réservés.
      </div>
    </footer>
  );
}
