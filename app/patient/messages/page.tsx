"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import PatientShell from "@/components/patient/PatientShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import FilMessages from "@/components/site/FilMessages";
import Icone from "@/components/site/Icone";
import { useConversationsPatient, type Conversation } from "@/lib/conversations";
import { useMesMedecins, useTousMedecins } from "@/lib/documents";
import { useProches, useProfilConnecte } from "@/lib/patient";
import { OBJETS, labelObjet, type ObjetConversation } from "@/lib/messagerie-objets";

/*
 * Messages — les conversations du patient avec ses médecins.
 *
 * On peut écrire à n'importe quel médecin validé de l'annuaire (migration
 * 0076) : la liste « Écrire à » réunit les médecins déjà consultés
 * (`medecins_du_patient`, en premier) et tout le reste de l'annuaire
 * (`useTousMedecins`). Un message peut porter sur un proche : le médecin le
 * voit dans la fiche de ce proche.
 *
 * « Nouvelle conversation » ouvre un tiroir : recherche du médecin (tri par
 * défaut = déjà consultés en premier), sélection d'un objet, puis le fil
 * s'ouvre avec l'objet prêt à être envoyé au premier message.
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
  const { medecins: annuaire } = useTousMedecins();
  const { proches } = useProches();
  const [choisi, setChoisi] = useState<string | null>(() => parametres.get("medecin"));
  const [pour, setPour] = useState<string>("");
  const [objet, setObjet] = useState<ObjetConversation | "">("");
  const [nouvelleConv, setNouvelleConv] = useState(false);
  const [recherche, setRecherche] = useState("");

  // Médecins joignables en « nouvelle conversation » : tout l'annuaire, les
  // déjà consultés d'abord (ordre de medecins_du_patient, par date de RDV
  // décroissante), puis les autres par ordre alphabétique. On retire ceux qui
  // ont déjà un fil ouvert — ils figurent dans la liste des conversations, à
  // un tap. La messagerie n'exige plus un RDV préalable (migration 0076).
  const joignables = useMemo(() => {
    const idsConsultes = new Set(medecins.map((m) => m.id));
    const avecFil = new Set(conversations.map((c) => c.medecinId));
    const autres = annuaire
      .filter((m) => !idsConsultes.has(m.id))
      .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
    return [...medecins, ...autres].filter((m) => !avecFil.has(m.id));
  }, [medecins, annuaire, conversations]);

  // Recherche dans la liste « Écrire à » : déjà consultés en premier.
  const resultatsRecherche = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return joignables;
    return joignables.filter(
      (m) => m.nom.toLowerCase().includes(q) || (m.specialite ?? "").toLowerCase().includes(q),
    );
  }, [joignables, recherche]);

  const courant: { id: string; nom: string; specialite: string | null } | null = choisi
    ? (() => {
        const c = conversations.find((x) => x.medecinId === choisi);
        if (c) return { id: c.medecinId, nom: c.medecin, specialite: c.specialite };
        const m = medecins.find((x) => x.id === choisi) ?? annuaire.find((x) => x.id === choisi);
        return m ? { id: m.id, nom: m.nom, specialite: m.specialite || null } : null;
      })()
    : null;
  const nomsProches = Object.fromEntries(proches.map((p) => [p.id, `${p.prenom} ${p.nom}`]));

  // L'objet de la conversation existante, ou celui choisi pour une nouvelle.
  const objetConv = (() => {
    if (objet) return objet;
    const c = conversations.find((x) => x.medecinId === choisi);
    return c?.objet ?? null;
  })();

  function ouvrir(id: string) {
    setChoisi(id);
    setNouvelleConv(false);
    setPour("");
    // Conserver l'objet seulement si c'est une nouvelle conversation
    if (conversations.some((c) => c.medecinId === id)) setObjet("");
    window.history.replaceState(null, "", `/patient/messages?medecin=${id}`);
  }
  function fermer() {
    setChoisi(null);
    setNouvelleConv(false);
    setObjet("");
    window.history.replaceState(null, "", "/patient/messages");
  }
  function ouvrirNouvelle() {
    setNouvelleConv(true);
    setChoisi(null);
    setRecherche("");
    setObjet("");
  }

  const liste = (
    <div className="grid content-start gap-3">
      {/* Bouton « Nouvelle conversation » */}
      {joignables.length > 0 && (
        <button
          type="button"
          onClick={ouvrirNouvelle}
          className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-teal px-4 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-blue"
        >
          <Icone nom="plus" taille={15} epaisseur={2.6} />
          Nouvelle conversation
        </button>
      )}

      {chargement ? (
        <div className="grid gap-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[62px] animate-pulse rounded-xl bg-white" />
          ))}
        </div>
      ) : conversations.length === 0 && joignables.length === 0 ? (
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
        </>
      )}
    </div>
  );

  // Panneau « Nouvelle conversation » : recherche médecin + choix objet
  const panneauNouveau = nouvelleConv && (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <b className="text-[15px] font-extrabold">Nouvelle conversation</b>
        <button
          type="button"
          onClick={fermer}
          className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-bg"
          aria-label="Fermer"
        >
          <Icone nom="croix" taille={16} />
        </button>
      </div>

      {/* Recherche médecin */}
      <div>
        <label htmlFor="recherche-medecin" className="mb-1.5 block text-[12px] font-bold text-muted">
          Choisir un médecin
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
            <Icone nom="loupe" taille={15} />
          </span>
          <input
            id="recherche-medecin"
            type="search"
            placeholder="Rechercher par nom ou spécialité…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-line bg-bg pl-9 pr-3 text-[13px] outline-none focus:border-teal"
          />
        </div>
      </div>

      {resultatsRecherche.length === 0 ? (
        <p className="text-[12.5px] text-muted">Aucun médecin trouvé.</p>
      ) : (
        <ul className="grid gap-1.5 overflow-y-auto" style={{ maxHeight: "min(40vh, 300px)" }}>
          {resultatsRecherche.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => {
                  setChoisi(m.id);
                  setNouvelleConv(false);
                  window.history.replaceState(null, "", `/patient/messages?medecin=${m.id}`);
                }}
                className="flex min-h-11 w-full items-center gap-2.5 rounded-xl border border-line bg-white px-3 py-2 text-left transition-colors hover:border-teal hover:bg-teal-soft"
              >
                <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-teal-soft text-teal">
                  <Icone nom="utilisateur" taille={14} />
                </span>
                <span className="min-w-0">
                  <b className="block truncate text-[13px]">{m.nom}</b>
                  {m.specialite && <span className="block truncate text-[11.5px] text-muted">{m.specialite}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Choix de l'objet */}
      <div>
        <label htmlFor="objet-conversation" className="mb-1.5 block text-[12px] font-bold text-muted">
          Objet de votre message
        </label>
        <select
          id="objet-conversation"
          value={objet}
          onChange={(e) => setObjet(e.target.value as ObjetConversation | "")}
          className="min-h-11 w-full rounded-xl border border-line bg-white px-3 text-[13px] font-semibold outline-none focus:border-teal"
        >
          <option value="">Sélectionner un objet…</option>
          {OBJETS.map((o) => (
            <option key={o.slug} value={o.slug}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  const fil =
    courant && profil ? (
      <div className="grid gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <b className="block truncate text-[15px] font-extrabold">{courant.nom}</b>
            <span className="flex flex-wrap items-center gap-2">
              {courant.specialite && <span className="text-[12px] text-muted">{courant.specialite}</span>}
              {objetConv && (
                <span className="inline-block rounded bg-teal/10 px-1.5 py-0.5 text-[10.5px] font-bold text-teal">
                  {labelObjet(objetConv)}
                </span>
              )}
            </span>
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

        {/* Sélection d'objet pour une NOUVELLE conversation (sans messages encore) */}
        {!conversations.some((c) => c.medecinId === choisi) && !objet && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
            <label htmlFor="objet-nouveau" className="mb-1 block text-[12px] font-bold text-amber-700">
              Choisissez un objet avant d’écrire
            </label>
            <select
              id="objet-nouveau"
              value={objet}
              onChange={(e) => setObjet(e.target.value as ObjetConversation | "")}
              className="min-h-9 w-full rounded-lg border border-amber-200 bg-white px-2.5 text-[12.5px] font-semibold outline-none focus:border-teal"
            >
              <option value="">Sélectionner un objet…</option>
              {OBJETS.map((o) => (
                <option key={o.slug} value={o.slug}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        )}

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
          objet={objet || undefined}
          onActivite={() => {
            setRevision((r) => r + 1);
            // L'objet a été porté par le premier message : on le vide du state
            // local pour ne pas le renvoyer sur les suivants.
            if (objet) setObjet("");
          }}
        />
        <p className="text-[11.5px] text-muted">
          Pour une urgence, appelez le 442 (SAMU) : votre médecin ne lit pas ses messages en continu.
        </p>
      </div>
    ) : choisi && !chargement ? (
      <p className="text-[13px] text-muted">Conversation introuvable : choisissez un médecin dans la liste.</p>
    ) : null;

  return (
    <>
      <div className="md:hidden">
        {choisi || nouvelleConv ? (
          <EnTeteMobile
            titre="Messages"
            sousTitre={courant?.nom ?? (nouvelleConv ? "Nouveau" : undefined)}
            retour="/patient/messages"
          />
        ) : (
          <EnTeteMobile retour="/" titre="Messages" />
        )}
      </div>
      <div className="mb-5 hidden md:block">
        <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Messages</h2>
        <small className="text-[13px] text-muted">Vos échanges avec les médecins que vous avez consultés</small>
      </div>

      <div className="pad pad-haut grid items-start gap-5 md:p-0 lg:grid-cols-[300px_1fr]">
        <div className={choisi || nouvelleConv ? "hidden lg:block" : ""}>{liste}</div>
        <div className={choisi || nouvelleConv ? "" : "hidden lg:block"}>
          {(choisi || nouvelleConv) && (
            <button
              type="button"
              onClick={fermer}
              className="cible-texte mb-2 inline-flex items-center gap-1 text-[12.5px] font-bold text-teal lg:hidden"
            >
              ← Toutes les conversations
            </button>
          )}
          <div className="rounded-2xl border border-line bg-white p-3 md:p-4">
            {panneauNouveau || fil || (
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
        <Icone nom="message" taille={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <b className="truncate text-[13px]">{c.medecin}</b>
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
