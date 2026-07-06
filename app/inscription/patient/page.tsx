"use client";

import Link from "next/link";
import CaseCocher from "@/components/site/CaseCocher";
import CoteAuth from "@/components/site/CoteAuth";
import FauxCaptcha from "@/components/site/FauxCaptcha";

/*
 * Inscription patient — reproduit l'écran « inscription-patient » de la
 * maquette web. Création de compte simulée (mocks) : « Créer mon compte »
 * ouvre l'espace patient, comme la maquette. Supabase viendra plus tard.
 */

export default function InscriptionPatient() {
  const champ =
    "mb-3 w-full rounded-xl border border-line bg-white p-[14px] text-sm outline-none focus:border-teal";
  const etiquette = "mb-1.5 mt-0.5 block text-[12.5px] font-bold text-ink";

  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-10 sm:px-[50px] sm:py-[54px]">
        <div className="mx-auto w-full max-w-[520px]">
          <h3 className="text-[22px] font-extrabold tracking-[-0.3px]">
            Créer mon compte patient
          </h3>
          <p className="mb-6 mt-1.5 text-[13.5px] text-muted">
            Gratuit · 2 minutes · sans engagement.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={etiquette}>Nom *</label>
              <input className={champ} placeholder="Nom" />
            </div>
            <div>
              <label className={etiquette}>Prénom *</label>
              <input className={champ} placeholder="Prénom" />
            </div>
          </div>
          <label className={etiquette}>Genre</label>
          <select className={champ}>
            <option>Femme</option>
            <option>Homme</option>
          </select>
          <label className={etiquette}>Téléphone *</label>
          <div className="mb-3 flex gap-2">
            <span className="flex flex-none items-center gap-1.5 whitespace-nowrap rounded-xl border border-line bg-[#F4F8FA] px-[13px] text-sm font-bold">
              🇬🇳 +224
            </span>
            <input
              className={`${champ} mb-0`}
              placeholder="6XX XX XX XX"
              aria-label="Numéro de téléphone"
            />
          </div>
          <p className="-mt-1.5 mb-3 text-[11px] text-muted">
            Un SMS de vérification sera envoyé à ce numéro.
          </p>
          <label className={etiquette}>E-mail *</label>
          <input className={champ} placeholder="votre@email.com" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={etiquette}>Mot de passe *</label>
              <input className={champ} type="password" placeholder="••••••••" />
            </div>
            <div>
              <label className={etiquette}>Confirmation *</label>
              <input className={champ} type="password" placeholder="••••••••" />
            </div>
          </div>
          <CaseCocher texte="J'accepte les conditions d'utilisation et la politique de confidentialité." />
          <FauxCaptcha />
          <Link
            href="/patient"
            className="flex w-full items-center justify-center gap-2 rounded-[11px] bg-teal px-6 py-[14px] text-[15px] font-bold text-white transition-colors hover:bg-[#2790bc]"
          >
            Créer mon compte
          </Link>
          <div className="mt-[18px] text-center text-[13px] text-muted">
            Déjà inscrit ?{" "}
            <Link href="/connexion" className="font-bold text-teal">
              Se connecter
            </Link>
          </div>
        </div>
      </div>
      <CoteAuth
        titre={
          <>
            La santé à portée
            <br />
            de clics.
          </>
        }
        texte="Rejoignez les milliers de patients qui prennent rendez-vous chez leur médecin sans téléphoner."
        points={[
          { icone: "📅", texte: "Rendez-vous en quelques clics" },
          { icone: "🔔", texte: "Rappels SMS & e-mail" },
          { icone: "💬", texte: "Messagerie sécurisée" },
        ]}
        stats={[
          { valeur: "320+", label: "Médecins" },
          { valeur: "24/7", label: "Prise de RDV" },
          { valeur: "0 GNF", label: "À l'inscription" },
        ]}
      />
    </div>
  );
}
