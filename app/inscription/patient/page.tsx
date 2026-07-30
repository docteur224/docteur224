"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import CaseCocher from "@/components/site/CaseCocher";
import CoteAuth from "@/components/site/CoteAuth";
import FauxCaptcha from "@/components/site/FauxCaptcha";
import { inscrirePatient } from "@/lib/auth";

/*
 * Inscription patient — création réelle du compte (Supabase Auth) et des
 * lignes `utilisateurs` + `patients`, puis redirection vers l'espace patient.
 */

export default function InscriptionPatient() {
  const router = useRouter();
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [genre, setGenre] = useState("Femme");
  const [telephone, setTelephone] = useState("");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function creerCompte() {
    if (enCours) return;
    setErreur(null);
    if (!nom || !prenom || !telephone || !email || !motDePasse) {
      setErreur("Remplissez tous les champs obligatoires.");
      return;
    }
    if (motDePasse.length < 8) {
      setErreur("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (motDePasse !== confirmation) {
      setErreur("Le mot de passe et sa confirmation ne correspondent pas.");
      return;
    }
    setEnCours(true);
    const res = await inscrirePatient({
      nom: nom.trim(),
      prenom: prenom.trim(),
      genre: genre === "Femme" ? "F" : "M",
      telephone,
      email: email.trim(),
      motDePasse,
    });
    setEnCours(false);
    if (res.erreur) setErreur(res.erreur);
    else router.push("/patient");
  }

  const champ =
    "mb-3 w-full rounded-xl border border-line bg-white p-[14px] text-sm outline-none focus:border-teal";
  const etiquette = "mb-1.5 mt-0.5 block text-[12.5px] font-bold text-ink";

  const messageErreur = erreur && (
    <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-600">
      {erreur}
    </p>
  );

  return (
    <div className="min-h-screen bg-bg md:bg-white">
      {/* ================= VERSION MOBILE ================= */}
      <div className="md:hidden">
        <EnTeteMobile retour="/inscription" titre="Compte patient" actions={false} />
        <div className="pad">
          <p className="muted" style={{ fontSize: 12, margin: "0 0 14px" }}>
            Gratuit · 2 minutes · sans engagement.
          </p>
          {messageErreur}
          <div className="fgrid2">
            <div>
              <div className="flabel">Nom *</div>
              <input className="inp" placeholder="Nom" value={nom} onChange={(e) => setNom(e.target.value)} />
            </div>
            <div>
              <div className="flabel">Prénom *</div>
              <input className="inp" placeholder="Prénom" value={prenom} onChange={(e) => setPrenom(e.target.value)} />
            </div>
          </div>
          <div className="flabel">Genre</div>
          <select className="selm" value={genre} onChange={(e) => setGenre(e.target.value)}>
            <option>Femme</option>
            <option>Homme</option>
          </select>
          <div className="flabel">Téléphone *</div>
          <div className="phone-inp">
            <span className="cc">🇬🇳 +224</span>
            <input
              className="inp"
              placeholder="6XX XX XX XX"
              aria-label="Numéro de téléphone"
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
            />
          </div>
          <div className="muted" style={{ fontSize: 10.5, margin: "-6px 0 11px" }}>
            Un SMS de vérification sera envoyé à ce numéro.
          </div>
          <div className="flabel">E-mail *</div>
          <input className="inp" placeholder="votre@email.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="flabel">Mot de passe *</div>
          <input className="inp" type="password" placeholder="••••••••" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} />
          <div className="flabel">Confirmation *</div>
          <input className="inp" type="password" placeholder="••••••••" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
          <CaseCocher texte="J'accepte les conditions d'utilisation et la politique de confidentialité." />
          <FauxCaptcha />
          <button type="button" className="btn block w-full" onClick={creerCompte} disabled={enCours}>
            {enCours ? "Création…" : "Créer mon compte"}
          </button>
          <div className="promo">
            <h4>La santé à portée de clics</h4>
            <p>Réservez chez votre médecin sans téléphoner.</p>
            <div className="ps">
              <div>
                <b>320+</b>
                <small>Médecins</small>
              </div>
              <div>
                <b>24/7</b>
                <small>Prise de RDV</small>
              </div>
              <div>
                <b>0 GNF</b>
                <small>Inscription</small>
              </div>
            </div>
          </div>
          <div className="linkline">
            Déjà inscrit ? <Link href="/connexion">Se connecter</Link>
          </div>
        </div>
      </div>

      {/* ================= VERSION WEB ================= */}
      <div className="hidden min-h-screen bg-white md:grid lg:grid-cols-2">
        <div className="flex flex-col justify-center px-6 py-10 sm:px-[50px] sm:py-[54px]">
          <div className="mx-auto w-full max-w-[520px]">
            <h3 className="text-[22px] font-extrabold tracking-[-0.3px]">
              Créer mon compte patient
            </h3>
            <p className="mb-6 mt-1.5 text-[13.5px] text-muted">
              Gratuit · 2 minutes · sans engagement.
            </p>
            {messageErreur}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={etiquette}>Nom *</label>
                <input className={champ} placeholder="Nom" value={nom} onChange={(e) => setNom(e.target.value)} />
              </div>
              <div>
                <label className={etiquette}>Prénom *</label>
                <input className={champ} placeholder="Prénom" value={prenom} onChange={(e) => setPrenom(e.target.value)} />
              </div>
            </div>
            <label className={etiquette}>Genre</label>
            <select className={champ} value={genre} onChange={(e) => setGenre(e.target.value)}>
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
                value={telephone}
                onChange={(e) => setTelephone(e.target.value)}
              />
            </div>
            <p className="-mt-1.5 mb-3 text-[11px] text-muted">
              Un SMS de vérification sera envoyé à ce numéro.
            </p>
            <label className={etiquette}>E-mail *</label>
            <input className={champ} placeholder="votre@email.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={etiquette}>Mot de passe *</label>
                <input className={champ} type="password" placeholder="••••••••" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} />
              </div>
              <div>
                <label className={etiquette}>Confirmation *</label>
                <input className={champ} type="password" placeholder="••••••••" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
              </div>
            </div>
            <CaseCocher texte="J'accepte les conditions d'utilisation et la politique de confidentialité." />
            <FauxCaptcha />
            <button
              type="button"
              onClick={creerCompte}
              disabled={enCours}
              className="flex w-full items-center justify-center gap-2 rounded-[11px] bg-teal px-6 py-[14px] text-[15px] font-bold text-white transition-colors hover:bg-[#2790bc] disabled:opacity-60"
            >
              {enCours ? "Création…" : "Créer mon compte"}
            </button>
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
    </div>
  );
}
