"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import CaseCocher from "@/components/site/CaseCocher";
import CoteAuth from "@/components/site/CoteAuth";
import FauxCaptcha from "@/components/site/FauxCaptcha";
import { inscrireProfessionnel } from "@/lib/auth";
import { creerClientNavigateur } from "@/lib/supabase/client";

/*
 * Inscription professionnel — création réelle du compte : praticien →
 * `utilisateurs` + `medecins` (statut en_attente, validé par l'admin) ;
 * clinique/hôpital/cabinet → `utilisateurs` + `etablissements`.
 * Spécialités et villes chargées depuis les référentiels Supabase.
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
  { label: string; placeholder: string; type: string }
> = {
  clinique: { label: "Nom de la clinique *", placeholder: "Ex. Clinique Ambroise Paré", type: "Clinique privée" },
  hopital: { label: "Nom de l'hôpital *", placeholder: "Ex. Hôpital Donka", type: "Hôpital public" },
  cabinet: { label: "Nom du cabinet *", placeholder: "Ex. Cabinet Médical du Centre", type: "Cabinet médical" },
};

interface Reference {
  id: string;
  nom: string;
}

export default function InscriptionProfessionnel() {
  const router = useRouter();
  const [profil, setProfil] = useState<Profil>("praticien");
  const praticien = profil === "praticien";

  const [specialites, setSpecialites] = useState<Reference[]>([]);
  const [villes, setVilles] = useState<Reference[]>([]);
  useEffect(() => {
    const supabase = creerClientNavigateur();
    supabase.from("specialites").select("id,nom").order("nom").then(({ data }) => setSpecialites(data ?? []));
    supabase.from("villes").select("id,nom").order("nom").then(({ data }) => setVilles(data ?? []));
  }, []);

  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [nomEtablissement, setNomEtablissement] = useState("");
  const [specialiteId, setSpecialiteId] = useState("");
  const [villeId, setVilleId] = useState("");
  const [telephone, setTelephone] = useState("");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function creerCompte() {
    if (enCours) return;
    setErreur(null);
    if (praticien && (!nom || !prenom)) return setErreur("Renseignez votre nom et votre prénom.");
    if (!praticien && !nomEtablissement) return setErreur("Renseignez le nom de l'établissement.");
    if (!telephone || !email || !motDePasse) return setErreur("Remplissez tous les champs obligatoires.");
    if (motDePasse.length < 8) return setErreur("Le mot de passe doit contenir au moins 8 caractères.");
    setEnCours(true);
    const res = await inscrireProfessionnel({
      typeCompte: praticien ? "medecin" : "etablissement",
      nom: praticien ? nom.trim() : nomEtablissement.trim(),
      prenom: praticien ? prenom.trim() : "Gestion",
      telephone,
      email: email.trim(),
      motDePasse,
      specialiteId: praticien ? specialiteId || specialites[0]?.id : undefined,
      typeEtablissement: praticien ? undefined : CHAMPS_ETABLISSEMENT[profil as Exclude<Profil, "praticien">].type,
      nomEtablissement: praticien ? undefined : nomEtablissement.trim(),
      villeId: villeId || villes[0]?.id,
    });
    setEnCours(false);
    if (res.erreur) setErreur(res.erreur);
    else router.push(praticien ? "/espace-medecin" : "/espace-etablissement");
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
        <EnTeteMobile retour="/inscription" titre="Compte professionnel" actions={false} />
        <div className="pad">
          <p className="muted" style={{ fontSize: 12, margin: "0 0 12px" }}>
            Sélectionnez votre profil pour commencer.
          </p>
          <div className="rtabs">
            {ONGLETS.map((onglet) => (
              <button
                key={onglet.id}
                type="button"
                onClick={() => setProfil(onglet.id)}
                className={`rtab${profil === onglet.id ? " on" : ""}`}
              >
                {onglet.nom}
              </button>
            ))}
          </div>
          <FauxCaptcha />
          {messageErreur}
          {praticien ? (
            <>
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
              <div className="flabel">Spécialité *</div>
              <select className="selm" value={specialiteId} onChange={(e) => setSpecialiteId(e.target.value)}>
                {specialites.map((s) => (
                  <option key={s.id} value={s.id}>{s.nom}</option>
                ))}
              </select>
            </>
          ) : (
            <>
              <div className="abannerm">
                <span aria-hidden>ℹ️</span>
                <div>
                  Vous compléterez le profil détaillé de l&apos;établissement après la création du
                  compte.
                </div>
              </div>
              <div className="flabel">{CHAMPS_ETABLISSEMENT[profil].label}</div>
              <input
                className="inp"
                placeholder={CHAMPS_ETABLISSEMENT[profil].placeholder}
                value={nomEtablissement}
                onChange={(e) => setNomEtablissement(e.target.value)}
              />
            </>
          )}
          <div className="flabel">Ville *</div>
          <select className="selm" value={villeId} onChange={(e) => setVilleId(e.target.value)}>
            {villes.map((v) => (
              <option key={v.id} value={v.id}>{v.nom}</option>
            ))}
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
          <input className="inp" placeholder="contact@exemple.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="flabel">Mot de passe *</div>
          <input className="inp" type="password" placeholder="••••••••" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} />
          <CaseCocher texte="J'accepte les conditions d'utilisation et la politique de confidentialité." />
          <button type="button" className="btn block w-full" onClick={creerCompte} disabled={enCours}>
            {enCours ? "Création…" : "Continuer"}
          </button>
          <div className="promo">
            <h4>Élargissez votre patientèle</h4>
            <p>Laissez vos patients prendre rendez-vous en ligne 24h/24.</p>
            <div className="ps">
              <div>
                <b>15 000+</b>
                <small>Patients</small>
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
            {messageErreur}
            {praticien ? (
              <>
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
                <label className={etiquette}>Spécialité *</label>
                <select className={champ} value={specialiteId} onChange={(e) => setSpecialiteId(e.target.value)}>
                  {specialites.map((s) => (
                    <option key={s.id} value={s.id}>{s.nom}</option>
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
                <input
                  className={champ}
                  placeholder={CHAMPS_ETABLISSEMENT[profil].placeholder}
                  value={nomEtablissement}
                  onChange={(e) => setNomEtablissement(e.target.value)}
                />
              </>
            )}
            <label className={etiquette}>Ville *</label>
            <select className={champ} value={villeId} onChange={(e) => setVilleId(e.target.value)}>
              {villes.map((v) => (
                <option key={v.id} value={v.id}>{v.nom}</option>
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
                value={telephone}
                onChange={(e) => setTelephone(e.target.value)}
              />
            </div>
            <p className="-mt-1.5 mb-3 text-[11px] text-muted">
              Un SMS de vérification sera envoyé à ce numéro.
            </p>
            <label className={etiquette}>E-mail *</label>
            <input className={champ} placeholder="contact@exemple.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <label className={etiquette}>Mot de passe *</label>
            <input className={champ} type="password" placeholder="••••••••" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} />
            <CaseCocher texte="J'accepte les conditions d'utilisation et la politique de confidentialité." />
            <button
              type="button"
              onClick={creerCompte}
              disabled={enCours}
              className="flex w-full items-center justify-center gap-2 rounded-[11px] bg-teal px-6 py-[14px] text-[15px] font-bold text-white transition-colors hover:bg-[#2790bc] disabled:opacity-60"
            >
              {enCours ? "Création…" : "Continuer"}
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
    </div>
  );
}
