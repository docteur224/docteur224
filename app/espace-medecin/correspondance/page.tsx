"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import MedecinShell from "@/components/medecin/MedecinShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import { formatDateCourte } from "@/lib/dates";
import {
  iconeType,
  libelleType,
  urlSignee,
  useDocumentsPartagesAvecMoi,
  type DocumentPartage,
} from "@/lib/documents";
import {
  marquerTransmissionLue,
  revoquerTransmission,
  useTransmissions,
  type PieceJointe,
  type Transmission,
} from "@/lib/transmissions";

/*
 * Correspondance du médecin — tout ce qui lui arrive ou part de lui au sujet
 * d'un dossier, en un seul endroit :
 *   · Reçues   : dossiers que des confrères lui ont adressés ;
 *   · Envoyées : ceux qu'il a adressés, avec accusé de lecture et révocation ;
 *   · Patients : documents que des patients ont partagés directement.
 *
 * Ces trois flux étaient (ou allaient être) trois écrans distincts alors
 * qu'ils répondent à la même question — « qu'est-ce qui a circulé ? ». La
 * vue est portée par l'URL (?vue=) pour rester partageable et pour que les
 * notifications puissent pointer sur le bon onglet.
 */

const VUES = [
  { cle: "recues", libelle: "Reçues" },
  { cle: "envoyees", libelle: "Envoyées" },
  { cle: "partages", libelle: "Partagés par les patients" },
] as const;

type Vue = (typeof VUES)[number]["cle"];

export default function Correspondance() {
  return (
    <Suspense fallback={<EcranCorrespondance vue="recues" />}>
      <AvecVue />
    </Suspense>
  );
}

function AvecVue() {
  const parametres = useSearchParams();
  const demandee = parametres.get("vue");
  const valide = VUES.some((v) => v.cle === demandee);
  return <EcranCorrespondance vue={valide ? (demandee as Vue) : "recues"} />;
}

