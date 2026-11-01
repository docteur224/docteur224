"use client";

import { useCallback, useEffect, useState } from "react";

/*
 * Bloc « Google Agenda » de l'écran Paramètres du patient.
 *
 * UNIQUEMENT côté patient : il vit dans /patient/parametres (déjà réservé au
 * patient par PatientShell) et toutes ses routes exigent un compte patient.
 *
 * Trois états :
 *   • plateforme pas encore configurée → « bientôt disponible » (mode simulé) ;
 *   • connecté → l'adresse Google + « Déconnecter » ;
 *   • non connecté → « Connecter Google Agenda ».
 *
 * Phase 1 : on relie le compte. La synchronisation des rendez-vous eux-mêmes
 * viendra ensuite (file remplie par trigger, drainer serveur).
 *
 * « Connecter » est un vrai lien vers la route /api/agenda-google/connexion :
 * la connexion OAuth exige une navigation plein écran (vers Google), pas une
 * navigation interne du routeur.
 */

interface EtatAgenda {
  configure: boolean;
  connecte: boolean;
  email: string | null;
}

const HORS_LIGNE: EtatAgenda = { configure: false, connecte: false, email: null };

const MESSAGES: Record<string, { ok: boolean; texte: string }> = {
  // « à venir », et non « prochains » : la connexion rattrape aussi les
  // rendez-vous déjà pris (trigger de rattrapage, migration 0084).
  connecte: { ok: true, texte: "Google Agenda connecté. Vos rendez-vous à venir y sont ajoutés automatiquement." },
  echec: { ok: false, texte: "La connexion a échoué. Réessayez dans un instant." },
  refuse: { ok: false, texte: "Connexion annulée : l'accès à l'agenda n'a pas été accordé." },
  refus: { ok: false, texte: "Session expirée — reconnectez-vous." },
  "non-configure": { ok: false, texte: "La synchronisation Google Agenda n'est pas encore activée sur la plateforme." },
};

/** Lit l'indicateur ?agenda=… laissé par le retour OAuth, puis nettoie l'URL. */
function useMessageRetour(): { ok: boolean; texte: string } | null {
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  useEffect(() => {
    let actif = true;
    // Différé en micro-tâche : on ne pose pas l'état en synchrone dans l'effet.
    Promise.resolve().then(() => {
      if (!actif) return;
      try {
        const params = new URLSearchParams(window.location.search);
        const cle = params.get("agenda");
        if (cle && MESSAGES[cle]) {
          setMessage(MESSAGES[cle]);
          const url = new URL(window.location.href);
          url.searchParams.delete("agenda");
          window.history.replaceState(null, "", url.toString());
        }
      } catch {
        /* pas d'URL exploitable */
      }
    });
    return () => { actif = false; };
  }, []);
  return message;
}

function useEtatAgenda() {
  const [etat, setEtat] = useState<EtatAgenda | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let actif = true;
    fetch("/api/agenda-google/etat", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<EtatAgenda>) : HORS_LIGNE))
      .then((e) => { if (actif) setEtat(e); })
      .catch(() => { if (actif) setEtat(HORS_LIGNE); });
    return () => { actif = false; };
  }, [version]);

  const deconnecter = useCallback(async () => {
    setOccupe(true);
    try {
      await fetch("/api/agenda-google/deconnexion", { method: "POST" });
      setVersion((v) => v + 1); // relance la lecture du statut
    } finally {
      setOccupe(false);
    }
  }, []);

  return { etat, occupe, deconnecter };
}

const DESCRIPTION =
  "Ajoutez vos rendez-vous à votre agenda Google, avec un rappel avant chaque consultation.";
const LIEN_CONNEXION = "/api/agenda-google/connexion";

function styleMessage(ok: boolean): React.CSSProperties {
  return ok
    ? { background: "#ecfdf5", color: "#047857" }
    : { background: "#fef2f2", color: "#b91c1c" };
}

export default function AgendaGoogle({ variante }: { variante: "web" | "mobile" }) {
  const { etat, occupe, deconnecter } = useEtatAgenda();
  const message = useMessageRetour();

  let titre = "Chargement…";
  let sous = "";
  if (etat) {
    if (!etat.configure) {
      titre = "Bientôt disponible";
      sous = "La connexion à Google Agenda sera activée prochainement.";
    } else if (etat.connecte) {
      titre = "Compte connecté";
      sous = etat.email ?? "Votre agenda Google est relié.";
    } else {
      titre = "Non connecté";
      sous = "Reliez votre compte Google pour y retrouver vos rendez-vous.";
    }
  }

  if (variante === "mobile") {
    let action: React.ReactNode = null;
    if (etat && etat.configure && etat.connecte) {
      action = (
        <button type="button" className="btnm gh" onClick={() => void deconnecter()} disabled={occupe}>
          {occupe ? "…" : "Déconnecter"}
        </button>
      );
    } else if (etat && etat.configure) {
      action = <a href={LIEN_CONNEXION} className="btnm">Connecter</a>;
    } else if (etat) {
      action = (
        <button type="button" className="btnm gh" disabled style={{ opacity: 0.5, cursor: "not-allowed" }}>
          Connecter
        </button>
      );
    }

    return (
      <div className="card2">
        <h4>Google Agenda</h4>
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>{DESCRIPTION}</p>
        {message && (
          <p style={{ ...styleMessage(message.ok), fontSize: 12.5, padding: "8px 10px", borderRadius: 9, marginBottom: 10 }}>
            {message.texte}
          </p>
        )}
        <div className="setrow">
          <div>
            <b>{titre}</b>
            <small>{sous}</small>
          </div>
          {action}
        </div>
      </div>
    );
  }

  // ----- variante web -----
  let action: React.ReactNode = null;
  if (etat && etat.configure && etat.connecte) {
    action = (
      <button
        type="button"
        onClick={() => void deconnecter()}
        disabled={occupe}
        className="pointer-coarse:py-[13px] rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg disabled:opacity-50"
      >
        {occupe ? "…" : "Déconnecter"}
      </button>
    );
  } else if (etat && etat.configure) {
    action = (
      <a
        href={LIEN_CONNEXION}
        className="pointer-coarse:py-[13px] inline-block rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
      >
        Connecter Google Agenda
      </a>
    );
  } else if (etat) {
    action = (
      <button
        type="button"
        disabled
        title="Activation prochaine"
        className="cursor-not-allowed rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue opacity-50"
      >
        Connecter Google Agenda
      </button>
    );
  }

  return (
    <div className="mb-4 rounded-2xl border border-line bg-white p-5">
      <h3 className="mb-1 text-[15px] font-extrabold">Google Agenda</h3>
      <small className="text-xs text-muted">{DESCRIPTION}</small>
      {message && (
        <p
          className="mt-3 rounded-[9px] px-3 py-2 text-[12.5px] font-semibold"
          style={styleMessage(message.ok)}
        >
          {message.texte}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-[14px]">
        <div>
          <b className="block text-[13.5px] font-bold">{titre}</b>
          <small className="text-xs text-muted">{sous}</small>
        </div>
        {action}
      </div>
    </div>
  );
}
