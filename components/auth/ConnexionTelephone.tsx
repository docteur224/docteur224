"use client";

import { useState } from "react";
import ChampTelephoneGN from "@/components/site/ChampTelephoneGN";
import ChiffresCode from "@/components/auth/ChiffresCode";
import { ReglesPin } from "@/components/auth/InscriptionTelephone";
import {
  BoutonPrincipal,
  BoutonRetour,
  ChoixCanal,
  CodeDemonstration,
  Erreur,
  Etiquette,
  LienTexte,
  Note,
  TitreEtape,
} from "@/components/auth/elements";
import { useRenvoi } from "@/components/auth/use-renvoi";
import { connecterParTelephone, envoyerCode, reinitialiserPin, verifierCode } from "@/lib/auth-telephone";
import {
  LONGUEUR_CODE,
  LONGUEUR_PIN,
  MESSAGE_PIN,
  masquerTelephone,
  pinValide,
  type CanalCode,
} from "@/lib/pin";
import { MESSAGE_TELEPHONE_GN, telephoneGuineenValide, versTelephoneInternational } from "@/lib/telephone";

/*
 * Connexion par téléphone : numéro → code PIN → espace patient. Aucun code
 * n'est envoyé pour une connexion normale.
 *
 * « Code PIN oublié ? » : canal → code reçu → nouveau PIN → confirmation →
 * connecté. Le numéro n'est pas vérifié à la première étape : l'écran ne
 * doit pas dire si un numéro est inscrit (le serveur répond « Numéro ou code
 * PIN incorrect » dans les deux cas).
 */

type Etape = "numero" | "pin" | "canal" | "code" | "nouveau" | "confirmation";

const PRECEDENTE: Partial<Record<Etape, Etape>> = {
  pin: "numero",
  canal: "pin",
  code: "canal",
  confirmation: "nouveau",
};

export function useConnexionTelephone(destination: (cible: string) => string) {
  const [etape, setEtape] = useState<Etape>("numero");
  const [telephone, setTelephone] = useState("");
  const [pin, setPin] = useState("");
  const [canal, setCanal] = useState<CanalCode>("whatsapp");
  const [code, setCode] = useState("");
  const [codeDemonstration, setCodeDemonstration] = useState<string | null>(null);
  const [jeton, setJeton] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [renvoiDans, demarrerRenvoi] = useRenvoi();

  const international = versTelephoneInternational(telephone);

  function aller(e: Etape) {
    setErreur(null);
    setEtape(e);
  }

  function continuer() {
    if (!telephoneGuineenValide(telephone)) {
      setErreur(MESSAGE_TELEPHONE_GN);
      return;
    }
    setPin("");
    aller("pin");
  }

  async function connecter() {
    if (enCours) return;
    if (pin.length !== LONGUEUR_PIN) {
      setErreur("Saisissez les 4 chiffres de votre code PIN.");
      return;
    }
    setErreur(null);
    setEnCours(true);
    const res = await connecterParTelephone(international, pin);
    if (res.erreur) {
      setEnCours(false);
      setErreur(res.erreur);
      setPin("");
      return;
    }
    window.location.assign(destination(res.cible ?? "/patient"));
  }

  async function envoyer() {
    if (enCours) return;
    setErreur(null);
    setEnCours(true);
    const res = await envoyerCode(international, canal, "pin_oublie");
    setEnCours(false);
    if (res.renvoiDans) demarrerRenvoi(res.renvoiDans);
    if (res.erreur) {
      setErreur(res.erreur);
      return;
    }
    setCode("");
    setCodeDemonstration(res.codeDemonstration ?? null);
    if (etape !== "code") aller("code");
  }

  async function verifier() {
    if (enCours) return;
    if (code.length !== LONGUEUR_CODE) {
      setErreur("Saisissez les 6 chiffres du code reçu.");
      return;
    }
    setEnCours(true);
    const res = await verifierCode(international, "pin_oublie", code);
    setEnCours(false);
    if (res.erreur || !res.jeton) {
      setErreur(res.erreur ?? "Code incorrect.");
      setCode("");
      return;
    }
    setJeton(res.jeton);
    setNouveau("");
    setConfirmation("");
    aller("nouveau");
  }

  function validerNouveau() {
    if (!pinValide(nouveau)) {
      setErreur(MESSAGE_PIN);
      return;
    }
    setConfirmation("");
    aller("confirmation");
  }

  async function confirmerNouveau() {
    if (enCours) return;
    if (confirmation !== nouveau) {
      setErreur("Les deux codes PIN ne correspondent pas.");
      setConfirmation("");
      return;
    }
    setEnCours(true);
    const res = await reinitialiserPin(international, jeton, nouveau);
    if (res.erreur) {
      setEnCours(false);
      if (res.jetonExpire) aller("canal");
      setErreur(res.erreur);
      return;
    }
    window.location.assign(destination(res.cible ?? "/patient"));
  }

  return {
    etape, telephone, setTelephone, international, pin, setPin, canal, setCanal, code, setCode,
    codeDemonstration, nouveau, setNouveau, confirmation, setConfirmation, erreur, enCours, renvoiDans,
    continuer, connecter, envoyer, verifier, validerNouveau, confirmerNouveau,
    oublie: () => aller("canal"),
    retour: () => aller(PRECEDENTE[etape] ?? "numero"),
  };
}

