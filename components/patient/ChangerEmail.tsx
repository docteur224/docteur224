"use client";

import { useState } from "react";
import { changerEmail } from "@/lib/patient";

/*
 * Changement de l'adresse de connexion, sous le champ E-mail du profil.
 * L'adresse ne change pas ici : Supabase envoie un lien de confirmation et
 * c'est lui qui fait foi. L'écran annonce donc une demande en cours, jamais
 * un succès — sinon le patient croirait pouvoir se connecter tout de suite
 * avec la nouvelle adresse.
 */
export default function ChangerEmail({
  emailActuel,
  mobile = false,
}: {
  emailActuel: string;
  mobile?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [adresse, setAdresse] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);

  const valide = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(adresse.trim());

  function basculer() {
    setOuvert((o) => !o);
    setAdresse("");
    setMessage(null);
  }

  async function envoyer() {
    if (!valide || enCours) return;
    setEnCours(true);
    const res = await changerEmail(adresse);
    setEnCours(false);
    if (res.erreur) {
      setMessage({ texte: `⚠️ ${res.erreur}`, erreur: true });
      return;
    }
    setOuvert(false);
    setAdresse("");
    setMessage({
      texte: `✉️ Un lien de confirmation a été envoyé à ${adresse.trim().toLowerCase()}. L’adresse ne changera qu’une fois ce lien ouvert — vous pouvez recevoir un message de vérification sur ${res.ancien} également.`,
      erreur: false,
    });
  }

  /* ---------- Mobile ---------- */
  if (mobile) {
    return (
      <>
        <button
          type="button"
          className="btnm gh"
          style={{ marginBottom: 11 }}
          onClick={basculer}
        >
          {ouvert ? "Annuler" : "Changer d’adresse e-mail"}
        </button>
        {ouvert && (
          <>
            <div className="flabel">Nouvelle adresse e-mail</div>
            <input
              type="email"
              className="inp"
              autoComplete="email"
              placeholder="nouvelle@adresse.com"
              value={adresse}
              onChange={(e) => setAdresse(e.target.value)}
            />
            <button
              type="button"
              className="btn block"
              disabled={!valide || enCours}
              style={{ opacity: valide && !enCours ? 1 : 0.5 }}
              onClick={envoyer}
            >
              {enCours ? "Envoi…" : "Envoyer le lien de confirmation"}
            </button>
          </>
        )}
        {message && (
          <div
            style={{
              color: message.erreur ? "var(--red)" : "var(--blue)",
              fontSize: 12,
              fontWeight: 700,
              margin: "8px 0 11px",
            }}
          >
            {message.texte}
          </div>
        )}
      </>
    );
  }

  /* ---------- Web ---------- */
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={basculer}
        className="text-[11.5px] font-bold text-teal underline-offset-2 hover:underline"
      >
        {ouvert ? "Annuler le changement d’adresse" : "Changer d’adresse e-mail"}
      </button>
      {ouvert && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="email"
            autoComplete="email"
            placeholder="nouvelle@adresse.com"
            className="min-w-[220px] flex-1 rounded-[11px] border border-line bg-white px-[13px] py-2.5 text-[13.5px] outline-none focus:border-teal"
            value={adresse}
            onChange={(e) => setAdresse(e.target.value)}
          />
          <button
            type="button"
            onClick={envoyer}
            disabled={!valide || enCours}
            className="rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {enCours ? "Envoi…" : "Envoyer le lien"}
          </button>
        </div>
      )}
      {message && (
        <p
          className={`mt-2 text-[11.5px] font-semibold leading-relaxed ${
            message.erreur ? "text-red" : "text-blue"
          }`}
        >
          {message.texte}
        </p>
      )}
      {!ouvert && !message && (
        <p className="mt-1 text-[11.5px] text-muted">
          Adresse de connexion actuelle : {emailActuel || "—"}
        </p>
      )}
    </div>
  );
}
