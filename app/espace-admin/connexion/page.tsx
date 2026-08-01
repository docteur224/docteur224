"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Logo from "@/components/site/Logo";
import { ESPACE_PAR_ROLE, seConnecter, type Role } from "@/lib/auth";

/*
 * Porte d'entrée de la console d'administration.
 *
 * /connexion sert les cinq rôles du site et n'affiche aucun onglet « Admin » :
 * un administrateur devait donc passer par un écran qui ne parle pas de lui.
 * Cet écran-ci ne fait qu'une chose, et il refuse explicitement les comptes
 * qui ne sont pas administrateurs au lieu de les envoyer ailleurs sans un mot.
 *
 * Il vit sous /espace-admin mais n'est PAS enveloppé dans AdminShell : sinon
 * la garde de rôle le renverrait ici en boucle. Le layout du dossier ne pose
 * que le titre de page, il n'ajoute aucune coquille.
 */
export default function ConnexionAdmin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [espacePropose, setEspacePropose] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function connecter() {
    if (enCours) return;
    setErreur(null);
    setEspacePropose(null);
    if (!email || !motDePasse) {
      setErreur("Renseignez votre e-mail et votre mot de passe.");
      return;
    }
    setEnCours(true);
    const res = await seConnecter(email.trim(), motDePasse);
    if (res.erreur) {
      setEnCours(false);
      setErreur(res.erreur);
      return;
    }
    // Le compte est valide mais n'est pas administrateur : on le dit, et on
    // propose son espace. Pas de déconnexion forcée — la session obtenue est
    // légitime, elle n'a simplement rien à faire ici.
    if (res.cible !== ESPACE_PAR_ROLE["admin" as Role]) {
      setEnCours(false);
      setErreur("Ce compte n'est pas un compte administrateur.");
      setEspacePropose(res.cible ?? null);
      return;
    }
    router.replace("/espace-admin");
  }

  const champ =
    "mb-3 w-full rounded-xl border border-line bg-white p-[14px] text-sm outline-none focus:border-teal";

  return (
    <div className="grid min-h-screen place-items-center bg-bg px-4 py-10">
      <div className="w-full max-w-[420px]">
        <Logo variante="compact" hauteur={72} lien="/" className="mx-auto mb-6 block w-fit" />

        <div className="rounded-2xl border border-line bg-white p-6 sm:p-8">
          <div className="mb-5 flex items-center gap-[11px]">
            <span
              aria-hidden
              className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl text-lg text-white"
              style={{ background: "linear-gradient(135deg,#15506B,#0B2E3D)" }}
            >
              🛡️
            </span>
            <div>
              <h1 className="text-[19px] font-extrabold tracking-[-0.3px]">Console d’administration</h1>
              <small className="text-[12.5px] text-muted">Accès réservé aux administrateurs</small>
            </div>
          </div>

          {erreur && (
            <div
              role="alert"
              className="mb-3 rounded-lg bg-red-soft px-3 py-2 text-[12.5px] font-semibold text-red"
            >
              {erreur}
              {espacePropose && (
                <>
                  {" "}
                  <Link href={espacePropose} className="underline">
                    Accéder à votre espace
                  </Link>
                </>
              )}
            </div>
          )}

          <label htmlFor="admin-email" className="mb-1.5 block text-[12.5px] font-bold text-ink">
            E-mail
          </label>
          <input
            id="admin-email"
            className={champ}
            type="email"
            autoComplete="username"
            placeholder="vous@docteur224.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && connecter()}
          />

          <label htmlFor="admin-mdp" className="mb-1.5 block text-[12.5px] font-bold text-ink">
            Mot de passe
          </label>
          <input
            id="admin-mdp"
            className={champ}
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && connecter()}
          />

          <button
            type="button"
            onClick={connecter}
            disabled={enCours}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-[11px] bg-teal px-6 py-[14px] text-[15px] font-bold text-white transition-colors hover:bg-[#2790bc] disabled:opacity-60"
          >
            {enCours ? "Connexion…" : "Accéder à la console"}
          </button>

          <div className="mt-[18px] text-center text-[13px] text-muted">
            Vous n’êtes pas administrateur ?{" "}
            <Link href="/connexion" className="font-bold text-teal">
              Connexion habituelle
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
