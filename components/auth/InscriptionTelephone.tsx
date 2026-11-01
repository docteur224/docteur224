"use client";

import Link from "next/link";
import { useState } from "react";
import CaseCocher from "@/components/site/CaseCocher";
import ChampTelephoneGN from "@/components/site/ChampTelephoneGN";
import ChiffresCode from "@/components/auth/ChiffresCode";
import {
  BoutonPrincipal,
  BoutonRetour,
  CHAMP_WEB,
  ChoixCanal,
  CodeDemonstration,
  EncartNumeroTest,
  Erreur,
  Etiquette,
  LienTexte,
  Note,
  Progression,
  TitreEtape,
} from "@/components/auth/elements";
import { useRenvoi } from "@/components/auth/use-renvoi";
import { envoyerCode, inscrireParTelephone, verifierCode } from "@/lib/auth-telephone";
import {
  LONGUEUR_CODE,
  LONGUEUR_PIN,
  MESSAGE_PIN,
  masquerTelephone,
  pinTropSimple,
  pinValide,
  type CanalCode,
} from "@/lib/pin";
import { MESSAGE_TELEPHONE_GN, telephoneGuineenValide, versTelephoneInternational } from "@/lib/telephone";

/*
 * Inscription patient par téléphone :
 *   numéro → WhatsApp ou SMS → code à 6 chiffres → PIN → confirmation du PIN
 *   → profil → compte créé, session ouverte.
 *
 * Le code ne sert qu'ici, une fois : les connexions suivantes se font avec le
 * numéro et le PIN. L'état vit dans le hook, au niveau de la page, parce que
 * la page rend deux fois le parcours (mobile et web) : les deux rendus
 * montrent la même étape et les mêmes saisies.
 */

type Etape = "numero" | "canal" | "code" | "pin" | "confirmation" | "profil";

const PROGRESSION: Record<Etape, [number, string]> = {
  numero: [1, "Identification"],
  canal: [2, "Vérification"],
  code: [2, "Vérification"],
  pin: [3, "Création du PIN"],
  confirmation: [3, "Confirmation du PIN"],
  profil: [4, "Profil"],
};

const PRECEDENTE: Partial<Record<Etape, Etape>> = {
  canal: "numero",
  code: "canal",
  confirmation: "pin",
};

export function useInscriptionTelephone() {
  const [etape, setEtape] = useState<Etape>("numero");
  const [telephone, setTelephone] = useState("");
  const [canal, setCanal] = useState<CanalCode>("whatsapp");
  const [code, setCode] = useState("");
  const [codeDemonstration, setCodeDemonstration] = useState<{ code: string; test: boolean } | null>(null);
  const [jeton, setJeton] = useState("");
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [genre, setGenre] = useState("Femme");
  const [dateNaissance, setDateNaissance] = useState("");
  const [email, setEmail] = useState("");
  const [conditions, setConditions] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [compteExistant, setCompteExistant] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [renvoiDans, demarrerRenvoi] = useRenvoi();

  function aller(e: Etape) {
    setErreur(null);
    setCompteExistant(false);
    setEtape(e);
  }

  function continuerNumero() {
    if (!telephoneGuineenValide(telephone)) {
      setErreur(MESSAGE_TELEPHONE_GN);
      return;
    }
    aller("canal");
  }

  async function envoyer() {
    if (enCours) return;
    setErreur(null);
    setEnCours(true);
    const res = await envoyerCode(telephone, canal, "inscription");
    setEnCours(false);
    if (res.compteExistant) {
      aller("numero");
      setErreur(res.erreur ?? null);
      setCompteExistant(true);
      return;
    }
    if (res.renvoiDans) demarrerRenvoi(res.renvoiDans);
    if (res.erreur) {
      setErreur(res.erreur);
      return;
    }
    setCode("");
    setCodeDemonstration(
      res.codeTest
        ? { code: res.codeTest, test: true }
        : res.codeDemonstration
          ? { code: res.codeDemonstration, test: false }
          : null
    );
    if (etape !== "code") aller("code");
  }

  async function verifier() {
    if (enCours) return;
    if (code.length !== LONGUEUR_CODE) {
      setErreur("Saisissez les 6 chiffres du code reçu.");
      return;
    }
    setEnCours(true);
    const res = await verifierCode(telephone, "inscription", code);
    setEnCours(false);
    if (res.erreur || !res.jeton) {
      setErreur(res.erreur ?? "Code incorrect.");
      setCode("");
      return;
    }
    setJeton(res.jeton);
    setPin("");
    setConfirmation("");
    aller("pin");
  }

  function validerPin() {
    if (!pinValide(pin)) {
      setErreur(MESSAGE_PIN);
      return;
    }
    setConfirmation("");
    aller("confirmation");
  }

  function confirmerPin() {
    if (confirmation !== pin) {
      setErreur("Les deux codes PIN ne correspondent pas.");
      setConfirmation("");
      return;
    }
    aller("profil");
  }

  async function creer() {
    if (enCours) return;
    setErreur(null);
    if (!nom.trim() || !prenom.trim() || !dateNaissance) {
      setErreur("Remplissez tous les champs obligatoires.");
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErreur("Adresse e-mail invalide.");
      return;
    }
    if (!conditions) {
      setErreur("Acceptez les conditions d’utilisation pour créer votre compte.");
      return;
    }
    setEnCours(true);
    const res = await inscrireParTelephone(versTelephoneInternational(telephone), jeton, pin, {
      nom: nom.trim(),
      prenom: prenom.trim(),
      genre: genre === "Femme" ? "F" : "M",
      dateNaissance,
      email: email.trim(),
    });
    if (res.erreur) {
      setEnCours(false);
      if (res.jetonExpire || res.compteExistant) {
        aller("numero");
        setCompteExistant(!!res.compteExistant);
      }
      setErreur(res.erreur);
      return;
    }
    // Navigation complète : la session vient d'être posée dans les cookies
    // par le serveur (même raison que la connexion par e-mail).
    window.location.assign(res.cible ?? "/patient");
  }

  return {
    etape, telephone, setTelephone, canal, setCanal, code, setCode, codeDemonstration,
    pin, setPin, confirmation, setConfirmation, nom, setNom, prenom, setPrenom, genre, setGenre,
    dateNaissance, setDateNaissance, email, setEmail, setConditions, erreur, compteExistant,
    enCours, renvoiDans,
    continuerNumero, envoyer, verifier, validerPin, confirmerPin, creer,
    retour: () => aller(PRECEDENTE[etape] ?? "numero"),
  };
}

