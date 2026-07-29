"use client";

import { useState } from "react";
import { signalerAvis } from "@/lib/avis";

/*
 * Signaler un avis abusif depuis la fiche publique.
 *
 * C'est ce qui alimente la file de modération de l'admin : les avis étant
 * publiés dès leur dépôt, sans ce bouton un commentaire injurieux resterait
 * en ligne jusqu'à ce que quelqu'un pense à regarder la table.
 *
 * Réservé aux utilisateurs connectés (`signalements.auteur_id` est requis) :
 * un visiteur anonyme se voit expliquer qu'il doit se connecter.
 */

const MOTIFS = [
  "Propos injurieux ou haineux",
  "Faux avis / ne correspond pas à une consultation",
  "Données personnelles divulguées",
  "Autre",
];

export default function SignalerAvis({ avisId }: { avisId: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState(MOTIFS[0]);
  const [etat, setEtat] = useState<"saisie" | "envoi" | "envoye">("saisie");
  const [erreur, setErreur] = useState("");

  if (etat === "envoye") {
    return (
      <p className="mt-2 text-[11.5px] font-bold text-green">
        ✔ Signalement transmis à la modération. Merci.
      </p>
    );
  }

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="mt-2 text-[11.5px] font-semibold text-muted underline-offset-2 transition-colors hover:text-red hover:underline"
      >
        Signaler cet avis
      </button>
    );
  }

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    setEtat("envoi");
    const { erreur: err } = await signalerAvis(avisId, motif);
    if (err) {
      setErreur(err);
      setEtat("saisie");
      return;
    }
    setEtat("envoye");
  }

  return (
    <form onSubmit={envoyer} className="mt-2 rounded-xl border border-line bg-bg p-3">
      <label htmlFor={`motif-${avisId}`} className="block text-[11.5px] font-bold text-muted">
        Motif du signalement
      </label>
      <select
        id={`motif-${avisId}`}
        value={motif}
        onChange={(e) => setMotif(e.target.value)}
        className="mt-1 w-full rounded-[9px] border-[1.5px] border-line bg-white px-[10px] py-2 text-[12.5px] outline-none focus:border-teal"
      >
        {MOTIFS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      {erreur && (
        <p role="alert" className="mt-2 text-[11.5px] font-bold text-red">
          {erreur}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={etat === "envoi"}
          className="rounded-[9px] bg-teal px-[13px] py-[7px] text-[11.5px] font-bold text-white transition-colors hover:bg-[#2790bc] disabled:opacity-60"
        >
          {etat === "envoi" ? "Envoi…" : "Envoyer"}
        </button>
        <button
          type="button"
          onClick={() => setOuvert(false)}
          className="rounded-[9px] border-[1.5px] border-line bg-white px-[13px] py-[7px] text-[11.5px] font-bold text-blue transition-colors hover:bg-white"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
