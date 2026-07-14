"use client";

import Link from "next/link";
import AdminShell from "@/components/admin/AdminShell";
import {
  useCompteursAdmin,
  useCroissanceInscriptions,
  useEtablissementsEnAttente,
  useMedecinsEnAttente,
  useSignalements,
} from "@/lib/admin";

/*
 * Tableau de bord admin — reproduit l'écran « admin-dash » de la maquette
 * web : statistiques plateforme (comptées en direct dans Supabase), liste
 * « À traiter » (files de validation et de modération), croissance des
 * inscriptions.
 */
export default function TableauDeBordAdmin() {
  const { dossiers: medecinsEnAttente } = useMedecinsEnAttente();
  const { dossiers: etabsEnAttente } = useEtablissementsEnAttente();
  const { signalements } = useSignalements();
  const compteurs = useCompteursAdmin();
  const croissance = useCroissanceInscriptions();
  const maxCroissance = Math.max(1, ...croissance.map((m) => m.total));
  const BARRES = croissance.map((m) => ({ mois: m.mois, hauteur: Math.round((m.total / maxCroissance) * 100) }));

  return (
    <AdminShell>
      {/* ===== Version mobile (écran « m-admin-dash » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <div className="appbar">
          <h3 style={{ paddingLeft: 4 }}>Administration</h3>
        </div>
        <div className="pad">
          <div className="statcards inpad two">
            <div className="sc b1">
              <b>{compteurs.utilisateurs.toLocaleString("fr-FR")}</b>
              <small>Utilisateurs</small>
            </div>
            <div className="sc b2">
              <b>{compteurs.medecinsValides.toLocaleString("fr-FR")}</b>
              <small>Médecins</small>
            </div>
            <div className="sc b3">
              <b>{compteurs.rdvCeMois.toLocaleString("fr-FR")}</b>
              <small>RDV ce mois</small>
            </div>
          </div>
          <div className="card2" style={{ marginTop: 12 }}>
            <h4>À traiter</h4>
            <div className="setrow">
              <div>
                <b>
                  {medecinsEnAttente.length} médecin{medecinsEnAttente.length > 1 ? "s" : ""} en
                  attente
                </b>
                <small>Documents à vérifier</small>
              </div>
              <Link href="/espace-admin/validations" className="btnm">
                Traiter
              </Link>
            </div>
            <div className="setrow">
              <div>
                <b>
                  {etabsEnAttente.length} établissement{etabsEnAttente.length > 1 ? "s" : ""}
                </b>
                <small>À approuver</small>
              </div>
              <Link href="/espace-admin/validations" className="btnm">
                Traiter
              </Link>
            </div>
            <div className="setrow">
              <div>
                <b>
                  {signalements.length} signalement{signalements.length > 1 ? "s" : ""}
                </b>
                <small>À examiner</small>
              </div>
              <Link href="/espace-admin/moderation" className="btnm gh">
                Voir
              </Link>
            </div>
          </div>
          <div className="card2">
            <h4>Croissance des inscriptions</h4>
            <div className="bars">
              {BARRES.map((barre) => (
                <div key={barre.mois} className="b">
                  <div className="bar" style={{ height: `${barre.hauteur}%` }} />
                  <small>{barre.mois}</small>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ===== Version web (inchangée) ===== */}
      <div className="hidden md:block">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">
            Administration · Docteur 224
          </h2>
          <small className="text-[13px] text-muted">Vue d’ensemble de la plateforme</small>
        </div>
        <Link
          href="/espace-medecin/nouveau-rdv"
          className="rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
        >
          + RDV pour un patient
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-line bg-white p-[18px]">
          <span className="text-lg" aria-hidden>
            👥
          </span>
          <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-blue">
            {compteurs.utilisateurs.toLocaleString("fr-FR")}
          </b>
          <small className="text-xs font-semibold text-muted">Utilisateurs</small>
        </div>
        <div className="rounded-2xl border border-line bg-white p-[18px]">
          <span className="text-lg" aria-hidden>
            👨‍⚕️
          </span>
          <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-amber">{compteurs.medecinsValides.toLocaleString("fr-FR")}</b>
          <small className="text-xs font-semibold text-muted">Médecins</small>
        </div>
        <div className="rounded-2xl border border-line bg-white p-[18px]">
          <span className="text-lg" aria-hidden>
            📅
          </span>
          <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-green">
            {compteurs.rdvCeMois.toLocaleString("fr-FR")}
          </b>
          <small className="text-xs font-semibold text-muted">RDV ce mois</small>
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">À traiter</h3>
        <div className="flex items-center justify-between gap-[14px] border-b border-line py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">
              {medecinsEnAttente.length} médecin{medecinsEnAttente.length > 1 ? "s" : ""} en
              attente de validation
            </b>
            <small className="text-xs text-muted">
              Diplômes et cartes de l’ordre à vérifier
            </small>
          </div>
          <Link
            href="/espace-admin/validations"
            className="rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
          >
            Traiter
          </Link>
        </div>
        <div className="flex items-center justify-between gap-[14px] border-b border-line py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">
              {etabsEnAttente.length} établissement{etabsEnAttente.length > 1 ? "s" : ""} en
              attente
            </b>
            <small className="text-xs text-muted">Demandes de rattachement à approuver</small>
          </div>
          <Link
            href="/espace-admin/validations"
            className="rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
          >
            Traiter
          </Link>
        </div>
        <div className="flex items-center justify-between gap-[14px] py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">
              {signalements.length} signalement{signalements.length > 1 ? "s" : ""}
            </b>
            <small className="text-xs text-muted">Avis ou comptes à examiner</small>
          </div>
          <Link
            href="/espace-admin/moderation"
            className="rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
          >
            Examiner
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-[14px] text-[15px] font-extrabold">Croissance des inscriptions</h3>
        <div className="flex h-[180px] items-end gap-[14px] px-1 pt-[10px]">
          {BARRES.map((barre) => (
            <div
              key={barre.mois}
              className="flex h-full flex-1 flex-col items-center justify-end gap-2"
            >
              <div
                className="w-full max-w-[46px] rounded-t-lg bg-[linear-gradient(180deg,var(--teal),var(--blue))]"
                style={{ height: `${barre.hauteur}%` }}
              />
              <small className="text-[11px] font-bold text-muted">{barre.mois}</small>
            </div>
          ))}
        </div>
      </div>
      </div>
    </AdminShell>
  );
}
