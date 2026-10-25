"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import PatientShell from "@/components/patient/PatientShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import FilMessages from "@/components/site/FilMessages";
import Icone from "@/components/site/Icone";
import { useConversationsPatient, type Conversation } from "@/lib/conversations";
import { useMesMedecins } from "@/lib/documents";
import { useProches, useProfilConnecte } from "@/lib/patient";

/*
 * Messages — les conversations du patient avec ses médecins.
 *
 * On n'écrit qu'aux médecins chez qui l'on a déjà eu un rendez-vous (pour
 * soi ou pour un proche) : la liste « Écrire à » vient de
 * `medecins_du_patient`, et la base refuse tout autre envoi. Un message peut
 * porter sur un proche : le médecin le voit dans la fiche de ce proche.
 *
 * Web : liste à gauche, fil à droite. Mobile : la liste, puis le fil en
 * plein écran avec un retour. `?medecin=<id>` ouvre directement un fil
 * (lien des notifications).
 */

const quand = (iso: string) => {
  const d = new Date(iso);
  const jour = d.toLocaleDateString("sv-SE", { timeZone: "Africa/Conakry" });
  const auj = new Date().toLocaleDateString("sv-SE", { timeZone: "Africa/Conakry" });
  return jour === auj
    ? d.toLocaleTimeString("fr-FR", { timeZone: "Africa/Conakry", hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("fr-FR", { timeZone: "Africa/Conakry", day: "numeric", month: "short" });
};

export default function MesMessages() {
  return (
    <PatientShell>
      <Suspense fallback={<p className="p-6 text-[13px] text-muted">Chargement…</p>}>
        <Messagerie />
      </Suspense>
    </PatientShell>
  );
}

function Messagerie() {
  const parametres = useSearchParams();
  const { profil } = useProfilConnecte();
  const [revision, setRevision] = useState(0);
  const { conversations, chargement } = useConversationsPatient(revision);
  const { medecins } = useMesMedecins();
  const { proches } = useProches();
  const [choisi, setChoisi] = useState<string | null>(() => parametres.get("medecin"));
  const [pour, setPour] = useState<string>("");

  // Médecins consultés sans conversation encore ouverte : on peut leur écrire.
  const sansFil = medecins.filter((m) => !conversations.some((c) => c.medecinId === m.id));
  const courant: { id: string; nom: string; specialite: string | null } | null = choisi
    ? (() => {
        const c = conversations.find((x) => x.medecinId === choisi);
        if (c) return { id: c.medecinId, nom: c.medecin, specialite: c.specialite };
        const m = medecins.find((x) => x.id === choisi);
        return m ? { id: m.id, nom: m.nom, specialite: m.specialite || null } : null;
      })()
    : null;
  const nomsProches = Object.fromEntries(proches.map((p) => [p.id, `${p.prenom} ${p.nom}`]));

  function ouvrir(id: string) {
    setChoisi(id);
    setPour("");
    window.history.replaceState(null, "", `/patient/messages?medecin=${id}`);
  }
  function fermer() {
    setChoisi(null);
    window.history.replaceState(null, "", "/patient/messages");
  }

  const liste = (
    <div className="grid content-start gap-3">
      {chargement ? (
        <div className="grid gap-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[62px] animate-pulse rounded-xl bg-white" />
          ))}
        </div>
      ) : conversations.length === 0 && sansFil.length === 0 ? (
        <div className="rounded-2xl border border-line bg-white p-6 text-center">
          <span className="mx-auto mb-2 grid h-11 w-11 place-items-center rounded-2xl bg-teal-soft text-blue">
            <Icone nom="message" taille={20} />
          </span>
          <b className="block text-sm font-extrabold">Pas encore de conversation</b>
          <p className="mx-auto mt-1 max-w-[340px] text-[12.5px] text-muted">
            Après un premier rendez-vous, vous pourrez écrire ici à votre médecin, et il pourra vous répondre.
          </p>
        </div>
      ) : (
        <>
          {conversations.length > 0 && (
            <ul className="grid gap-1.5" aria-label="Conversations">
              {conversations.map((c) => (
                <li key={c.medecinId}>
                  <LigneConversation c={c} actif={c.medecinId === choisi} onClick={() => ouvrir(c.medecinId)} />
                </li>
              ))}
            </ul>
          )}
          {sansFil.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11.5px] font-bold uppercase tracking-[0.04em] text-muted">Écrire à</div>
              <ul className="grid gap-1.5">
                {sansFil.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => ouvrir(m.id)}
                      aria-current={m.id === choisi ? "true" : undefined}
                      className={`flex min-h-11 w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors ${
                        m.id === choisi ? "border-teal bg-teal-soft" : "border-line bg-white hover:bg-bg"
                      }`}
                    >
                      <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-bg text-teal">
                        <Icone nom="plus" taille={14} epaisseur={2.6} />
                      </span>
                      <span className="min-w-0">
                        <b className="block truncate text-[13px]">{m.nom}</b>
                        {m.specialite && <span className="block truncate text-[11.5px] text-muted">{m.specialite}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );

  const fil =
    courant && profil ? (
      <div className="grid gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <b className="block truncate text-[15px] font-extrabold">{courant.nom}</b>
            {courant.specialite && <span className="text-[12px] text-muted">{courant.specialite}</span>}
          </div>
          {proches.length > 0 && (
            <label className="flex items-center gap-2 text-[12px] font-semibold text-muted">
              À propos de
              <select
                value={pour}
                onChange={(e) => setPour(e.target.value)}
                className="min-h-9 rounded-[9px] border border-line bg-white px-2 text-[12.5px] font-bold text-ink"
              >
                <option value="">moi-même</option>
                {proches.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.prenom} {p.nom}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <FilMessages
          key={courant.id}
          patientId={profil.id}
          medecinId={courant.id}
          moiId={profil.id}
          interlocuteur={courant.nom}
          procheId={pour || null}
          prochesNoms={nomsProches}
          idChamp="message-patient"
          hauteur="min(calc(62vh / var(--zoom-page, 1)), 560px)"
          onActivite={() => setRevision((r) => r + 1)}
        />
        <p className="text-[11.5px] text-muted">
          Pour une urgence, appelez le 442 (SAMU) : votre médecin ne lit pas ses messages en continu.
        </p>
      </div>
    ) : choisi && !chargement ? (
      <p className="text-[13px] text-muted">Conversation introuvable : choisissez un médecin dans la liste.</p>
    ) : null;

  /*
   * Un seul arbre pour toutes les largeurs : le fil n'est monté qu'une fois
   * (un champ de saisie, une relève toutes les 15 s, un marquage « lu »).
   * Sous md, la liste OU le fil ; au-delà, les deux côte à côte.
   */
  return (
    <>
      <div className="md:hidden">
        {choisi ? (
          <EnTeteMobile titre="Messages" sousTitre={courant?.nom} retour="/patient/messages" />
        ) : (
          <EnTeteMobile retour="/patient/compte" titre="Messages" />
        )}
      </div>
      <div className="mb-5 hidden md:block">
        <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Messages</h2>
        <small className="text-[13px] text-muted">Vos échanges avec les médecins que vous avez consultés</small>
      </div>

      <div className="pad grid items-start gap-5 md:p-0 lg:grid-cols-[300px_1fr]">
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
                Choisissez une conversation, ou un médecin à qui écrire.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function LigneConversation({ c, actif, onClick }: { c: Conversation; actif: boolean; onClick: () => void }) {
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
        <Icone nom="message" taille={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <b className="truncate text-[13px]">{c.medecin}</b>
          <span className="flex-none text-[11px] text-muted">{quand(c.dernierLe)}</span>
        </span>
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
