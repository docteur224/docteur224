"use client";

import AssistantShell from "@/components/assistant/AssistantShell";
import { usePermissionsAssistante } from "@/lib/mock-medecin";

/*
 * Messagerie (assistant(e)) — reproduit l'écran « asst-messages » de la
 * maquette web : conversations et réponses rapides. Accès gouverné par la
 * permission « Messagerie patients ». Conversations de démonstration —
 * la messagerie temps réel arrivera avec la base de données.
 */

const CONVERSATIONS = [
  {
    initiales: "MS",
    gradient: "linear-gradient(135deg,#E08E45,#C0392B)",
    nom: "Mariama Sow",
    message: "Bonjour, puis-je décaler le RDV de mon fils à 15h ?",
    heure: "09:12",
    nonLus: 2,
  },
  {
    initiales: "AS",
    gradient: "linear-gradient(135deg,#2E9CCA,#15506B)",
    nom: "Aboubacar Sylla",
    message: "Merci pour la confirmation 🙏",
    heure: "08:40",
    nonLus: 0,
  },
  {
    initiales: "AD",
    gradient: "linear-gradient(135deg,#6C5CE7,#341F97)",
    nom: "Aminata Diané",
    message: "Le cabinet est bien à Almamya ?",
    heure: "Hier",
    nonLus: 1,
  },
];

const REPONSES_RAPIDES = [
  "📅 Rappel de rendez-vous",
  "✅ Confirmation",
  "⏰ Médecin en retard",
  "📍 Adresse du cabinet",
  "💳 Modes de paiement",
];

export default function MessagesAssistant() {
  const permissions = usePermissionsAssistante();

  return (
    <AssistantShell>
      <div className="mb-5">
        <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Messagerie</h2>
        <small className="text-[13px] text-muted">
          Communication avec les patients · WhatsApp et chat intégré
        </small>
      </div>

      {!permissions.messagerie ? (
        <div className="flex items-start gap-[9px] rounded-xl border border-[#F3C9C2] bg-red-soft px-[14px] py-3 text-[12.5px] font-semibold leading-relaxed text-red">
          <span aria-hidden>⛔</span>
          <div>
            La permission <b>« Messagerie patients »</b> ne vous a pas été accordée par le
            médecin. Les conversations ne sont pas accessibles.
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4 rounded-2xl border border-line bg-white p-5">
            <h3 className="mb-1 text-[15px] font-extrabold">Conversations</h3>
            {CONVERSATIONS.map((conversation) => (
              <div
                key={conversation.nom}
                className="flex items-center gap-3 border-b border-line py-[13px] last:border-b-0"
              >
                <span
                  aria-hidden
                  className="grid h-[42px] w-[42px] flex-none place-items-center rounded-full text-sm font-extrabold text-white"
                  style={{ background: conversation.gradient }}
                >
                  {conversation.initiales}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block text-[13.5px]">{conversation.nom}</b>
                  <small className="block truncate text-xs text-muted">
                    {conversation.message}
                  </small>
                </span>
                <span className="flex-none text-right text-[11px] leading-relaxed text-muted">
                  {conversation.heure}
                  {conversation.nonLus > 0 && (
                    <>
                      <br />
                      <span className="inline-block rounded-full bg-teal px-[7px] py-px text-[10.5px] font-extrabold text-white">
                        {conversation.nonLus}
                      </span>
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-line bg-white p-5">
            <h3 className="mb-2 text-[15px] font-extrabold">Réponses rapides</h3>
            <p className="mb-3 text-[12.5px] text-muted">
              Messages-types pour répondre vite, sans rédiger à chaque fois.
            </p>
            <div className="flex flex-wrap gap-2">
              {REPONSES_RAPIDES.map((reponse) => (
                <span
                  key={reponse}
                  className="rounded-full border border-[#CDE6F2] bg-teal-soft px-[14px] py-2 text-xs font-bold text-blue"
                >
                  {reponse}
                </span>
              ))}
            </div>
          </div>

          <p className="mt-3 text-[11.5px] text-muted">
            Conversations de démonstration — la messagerie temps réel sera branchée avec la base
            de données.
          </p>
        </>
      )}
    </AssistantShell>
  );
}
