"use client";

import { useState } from "react";
import Link from "next/link";
import Logo from "@/components/site/Logo";
import { seConnecter } from "@/lib/auth";
import { aBesoinDeSecondFacteur, annulerSecondFacteur, verifierSecondFacteur } from "@/lib/mfa";

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
 *
 * Habillage : l'écran doit se distinguer d'un coup d'œil de la connexion du
 * public — on n'administre pas la plateforme par mégarde. D'où le fond voilé
 * de deux halos de la charte, le filet dégradé en tête de carte et la mention
 * d'accès journalisé. Tout est construit sur les variables de charte (donc
 * recoloré avec le compte) et ne connaît que des classes déjà remappées en
 * mode sombre (« bg-white » → --card), sans quoi la carte resterait blanche
 * sur fond nuit.
 */
export default function ConnexionAdmin() {
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [espacePropose, setEspacePropose] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  // Œil du mot de passe : un mot de passe d'administrateur est long, le relire
  // avant de valider évite un échec qui ressemble à un refus de compte.
  const [mdpVisible, setMdpVisible] = useState(false);
  // Deuxième facteur : affiché seulement si le compte en a un de vérifié. Tant
  // qu'il n'est pas franchi, on ne navigue pas vers la console.
  const [etape2fa, setEtape2fa] = useState(false);
  const [code2fa, setCode2fa] = useState("");

  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- rechargement voulu après connexion (session fraîche dans les cookies, caches de module remis à zéro)
  const entrer = () => window.location.assign("/espace-admin");

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
    // légitime, elle n'a simplement rien à faire ici (symétrique du refus
    // opposé aux administrateurs sur /connexion).
    if (res.role !== "admin") {
      setEnCours(false);
      setErreur("Ce compte n'est pas un compte administrateur.");
      setEspacePropose(res.cible ?? null);
      return;
    }
    // Le mot de passe est bon. Si ce compte a un deuxième facteur, la session
    // n'est encore qu'au premier niveau : on demande le code AVANT d'entrer.
    if (await aBesoinDeSecondFacteur()) {
      setEnCours(false);
      setCode2fa("");
      setEtape2fa(true);
      return;
    }
    entrer();
  }

  async function valider2fa() {
    if (enCours || code2fa.length !== 6) return;
    setErreur(null);
    setEnCours(true);
    const { erreur: err } = await verifierSecondFacteur(code2fa);
    if (err) {
      setEnCours(false);
      setErreur(err);
      return;
    }
    entrer();
  }

  async function annuler2fa() {
    // On referme la session restée au premier facteur et on revient au départ.
    await annulerSecondFacteur();
    setEtape2fa(false);
    setCode2fa("");
    setMotDePasse("");
    setErreur(null);
  }

  const champ =
    "w-full rounded-xl border border-line bg-white px-[14px] py-[13px] text-sm text-ink outline-none transition-[border-color,box-shadow] placeholder:text-muted-soft hover:border-teal-line focus:border-teal focus:shadow-[0_0_0_3px_var(--teal-soft)]";

  const etiquette = "mb-1.5 block text-[12.5px] font-bold text-ink";

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-bg px-4 py-10">
      {/* Halos décoratifs : les deux teintes de la charte, très diluées. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(640px 440px at 50% -8%, color-mix(in srgb, var(--teal) 26%, transparent), transparent 70%), radial-gradient(540px 400px at 50% 112%, color-mix(in srgb, var(--blue) 18%, transparent), transparent 70%)",
        }}
      />

      <div className="relative w-full max-w-[430px]">
        <Logo variante="compact" hauteur={72} lien="/" className="mx-auto mb-6 block w-fit" />

        <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
          {/* Filet d'en-tête : la carte se reconnaît avant d'être lue. */}
          <div aria-hidden className="h-[3px] w-full" style={{ background: "var(--badge)" }} />

          <div className="p-6 sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              <span
                aria-hidden
                className="grid h-[46px] w-[46px] flex-none place-items-center rounded-xl text-xl text-white shadow-[0_6px_18px_rgba(16,59,80,0.22)]"
                style={{ background: "var(--badge-sombre)" }}
              >
                🛡️
              </span>
              <div className="min-w-0">
                <h1 className="text-[19px] font-extrabold leading-tight tracking-[-0.3px]">
                  Console d’administration
                </h1>
                <small className="text-[12.5px] text-muted">
                  {etape2fa ? "Vérification en deux étapes" : "Accès réservé aux administrateurs"}
                </small>
              </div>
            </div>

            {erreur && (
              <div
                role="alert"
                className="mb-4 flex items-start gap-2 rounded-xl border border-red-line bg-red-soft px-3 py-2.5 text-[12.5px] font-semibold text-red"
              >
                <span aria-hidden>⚠️</span>
                <span>
                  {erreur}
                  {espacePropose && (
                    <>
                      {" "}
                      <Link href={espacePropose} className="underline">
                        Accéder à votre espace
                      </Link>
                    </>
                  )}
                </span>
              </div>
            )}

            {etape2fa ? (
              <div>
                <p className="mb-4 text-[12.5px] leading-relaxed text-muted">
                  Ce compte est protégé par un deuxième facteur. Saisissez le code à
                  6&nbsp;chiffres affiché par votre application d’authentification.
                </p>
                <label htmlFor="admin-2fa" className={etiquette}>
                  Code de vérification
                </label>
                <input
                  id="admin-2fa"
                  className={`${champ} text-center text-[18px] font-bold tracking-[0.4em]`}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={6}
                  placeholder="______"
                  value={code2fa}
                  onChange={(e) => setCode2fa(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={(e) => e.key === "Enter" && valider2fa()}
                />
                <button
                  type="button"
                  onClick={valider2fa}
                  disabled={enCours || code2fa.length !== 6}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-teal px-6 py-[14px] text-[15px] font-bold text-white shadow-[0_10px_22px_-12px_var(--teal)] transition-colors hover:bg-teal-hover disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
                >
                  {enCours ? "Vérification…" : "Vérifier et accéder"}
                </button>
                <button
                  type="button"
                  onClick={annuler2fa}
                  disabled={enCours}
                  className="mt-3 block w-full text-center text-[12.5px] font-bold text-muted hover:text-teal disabled:opacity-50"
                >
                  Revenir à la connexion
                </button>
              </div>
            ) : (
            <>
            <div className="mb-4">
              <label htmlFor="admin-email" className={etiquette}>
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
            </div>

            <div className="mb-5">
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <label htmlFor="admin-mdp" className="block text-[12.5px] font-bold text-ink">
                  Mot de passe
                </label>
                {/* Même écran que pour les autres rôles : le lien reçu renvoie
                    vers cette console une fois le mot de passe changé. */}
                <Link
                  href="/mot-de-passe-oublie"
                  className="text-xs font-bold text-teal hover:underline"
                >
                  Mot de passe oublié ?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="admin-mdp"
                  className={`${champ} pr-12`}
                  type={mdpVisible ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && connecter()}
                />
                <button
                  type="button"
                  onClick={() => setMdpVisible((v) => !v)}
                  aria-pressed={mdpVisible}
                  aria-label={mdpVisible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  title={mdpVisible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  className="absolute right-0.5 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-lg text-base text-muted hover:text-teal"
                >
                  <span aria-hidden>{mdpVisible ? "🙈" : "👁️"}</span>
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={connecter}
              disabled={enCours}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal px-6 py-[14px] text-[15px] font-bold text-white shadow-[0_10px_22px_-12px_var(--teal)] transition-colors hover:bg-teal-hover disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
            >
              {enCours ? "Connexion…" : "Accéder à la console"}
            </button>

            <p className="mt-4 text-center text-[11.5px] leading-relaxed text-muted">
              <span aria-hidden>🔒</span> Connexion sécurisée — les accès à la console sont
              journalisés.
            </p>
            </>
            )}
          </div>

          {!etape2fa && (
            <div className="border-t border-line px-6 py-4 text-center text-[13px] text-muted sm:px-8">
              Vous n’êtes pas administrateur ?{" "}
              <Link href="/connexion" className="font-bold text-teal hover:underline">
                Connexion habituelle
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
