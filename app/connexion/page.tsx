"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import CoteAuth from "@/components/site/CoteAuth";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import Logo from "@/components/site/Logo";
import { seConnecter } from "@/lib/auth";

/*
 * Connexion — authentification réelle Supabase. Les onglets de rôle sont
 * conservés visuellement (maquette), mais la redirection suit le rôle réel
 * du compte, lu dans la table `utilisateurs`.
 */

const ROLES = ["Patient", "Médecin", "Clinique", "Hôpital", "Cabinet"];

export default function Connexion() {
  const router = useRouter();
  const [role, setRole] = useState(ROLES[0]);
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function connecter() {
    if (enCours) return;
    setErreur(null);
    if (!email || !motDePasse) {
      setErreur("Renseignez votre e-mail et votre mot de passe.");
      return;
    }
    setEnCours(true);
    const res = await seConnecter(email.trim(), motDePasse);
    setEnCours(false);
    if (res.erreur) setErreur(res.erreur);
    else router.push(res.cible!);
  }

  const champ =
    "mb-3 w-full rounded-xl border border-line bg-white p-[14px] text-sm outline-none focus:border-teal";

  const messageErreur = erreur && (
    <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-600">
      {erreur}
    </p>
  );

  return (
    <div className="min-h-screen bg-bg md:bg-white">
      {/* ================= VERSION MOBILE ================= */}
      {/* Barre réduite au retour : sans elle, l'écran de connexion mobile
          n'offrait aucun chemin vers l'accueil. */}
      <EnTeteMobile retour="/" actions={false} />
      <div className="authwrap md:hidden">
        <Logo variante="compact" hauteur={66} lien={null} className="mb-4 block" />
        <div className="eyebrow2" style={{ marginTop: 8 }}>
          Je me connecte en tant que
        </div>
        <div className="rtabs">
          {ROLES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={`rtab${role === r ? " on" : ""}`}
            >
              {r}
            </button>
          ))}
        </div>
        <h2 style={{ marginBottom: 4 }}>Connexion</h2>
        <div className="sub">Accédez à votre espace Docteur 224.</div>
        {messageErreur}
        <input
          className="inp"
          placeholder="vous@exemple.com"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="inp"
          type="password"
          placeholder="••••••••"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && connecter()}
        />
        <button type="button" className="btn block w-full" onClick={connecter} disabled={enCours}>
          {enCours ? "Connexion…" : "S'identifier"}
        </button>
        <div style={{ textAlign: "right", marginTop: 10 }}>
          <span
            className="muted"
            title="Bientôt disponible"
            style={{ color: "var(--teal)", fontSize: 12.5, fontWeight: 700, opacity: 0.6 }}
          >
            Mot de passe oublié ?
          </span>
        </div>
        <div className="linkline">
          Pas encore de compte ? <Link href="/inscription">S&apos;inscrire</Link>
        </div>
      </div>

      {/* ================= VERSION WEB ================= */}
      <div className="hidden min-h-screen bg-white md:grid lg:grid-cols-2">
        <div className="flex flex-col justify-center px-6 py-10 sm:px-[50px] sm:py-[54px]">
          <div className="mx-auto w-full max-w-[520px]">
            <div className="mb-[10px] text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">
              Je me connecte en tant que
            </div>
            <div className="mb-[22px] flex flex-wrap gap-2">
              {ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`rounded-full border-[1.5px] px-4 py-[9px] text-[13px] font-bold ${
                    role === r ? "border-blue bg-blue text-white" : "border-line bg-white text-muted"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <h3 className="text-[22px] font-extrabold tracking-[-0.3px]">Connexion à mon compte</h3>
            <p className="mb-6 mt-1.5 text-[13.5px] text-muted">Accédez à votre espace Docteur 224.</p>
            {messageErreur}
            <label className="mb-1.5 mt-0.5 block text-[12.5px] font-bold text-ink">E-mail</label>
            <input
              className={champ}
              placeholder="vous@exemple.com"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <div className="mb-1.5 mt-0.5 flex items-center justify-between text-[12.5px] font-bold text-ink">
              Mot de passe
              <button
                type="button"
                disabled
                title="Bientôt disponible"
                className="cursor-not-allowed text-xs font-bold text-teal opacity-60"
              >
                Mot de passe oublié ?
              </button>
            </div>
            <input
              className={champ}
              type="password"
              placeholder="••••••••"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && connecter()}
            />
            <button
              type="button"
              onClick={connecter}
              disabled={enCours}
              className="flex w-full items-center justify-center gap-2 rounded-[11px] bg-teal px-6 py-[14px] text-[15px] font-bold text-white transition-colors hover:bg-[#2790bc] disabled:opacity-60"
            >
              {enCours ? "Connexion…" : "S'identifier"}
            </button>
            <div className="mt-[18px] text-center text-[13px] text-muted">
              Pas encore de compte ?{" "}
              <Link href="/inscription" className="font-bold text-teal">
                S&apos;inscrire
              </Link>
            </div>
          </div>
        </div>
        <CoteAuth
          titre={
            <>
              Heureux de
              <br />
              vous revoir.
            </>
          }
          texte="Connectez-vous pour retrouver vos rendez-vous, vos médecins et vos échanges sécurisés."
          points={[
            { icone: "📅", texte: "Vos rendez-vous vous attendent" },
            { icone: "💬", texte: "Messagerie sécurisée" },
            { icone: "🔒", texte: "Vos données protégées" },
          ]}
        />
      </div>
    </div>
  );
}
