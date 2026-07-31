"use client";

import { useState } from "react";
import { formatDateCourte } from "@/lib/dates";
import {
  revoquerTransmission,
  useTransmissionsMeConcernant,
  type TransmissionPatient,
} from "@/lib/transmissions";

/*
 * Ce que les médecins se sont transmis au sujet du patient.
 *
 * C'est la contrepartie de l'adressage confraternel : la transmission part
 * sans validation préalable — bloquer une orientation vers un spécialiste
 * n'aurait pas de sens — mais le patient voit tout, immédiatement, et peut
 * retirer l'accès d'un clic. Sans cet écran, l'attestation de consentement
 * signée par l'émetteur ne serait vérifiable par personne.
 */
export default function TransmissionsEntreMedecins() {
  const { transmissions, chargement, recharger } = useTransmissionsMeConcernant();
  const [deplie, setDeplie] = useState<string | null>(null);
  const [aRevoquer, setARevoquer] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  /* Révocation en deux temps, comme partout ailleurs dans l'application. */
  async function revoquer(t: TransmissionPatient) {
    if (aRevoquer !== t.id) {
      setARevoquer(t.id);
      setMessage("");
      return;
    }
    const res = await revoquerTransmission(t.id);
    setMessage(
      res.erreur ? `⚠️ ${res.erreur}` : `✓ ${t.destinataire} n’a plus accès à ce dossier.`
    );
    setARevoquer(null);
    recharger();
  }

  if (chargement) return <p className="text-[13px] text-muted">Chargement…</p>;

  if (transmissions.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-white p-8 text-center">
        <div className="mb-2 text-3xl" aria-hidden>
          📨
        </div>
        <b className="block text-sm font-extrabold">Aucune transmission entre médecins</b>
        <p className="mx-auto mt-1 max-w-[480px] text-[12.5px] text-muted">
          Quand un de vos médecins adresse votre dossier à un confrère — pour un avis spécialisé
          par exemple — cela apparaît ici. Vous êtes prévenu à chaque fois et vous pouvez retirer
          l’accès à tout moment.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-3">
        {transmissions.map((t) => {
          const revoquee = t.statut === "revoquee";
          return (
            <div
              key={t.id}
              className={`rounded-2xl border bg-white p-4 ${
                revoquee ? "border-line opacity-70" : "border-line"
              }`}
            >
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                {t.urgence === "prioritaire" && !revoquee && (
                  <span className="rounded bg-[#FFF5E9] px-1.5 py-0.5 text-[10.5px] font-bold text-[#8A5A1B]">
                    Prioritaire
                  </span>
                )}
                {revoquee ? (
                  <span className="rounded bg-red-soft px-1.5 py-0.5 text-[10.5px] font-bold text-red">
                    Accès retiré
                  </span>
                ) : t.statut === "lue" ? (
                  <span className="rounded bg-green-soft px-1.5 py-0.5 text-[10.5px] font-bold text-green">
                    Consultée
                  </span>
                ) : (
                  <span className="rounded bg-teal-soft px-1.5 py-0.5 text-[10.5px] font-bold text-blue">
                    Transmise
                  </span>
                )}
                <span className="text-[10.5px] text-muted">
                  {formatDateCourte(t.creeLe.slice(0, 10))}
                </span>
              </div>

              <b className="block text-sm font-extrabold">{t.motif}</b>
              <div className="text-[12px] text-muted">
                <b className="font-semibold text-blue">{t.emetteur}</b> a transmis à{" "}
                <b className="font-semibold text-blue">{t.destinataire}</b>
              </div>
              <div className="mt-0.5 text-[11.5px] text-muted">
                Concerne : {t.pourQui} ·{" "}
                {t.nbDocuments === 0
                  ? "aucune pièce jointe"
                  : `${t.nbDocuments} pièce${t.nbDocuments > 1 ? "s" : ""} jointe${t.nbDocuments > 1 ? "s" : ""}`}
              </div>

              {t.note && (
                <>
                  <button
                    type="button"
                    onClick={() => setDeplie(deplie === t.id ? null : t.id)}
                    className="mt-2 text-[11.5px] font-bold text-teal hover:underline"
                  >
                    {deplie === t.id ? "Replier le courrier" : "Lire le courrier transmis"}
                  </button>
                  {deplie === t.id && (
                    <pre className="mt-2 whitespace-pre-wrap border-t border-line pt-2 font-sans text-[12.5px] leading-[1.7] text-[#3f5360]">
                      {t.note}
                    </pre>
                  )}
                </>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                {revoquee ? (
                  <span className="text-[11.5px] text-muted">
                    Accès retiré
                    {t.revoqueeLe ? ` le ${formatDateCourte(t.revoqueeLe.slice(0, 10))}` : ""}.
                  </span>
                ) : (
                  <>
                    <span className="text-[11.5px] text-muted">
                      {t.lueLe
                        ? `Consultée le ${formatDateCourte(t.lueLe.slice(0, 10))}`
                        : "Pas encore consultée"}
                    </span>
                    <button
                      type="button"
                      onClick={() => revoquer(t)}
                      className="ml-auto rounded-[9px] border-[1.5px] border-[#F3C9C2] bg-white px-3 py-1.5 text-[11.5px] font-bold text-red transition-colors hover:bg-red-soft"
                    >
                      {aRevoquer === t.id ? "Confirmer le retrait" : "Retirer l’accès"}
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {message && (
        <p
          className={`mt-3 text-[12.5px] font-bold ${
            message.startsWith("⚠️") ? "text-red" : "text-green"
          }`}
        >
          {message}
        </p>
      )}
    </>
  );
}
