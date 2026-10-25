"use client";

import Link from "next/link";
import { useState } from "react";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import Footer from "@/components/site/Footer";
import Logo from "@/components/site/Logo";
import TopNav from "@/components/site/TopNav";
import type { Role } from "@/lib/auth";
import { creerClientNavigateur } from "@/lib/supabase/client";

/*
 * « Mot de passe oublié » — le nouveau mot de passe.
 *
 * Le jeton du lien est consommé AU MOMENT DE VALIDER, pas à l'ouverture de la
 * page. C'est délibéré : un lien de récupération ne sert qu'une fois, et les
 * antivirus de messagerie d'entreprise ouvrent les liens qu'ils trouvent pour
 * les inspecter. Vérifier à l'arrivée, c'était laisser un robot brûler le
 * jeton avant que le destinataire ne clique.
 *
 * La session ouverte par le jeton est refermée aussitôt le mot de passe
 * changé, et l'on renvoie vers la porte de connexion qui correspond au rôle.
 * Deux raisons : un administrateur n'obtient pas de session par un écran
 * public (voir /connexion), et retaper son mot de passe tout neuf est la
 * seule preuve qu'il a bien été enregistré.
 */

/**
 * Le jeton est lu dans l'URL sans useSearchParams : pas de <Suspense> dont le
 * repli remplacerait le formulaire une fraction de seconde — ce que le
 * gestionnaire de mots de passe y aurait déjà rempli disparaîtrait.
 */
function jetonDuLien(): string {
  return new URLSearchParams(window.location.search).get("jeton") ?? "";
}

export default function NouveauMotDePasse() {
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [porte, setPorte] = useState<string | null>(null);

  async function enregistrer() {
    if (enCours) return;
    setErreur(null);
    if (motDePasse.length < 8) {
      setErreur("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (motDePasse !== confirmation) {
      setErreur("Les deux mots de passe ne sont pas identiques.");
      return;
    }
    /*
     * L'URL n'est lue qu'ici, et non à l'affichage : la lire au premier rendu
     * demanderait d'attendre le navigateur, donc d'afficher autre chose en
     * attendant — exactement le remplacement de formulaire que l'on évite.
     * Un lien tronqué se signale alors comme un lien périmé, au même endroit.
     *
     * APRÈS les deux contrôles de saisie, et non avant : ce qui est reproché
     * doit être ce qu'on vient de taper. Un formulaire qui répond « ce lien
     * est incomplet » à deux mots de passe différents fait chercher l'erreur
     * là où elle n'est pas.
     */
    const jeton = jetonDuLien();
    if (!jeton) {
      setErreur("Ce lien est incomplet : ouvrez-le depuis le message reçu.");
      return;
    }
    setEnCours(true);
    const supabase = creerClientNavigateur();

    // Le jeton vaut session : c'est ici qu'il est dépensé.
    const { data: session, error: eJeton } = await supabase.auth.verifyOtp({
      token_hash: jeton,
      type: "recovery",
    });
    if (eJeton || !session.user) {
      setEnCours(false);
      setErreur("Ce lien n’est plus valable : il a expiré ou a déjà servi.");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: motDePasse });
    if (error) {
      setEnCours(false);
      // Supabase refuse en anglais un mot de passe identique au précédent.
      setErreur(
        /different from the old password/i.test(error.message)
          ? "Choisissez un mot de passe différent de l’ancien."
          : error.message
      );
      // La session de récupération n'a plus d'objet : on ne la laisse pas
      // ouverte derrière un échec.
      await supabase.auth.signOut();
      return;
    }

    /*
     * Le rôle décide de la porte proposée — la console d'administration pour
     * un administrateur, /connexion pour tous les autres. Lu avant la
     * déconnexion, forcément : après, `utilisateurs` n'est plus lisible.
     */
    const { data: profil } = await supabase
      .from("utilisateurs")
      .select("role")
      .eq("id", session.user.id)
      .maybeSingle();
    const role = profil?.role as Role | undefined;
    await supabase.auth.signOut();
    setEnCours(false);
    setPorte(role === "admin" ? "/espace-admin/connexion" : "/connexion");
  }

  const champ =
    "mb-3 w-full rounded-xl border border-line bg-white p-[14px] text-sm outline-none focus:border-teal";
  const bouton =
    "ui-btn flex w-full items-center justify-center gap-2 rounded-[11px] bg-teal px-6 py-[14px] text-[15px] font-bold text-white transition-colors hover:bg-teal-hover disabled:opacity-60";

  let contenu: React.ReactNode;
  if (porte) {
    contenu = (
      <>
        <div className="mb-4 rounded-[11px] bg-green-soft px-[13px] py-[11px] text-[13px] font-semibold text-green">
          Votre mot de passe a été modifié.
        </div>
        <p className="mb-5 text-[13.5px] leading-relaxed text-muted">
          Vous pouvez maintenant vous connecter avec ce nouveau mot de passe.
          {porte === "/espace-admin/connexion" &&
            " Votre compte étant administrateur, la connexion se fait depuis la console."}
        </p>
        <Link href={porte} className={bouton}>
          Se connecter
        </Link>
      </>
    );
  } else {
    contenu = (
      <>
        <p className="mb-5 text-[13.5px] leading-relaxed text-muted">
          Choisissez un mot de passe d’au moins 8 caractères.
        </p>
        {erreur && (
          <p
            role="alert"
            className="mb-3 rounded-lg bg-red-soft px-3 py-2 text-[12.5px] font-semibold text-red"
          >
            {erreur}{" "}
            <Link href="/mot-de-passe-oublie" className="underline">
              Demander un nouveau lien
            </Link>
          </p>
        )}
        <label htmlFor="mdp-nouveau" className="mb-1.5 block text-[12.5px] font-bold text-ink">
          Nouveau mot de passe
        </label>
        <input
          id="mdp-nouveau"
          className={champ}
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
        />
        <label htmlFor="mdp-confirme" className="mb-1.5 block text-[12.5px] font-bold text-ink">
          Confirmation
        </label>
        <input
          id="mdp-confirme"
          className={champ}
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && enregistrer()}
        />
        <button
          type="button"
          onClick={enregistrer}
          disabled={enCours}
          className={`mt-1 ${bouton}`}
        >
          {enCours ? "Enregistrement…" : "Enregistrer le mot de passe"}
        </button>
      </>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <TopNav />
      <EnTeteMobile retour="/connexion" actions={false} />

      <main className="flex flex-1 items-center justify-center px-4 py-8 md:py-14">
        <div className="w-full max-w-[460px]">
          <Logo variante="compact" hauteur={76} lien="/" className="mx-auto mb-6 block w-fit" />
          <div className="rounded-2xl border border-line bg-white p-6 sm:p-8">
            <h1 className="mb-1.5 text-[20px] font-extrabold tracking-[-0.3px]">
              Nouveau mot de passe
            </h1>
            {contenu}
            <div className="mt-[18px] border-t border-line pt-[14px] text-center text-[13px] text-muted">
              <Link href="/connexion" className="font-bold text-teal">
                Retour à la connexion
              </Link>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
