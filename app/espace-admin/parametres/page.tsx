"use client";

import { useState } from "react";
import Link from "next/link";
import AdminShell from "@/components/admin/AdminShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import Interrupteur from "@/components/patient/Interrupteur";
import CommunesCouvertes from "@/components/admin/CommunesCouvertes";
import SpecialitesProposees from "@/components/admin/SpecialitesProposees";
import {
  ajouterAListeContenu,
  useListeContenu,
  useReglagesPlateforme,
  type CleListeContenu,
} from "@/lib/admin";

/*
 * Paramètres de la plateforme — reproduit l'écran « admin-params » de la
 * maquette web : listes de contenu (spécialités, villes, assurances) avec
 * ajout en direct, et réglages généraux persistés. Chaque bascule de réglage
 * est tracée dans le journal d'audit.
 */

// Les spécialités portent une icône : elles ont leur propre carte
// (SpecialitesProposees), avec liste de suggestions et choix de l'emoji.
const LISTES: { cle: CleListeContenu; titre: string; question: string }[] = [
  { cle: "villes", titre: "Villes couvertes", question: "Ville à ajouter :" },
  { cle: "assurances", titre: "Assurances référencées", question: "Assurance à ajouter :" },
];

function CarteListe({ cle, titre, question }: (typeof LISTES)[number]) {
  const { liste: elements, recharger } = useListeContenu(cle);

  function ajouter() {
    const valeur = window.prompt(question)?.trim();
    if (valeur) ajouterAListeContenu(cle, valeur).then(() => recharger());
  }

  return (
    <>
    {/* Variante mobile : carte .card2 avec chips de la maquette */}
    <div className="card2 md:hidden">
      <h4>{titre}</h4>
      <div className="chips">
        {elements.map((element) => (
          <span key={element} className="chip">
            {element}
          </span>
        ))}
        <button type="button" className="chip grey" onClick={ajouter}>
          + Ajouter
        </button>
      </div>
    </div>

    <div className="mb-4 hidden rounded-2xl border border-line bg-white p-5 md:block">
      <h3 className="mb-3 text-[15px] font-extrabold">{titre}</h3>
      <div className="flex flex-wrap gap-2">
        {elements.map((element) => (
          <span
            key={element}
            className="rounded-full border border-[#CDE6F2] bg-teal-soft px-[14px] py-2 text-xs font-bold text-blue"
          >
            {element}
          </span>
        ))}
        <button
          type="button"
          onClick={ajouter}
          className="rounded-full border border-[#DCE4EA] bg-[#EEF2F5] px-[14px] py-2 text-xs font-bold text-[#3A4A55] transition-colors hover:bg-bg"
        >
          + Ajouter
        </button>
      </div>
    </div>
    </>
  );
}

