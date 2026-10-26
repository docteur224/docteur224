"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import MedecinShell from "@/components/medecin/MedecinShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import FilMessages from "@/components/site/FilMessages";
import Icone from "@/components/site/Icone";
import { useConversationsMedecin, type ConversationMedecin } from "@/lib/conversations";
import { useContextePro } from "@/lib/pro";
import { labelObjet } from "@/lib/messagerie-objets";

/*
 * Messages — la liste des conversations vues par le médecin (ou l'assistante
 * avec la permission « messagerie »).
 *
 * La RPC `conversations_medecin()` gère le switch médecin / assistant
 * transparently en base : le hook reçoit la même liste dans les deux cas.
 *
 * Layout identique au patient : liste à gauche, fil à droite (lg+) ; en
 * mobile, liste OU fil avec un bouton retour.
 */

const quand = (iso: string) => {
  const d = new Date(iso);
  const jour = d.toLocaleDateString("sv-SE", { timeZone: "Africa/Conakry" });
  const auj = new Date().toLocaleDateString("sv-SE", { timeZone: "Africa/Conakry" });
  return jour === auj
    ? d.toLocaleTimeString("fr-FR", { timeZone: "Africa/Conakry", hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("fr-FR", { timeZone: "Africa/Conakry", day: "numeric", month: "short" });
};

export default function PageMessagesMedecin() {
  return (
    <MedecinShell>
      <Suspense fallback={<p className="p-6 text-[13px] text-muted">Chargement…</p>}>
        <Messagerie />
      </Suspense>
    </MedecinShell>
  );
}

function Messagerie() {
  const parametres = useSearchParams();
  const { medecin, medecinId, role } = useContextePro();
  const [revision, setRevision] = useState(0);
  const { conversations, chargement } = useConversationsMedecin(revision);
  const [choisi, setChoisi] = useState<string | null>(() => parametres.get("patient"));

  const courant: { id: string; nom: string } | null = choisi
    ? (() => {
        const c = conversations.find((x) => x.patientId === choisi);
        return c ? { id: c.patientId, nom: c.patient } : null;
      })()
    : null;

  // L'identifiant affiché à droite du fil : médecin ou assistant ?
  const moiId = role === "assistant" && medecinId ? medecinId : medecin?.id;

  function ouvrir(id: string) {
    setChoisi(id);
    window.history.replaceState(null, "", `/espace-medecin/messages?patient=${id}`);
  }
  function fermer() {
    setChoisi(null);
    window.history.replaceState(null, "", "/espace-medecin/messages");
  }

  const liste = (
    <div className="grid content-start gap-3">
      {chargement ? (
        <div className="grid gap-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[62px] animate-pulse rounded-xl bg-white" />
          ))}
        </div>
      ) : conversations.length === 0 ? (
        <div className="rounded-2xl border border-line bg-white p-6 text-center">
          <span className="mx-auto mb-2 grid h-11 w-11 place-items-center rounded-2xl bg-teal-soft text-blue">
            <Icone nom="message" taille={20} />
          </span>
          <b className="block text-sm font-extrabold">Aucune conversation</b>
          <p className="mx-auto mt-1 max-w-[340px] text-[12.5px] text-muted">
            Quand un patient vous écrira, sa conversation apparaîtra ici.
          </p>
        </div>
      ) : (
        <ul className="grid gap-1.5" aria-label="Conversations">
          {conversations.map((c) => (
            <li key={c.patientId}>
              <LigneConversation c={c} actif={c.patientId === choisi} onClick={() => ouvrir(c.patientId)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const fil =
    courant && moiId ? (
      <div className="grid gap-2.5">
        <div className="min-w-0">
          <b className="block truncate text-[15px] font-extrabold">{courant.nom}</b>
          {(() => {
            const conv = conversations.find((x) => x.patientId === choisi);
            const lbl = labelObjet(conv?.objet);
            return lbl ? <span className="text-[12px] text-muted">{lbl}</span> : null;
          })()}
        </div>
        <FilMessages
          key={courant.id}
          patientId={courant.id}
          medecinId={moiId}
          moiId={moiId}
          interlocuteur={courant.nom}
          idChamp="message-medecin"
          hauteur="min(calc(62vh / var(--zoom-page, 1)), 560px)"
          onActivite={() => setRevision((r) => r + 1)}
        />
      </div>
    ) : choisi && !chargement ? (
      <p className="text-[13px] text-muted">Conversation introuvable.</p>
    ) : null;

  return (
    <>
      <div className="md:hidden">
        {choisi ? (
          <EnTeteMobile titre="Messages" sousTitre={courant?.nom} retour="/espace-medecin/messages" />
        ) : (
          <EnTeteMobile retour="/espace-medecin" titre="Messages" />
        )}
      </div>
      <div className="mb-5 hidden md:block">
        <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Messages</h2>
        <small className="text-[13px] text-muted">
          {role === "assistant" ? "Conversations de votre médecin" : "Échanges avec vos patients"}
        </small>
      </div>

      <div className="pad pad-haut grid items-start gap-5 md:p-0 lg:grid-cols-[300px_1fr]">
        <div className={choisi ? "hidden lg:block" : ""}>{liste}</div>
        <div className={choisi ? "" : "hidden lg:block"}>
          {choisi && (
            <button
              type="button"
              onClick={fermer}
              className="cible-texte mb-2 inline-flex items-center gap-1 text-[12.5px] font-bold text-teal lg:hidden"
            >
              ← Toutes les conversations
            </button>
          )}
          <div className="rounded-2xl border border-line bg-white p-3 md:p-4">
            {fil ?? (
              <div className="grid min-h-[280px] place-items-center text-center text-[13px] text-muted">
                Sélectionnez une conversation pour lire les messages.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function LigneConversation({ c, actif, onClick }: { c: ConversationMedecin; actif: boolean; onClick: () => void }) {
  const lbl = labelObjet(c.objet);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={actif ? "true" : undefined}
      className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
        actif ? "border-teal bg-teal-soft" : "border-line bg-white hover:bg-bg"
      }`}
    >
      <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-teal-soft text-blue">
        <Icone nom="utilisateur" taille={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <b className="truncate text-[13px]">{c.patient}</b>
          <span className="flex-none text-[11px] text-muted">{quand(c.dernierLe)}</span>
        </span>
        {lbl && (
          <span className="mb-0.5 inline-block rounded bg-teal/10 px-1.5 py-0.5 text-[10.5px] font-bold text-teal">
            {lbl}
          </span>
        )}
        <span className={`block truncate text-[12px] ${c.nonLus ? "font-bold text-ink" : "text-muted"}`}>
          {c.dernierDeMoi ? "Vous : " : ""}
          {c.dernierMessage}
        </span>
      </span>
      {c.nonLus > 0 && (
        <span className="grid h-5 min-w-5 flex-none place-items-center rounded-full bg-teal px-1.5 text-[10.5px] font-bold text-white">
          {c.nonLus}
          <span className="sr-only"> non lu{c.nonLus > 1 ? "s" : ""}</span>
        </span>
      )}
    </button>
  );
}
