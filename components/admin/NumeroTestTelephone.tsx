"use client";

import { useEffect, useState } from "react";
import { chiffresTelephone, formaterTelephoneGN } from "@/lib/telephone";

/*
 * Carte « Numéro de test » de /espace-admin/messagerie.
 *
 * Tant qu'aucun agrégateur SMS/WhatsApp n'est branché, c'est le seul moyen
 * d'exercer l'inscription et le PIN oublié par téléphone. Coché, le numéro
 * reçoit toujours le même code sans qu'aucun message ne parte, et les écrans
 * de connexion l'AFFICHENT à tous : à décocher dès que la plateforme ouvre au
 * public, ou dès qu'un agrégateur est en service.
 *
 * Enregistrement indépendant du reste de l'écran : ce réglage ne touche pas
 * à la configuration des fournisseurs.
 */

interface Etat {
  test: { actif: boolean; numero: string; code: string } | null;
  compte: { nom: string; creeLe: string } | null;
}

const champ =
  "mb-3 w-full rounded-xl border border-line bg-white p-[11px] text-[13px] outline-none focus:border-teal";
const etiquette = "mb-1.5 mt-0.5 block text-[12.5px] font-bold text-ink";
const boutonSecondaire =
  "rounded-[9px] border-[1.5px] border-line bg-white px-3 py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg disabled:cursor-not-allowed disabled:opacity-50";

export default function NumeroTestTelephone() {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [actif, setActif] = useState(false);
  const [numero, setNumero] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vivant = true;
    fetch("/api/admin/telephone-test")
      .then((r) => r.json())
      .then((e: Etat) => {
        if (!vivant) return;
        setEtat(e);
        if (e.test) {
          setActif(e.test.actif);
          setNumero(chiffresTelephone(e.test.numero));
          setCode(e.test.code);
        }
      })
      .catch(() => vivant && setMessage({ texte: "Réglage illisible.", erreur: true }));
    return () => {
      vivant = false;
    };
  }, [version]);

  async function enregistrer(prochainActif = actif) {
    setEnCours(true);
    setMessage(null);
    const r = await fetch("/api/admin/telephone-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actif: prochainActif, numero, code }),
    });
    const corps = await r.json().catch(() => ({}));
    setEnCours(false);
    if (!r.ok) {
      setMessage({ texte: corps.erreur ?? "Enregistrement impossible.", erreur: true });
      return;
    }
    setActif(prochainActif);
    setMessage({ texte: prochainActif ? "Numéro de test activé." : "Numéro de test désactivé.", erreur: false });
    setVersion((v) => v + 1);
  }

  async function fermerCompte() {
    if (!window.confirm("Fermer le compte ouvert avec le numéro de test ? Il pourra être recréé par l’inscription.")) return;
    setEnCours(true);
    setMessage(null);
    const r = await fetch("/api/admin/telephone-test", { method: "DELETE" });
    const corps = await r.json().catch(() => ({}));
    setEnCours(false);
    setMessage(r.ok ? { texte: "Compte de test fermé.", erreur: false } : { texte: corps.erreur ?? "Échec.", erreur: true });
    setVersion((v) => v + 1);
  }

  return (
    <div className="mb-4 rounded-2xl border border-line bg-white p-5">
      <h3 className="mb-1 text-[15px] font-extrabold">Numéro de test (connexion par téléphone)</h3>
      <p className="mb-[14px] text-[12.5px] text-muted">
        Sans agrégateur SMS/WhatsApp, aucun code ne peut partir. Coché, ce numéro reçoit toujours le
        code ci-dessous, sans aucun envoi, et les pages Connexion et Inscription l’affichent à tous
        les visiteurs. Les autres numéros ne sont pas concernés.
      </p>

      {!etat ? (
        <p className="text-[12.5px] text-muted">Chargement…</p>
      ) : (
        <>
          <label className="mb-[14px] flex cursor-pointer items-center gap-[9px] text-[13px] font-bold text-ink">
            <input
              type="checkbox"
              checked={actif}
              disabled={enCours}
              onChange={(e) => enregistrer(e.target.checked)}
              className="h-[18px] w-[18px] accent-[var(--teal)]"
            />
            Activer le numéro et le code de test
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={etiquette}>Numéro de test</label>
              <div className="flex gap-2">
                <span className="mb-3 flex flex-none items-center rounded-xl border border-line bg-card px-3 text-[13px] font-bold">
                  +224
                </span>
                <input
                  className={champ}
                  inputMode="numeric"
                  aria-label="Numéro de test"
                  value={formaterTelephoneGN(numero)}
                  onChange={(e) => setNumero(chiffresTelephone(e.target.value))}
                />
              </div>
            </div>
            <div>
              <label className={etiquette}>Code reçu (6 chiffres)</label>
              <input
                className={champ}
                inputMode="numeric"
                maxLength={6}
                aria-label="Code de test"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={boutonSecondaire} disabled={enCours} onClick={() => enregistrer()}>
              Enregistrer le numéro et le code
            </button>
            {etat.compte && (
              <button type="button" className={boutonSecondaire} disabled={enCours} onClick={fermerCompte}>
                Fermer le compte de test
              </button>
            )}
          </div>
          <p className="mt-3 text-[12px] text-muted">
            {etat.compte
              ? `Compte ouvert avec ce numéro : ${etat.compte.nom}, depuis le ${new Date(etat.compte.creeLe).toLocaleDateString("fr-FR")}. Fermez-le pour rejouer l’inscription.`
              : "Aucun compte n’est encore ouvert avec ce numéro : l’inscription par téléphone le créera."}
          </p>
          {message && (
            <p className={`mt-2 text-[12.5px] font-bold ${message.erreur ? "text-red" : "text-green"}`}>
              {message.erreur ? "⚠️ " : "✓ "}
              {message.texte}
            </p>
          )}
        </>
      )}
    </div>
  );
}
