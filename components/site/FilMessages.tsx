"use client";

import { useEffect, useRef, useState } from "react";
import Icone from "@/components/site/Icone";
import { envoyerMessagePatient, marquerLus, urlPieceJointe, useConversation, type Message } from "@/lib/conversations";

/*
 * Fil d'une conversation patient ↔ médecin, partagé par la fiche patient
 * (côté médecin) et la messagerie du patient.
 *
 *  - les messages reçus sont marqués lus à l'ouverture du fil, et à chaque
 *    relève (toutes les 15 s) qui en apporte de nouveaux ;
 *  - sous le dernier message envoyé : « Lu à 14:32 » ou « Envoyé » ;
 *  - Entrée envoie, Maj+Entrée va à la ligne ; pièce jointe PDF ou image,
 *    8 Mo au plus, ouverte par un lien temporaire au clic.
 */

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const jourIso = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Africa/Conakry" });
const heure = (iso: string) =>
  new Date(iso).toLocaleTimeString("fr-FR", { timeZone: "Africa/Conakry", hour: "2-digit", minute: "2-digit" });

function libelleJour(jour: string, aujourdhui: string): string {
  if (jour === aujourdhui) return "Aujourd’hui";
  const hier = new Date(`${aujourdhui}T12:00:00Z`);
  hier.setUTCDate(hier.getUTCDate() - 1);
  if (jour === hier.toISOString().slice(0, 10)) return "Hier";
  const [a, m, j] = jour.split("-").map(Number);
  return `${j} ${MOIS[m - 1]}${a !== Number(aujourdhui.slice(0, 4)) ? ` ${a}` : ""}`;
}

