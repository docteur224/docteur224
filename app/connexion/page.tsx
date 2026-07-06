"use client";

import Link from "next/link";
import { useState } from "react";
import CoteAuth from "@/components/site/CoteAuth";

/*
 * Connexion — reproduit l'écran « login » de la maquette web : choix du rôle
 * (patient, médecin, clinique, hôpital, cabinet) puis e-mail + mot de passe.
 * Authentification simulée (mocks) : « S'identifier » ouvre l'espace du rôle
 * choisi, exactement comme la maquette. Supabase sera branché plus tard.
 */

const ROLES = [
  { nom: "Patient", cible: "/patient" },
  { nom: "Médecin", cible: "/espace-medecin" },
  { nom: "Clinique", cible: "/espace-etablissement" },
  { nom: "Hôpital", cible: "/espace-etablissement" },
  { nom: "Cabinet", cible: "/espace-medecin" },
];

export default function Connexion() {
  const [role, setRole] = useState(ROLES[0]);

  const champ =
    "mb-3 w-full rounded-xl border border-line bg-white p-[14px] text-sm outline-none focus:border-teal";

  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-10 sm:px-[50px] sm:py-[54px]">
        <div className="mx-auto w-full max-w-[520px]">
          <div className="mb-[10px] text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">
            Je me connecte en tant que
          </div>
          <div className="mb-[22px] flex flex-wrap gap-2">
            {ROLES.map((r) => (
              <button
                key={r.nom}
                type="button"
                onClick={() => setRole(r)}
                className={`rounded-full border-[1.5px] px-4 py-[9px] text-[13px] font-bold ${
                  role.nom === r.nom
                    ? "border-blue bg-blue text-white"
                    : "border-line bg-white text-muted"
                }`}
              >
                {r.nom}
              </button>
            ))}
          </div>
          <h3 className="text-[22px] font-extrabold tracking-[-0.3px]">Connexion à mon compte</h3>
          <p className="mb-6 mt-1.5 text-[13.5px] text-muted">Accédez à votre espace Docteur 224.</p>
          <label className="mb-1.5 mt-0.5 block text-[12.5px] font-bold text-ink">E-mail</label>
          <input className={champ} placeholder="vous@exemple.com" />
          <div className="mb-1.5 mt-0.5 flex items-center justify-between text-[12.5px] font-bold text-ink">
            Mot de passe
            <button
              type="button"
              disabled
              title="Disponible avec l'authentification réelle"
              className="cursor-not-allowed text-xs font-bold text-teal opacity-60"
            >
              Mot de passe oublié ?
            </button>
          </div>
          <input className={champ} type="password" placeholder="••••••••" />
          <Link
            href={role.cible}
            className="flex w-full items-center justify-center gap-2 rounded-[11px] bg-teal px-6 py-[14px] text-[15px] font-bold text-white transition-colors hover:bg-[#2790bc]"
          >
            S&apos;identifier
          </Link>
          <div className="my-[18px] flex items-center gap-[11px] text-[12.5px] text-muted before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
            ou
          </div>
          <Link
            href="/patient"
            className="flex w-full items-center justify-center gap-2 rounded-[11px] border-[1.5px] border-line bg-white px-[18px] py-[11px] text-[13.5px] font-bold text-blue transition-colors hover:bg-bg"
          >
            📱 Continuer avec mon numéro
          </Link>
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
  );
}
