"use client";

import Link from "next/link";
import AdminShell from "@/components/admin/AdminShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import Interrupteur from "@/components/patient/Interrupteur";
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

const LISTES: { cle: CleListeContenu; titre: string; question: string }[] = [
  { cle: "specialites", titre: "Spécialités proposées", question: "Spécialité à ajouter :" },
  { cle: "villes", titre: "Villes couvertes", question: "Ville à ajouter :" },
  { cle: "assurances", titre: "Assurances référencées", question: "Assurance à ajouter :" },
];

function CarteListe({ cle, titre, question }: (typeof LISTES)[number]) {
  const { liste: elements, recharger } = useListeContenu(cle);

  function ajouter() {
    const valeur = window.prompt(question)?.trim();
    if (valeur) ajouterAListeContenu(cle, valeur).then(recharger);
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

export default function ParametresAdmin() {
  const { reglages, basculer } = useReglagesPlateforme();

  return (
    <AdminShell>
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
      {LISTES.map((liste) => (
        <CarteListe key={liste.cle} {...liste} />
      ))}

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