function EcranCorrespondance({ vue }: { vue: Vue }) {
  const router = useRouter();
  const recues = useTransmissions("recues");
  const envoyees = useTransmissions("envoyees");
  const partages = useDocumentsPartagesAvecMoi();
  const [deplie, setDeplie] = useState<string | null>(null);
  const [aRevoquer, setARevoquer] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  /* La vue n'est PAS dupliquée dans un état local : elle se lit dans l'URL,
     que `router.replace` met à jour. Un état miroir aurait exigé un effet de
     resynchronisation, que le linter React interdit ici. */
  function changerVue(nouvelle: Vue) {
    setMessage("");
    router.replace(`/espace-medecin/correspondance?vue=${nouvelle}`, { scroll: false });
  }

  async function ouvrirFichier(path: string | null) {
    if (!path) return;
    setMessage("");
    const res = await urlSignee(path);
    if (res.erreur || !res.url) {
      setMessage(`⚠️ ${res.erreur ?? "Fichier introuvable."}`);
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  async function accuserReception(t: Transmission) {
    const res = await marquerTransmissionLue(t.id);
    setMessage(res.erreur ? `⚠️ ${res.erreur}` : "✓ Réception confirmée à votre confrère.");
    recues.recharger();
  }

  /* Révocation en deux temps, comme partout ailleurs dans l'application. */
  async function revoquer(t: Transmission) {
    if (aRevoquer !== t.id) {
      setARevoquer(t.id);
      setMessage("");
      return;
    }
    const res = await revoquerTransmission(t.id);
    setMessage(res.erreur ? `⚠️ ${res.erreur}` : "✓ Accès retiré. Le confrère en est informé.");
    setARevoquer(null);
    envoyees.recharger();
  }

  const badgeStatut = (t: Transmission) => {
    if (t.statut === "revoquee")
      return <span className="rounded bg-red-soft px-1.5 py-0.5 text-[10.5px] font-bold text-red">Accès retiré</span>;
    if (t.statut === "lue")
      return <span className="rounded bg-green-soft px-1.5 py-0.5 text-[10.5px] font-bold text-green">Lue</span>;
    return <span className="rounded bg-teal-soft px-1.5 py-0.5 text-[10.5px] font-bold text-blue">Envoyée</span>;
  };

  const pieceJointe = (p: PieceJointe, revoquee: boolean) => (
    <div key={p.id} className="flex items-center gap-2 border-b border-line py-2 last:border-b-0">
      <span aria-hidden className="flex-none text-base">
        {iconeType(p.type)}
      </span>
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[12.5px] font-bold">{p.titre}</b>
        <small className="block text-[10.5px] text-muted">
          {libelleType(p.type)} · {formatDateCourte(p.creeLe.slice(0, 10))}
          {p.redigePar ? ` · ${p.redigePar}` : ""}
        </small>
      </span>
      {p.fichierPath && !revoquee && (
        <button
          type="button"
          onClick={() => ouvrirFichier(p.fichierPath)}
          className="flex-none rounded-[9px] bg-teal px-3 py-1 text-[11px] font-bold text-white transition-colors hover:bg-[#2790bc]"
        >
          Ouvrir
        </button>
      )}
    </div>
  );

  const carteTransmission = (t: Transmission) => {
    const revoquee = t.statut === "revoquee";
    return (
      <div
        key={t.id}
        className={`rounded-2xl border bg-white p-4 ${
          t.urgence === "prioritaire" && !revoquee ? "border-[#F2D9B6]" : "border-line"
        } ${revoquee ? "opacity-70" : ""}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              {t.urgence === "prioritaire" && !revoquee && (
                <span className="rounded bg-[#FFF5E9] px-1.5 py-0.5 text-[10.5px] font-bold text-[#8A5A1B]">
                  Prioritaire
                </span>
              )}
              {badgeStatut(t)}
              <span className="text-[10.5px] text-muted">
                {formatDateCourte(t.creeLe.slice(0, 10))}
              </span>
            </div>
            <b className="block text-sm font-extrabold">{t.motif}</b>
            <div className="text-[11.5px] text-muted">
              {t.sens === "recue" ? "De" : "À"} {t.confrere} · Patient : {t.patientNom}
              {t.pourQui !== "Lui-même" && ` (pour ${t.pourQui})`}
            </div>
          </div>
        </div>

        {t.note && (
          <>
            <button
              type="button"
              onClick={() => setDeplie(deplie === t.id ? null : t.id)}
              className="mt-2 text-[11.5px] font-bold text-teal hover:underline"
            >
              {deplie === t.id ? "Replier le courrier" : "Lire le courrier"}
            </button>
            {deplie === t.id && (
              <pre className="mt-2 whitespace-pre-wrap border-t border-line pt-2 font-sans text-[12.5px] leading-[1.7] text-[#3f5360]">
                {t.note}
              </pre>
            )}
          </>
        )}

        {t.documents.length > 0 && (
          <div className="mt-3 rounded-xl bg-bg px-3 py-1">
            <b className="block pt-2 text-[11px] font-extrabold uppercase tracking-[.04em] text-muted">
              {t.documents.length} pièce{t.documents.length > 1 ? "s" : ""} jointe
              {t.documents.length > 1 ? "s" : ""}
            </b>
            {t.documents.map((p) => pieceJointe(p, revoquee))}
          </div>
        )}

        {revoquee && (
          <p className="mt-2 text-[11.5px] font-semibold text-red">
            L’accès aux pièces a été retiré{t.revoqueeLe ? ` le ${formatDateCourte(t.revoqueeLe.slice(0, 10))}` : ""}.
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {t.sens === "recue" && t.statut === "envoyee" && (
            <button
              type="button"
              onClick={() => accuserReception(t)}
              className="rounded-[9px] bg-teal px-3 py-1.5 text-[11.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
            >
              Accuser réception
            </button>
          )}
          {t.sens === "recue" && t.lueLe && (
            <span className="text-[11.5px] text-muted">
              Réception confirmée le {formatDateCourte(t.lueLe.slice(0, 10))}
            </span>
          )}
          {t.sens === "envoyee" && (
            <>
              <span className="text-[11.5px] text-muted">
                {t.lueLe
                  ? `Lue par ${t.confrere} le ${formatDateCourte(t.lueLe.slice(0, 10))}`
                  : revoquee
                    ? ""
                    : "En attente de lecture"}
              </span>
              {!revoquee && (
                <button
                  type="button"
                  onClick={() => revoquer(t)}
                  className="ml-auto rounded-[9px] border-[1.5px] border-[#F3C9C2] bg-white px-3 py-1.5 text-[11.5px] font-bold text-red transition-colors hover:bg-red-soft"
                >
                  {aRevoquer === t.id ? "Confirmer le retrait" : "Retirer l’accès"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  const cartePartage = (d: DocumentPartage) => (
    <div key={d.documentId} className="rounded-2xl border border-line bg-white p-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl bg-teal-soft text-lg"
        >
          {iconeType(d.type)}
        </span>
        <div className="min-w-0 flex-1">
          <b className="block text-sm font-extrabold">{d.titre}</b>
          <div className="text-[11.5px] text-muted">
            {libelleType(d.type)} · {formatDateCourte(d.creeLe.slice(0, 10))} · partagé le{" "}
            {formatDateCourte(d.partageLe.slice(0, 10))}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-teal-soft px-1.5 py-0.5 text-[10.5px] font-bold text-blue">
              {d.patientNom}
            </span>
            {d.pourQui !== "Lui-même" && (
              <span className="rounded bg-bg px-1.5 py-0.5 text-[10.5px] font-bold text-muted">
                pour {d.pourQui}
              </span>
            )}
            {d.redigePar && <span className="text-[10.5px] text-muted">rédigé par {d.redigePar}</span>}
          </div>
        </div>
        {d.fichierPath && (
          <button
            type="button"
            onClick={() => ouvrirFichier(d.fichierPath)}
            className="flex-none rounded-[9px] bg-teal px-3 py-1.5 text-[11.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
          >
            Ouvrir
          </button>
        )}
      </div>
      {d.contenu && (
        <>
          <button
            type="button"
            onClick={() => setDeplie(deplie === d.documentId ? null : d.documentId)}
            className="mt-2 text-[11.5px] font-bold text-teal hover:underline"
          >
            {deplie === d.documentId ? "Replier" : "Lire le contenu"}
          </button>
          {deplie === d.documentId && (
            <pre className="mt-2 whitespace-pre-wrap border-t border-line pt-2 font-sans text-[13px] leading-[1.7] text-[#3f5360]">
              {d.contenu}
            </pre>
          )}
        </>
      )}
    </div>
  );

  const compteur = (v: Vue) =>
    v === "recues" ? recues.transmissions.length : v === "envoyees" ? envoyees.transmissions.length : partages.documents.length;

  const chargement =
    vue === "recues" ? recues.chargement : vue === "envoyees" ? envoyees.chargement : partages.chargement;

  const contenu =
    vue === "recues"
      ? recues.transmissions.map(carteTransmission)
      : vue === "envoyees"
        ? envoyees.transmissions.map(carteTransmission)
        : partages.documents.map(cartePartage);

  const vide = !chargement && contenu.length === 0;

  const messageVide =
    vue === "recues"
      ? "Aucun dossier reçu d’un confrère pour l’instant. Une transmission apparaît ici dès qu’un praticien vous adresse un patient."
      : vue === "envoyees"
        ? "Vous n’avez encore adressé aucun dossier. Depuis la fiche d’un patient, utilisez « Adresser à un confrère »."
        : "Aucun document partagé par un patient pour l’instant.";

  const onglets = (
    <div className="flex flex-wrap gap-2">
      {VUES.map((v) => (
        <button
          key={v.cle}
          type="button"
          onClick={() => changerVue(v.cle)}
          className={`rounded-[9px] border-[1.5px] px-3 py-1.5 text-[11.5px] font-bold transition-colors ${
            vue === v.cle
              ? "border-teal bg-teal-soft text-blue"
              : "border-line bg-white text-muted hover:bg-bg"
          }`}
        >
          {v.libelle} ({compteur(v.cle)})
        </button>
      ))}
    </div>
  );

  return (
    <MedecinShell>
      {/* ===== Version mobile ===== */}
      <div className="md:hidden">
        <EnTeteMobile variante="marque" />
        <div className="appbar">
          <h3 style={{ paddingLeft: 4 }}>Correspondance</h3>
        </div>
        <div className="pad" style={{ paddingTop: 8 }}>
          <div className="mb-3">{onglets}</div>
          {chargement && (
            <p className="muted" style={{ fontSize: 13 }}>
              Chargement…
            </p>
          )}
          {vide && (
            <div className="noteboxm" style={{ marginTop: 0 }}>
              <span aria-hidden>📨</span>
              <div>{messageVide}</div>
            </div>
          )}
          <div className="grid gap-3">{contenu}</div>
          {message && (
            <p
              style={{
                color: message.startsWith("⚠️") ? "var(--red)" : "var(--green)",
                fontSize: 12.5,
                fontWeight: 700,
                paddingTop: 10,
              }}
            >
              {message}
            </p>
          )}
        </div>
      </div>

      {/* ===== Version web ===== */}
      <div className="hidden md:block">
        <div className="mb-5">
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Correspondance</h2>
          <small className="text-[13px] text-muted">
            Dossiers reçus et adressés entre confrères, et documents partagés par vos patients
          </small>
        </div>

        <div className="mb-4">{onglets}</div>

        {chargement && <p className="text-[13px] text-muted">Chargement…</p>}

        {vide && (
          <div className="rounded-2xl border border-line bg-white p-8 text-center">
            <div className="mb-2 text-3xl" aria-hidden>
              📨
            </div>
            <b className="block text-sm font-extrabold">Rien pour l’instant</b>
            <p className="mx-auto mt-1 max-w-[480px] text-[12.5px] text-muted">{messageVide}</p>
          </div>
        )}

        <div className="grid gap-3">{contenu}</div>

        {message && (
          <p
            className={`mt-3 text-[12.5px] font-bold ${
              message.startsWith("⚠️") ? "text-red" : "text-green"
            }`}
          >
            {message}
          </p>
        )}
      </div>
    </MedecinShell>
  );
}