export type ParcoursConnexionTelephone = ReturnType<typeof useConnexionTelephone>;

export default function ConnexionTelephone({
  p,
  mobile = false,
}: {
  p: ParcoursConnexionTelephone;
  mobile?: boolean;
}) {
  const erreur = p.erreur && <Erreur>{p.erreur}</Erreur>;
  const numero = <b className="text-ink">{masquerTelephone(p.international)}</b>;

  return (
    <div>
      {p.etape === "numero" && (
        <>
          {erreur}
          <Etiquette mobile={mobile}>Numéro de téléphone</Etiquette>
          <ChampTelephoneGN valeur={p.telephone} onChange={p.setTelephone} mobile={mobile} />
          <Note>🔐 Connexion avec votre numéro et votre code PIN. Aucun SMS n’est envoyé.</Note>
          <BoutonPrincipal mobile={mobile} onClick={p.continuer}>
            Continuer
          </BoutonPrincipal>
        </>
      )}

      {p.etape === "pin" && (
        <>
          <BoutonRetour onClick={p.retour}>Changer de numéro</BoutonRetour>
          <TitreEtape titre="Saisissez votre code PIN" texte={<>Compte : {numero}</>} />
          {erreur}
          <ChiffresCode
            longueur={LONGUEUR_PIN}
            valeur={p.pin}
            onChange={p.setPin}
            libelle="Code PIN"
            masque
            onValider={p.connecter}
            autoFocus
          />
          <div className="mb-3 text-right">
            <LienTexte onClick={p.oublie}>Code PIN oublié ?</LienTexte>
          </div>
          <BoutonPrincipal mobile={mobile} onClick={p.connecter} enCours={p.enCours}>
            {p.enCours ? "Connexion…" : "Se connecter"}
          </BoutonPrincipal>
        </>
      )}

      {p.etape === "canal" && (
        <>
          <BoutonRetour onClick={p.retour}>Retour à la connexion</BoutonRetour>
          <TitreEtape
            titre="Code PIN oublié ?"
            texte={<>Pour protéger vos données de santé, nous vérifions d’abord le numéro {numero}.</>}
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
            titre="Vérifiez votre identité"
            texte={
              <>
                Si ce numéro a un compte, un code à 6 chiffres vient de partir par{" "}
                {p.canal === "whatsapp" ? "WhatsApp" : "SMS"} au {numero}.
              </>
            }
          />
          {erreur}
          {p.codeDemonstration && <CodeDemonstration code={p.codeDemonstration} />}
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

      {p.etape === "nouveau" && (
        <>
          <TitreEtape titre="Créez un nouveau PIN" texte="L’ancien code PIN sera immédiatement remplacé." />
          {erreur}
          <ChiffresCode
            longueur={LONGUEUR_PIN}
            valeur={p.nouveau}
            onChange={p.setNouveau}
            libelle="Nouveau code PIN"
            masque
            onValider={p.validerNouveau}
            autoFocus
          />
          <ReglesPin pin={p.nouveau} />
          <BoutonPrincipal mobile={mobile} onClick={p.validerNouveau}>
            Continuer
          </BoutonPrincipal>
        </>
      )}

      {p.etape === "confirmation" && (
        <>
          <BoutonRetour onClick={p.retour}>Modifier le PIN</BoutonRetour>
          <TitreEtape titre="Confirmez le nouveau PIN" texte="Saisissez-le une seconde fois." />
          {erreur}
          <ChiffresCode
            longueur={LONGUEUR_PIN}
            valeur={p.confirmation}
            onChange={p.setConfirmation}
            libelle="Confirmation du code PIN"
            masque
            onValider={p.confirmerNouveau}
            autoFocus
          />
          <BoutonPrincipal mobile={mobile} onClick={p.confirmerNouveau} enCours={p.enCours}>
            {p.enCours ? "Enregistrement…" : "Réinitialiser et me connecter"}
          </BoutonPrincipal>
        </>
      )}
    </div>
  );
}
