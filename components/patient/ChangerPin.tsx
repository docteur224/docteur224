"use client";

import { useEffect, useState, type ReactNode } from "react";
import ChiffresCode from "@/components/auth/ChiffresCode";
import { ReglesPin } from "@/components/auth/InscriptionTelephone";
import { lireEtatPin, modifierPin } from "@/lib/auth-telephone";
import { LONGUEUR_PIN, MESSAGE_PIN, masquerTelephone, pinValide } from "@/lib/pin";

/*
 * Bloc « Code PIN » de « Mon compte », pour un compte ouvert par téléphone.
 *
 * Un tel compte n'a pas de mot de passe connu de son titulaire : le bloc
 * « Mot de passe » ne lui servirait à rien. On montre donc l'un OU l'autre —
 * `repli` est le bloc mot de passe, affiché pour tous les autres comptes.
 * L'ancien PIN est exigé, comme l'ancien mot de passe l'est ailleurs.
 */

const VIDE = { actuel: "", nouveau: "", confirmation: "" };

export default function ChangerPin({ repli }: { repli: ReactNode }) {
  const [etat, setEtat] = useState<{ telephone: string | null; pinModifieLe: string | null } | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [champs, setChamps] = useState(VIDE);
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    let actif = true;
    lireEtatPin().then((e) => actif && setEtat(e));
    return () => {
      actif = false;
    };
  }, []);

  if (!etat) return null;
  if (!etat.telephone) return <>{repli}</>;

  const valide =
    champs.actuel.length === LONGUEUR_PIN && pinValide(champs.nouveau) && champs.nouveau === champs.confirmation;

  function basculer() {
    setOuvert((o) => !o);
    setChamps(VIDE);
    setMessage(null);
  }

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    if (!valide || enCours) return;
    setEnCours(true);
    const { erreur } = await modifierPin(champs.actuel, champs.nouveau);
    setEnCours(false);
    if (erreur) {
      setMessage({ texte: `⚠️ ${erreur}`, erreur: true });
      setChamps({ ...champs, actuel: "" });
      return;
    }
    setChamps(VIDE);
    setOuvert(false);
    setMessage({ texte: "✓ Code PIN modifié.", erreur: false });
  }

  const aide =
    champs.nouveau.length === LONGUEUR_PIN && !pinValide(champs.nouveau)
      ? MESSAGE_PIN
      : champs.confirmation.length === LONGUEUR_PIN && champs.confirmation !== champs.nouveau
        ? "Les deux codes PIN ne correspondent pas."
        : "";

  const etiquette = "mb-1.5 block text-xs font-bold text-muted";

  return (
    <>
      <div className="flex items-center justify-between gap-[14px] py-[15px]">
        <div>
          <b className="block text-[13.5px] font-bold">Code PIN</b>
          <small className="text-xs text-muted">
            {ouvert
              ? "Saisissez votre PIN actuel, puis le nouveau"
              : `Connexion avec le ${masquerTelephone(etat.telephone)} et votre PIN à 4 chiffres`}
          </small>
        </div>
        <div className="flex items-center gap-3">
          {message && !ouvert && (
            <span className={`text-[12.5px] font-bold ${message.erreur ? "text-red" : "text-green"}`}>
              {message.texte}
            </span>
          )}
          <button
            type="button"
            onClick={basculer}
            className="rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
          >
            {ouvert ? "Annuler" : "Modifier"}
          </button>
        </div>
      </div>

      {ouvert && (
        <form onSubmit={envoyer} className="border-t border-line pt-4">
          <div className="grid max-w-[560px] gap-4 sm:grid-cols-3">
            <div>
              <span className={etiquette}>PIN actuel</span>
              <ChiffresCode
                longueur={LONGUEUR_PIN}
                valeur={champs.actuel}
                onChange={(v) => setChamps({ ...champs, actuel: v })}
                libelle="PIN actuel"
                masque
              />
            </div>
            <div>
              <span className={etiquette}>Nouveau PIN</span>
              <ChiffresCode
                longueur={LONGUEUR_PIN}
                valeur={champs.nouveau}
                onChange={(v) => setChamps({ ...champs, nouveau: v })}
                libelle="Nouveau PIN"
                masque
              />
            </div>
            <div>
              <span className={etiquette}>Confirmation</span>
              <ChiffresCode
                longueur={LONGUEUR_PIN}
                valeur={champs.confirmation}
                onChange={(v) => setChamps({ ...champs, confirmation: v })}
                libelle="Confirmation du nouveau PIN"
                masque
              />
            </div>
          </div>
          <div className="max-w-[360px]">
            <ReglesPin pin={champs.nouveau} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={!valide || enCours}
              className="rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-teal-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {enCours ? "Enregistrement…" : "Enregistrer le nouveau PIN"}
            </button>
            <span className={`text-[12.5px] font-bold ${message && !message.erreur ? "text-green" : "text-red"}`}>
              {message ? message.texte : aide}
            </span>
          </div>
        </form>
      )}
    </>
  );
}
