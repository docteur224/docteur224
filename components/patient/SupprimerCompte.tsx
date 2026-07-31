"use client";

import { useState } from "react";
import { supprimerMonCompte } from "@/lib/patient";

/*
 * Zone de danger de l'écran Paramètres : suppression du compte patient.
 * Double garde-fou avant l'appel : ouverture explicite du panneau, puis
 * saisie du mot SUPPRIMER. Le détail de ce qui est conservé (rendez-vous
 * honorés) est annoncé ici, pas seulement dans le code du serveur.
 */

const MOT_DE_CONFIRMATION = "SUPPRIMER";

const CONSEQUENCES = [
  "Vos rendez-vous à venir sont annulés et les créneaux rendus aux médecins.",
  "Vos proches et vos informations personnelles sont effacés.",
  "Vos consultations déjà honorées restent au dossier médical du praticien, sans votre identité.",
  "La connexion devient impossible : cette action est définitive.",
];

export default function SupprimerCompte({ mobile = false }: { mobile?: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  const [saisie, setSaisie] = useState("");
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);

  const confirme = saisie.trim().toUpperCase() === MOT_DE_CONFIRMATION;

  function basculer() {
    setOuvert((o) => !o);
    setSaisie("");
    setErreur("");
  }

  async function supprimer() {
    if (!confirme || enCours) return;
    setEnCours(true);
    const res = await supprimerMonCompte();
    if (res.erreur) {
      setErreur(res.erreur);
      setEnCours(false);
      return;
    }
    // Rechargement complet plutôt que router.replace : la déconnexion fait
    // réagir la garde de PatientShell, qui filerait vers /connexion, et les
    // caches de module (profil, prochain rendez-vous) doivent repartir à zéro.
    window.location.assign("/");
  }

  /* ---------- Mobile (classes de app/mobile.css) ---------- */
  if (mobile) {
    return (
      <div className="card2">
        <h4>Supprimer mon compte</h4>
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
          Efface définitivement votre compte et vos informations personnelles.
        </p>
        {!ouvert ? (
          <button type="button" className="btnm dg" onClick={basculer}>
            Supprimer mon compte
          </button>
        ) : (
          <>
            <div className="privnote alert" style={{ marginBottom: 10 }}>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {CONSEQUENCES.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
            <div className="flabel">
              Tapez « {MOT_DE_CONFIRMATION} » pour confirmer
            </div>
            <input
              className="inp"
              placeholder={MOT_DE_CONFIRMATION}
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
            />
            {erreur && (
              <div style={{ color: "var(--red)", fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                ⚠️ {erreur}
              </div>
            )}
            <button
              type="button"
              className="btn block"
              disabled={!confirme || enCours}
              style={{
                background: "var(--red)",
                opacity: confirme && !enCours ? 1 : 0.5,
              }}
              onClick={supprimer}
            >
              {enCours ? "Suppression…" : "Supprimer définitivement"}
            </button>
            <button type="button" className="btn ghost block" onClick={basculer}>
              Annuler
            </button>
          </>
        )}
      </div>
    );
  }

  /* ---------- Web ---------- */
  return (
    <div className="rounded-2xl border border-[#F3C9C2] bg-white p-5">
      <h3 className="mb-1 text-[15px] font-extrabold text-red">Zone de danger</h3>
      <div className="flex flex-wrap items-center justify-between gap-[14px] py-[15px]">
        <div>
          <b className="block text-[13.5px] font-bold">Supprimer mon compte</b>
          <small className="text-xs text-muted">
            Efface définitivement votre compte et vos informations personnelles
          </small>
        </div>
        <button
          type="button"
          onClick={basculer}
          className="rounded-[9px] border-[1.5px] border-[#F3C9C2] bg-white px-[14px] py-2 text-[12.5px] font-bold text-red transition-colors hover:bg-red-soft"
        >
          {ouvert ? "Annuler" : "Supprimer mon compte"}
        </button>
      </div>

      {ouvert && (
        <div className="border-t border-line pt-4">
          <ul className="mb-4 list-disc space-y-1 rounded-xl bg-red-soft py-3 pl-8 pr-4 text-[12.5px] font-semibold text-red">
            {CONSEQUENCES.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <label className="mb-1.5 block text-xs font-bold text-muted">
            Tapez « {MOT_DE_CONFIRMATION} » pour confirmer
          </label>
          <input
            className="w-full max-w-[280px] rounded-[11px] border border-line bg-white px-[13px] py-3 text-[13.5px] outline-none focus:border-red"
            placeholder={MOT_DE_CONFIRMATION}
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
          />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={supprimer}
              disabled={!confirme || enCours}
              className="rounded-[9px] bg-red px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#a5301f] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {enCours ? "Suppression…" : "Supprimer définitivement"}
            </button>
            {erreur && <span className="text-[12.5px] font-bold text-red">⚠️ {erreur}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