export default function FilMessages({
  patientId,
  medecinId,
  moiId,
  interlocuteur,
  procheId = null,
  prochesNoms = {},
  idChamp,
  hauteur = "min(60vh, 520px)",
  onActivite,
  onErreur,
}: {
  patientId: string;
  medecinId: string;
  /** Utilisateur connecté : ses messages s'alignent à droite. */
  moiId: string;
  /** « Dr Diallo » ou « Alpha Condé » : à qui l'on écrit. */
  interlocuteur: string;
  /** Proche dont il est question (fiche d'un proche, côté médecin). */
  procheId?: string | null;
  prochesNoms?: Record<string, string>;
  /** Identifiant unique du champ de saisie (deux fils peuvent coexister). */
  idChamp: string;
  hauteur?: string;
  /** Après un envoi ou une lecture : pour recompter les non-lus ailleurs. */
  onActivite?: () => void;
  onErreur?: (message: string) => void;
}) {
  const [revision, setRevision] = useState(0);
  const { messages, chargement } = useConversation(patientId, medecinId, revision);
  const [texte, setTexte] = useState("");
  const [fichier, setFichier] = useState<File | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [aujourdhui] = useState(() => jourIso(new Date().toISOString()));
  const fil = useRef<HTMLDivElement>(null);
  const entreeFichier = useRef<HTMLInputElement>(null);

  /* Le dernier `onActivite` reçu, gardé hors des dépendances : un parent qui
     le recrée à chaque rendu relancerait sinon le marquage en boucle. */
  const signalerActivite = useRef(onActivite);
  useEffect(() => {
    signalerActivite.current = onActivite;
  });

  // Ce qui arrive est lu dès qu'on l'affiche ; le fil est aussitôt relu,
  // sans quoi ces messages compteraient encore comme non lus ici.
  const nonLusRecus = messages.filter((m) => !m.lu && m.expediteurId !== moiId).length;
  useEffect(() => {
    if (!nonLusRecus) return;
    let actif = true;
    marquerLus(patientId, medecinId).then(() => {
      if (!actif) return;
      setRevision((r) => r + 1);
      signalerActivite.current?.();
    });
    return () => {
      actif = false;
    };
  }, [nonLusRecus, patientId, medecinId]);

  // Le fil s'ouvre sur le plus récent, et y revient à chaque nouveau message.
  useEffect(() => {
    const el = fil.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function envoyer() {
    if (enCours || (!texte.trim() && !fichier)) return;
    setEnCours(true);
    setErreur(null);
    const res = await envoyerMessagePatient({ patientId, medecinId, contenu: texte, fichier, procheId });
    setEnCours(false);
    if (res.erreur) {
      setErreur(res.erreur);
      onErreur?.(res.erreur);
      return;
    }
    setTexte("");
    setFichier(null);
    if (entreeFichier.current) entreeFichier.current.value = "";
    setRevision((r) => r + 1);
    signalerActivite.current?.();
  }

  async function ouvrirPiece(m: Message) {
    if (!m.piecePath) return;
    // Onglet ouvert AVANT l'attente : sinon le navigateur le bloque.
    const onglet = window.open("", "_blank", "noopener");
    const res = await urlPieceJointe(m.piecePath);
    if (res.url && onglet) onglet.location.href = res.url;
    else {
      onglet?.close();
      onErreur?.(res.erreur ?? "Pièce jointe introuvable.");
    }
  }

  const dernierDeMoi = [...messages].reverse().find((m) => m.expediteurId === moiId);

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-bg">
      <div
        ref={fil}
        role="log"
        aria-label={`Conversation avec ${interlocuteur}`}
        aria-live="polite"
        className="flex flex-col gap-1.5 overflow-y-auto px-3 py-3"
        style={{ height: hauteur }}
      >
        {chargement ? (
          <p className="m-auto text-[12.5px] text-muted">Chargement de la conversation…</p>
        ) : messages.length === 0 ? (
          <div className="m-auto max-w-[320px] text-center">
            <span className="mx-auto mb-2 grid h-11 w-11 place-items-center rounded-2xl bg-white text-teal">
              <Icone nom="message" taille={20} />
            </span>
            <b className="block text-[13.5px]">Aucun message pour l’instant</b>
            <p className="mt-1 text-[12px] text-muted">Écrivez à {interlocuteur} ci-dessous. Il sera prévenu par une notification.</p>
          </div>
        ) : (
          messages.map((m, i) => {
            const mien = m.expediteurId === moiId;
            const jour = jourIso(m.creeLe);
            const nouveauJour = i === 0 || jourIso(messages[i - 1].creeLe) !== jour;
            return (
              <div key={m.id} className="contents">
                {nouveauJour && (
                  <div className="my-2 text-center text-[11px] font-bold uppercase tracking-[0.04em] text-muted">
                    {libelleJour(jour, aujourdhui)}
                  </div>
                )}
                <div className={`flex max-w-[85%] flex-col gap-0.5 ${mien ? "items-end self-end" : "items-start self-start"}`}>
                  {m.procheId && prochesNoms[m.procheId] && (
                    <span className="text-[10.5px] font-bold text-muted">À propos de {prochesNoms[m.procheId]}</span>
                  )}
                  <div
                    className={`rounded-2xl px-3 py-2 text-[13.5px] leading-relaxed ${
                      mien ? "rounded-br-md bg-teal text-white" : "rounded-bl-md border border-line bg-white text-ink"
                    }`}
                  >
                    {m.contenu && <p className="whitespace-pre-wrap break-words">{m.contenu}</p>}
                    {m.piecePath && (
                      <button
                        type="button"
                        onClick={() => ouvrirPiece(m)}
                        className={`mt-1 inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-lg px-2 text-[12.5px] font-bold underline-offset-2 hover:underline pointer-coarse:min-h-11 ${
                          mien ? "bg-white/15 text-white" : "bg-bg text-blue"
                        }`}
                      >
                        <Icone nom="document" taille={14} className="flex-none" />
                        <span className="truncate">{m.pieceNom ?? "Pièce jointe"}</span>
                      </button>
                    )}
                  </div>
                  <span className="text-[10.5px] text-muted">
                    {heure(m.creeLe)}
                    {mien && m.id === dernierDeMoi?.id && (m.lu ? ` · Lu à ${heure(m.luLe ?? m.creeLe)}` : " · Envoyé")}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          envoyer();
        }}
        className="grid gap-2 border-t border-line bg-white p-2.5"
      >
        {fichier && (
          <span className="flex items-center gap-1.5 rounded-lg bg-bg px-2.5 py-1.5 text-[12px] font-semibold">
            <Icone nom="document" taille={13} className="flex-none" />
            <span className="min-w-0 flex-1 truncate">{fichier.name}</span>
            <button
              type="button"
              onClick={() => {
                setFichier(null);
                if (entreeFichier.current) entreeFichier.current.value = "";
              }}
              aria-label="Retirer la pièce jointe"
              className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-white pointer-coarse:h-11 pointer-coarse:w-11"
            >
              <Icone nom="croix" taille={14} />
            </button>
          </span>
        )}
        <div className="flex items-end gap-2">
          <label
            htmlFor={`${idChamp}-fichier`}
            className="grid h-11 w-11 flex-none cursor-pointer place-items-center rounded-[10px] border border-line text-muted transition-colors hover:border-muted hover:text-ink"
            title="Joindre un fichier (PDF ou image, 8 Mo)"
          >
            <Icone nom="partager" taille={17} />
            <span className="sr-only">Joindre un fichier</span>
          </label>
          <input
            id={`${idChamp}-fichier`}
            ref={entreeFichier}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            className="sr-only"
            onChange={(e) => setFichier(e.target.files?.[0] ?? null)}
          />
          <label htmlFor={idChamp} className="sr-only">
            Message à {interlocuteur}
          </label>
          <textarea
            id={idChamp}
            rows={1}
            value={texte}
            maxLength={4000}
            onChange={(e) => setTexte(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                envoyer();
              }
            }}
            placeholder="Votre message…"
            className="max-h-32 min-h-11 flex-1 resize-none rounded-[10px] border border-line px-3 py-2.5 text-[13.5px] outline-none focus:border-teal"
          />
          <button
            type="submit"
            disabled={enCours || (!texte.trim() && !fichier)}
            className="inline-flex h-11 flex-none items-center justify-center gap-1.5 rounded-[10px] bg-teal px-4 text-[13px] font-bold text-white transition-colors hover:bg-blue disabled:opacity-45"
          >
            {enCours ? "Envoi…" : "Envoyer"}
          </button>
        </div>
        {erreur && (
          <p role="alert" className="text-[12px] font-semibold text-red">
            {erreur}
          </p>
        )}
      </form>
    </div>
  );
}