export type ParcoursInscriptionTelephone = ReturnType<typeof useInscriptionTelephone>;

export default function InscriptionTelephone({
  p,
  mobile = false,
}: {
  p: ParcoursInscriptionTelephone;
  mobile?: boolean;
}) {
  const [numeroEtape, nomEtape] = PROGRESSION[p.etape];
  const champ = mobile ? "inp" : CHAMP_WEB;
  const aujourdhui = new Date().toISOString().slice(0, 10);

  const erreur = p.erreur && (
    <Erreur>
      {p.erreur}
      {p.compteExistant && (
        <>
          {" "}
          <Link href="/connexion?mode=telephone" className="underline">
            Se connecter
          </Link>
        </>
      )}
    </Erreur>
  );

  return (
    <div>
      <Progression etape={numeroEtape} total={4} nom={nomEtape} />

      {p.etape === "numero" && (
        <>
          <TitreEtape
            titre="Votre numéro de téléphone"
            texte="Il servira d’identifiant à votre compte. Nous le vérifions d’abord avec un code temporaire."
          />
          {erreur}
          <EncartNumeroTest onUtiliser={p.setTelephone} />
          <Etiquette mobile={mobile}>Téléphone *</Etiquette>
          <ChampTelephoneGN valeur={p.telephone} onChange={p.setTelephone} mobile={mobile} />
          <BoutonPrincipal mobile={mobile} onClick={p.continuerNumero}>
            Continuer
          </BoutonPrincipal>
        </>
      )}

      {p.etape === "canal" && (
        <>
          <BoutonRetour onClick={p.retour}>Modifier le numéro</BoutonRetour>
          <TitreEtape
            titre="Recevoir votre code"
            texte={
              <>
                Choisissez comment recevoir le code envoyé au{" "}
                <b className="text-ink">{masquerTelephone(versTelephoneInternational(p.telephone))}</b>.
              </>
            }
          />
          {erreur}
          <ChoixCanal canal={p.canal} onChange={p.setCanal} />
          <BoutonPrincipal mobile={mobile} onClick={p.envoyer} enCours={p.enCours}>
            {p.enCours ? "Envoi…" : "Envoyer le code"}
          </BoutonPrincipal>
        </>
      )}

      {p.etape === "code" && (
        <>
          <BoutonRetour onClick={p.retour} />
          <TitreEtape
            titre="Vérifiez votre numéro"
            texte={
              <>
                Code à 6 chiffres envoyé par {p.canal === "whatsapp" ? "WhatsApp" : "SMS"} au{" "}
                <b className="text-ink">{masquerTelephone(versTelephoneInternational(p.telephone))}</b>.
              </>
            }
          />
          {erreur}
          {p.codeDemonstration && (
            <CodeDemonstration code={p.codeDemonstration.code} test={p.codeDemonstration.test} />
          )}
          <ChiffresCode
            longueur={LONGUEUR_CODE}
            valeur={p.code}
            onChange={p.setCode}
            libelle="Code reçu"
            onValider={p.verifier}
            autoFocus
          />
          <p className="mb-4 text-center text-[12.5px] text-muted">
            Code non reçu ?{" "}
            {p.renvoiDans > 0 ? (
              <span>Renvoyer dans {p.renvoiDans} s</span>
            ) : (
              <LienTexte onClick={p.envoyer}>Renvoyer le code</LienTexte>
            )}
          </p>
          <BoutonPrincipal mobile={mobile} onClick={p.verifier} enCours={p.enCours}>
            {p.enCours ? "Vérification…" : "Vérifier"}
          </BoutonPrincipal>
        </>
      )}

      {p.etape === "pin" && (
        <>
          <TitreEtape
            titre="Créez votre code PIN"
            texte="4 chiffres personnels. Vos prochaines connexions se feront avec votre numéro et ce code — sans SMS."
          />
          {erreur}
          <ChiffresCode
            longueur={LONGUEUR_PIN}
            valeur={p.pin}
            onChange={p.setPin}
            libelle="Nouveau code PIN"
            masque
            onValider={p.validerPin}
            autoFocus
          />
          <ReglesPin pin={p.pin} />
          <Note ton="alerte">
            ⚠️ Ne communiquez jamais votre PIN. Docteur 224 ne vous le demandera jamais par téléphone,
            SMS ou WhatsApp.
          </Note>
          <BoutonPrincipal mobile={mobile} onClick={p.validerPin}>
            Continuer
          </BoutonPrincipal>
        </>
      )}

      {p.etape === "confirmation" && (
        <>
          <BoutonRetour onClick={p.retour}>Modifier le PIN</BoutonRetour>
          <TitreEtape titre="Confirmez votre code PIN" texte="Saisissez-le une seconde fois pour éviter toute erreur." />
          {erreur}
          <ChiffresCode
            longueur={LONGUEUR_PIN}
            valeur={p.confirmation}
            onChange={p.setConfirmation}
            libelle="Confirmation du code PIN"
            masque
            onValider={p.confirmerPin}
            autoFocus
          />
          <BoutonPrincipal mobile={mobile} onClick={p.confirmerPin}>
            Continuer vers mon profil
          </BoutonPrincipal>
        </>
      )}

      {p.etape === "profil" && (
        <>
          <TitreEtape titre="Votre profil" texte="Numéro vérifié ✓ PIN enregistré ✓ — encore quelques informations." />
          {erreur}
          <div className={mobile ? "fgrid2" : "grid grid-cols-2 gap-3"}>
            <div>
              <Etiquette mobile={mobile}>Nom *</Etiquette>
              <input className={champ} placeholder="Nom" value={p.nom} onChange={(e) => p.setNom(e.target.value)} />
            </div>
            <div>
              <Etiquette mobile={mobile}>Prénom *</Etiquette>
              <input className={champ} placeholder="Prénom" value={p.prenom} onChange={(e) => p.setPrenom(e.target.value)} />
            </div>
          </div>
          <div className={mobile ? "fgrid2" : "grid grid-cols-2 gap-3"}>
            <div>
              <Etiquette mobile={mobile}>Genre</Etiquette>
              <select className={mobile ? "selm" : champ} value={p.genre} onChange={(e) => p.setGenre(e.target.value)}>
                <option>Femme</option>
                <option>Homme</option>
              </select>
            </div>
            <div>
              <Etiquette mobile={mobile}>Date de naissance *</Etiquette>
              <input
                className={champ}
                type="date"
                max={aujourdhui}
                aria-label="Date de naissance"
                value={p.dateNaissance}
                onChange={(e) => p.setDateNaissance(e.target.value)}
              />
            </div>
          </div>
          <Etiquette mobile={mobile}>
            E-mail <span className="font-semibold text-muted">— facultatif</span>
          </Etiquette>
          <input
            className={champ}
            type="email"
            placeholder="votre@email.com"
            value={p.email}
            onChange={(e) => p.setEmail(e.target.value)}
          />
          <CaseCocher
            texte="J'accepte les conditions d'utilisation et la politique de confidentialité."
            onChange={p.setConditions}
          />
          <BoutonPrincipal mobile={mobile} onClick={p.creer} enCours={p.enCours}>
            {p.enCours ? "Création…" : "Créer mon compte"}
          </BoutonPrincipal>
        </>
      )}
    </div>
  );
}

/** Les deux règles, cochées au fil de la saisie. */
export function ReglesPin({ pin }: { pin: string }) {
  const complet = pin.length === LONGUEUR_PIN;
  const regles = [
    { ok: complet, texte: "Exactement 4 chiffres" },
    { ok: complet && !pinTropSimple(pin), texte: "Pas de 0000, 1234…" },
  ];
  return (
    <div className="mb-4 grid grid-cols-2 gap-2">
      {regles.map((r) => (
        <div
          key={r.texte}
          className={`rounded-[10px] border px-[10px] py-2 text-[12px] font-semibold ${
            r.ok ? "border-green-line bg-green-soft text-green" : "border-line bg-card text-muted"
          }`}
        >
          {r.ok ? "✓" : "○"} {r.texte}
        </div>
      ))}
    </div>
  );
}
