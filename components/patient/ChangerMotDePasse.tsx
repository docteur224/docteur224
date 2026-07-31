"use client";

import { useState } from "react";
import { changerMotDePasse } from "@/lib/patient";

/*
 * Bloc « Mot de passe » de l'écran Paramètres : la ligne de réglage et, une
 * fois dépliée, le formulaire de changement. L'ancien mot de passe est
 * demandé et vérifié (voir changerMotDePasse) — sinon une session laissée
 * ouverte suffirait à voler le compte.
 */

const VIDE = { actuel: "", nouveau: "", confirmation: "" };

export default function ChangerMotDePasse({ mobile = false }: { mobile?: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  const [champs, setChamps] = useState(VIDE);
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);
  const [enCours, setEnCours] = useState(false);

  const concordent = champs.nouveau !== "" && champs.nouveau === champs.confirmation;
  const valide = champs.actuel !== "" && champs.nouveau.length >= 8 && concordent;

  function basculer() {
    setOuvert((o) => !o);
    setChamps(VIDE);
    setMessage(null);
  }

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    if (!valide || enCours) return;
    setEnCours(true);
    const { erreur } = await changerMotDePasse(champs.actuel, champs.nouveau);
    setEnCours(false);
    if (erreur) {
      setMessage({ texte: `⚠️ ${erreur}`, erreur: true });
      return;
    }
    setChamps(VIDE);
    setOuvert(false);
    setMessage({ texte: "✓ Mot de passe modifié.", erreur: false });
  }

  const aide =
    champs.nouveau !== "" && champs.nouveau.length < 8
      ? "8 caractères minimum."
      : champs.confirmation !== "" && !concordent
        ? "Les deux mots de passe ne correspondent pas."
        : "";

  /* ---------- Mobile (classes de app/mobile.css) ---------- */
  if (mobile) {
    return (
      <>
        <div className="setrow">
          <div>
            <b>Mot de passe</b>
            <small>{ouvert ? "Renseignez l’ancien puis le nouveau" : "Changez votre mot de passe"}</small>
          </div>
          <button type="button" className="btnm gh" onClick={basculer}>
            {ouvert ? "Annuler" : "Modifier"}
          </button>
        </div>
        {message && !ouvert && (
          <div
            style={{
              color: message.erreur ? "var(--red)" : "var(--green)",
              fontSize: 12,
              fontWeight: 700,
              paddingTop: 10,
            }}
          >
            {message.texte}
          </div>
        )}
        {ouvert && (
          <form onSubmit={envoyer} style={{ paddingTop: 12 }}>
            <div className="flabel">Mot de passe actuel</div>
            <input
              type="password"
              className="inp"
              autoComplete="current-password"
              value={champs.actuel}
              onChange={(e) => setChamps({ ...champs, actuel: e.target.value })}
            />
            <div className="flabel">Nouveau mot de passe</div>
            <input
              type="password"
              className="inp"
              autoComplete="new-password"
              value={champs.nouveau}
              onChange={(e) => setChamps({ ...champs, nouveau: e.target.value })}
            />
            <div className="flabel">Confirmer le nouveau mot de passe</div>
            <input
              type="password"
              className="inp"
              autoComplete="new-password"
              value={champs.confirmation}
              onChange={(e) => setChamps({ ...champs, confirmation: e.target.value })}
            />
            {(aide || message) && (
              <div
                style={{
                  color: message && !message.erreur ? "var(--green)" : "var(--red)",
                  fontSize: 12,
                  fontWeight: 700,
                  marginBottom: 8,
                }}
              >
                {message ? message.texte : aide}
              </div>
            )}
            <button
              type="submit"
              className="btn block"
              disabled={!valide || enCours}
              style={{ opacity: valide && !enCours ? 1 : 0.5 }}
            >
              {enCours ? "Enregistrement…" : "Enregistrer le nouveau mot de passe"}
            </button>
          </form>
        )}
      </>
    );
  }

  /* ---------- Web ---------- */
  const classeChamp =
    "w-full rounded-[11px] border border-line bg-white px-[13px] py-3 text-[13.5px] outline-none focus:border-teal";

  return (
    <>
      <div className="flex items-center justify-between gap-[14px] py-[15px]">
        <div>
          <b className="block text-[13.5px] font-bold">Mot de passe</b>
          <small className="text-xs text-muted">
            {ouvert
              ? "Renseignez votre mot de passe actuel, puis le nouveau"
              : "Changez le mot de passe de connexion à votre compte"}
          </small>
        </div>
        <div className="flex items-center gap-3">
          {message && !ouvert && (
            <span
              className={`text-[12.5px] font-bold ${message.erreur ? "text-red" : "text-green"}`}
            >
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
          <div className="grid max-w-[560px] gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-bold text-muted">
                Mot de passe actuel
              </label>
              <input
                type="password"
                autoComplete="current-password"
                className={classeChamp}
                value={champs.actuel}
                onChange={(e) => setChamps({ ...champs, actuel: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-muted">
                Nouveau mot de passe
              </label>
              <input
                type="password"
                autoComplete="new-password"
                className={classeChamp}
                value={champs.nouveau}
                onChange={(e) => setChamps({ ...champs, nouveau: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-muted">Confirmation</label>
              <input
                type="password"
                autoComplete="new-password"
                className={classeChamp}
                value={champs.confirmation}
                onChange={(e) => setChamps({ ...champs, confirmation: e.target.value })}
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={!valide || enCours}
              className="rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {enCours ? "Enregistrement…" : "Enregistrer le nouveau mot de passe"}
            </button>
            <span
              className={`text-[12.5px] font-bold ${
                message && !message.erreur ? "text-green" : "text-red"
              }`}
            >
              {message ? message.texte : aide}
            </span>
          </div>
        </form>
      )}
    </>
  );
}