/** Convertit un ISO stocké (timestamptz) vers la valeur d'un <input datetime-local>. */
function versInputLocal(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Éditeur du message et du compte à rebours de la maintenance, visible quand
 * l'interrupteur est actif. L'état interne est amorcé par les valeurs en base
 * (remontage via `key` côté appelant à chaque chargement).
 */
function EditeurMaintenance({
  messageInitial,
  jusquaInitial,
  onEnregistrer,
}: {
  messageInitial: string;
  jusquaInitial: string;
  onEnregistrer: (message: string, jusqua: string) => Promise<void>;
}) {
  const [message, setMessage] = useState(messageInitial);
  const [jusqua, setJusqua] = useState(versInputLocal(jusquaInitial));
  const [enCours, setEnCours] = useState(false);
  const [enregistre, setEnregistre] = useState(false);

  async function enregistrer() {
    setEnCours(true);
    setEnregistre(false);
    // L'input local est converti en ISO ; vide = pas de compte à rebours.
    await onEnregistrer(message, jusqua ? new Date(jusqua).toISOString() : "");
    setEnCours(false);
    setEnregistre(true);
  }

  return (
    <div className="mt-3 rounded-[13px] border border-[#CDE6F2] bg-teal-soft/50 p-4">
      <div className="mb-3 flex items-start gap-2 text-[12.5px] font-semibold text-blue">
        <span aria-hidden>🛠️</span>
        <span>
          La plateforme est fermée aux patients. Personnalisez ce qu’ils voient sur la page de
          maintenance.
        </span>
      </div>
      <label className="mb-1 block text-xs font-bold text-muted">Message affiché aux patients</label>
      <textarea
        rows={3}
        value={message}
        onChange={(e) => {
          setMessage(e.target.value);
          setEnregistre(false);
        }}
        placeholder="Ex : Nous améliorons la plateforme. Retour prévu à 14h — merci de votre patience."
        aria-label="Message de maintenance"
        className="w-full rounded-[11px] border border-line bg-white px-[13px] py-3 text-[13.5px] outline-none focus:border-teal"
      />
      <label className="mb-1 mt-3 block text-xs font-bold text-muted">
        Compte à rebours — fin de maintenance (facultatif)
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="datetime-local"
          value={jusqua}
          onChange={(e) => {
            setJusqua(e.target.value);
            setEnregistre(false);
          }}
          aria-label="Échéance de la maintenance"
          className="rounded-[11px] border border-line bg-white px-[13px] py-2.5 text-[13.5px] outline-none focus:border-teal"
        />
        {jusqua && (
          <button
            type="button"
            onClick={() => {
              setJusqua("");
              setEnregistre(false);
            }}
            className="rounded-[9px] border-[1.5px] border-line bg-white px-3 py-2 text-[12px] font-bold text-muted transition-colors hover:bg-bg"
          >
            Effacer
          </button>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={enregistrer}
          disabled={enCours}
          className="rounded-[9px] bg-teal px-[16px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {enCours ? "Enregistrement…" : "Enregistrer le message"}
        </button>
        <Link
          href="/maintenance"
          target="_blank"
          className="rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
        >
          Aperçu ↗
        </Link>
        {enregistre && <span className="text-[12.5px] font-bold text-green">✓ Enregistré</span>}
      </div>
    </div>
  );
}

export default function ParametresAdmin() {
  const { reglages, basculer, enregistrerMaintenance } = useReglagesPlateforme();

  return (
    <AdminShell permission="parametres">
      {/* En-tête mobile (écran « m-admin-params » de la maquette mobile) */}
      <div className="md:hidden">
        <EnTeteMobile retour="/espace-admin/plus" titre="Paramètres" />
      </div>
      {/* En-tête web (inchangé) */}
      <div className="mb-5 hidden md:block">
        <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">
          Paramètres de la plateforme
        </h2>
        <small className="text-[13px] text-muted">Contenu et réglages généraux</small>
      </div>

      <div className="pad">
      <SpecialitesProposees />

      {LISTES.map((liste) => (
        <CarteListe key={liste.cle} {...liste} />
      ))}

      {/* Les communes dépendent d'une ville : elles ont leur propre carte. */}
      <CommunesCouvertes />

      {/* Réglages — variante mobile */}
      <div className="card2 md:hidden">
        <h4>Réglages</h4>
        <div className="setrow">
          <div>
            <b>Inscriptions médecins</b>
            <small>Nouvelles demandes autorisées</small>
          </div>
          <Interrupteur
            actif={reglages.inscriptionsOuvertes}
            onChange={(v) => basculer("inscriptionsOuvertes", v)}
            label="Inscriptions médecins ouvertes"
          />
        </div>
        <div className="setrow">
          <div>
            <b>Paiement en ligne</b>
            <small>Orange Money, MTN MoMo</small>
          </div>
          <Interrupteur
            actif={reglages.paiementEnLigne}
            onChange={(v) => basculer("paiementEnLigne", v)}
            label="Paiement en ligne activé"
          />
        </div>
        <div className="setrow">
          <div>
            <b>Mode maintenance</b>
            <small>Plateforme inaccessible</small>
          </div>
          <Interrupteur
            actif={reglages.modeMaintenance}
            onChange={(v) => basculer("modeMaintenance", v)}
            label="Mode maintenance"
          />
        </div>
        {reglages.modeMaintenance && (
          <EditeurMaintenance
            key={`m-${reglages.maintenanceMessage}-${reglages.maintenanceJusqua}`}
            messageInitial={reglages.maintenanceMessage}
            jusquaInitial={reglages.maintenanceJusqua}
            onEnregistrer={enregistrerMaintenance}
          />
        )}
        <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
          Chaque bascule de réglage est tracée dans le journal d&apos;audit.
        </p>
      </div>

      <div className="mb-4 hidden rounded-2xl border border-line bg-white p-5 md:block">
        <h3 className="mb-1 text-[15px] font-extrabold">Réglages</h3>
        <div className="flex items-center justify-between gap-[14px] border-b border-line py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">Inscriptions médecins ouvertes</b>
            <small className="text-xs text-muted">Autoriser de nouvelles demandes</small>
          </div>
          <Interrupteur
            actif={reglages.inscriptionsOuvertes}
            onChange={(v) => basculer("inscriptionsOuvertes", v)}
            label="Inscriptions médecins ouvertes"
          />
        </div>
        <div className="flex items-center justify-between gap-[14px] border-b border-line py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">Paiement en ligne activé</b>
            <small className="text-xs text-muted">Orange Money, MTN MoMo</small>
          </div>
          <Interrupteur
            actif={reglages.paiementEnLigne}
            onChange={(v) => basculer("paiementEnLigne", v)}
            label="Paiement en ligne activé"
          />
        </div>
        <div className="flex items-center justify-between gap-[14px] border-b border-line py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">Mode maintenance</b>
            <small className="text-xs text-muted">
              Rend la plateforme inaccessible aux patients
            </small>
          </div>
          <Interrupteur
            actif={reglages.modeMaintenance}
            onChange={(v) => basculer("modeMaintenance", v)}
            label="Mode maintenance"
          />
        </div>
        {reglages.modeMaintenance && (
          <EditeurMaintenance
            key={`w-${reglages.maintenanceMessage}-${reglages.maintenanceJusqua}`}
            messageInitial={reglages.maintenanceMessage}
            jusquaInitial={reglages.maintenanceJusqua}
            onEnregistrer={enregistrerMaintenance}
          />
        )}
        <div className="flex items-center justify-between gap-[14px] py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">Langue par défaut</b>
            <small className="text-xs text-muted">Français</small>
          </div>
          <button
            type="button"
            disabled
            title="Multilingue : disponible dans une phase ultérieure"
            className="cursor-not-allowed rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue opacity-50"
          >
            Changer
          </button>
        </div>
        <p className="mt-1 text-[11.5px] text-muted">
          Chaque bascule de réglage est tracée dans le journal d’audit.
        </p>
      </div>

      <Link
        href="/"
        className="hidden w-full rounded-[11px] border-[1.5px] border-line bg-white px-[18px] py-[11px] text-center text-[13.5px] font-bold text-blue transition-colors hover:bg-bg md:block"
      >
        ↩️ Déconnexion
      </Link>
      </div>
    </AdminShell>
  );
}
