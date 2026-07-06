"use client";

import Link from "next/link";
import { useState } from "react";
import CaseCocher from "@/components/site/CaseCocher";
import CoteAuth from "@/components/site/CoteAuth";
import FauxCaptcha from "@/components/site/FauxCaptcha";

/*
 * Inscription professionnel — reproduit l'écran « inscription-pro » de la
 * maquette web : onglets praticien / clinique / hôpital / cabinet, champs
 * spécifiques au profil choisi. Création simulée (mocks) : « Continuer »
 * ouvre l'espace médecin (praticien) ou établissement (structures), comme
 * le fait la maquette. Supabase viendra plus tard.
 */

type Profil = "praticien" | "clinique" | "hopital" | "cabinet";

const ONGLETS: { id: Profil; nom: string }[] = [
  { id: "praticien", nom: "🩺 Praticien" },
  { id: "clinique", nom: "🏥 Clinique" },
  { id: "hopital", nom: "🏨 Hôpital" },
  { id: "cabinet", nom: "🏢 Cabinet" },
];

const CHAMPS_ETABLISSEMENT: Record<
  Exclude<Profil, "praticien">,
  { label: string; placeholder: string }
> = {
  clinique: { label: "Nom de la clinique *", placeholder: "Ex. Clinique Ambroise Paré" },
  hopital: { label: "Nom de l'hôpital *", placeholder: "Ex. Hôpital Donka" },
  cabinet: { label: "Nom du cabinet *", placeholder: "Ex. Cabinet Médical du Centre" },
};

const SPECIALITES = [
  "Médecine générale",
  "Pédiatrie",
  "Cardiologie",
  "Gynécologie",
  "Dermatologie",
];

const VILLES = ["Conakry", "Kankan", "Labé", "Kindia", "N'Zérékoré", "Boké"];

export default function InscriptionProfessionnel() {
  const [profil, setProfil] = useState<Profil>("praticien");
  const praticien = profil === "praticien";

  const champ =
    "mb-3 w-full rounded-xl border border-line bg-white p-[14px] text-sm outline-none focus:border-teal";
  const etiquette = "mb-1.5 mt-0.5 block text-[12.5px] font-bold text-ink";

  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-10 sm:px-[50px] sm:py-[54px]">
        <div className="mx-auto w-full max-w-[520px]">
          <h3 className="text-[22px] font-extrabold tracking-[-0.3px]">
            Créer mon compte professionnel
          </h3>
          <p className="mb-6 mt-1.5 text-[13.5px] text-muted">
            Sélectionnez votre profil pour commencer.
          </p>
          <div className="mb-[22px] flex flex-wrap gap-2">
            {ONGLETS.map((onglet) => (
              <button
                key={onglet.id}
                type="button"
                onClick={() => setProfil(onglet.id)}
                className={`rounded-full border-[1.5px] px-4 py-[9px] text-[13px] font-bold ${
                  profil === onglet.id
                    ? "border-blue bg-blue text-white"
                    : "border-line bg-white text-muted"
                }`}
              >
                {onglet.nom}
              </button>
            ))}
          </div>
          <FauxCaptcha />
          {praticien ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={etiquette}>Civilité *</label>
                  <select className={champ}>
                    <option>Dr</option>
                    <option>Pr</option>
                  </select>
                </div>
                <div>
                  <label className={etiquette}>Genre *</label>
                  <select className={champ}>
                    <option>Femme</option>
                    <option>Homme</option>
                  </select>
                </div>
              </div>
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
              <label className={etiquette}>Spécialité *</label>
              <select className={champ}>
                {SPECIALITES.map((specialite) => (
                  <option key={specialite}>{specialite}</option>
                ))}
              </select>
            </>
          ) : (
            <>
              <div className="mb-[18px] flex items-start gap-[9px] rounded-xl border border-[#BFE0EF] bg-teal-soft px-[14px] py-3 text-[12.5px] font-semibold leading-relaxed text-blue">
                <span aria-hidden>ℹ️</span>
                <div>
                  Vous compléterez le profil détaillé de l’établissement après la création du
                  compte.
                </div>
              </div>
              <label className={etiquette}>{CHAMPS_ETABLISSEMENT[profil].label}</label>
              <input className={champ} placeholder={CHAMPS_ETABLISSEMENT[profil].placeholder} />
            </>
          )}
          <label className={etiquette}>Ville *</label>
          <select className={champ}>
            {VILLES.map((ville) => (
              <option key={ville}>{ville}</option>
            ))}
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
          <input className={champ} placeholder="contact@exemple.com" />
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
          <Link
            href={praticien ? "/espace-medecin" : "/espace-etablissement"}
            className="flex w-full items-center justify-center gap-2 rounded-[11px] bg-teal px-6 py-[14px] text-[15px] font-bold text-white transition-colors hover:bg-[#2790bc]"
          >
            Continuer
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
            Élargissez
            <br />
            votre patientèle.
          </>
        }
        texte="Rejoignez Docteur 224 et laissez vos patients prendre rendez-vous en ligne, 24h/24 et 7j/7."
        points={[
          { icone: "👥", texte: "Des milliers de patients" },
          { icone: "📅", texte: "Agenda en ligne 24h/24" },
          { icone: "📈", texte: "Visibilité accrue" },
        ]}
        stats={[
          { valeur: "15 000+", label: "Patients actifs" },
          { valeur: "24/7", label: "Prise de RDV" },
          { valeur: "0 GNF", label: "À l'inscription" },
        ]}
      />
    </div>
  );
}
