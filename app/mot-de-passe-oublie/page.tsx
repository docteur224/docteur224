"use client";

import Link from "next/link";
import { useState } from "react";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import Footer from "@/components/site/Footer";
import Logo from "@/components/site/Logo";
import TopNav from "@/components/site/TopNav";

/*
 * « Mot de passe oublié » — la demande.
 *
 * Cet écran ne sait rien et ne doit rien apprendre : il poste une adresse et
 * affiche la même confirmation quoi qu'il advienne. C'est la route serveur qui
 * décide s'il y a quelqu'un à qui écrire (voir
 * app/api/mot-de-passe/demander/route.ts) ; un écran qui répondrait « compte
 * introuvable » dirait à un inconnu qui est inscrit chez un service de santé.
 *
 * Une seule porte pour les cinq rôles, administrateurs compris : le lien reçu
 * mène au même formulaire, et c'est l'écran suivant qui renvoie chacun vers sa
 * porte de connexion.
 */
export default function MotDePasseOublie() {
  const [email, setEmail] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoye, setEnvoye] = useState(false);
  const [enCours, setEnCours] = useState(false);

  async function demander() {
    if (enCours) return;
    setErreur(null);
    if (!email.trim()) {
      setErreur("Renseignez votre adresse e-mail.");
      return;
    }
    setEnCours(true);
    const reponse = await fetch("/api/mot-de-passe/demander", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    }).catch(() => null);
    setEnCours(false);
    if (!reponse) {
      setErreur("Connexion impossible. Réessayez dans un instant.");
      return;
    }
    if (!reponse.ok) {
      const { erreur: message } = await reponse
        .json()
        .catch(() => ({ erreur: "Demande impossible pour le moment." }));
      setErreur(message);
      return;
    }
    setEnvoye(true);
  }

  const champ =
    "mb-3 w-full rounded-xl border border-line bg-white p-[14px] text-sm outline-none focus:border-teal";

  const contenu = envoye ? (
    <>
      <div className="mb-4 rounded-[11px] bg-green-soft px-[13px] py-[11px] text-[13px] font-semibold text-green">
        Si un compte est associé à cette adresse, un message vient d’y être envoyé.
      </div>
      <p className="mb-3 text-[13.5px] leading-relaxed text-muted">
        Ouvrez-le et suivez le lien pour choisir un nouveau mot de passe : il est valable une heure
        et ne fonctionne qu’une fois. Pensez à regarder dans les indésirables.
      </p>
      {/*
       * Le plafond d'envoi (3 par quart d'heure) est annoncé ICI, en texte
       * constant, et jamais comme un refus.
       *
       * Un message « trop de demandes, réessayez plus tard » ne s'afficherait
       * que pour les adresses qui ont bel et bien un compte — il suffirait de
       * demander quatre fois pour savoir qui est inscrit chez un service de
       * santé. Dit à tout le monde, il n'apprend rien à personne, et il
       * explique à celui qui est vraiment plafonné pourquoi le message suivant
       * se fait attendre : le lien qu'il a déjà reçu est le bon.
       */}
      <p className="mb-5 text-[13px] leading-relaxed text-muted">
        Vous en avez déjà demandé un il y a quelques minutes ? C’est le dernier message reçu qui
        vaut — au-delà de quelques demandes rapprochées, l’envoi suivant attend un quart d’heure.
      </p>
      <button
        type="button"
        onClick={() => setEnvoye(false)}
        className="text-[13px] font-bold text-teal"
      >
        Essayer une autre adresse
      </button>
    </>
  ) : (
    <>
      <p className="mb-5 text-[13.5px] leading-relaxed text-muted">
        Indiquez l’adresse de votre compte : nous vous enverrons un lien pour en choisir un
        nouveau.
      </p>
      {erreur && (
        <p
          role="alert"
          className="mb-3 rounded-lg bg-red-soft px-3 py-2 text-[12.5px] font-semibold text-red"
        >
          {erreur}
        </p>
      )}
      <label htmlFor="mdp-email" className="mb-1.5 block text-[12.5px] font-bold text-ink">
        E-mail
      </label>
      <input
        id="mdp-email"
        className={champ}
        type="email"
        autoComplete="username"
        placeholder="vous@exemple.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && demander()}
      />
      <button
        type="button"
        onClick={demander}
        disabled={enCours}
        className="ui-btn mt-1 flex w-full items-center justify-center gap-2 rounded-[11px] bg-teal px-6 py-[14px] text-[15px] font-bold text-white transition-colors hover:bg-teal-hover disabled:opacity-60"
      >
        {enCours ? "Envoi…" : "Recevoir le lien"}
      </button>
    </>
  );

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <TopNav />
      <EnTeteMobile retour="/connexion" actions={false} />

      <main className="flex flex-1 items-center justify-center px-4 py-8 md:py-14">
        <div className="w-full max-w-[460px]">
          <Logo variante="compact" hauteur={76} lien="/" className="mx-auto mb-6 block w-fit" />
          <div className="rounded-2xl border border-line bg-white p-6 sm:p-8">
            <h1 className="mb-1.5 text-[20px] font-extrabold tracking-[-0.3px]">
              Mot de passe oublié
            </h1>
            {contenu}
            <div className="mt-[18px] border-t border-line pt-[14px] text-center text-[13px] text-muted">
              Vous vous en souvenez ?{" "}
              <Link href="/connexion" className="font-bold text-teal">
                Se connecter
              </Link>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
