"use client";

import { useEffect, useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import {
  commencerEnrolementTotp,
  confirmerEnrolementTotp,
  listerFacteursTotp,
  retirerFacteurTotp,
  type EnrolementTotp,
  type FacteurTotp,
} from "@/lib/mfa";

/*
 * Authentification à deux facteurs (TOTP) — bloc de l'écran « Mon compte ».
 *
 * LOT 2FA, pièce 1 — ENRÔLEMENT UNIQUEMENT. Ce bloc permet d'ACTIVER ou de
 * RETIRER un deuxième facteur ; il n'IMPOSE rien et ne touche pas à la
 * connexion. L'exigence à la connexion viendra dans une pièce suivante.
 *
 * Réservé aux administrateurs (c'est l'appelant, « Mon compte », qui ne le
 * monte que pour eux). Le secret reste chez Supabase ; on n'en garde rien.
 */

const LIGNE =
  "flex flex-wrap items-center justify-between gap-[14px] border-b border-line py-[15px] last:border-b-0";
const BOUTON =
  "rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg disabled:opacity-50 pointer-coarse:py-[13px]";

/** Le QR encode l'URI otpauth:// ; correction « M », comme les documents. */
function qrDepuisUri(uri: string): string {
  const qr = qrcode(0, "M");
  qr.addData(uri);
  qr.make();
  return qr.createDataURL(5, 2);
}

export default function DeuxFacteurs() {
  const [chargement, setChargement] = useState(true);
  const [facteurs, setFacteurs] = useState<FacteurTotp[]>([]);
  const [enrolement, setEnrolement] = useState<EnrolementTotp | null>(null);
  const [code, setCode] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmerRetrait, setConfirmerRetrait] = useState(false);

  const actif = facteurs.length > 0;
  const qr = useMemo(() => (enrolement ? qrDepuisUri(enrolement.uri) : null), [enrolement]);

  async function recharger() {
    setFacteurs(await listerFacteursTotp());
    setChargement(false);
  }

  useEffect(() => {
    // Chargement initial sans appeler setState « en direct » dans l'effet :
    // même motif que useProfilConnecte (garde de montage dans le .then).
    let actif = true;
    listerFacteursTotp().then((fs) => {
      if (!actif) return;
      setFacteurs(fs);
      setChargement(false);
    });
    return () => {
      actif = false;
    };
  }, []);

  async function activer() {
    setErreur(null);
    setEnCours(true);
    const { enrolement: e, erreur: err } = await commencerEnrolementTotp();
    setEnCours(false);
    if (err || !e) {
      setErreur(err ?? "Impossible d’ouvrir l’enrôlement.");
      return;
    }
    setCode("");
    setEnrolement(e);
  }

  async function confirmer() {
    if (code.length !== 6 || enCours) return;
    setErreur(null);
    setEnCours(true);
    const { erreur: err } = await confirmerEnrolementTotp(enrolement!.factorId, code);
    setEnCours(false);
    if (err) {
      setErreur(err);
      return;
    }
    setEnrolement(null);
    setCode("");
    await recharger();
  }

  function annuler() {
    setEnrolement(null);
    setCode("");
    setErreur(null);
  }

  async function retirer() {
    if (enCours) return;
    setErreur(null);
    setEnCours(true);
    const { erreur: err } = await retirerFacteurTotp(facteurs[0].id);
    setEnCours(false);
    if (err) {
      setErreur(err);
      return;
    }
    setConfirmerRetrait(false);
    await recharger();
  }

  return (
    <div className={LIGNE}>
      <div className="min-w-0 flex-1">
        <b className="block text-[13.5px] font-bold">Authentification à deux facteurs (2FA)</b>
        <small className="text-xs text-muted">
          {actif
            ? "Activée — un code d’application est demandé à la connexion."
            : "Un code à usage unique, depuis une application d’authentification (Google Authenticator, Authy…)."}
        </small>

        {erreur && (
          <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-600">
            {erreur}
          </p>
        )}

        {/* Panneau d'enrôlement : QR + secret + premier code */}
        {enrolement && (
          <div className="mt-3 w-full rounded-xl border border-line bg-bg p-4">
            <p className="mb-3 text-[12.5px] leading-relaxed text-muted">
              Scannez ce code dans votre application d’authentification, puis saisissez le code à
              6&nbsp;chiffres affiché pour terminer.
            </p>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              {qr && (
                // eslint-disable-next-line @next/next/no-img-element -- QR généré en mémoire (data URL), pas un asset
                <img
                  src={qr}
                  alt="QR code à scanner dans votre application d’authentification"
                  width={160}
                  height={160}
                  className="flex-none self-center rounded-lg border border-line bg-white p-2 sm:self-start"
                />
              )}
              <div className="min-w-0 flex-1">
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.04em] text-muted">
                  Saisie manuelle (si le scan est impossible)
                </label>
                <code className="mb-3 block break-all rounded-lg border border-line bg-white px-3 py-2 text-[12.5px] font-bold tracking-[0.08em]">
                  {enrolement.secret}
                </code>
                <label htmlFor="code-2fa" className="mb-1 block text-[11px] font-bold uppercase tracking-[0.04em] text-muted">
                  Code à 6 chiffres
                </label>
                <input
                  id="code-2fa"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="______"
                  className="w-full max-w-[200px] rounded-[11px] border border-line bg-white px-[13px] py-3 text-[15px] font-bold tracking-[0.3em] outline-none focus:border-teal"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={confirmer}
                    disabled={code.length !== 6 || enCours}
                    className="rounded-[9px] bg-blue px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {enCours ? "Vérification…" : "Activer la 2FA"}
                  </button>
                  <button type="button" onClick={annuler} disabled={enCours} className={BOUTON}>
                    Annuler
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation de retrait */}
        {actif && confirmerRetrait && (
          <div className="mt-3 w-full rounded-xl border border-red-line bg-red-soft p-4">
            <p className="mb-3 text-[12.5px] font-semibold text-red">
              Retirer la 2FA ? Votre compte ne sera plus protégé que par le mot de passe.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={retirer}
                disabled={enCours}
                className="rounded-[9px] bg-red px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-orange disabled:opacity-50"
              >
                {enCours ? "…" : "Retirer la 2FA"}
              </button>
              <button type="button" onClick={() => setConfirmerRetrait(false)} disabled={enCours} className={BOUTON}>
                Garder
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Action principale, à droite (empilée sous le texte sur mobile) */}
      {!enrolement && !confirmerRetrait && (
        <div className="flex-none">
          {chargement ? (
            <span className="text-[11.5px] font-bold text-muted">…</span>
          ) : actif ? (
            <button type="button" onClick={() => setConfirmerRetrait(true)} className={`${BOUTON} !text-red`}>
              Désactiver
            </button>
          ) : (
            <button type="button" onClick={activer} disabled={enCours} className={BOUTON}>
              {enCours ? "…" : "Activer"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
