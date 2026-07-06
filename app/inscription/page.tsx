import Link from "next/link";
import AppBarMobile from "@/components/mobile/AppBarMobile";

/*
 * Inscription · choix du profil — reproduit l'écran « inscription » de la
 * maquette web : deux grandes cartes (patient / professionnel de santé).
 */

const PROFILS = [
  {
    href: "/inscription/patient",
    icone: "🧑",
    titre: "Patient",
    texte:
      "Trouvez un médecin et prenez rendez-vous en ligne. C'est immédiat, simple et gratuit.",
    bouton: "S'inscrire →",
  },
  {
    href: "/inscription/professionnel",
    icone: "👨‍⚕️",
    titre: "Professionnel de santé",
    texte:
      "Médecin, clinique, hôpital ou cabinet : laissez vos patients réserver en ligne, gratuitement.",
    bouton: "Rejoindre la plateforme →",
  },
];

export default function ChoixInscription() {
  return (
    <main className="min-h-screen bg-bg md:flex md:items-center md:justify-center md:bg-white md:px-6 md:py-[54px]">
      {/* ================= VERSION MOBILE (écran « m-inscription » de la maquette mobile) ================= */}
      <div className="md:hidden">
        <AppBarMobile retour="/connexion" titre="Rejoignez Docteur 224" />
        <div className="pad">
          <p className="muted" style={{ fontSize: 12.5, margin: "2px 0 16px", lineHeight: 1.5 }}>
            Choisissez votre profil pour créer votre compte gratuitement.
          </p>
          <Link href="/inscription/patient" className="choicecardm">
            <span className="ic" aria-hidden>
              🧑
            </span>
            <span className="tx">
              <b>Patient</b>
              <small>Trouvez un médecin et prenez RDV en ligne. Immédiat, simple et gratuit.</small>
            </span>
            <span className="ar" aria-hidden>
              →
            </span>
          </Link>
          <Link href="/inscription/professionnel" className="choicecardm">
            <span className="ic" aria-hidden>
              👨‍⚕️
            </span>
            <span className="tx">
              <b>Professionnel de santé</b>
              <small>
                Médecin, clinique, hôpital ou cabinet. Laissez vos patients réserver en ligne.
              </small>
            </span>
            <span className="ar" aria-hidden>
              →
            </span>
          </Link>
          <div className="linkline" style={{ marginTop: 18 }}>
            Déjà inscrit ? <Link href="/connexion">Se connecter</Link>
          </div>
        </div>
      </div>

      {/* ================= VERSION WEB (inchangée) ================= */}
      <div className="hidden w-full max-w-[880px] text-center md:block">
        <h1 className="text-[30px] font-extrabold tracking-[-0.5px]">Rejoignez Docteur 224</h1>
        <p className="mt-[10px] text-muted">
          Choisissez votre profil pour créer votre compte gratuitement.
        </p>
        <div className="mt-[34px] grid gap-[22px] md:grid-cols-2">
          {PROFILS.map((profil) => (
            <Link
              key={profil.href}
              href={profil.href}
              className="flex flex-col items-center gap-[10px] rounded-[18px] border-[1.5px] border-line bg-white px-[26px] py-[34px] transition hover:-translate-y-0.5 hover:border-teal hover:shadow-[0_14px_34px_rgba(11,46,61,0.09)]"
            >
              <span
                aria-hidden
                className="mb-1 grid h-[74px] w-[74px] place-items-center rounded-[20px] bg-teal-soft text-[33px]"
              >
                {profil.icone}
              </span>
              <h4 className="text-[15px] font-extrabold uppercase tracking-[0.04em] text-blue">
                {profil.titre}
              </h4>
              <p className="min-h-[56px] text-[13px] leading-[1.55] text-muted">{profil.texte}</p>
              <span className="w-full rounded-[11px] bg-teal px-[18px] py-[11px] text-[13.5px] font-bold text-white transition-colors hover:bg-[#2790bc]">
                {profil.bouton}
              </span>
            </Link>
          ))}
        </div>
        <div className="mt-[30px] text-[13px] text-muted">
          Déjà inscrit ?{" "}
          <Link href="/connexion" className="font-bold text-teal">
            Se connecter
          </Link>
        </div>
      </div>
    </main>
  );
}
