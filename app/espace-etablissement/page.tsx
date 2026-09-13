"use client";

import Link from "next/link";
import EtablissementShell from "@/components/etablissement/EtablissementShell";
import {
  ETABLISSEMENT_VIDE,
  useEtablissementConnecte,
  useMedecinsRattaches,
  useStatistiquesEtablissement,
} from "@/lib/etablissement";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import { formatDateCourte } from "@/lib/dates";

/*
 * Tableau de bord établissement — reproduit l'écran « etab-dash » de la
 * maquette web : 4 statistiques, médecins de l'établissement, prochains
 * rendez-vous tous médecins.
 *
 * AUDIT : les trois quarts de cet écran étaient inventés. « 32 RDV
 * aujourd'hui », « 4 assistant(e)s », « 78 % d'occupation » et trois
 * rendez-vous écrits en dur (Aboubacar Sylla, Mariama Sow, Ibrahima Bah)
 * s'affichaient à l'identique pour tous les établissements. Tout vient
 * maintenant de `statistiques_etablissement` (migration 0054).
 *
 * Le taux d'occupation a cédé la place aux RDV du mois : il aurait fallu
 * régénérer les créneaux théoriques de chaque médecin pour le calculer,
 * et un pourcentage faux valait moins qu'un compte juste.
 *
 * Les prochains rendez-vous sont réels mais ANONYMES : l'espace
 * établissement ne montre jamais un nom de patient — ils appartiennent
 * au médecin et à son patient (c'est la RLS de `rendez_vous`).
 */

const LIBELLES_STATUT = {
  confirme: { texte: "Confirmé", pill: "ok", classes: "bg-green-soft text-green" },
  en_attente: { texte: "Attente", pill: "soon", classes: "bg-amber-soft text-amber" },
} as const;

/** « 09:00:00 » → « 09:00 » (la base rend un `time` complet). */
const heureCourte = (heure: string) => heure.slice(0, 5);

export default function TableauDeBordEtablissement() {
  const { etablissement, chargement } = useEtablissementConnecte();
  const etab = etablissement ?? ETABLISSEMENT_VIDE;
  const { rattaches } = useMedecinsRattaches(etablissement?.id);
  const { stats } = useStatistiquesEtablissement(etablissement?.id);

  // Le compte des médecins est déjà chargé localement : l'afficher sans
  // attendre la réponse des statistiques évite un « 0 » transitoire.
  const nbMedecins = rattaches.length;
  const nomMedecin = (id: string) => rattaches.find((m) => m.id === id);

  const prochains = (stats?.prochains ?? []).map((rdv) => {
    const medecin = nomMedecin(rdv.medecinId);
    return {
      ...rdv,
      medecinNom: medecin?.nom ?? "Médecin de l'établissement",
      specialite: medecin?.specialite ?? "",
    };
  });

  const aucunEtablissement = !chargement && !etablissement;

  if (aucunEtablissement) {
    return (
      <EtablissementShell>
        <div className="md:hidden">
          <EnTeteMobile variante="marque" />
        </div>
        <div className="pad md:p-0">
          <div className="rounded-2xl border border-line bg-white p-6 text-center">
            <h2 className="text-[17px] font-extrabold">Aucun établissement sur ce compte</h2>
            <p className="mx-auto mt-2 max-w-[420px] text-[13px] text-muted">
              Ce compte n’est gestionnaire d’aucun établissement. Si vous venez de vous inscrire,
              terminez l’inscription professionnelle ; sinon, contactez l’administrateur de la
              plateforme.
            </p>
            <Link
              href="/inscription/professionnel"
              className="mt-4 inline-block rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white"
            >
              Reprendre l’inscription
            </Link>
          </div>
        </div>
      </EtablissementShell>
    );
  }

  /*
   * Tant que l'établissement n'est pas validé, sa fiche n'est pas
   * publique et aucun patient ne peut le trouver. Rien ne le disait :
   * le gestionnaire voyait un tableau de bord normal et attendait des
   * rendez-vous qui ne pouvaient pas arriver.
   */
  const bandeauValidation = etab.statut && etab.statut !== "valide" && (
    <div className="mb-4 flex items-start gap-[9px] rounded-xl bg-amber-soft px-[14px] py-3 text-[12.5px] font-semibold leading-relaxed text-amber">
      <span aria-hidden>⏳</span>
      <div>
        {etab.statut === "refuse"
          ? "La validation de cet établissement a été refusée : sa fiche n’apparaît pas dans la recherche. Contactez l’administrateur de la plateforme."
          : "Établissement en cours de validation : sa fiche n’apparaît pas encore dans la recherche des patients."}
      </div>
    </div>
  );

  return (
    <EtablissementShell>
      {/* ===== Version mobile (écran « m-etab-dash » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <EnTeteMobile variante="marque" />
        <div className="appbar">
          <h3 style={{ paddingLeft: 4 }}>{etab.nomCourt}</h3>
        </div>
        <div className="pad">
          {bandeauValidation}
          <div className="statcards inpad two">
            <div className="sc b1">
              <b>{nbMedecins}</b>
              <small>Médecins</small>
            </div>
            <div className="sc b2">
              <b>{stats?.rdvAujourdhui ?? "—"}</b>
              <small>RDV aujourd&apos;hui</small>
            </div>
            <div className="sc b3">
              <b>{stats?.assistants ?? "—"}</b>
              <small>Assistant(e)s</small>
            </div>
            <div className="sc b1">
              <b>{stats?.rdvMois ?? "—"}</b>
              <small>RDV ce mois</small>
            </div>
          </div>
          <div className="card2" style={{ marginTop: 12 }}>
            <h4>Médecins</h4>
            {rattaches.slice(0, 3).map((medecin) => (
              <div key={medecin.id} className="asstrowm">
                <span className="av" aria-hidden style={{ background: medecin.gradient }}>
                  {medecin.initiales}
                </span>
                <span className="meta">
                  <b>{medecin.nom}</b>
                  <small>{medecin.specialite}</small>
                </span>
                <Link href="/espace-etablissement/medecins" className="btnm gh">
                  Voir
                </Link>
              </div>
            ))}
            {nbMedecins === 0 && (
              <p className="muted" style={{ fontSize: 13 }}>
                Aucun médecin rattaché pour l&apos;instant.
              </p>
            )}
            <Link href="/espace-etablissement/medecins" className="btn ghost block">
              {nbMedecins === 0 ? "Inviter un médecin" : "Voir tous les médecins"}
            </Link>
          </div>
          <div className="card2">
            <h4>Prochains RDV · tous médecins</h4>
            {prochains.map((rdv) => {
              const statut = LIBELLES_STATUT[rdv.statut];
              return (
                <div key={rdv.id} className="aptm">
                  <div className="tm">{heureCourte(rdv.heure)}</div>
                  <div className="meta">
                    <b>{rdv.medecinNom}</b>
                    <small>
                      {formatDateCourte(rdv.date)}
                      {rdv.specialite && ` · ${rdv.specialite}`}
                    </small>
                  </div>
                  <div className="acts">
                    <span className={`pill ${statut.pill}`}>{statut.texte}</span>
                  </div>
                </div>
              );
            })}
            {prochains.length === 0 && (
              <p className="muted" style={{ fontSize: 13 }}>
                Aucun rendez-vous à venir.
              </p>
            )}
            <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
              Les noms des patients ne sont pas visibles depuis l&apos;espace établissement.
            </p>
          </div>
          <Link href="/espace-etablissement/statistiques" className="btn ghost block">
            📊 Voir les statistiques
          </Link>
        </div>
      </div>

      {/* ===== Version web ===== */}
      <div className="hidden md:block">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">{etab.nom}</h2>
            <small className="text-[13px] text-muted">Vue d’ensemble de l’établissement</small>
          </div>
          <Link
            href="/espace-etablissement/medecins"
            className="rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
          >
            + Inviter un médecin
          </Link>
        </div>

        {bandeauValidation}

        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-2xl border border-line bg-white p-[18px]">
            <span className="text-lg" aria-hidden>
              👨‍⚕️
            </span>
            <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-blue">
              {nbMedecins}
            </b>
            <small className="text-xs font-semibold text-muted">Médecins actifs</small>
          </div>
          <div className="rounded-2xl border border-line bg-white p-[18px]">
            <span className="text-lg" aria-hidden>
              📅
            </span>
            <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-amber">
              {stats?.rdvAujourdhui ?? "—"}
            </b>
            <small className="text-xs font-semibold text-muted">RDV aujourd’hui</small>
          </div>
          <div className="rounded-2xl border border-line bg-white p-[18px]">
            <span className="text-lg" aria-hidden>
              🧑‍💼
            </span>
            <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-green">
              {stats?.assistants ?? "—"}
            </b>
            <small className="text-xs font-semibold text-muted">Assistant(e)s</small>
          </div>
          <div className="rounded-2xl border border-line bg-white p-[18px]">
            <span className="text-lg" aria-hidden>
              📈
            </span>
            <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-teal">
              {stats?.rdvMois ?? "—"}
            </b>
            <small className="text-xs font-semibold text-muted">RDV ce mois</small>
          </div>
        </div>

        <div className="mb-4 rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-1 text-[15px] font-extrabold">Médecins de l’établissement</h3>
          {rattaches.slice(0, 3).map((medecin) => (
            <div
              key={medecin.id}
              className="flex items-center gap-[13px] border-b border-line py-[14px] last:border-b-0"
            >
              <span
                aria-hidden
                className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl text-sm font-extrabold text-white"
                style={{ background: medecin.gradient }}
              >
                {medecin.initiales}
              </span>
              <div className="flex-1">
                <b className="block text-sm font-extrabold">{medecin.nom}</b>
                <small className="text-xs text-muted">{medecin.specialite}</small>
              </div>
              <span className="rounded-lg bg-green-soft px-[9px] py-1 text-[11px] font-bold text-green">
                Actif
              </span>
            </div>
          ))}
          {nbMedecins === 0 && (
            <p className="py-2 text-[13px] text-muted">
              Aucun médecin rattaché pour l’instant.
            </p>
          )}
          <Link
            href="/espace-etablissement/medecins"
            className="mt-[14px] inline-block rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
          >
            {nbMedecins === 0 ? "Inviter un médecin →" : "Voir tous les médecins →"}
          </Link>
        </div>

        <div className="rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-[14px] text-[15px] font-extrabold">
            Prochains rendez-vous · tous médecins
          </h3>
          {prochains.map((rdv) => {
            const statut = LIBELLES_STATUT[rdv.statut];
            return (
              <div
                key={rdv.id}
                className="mb-[10px] flex flex-wrap items-center gap-3 rounded-xl border border-line p-[13px] last:mb-0"
              >
                <span className="flex-none rounded-[9px] bg-teal-soft px-[11px] py-[9px] text-[13px] font-extrabold text-blue">
                  {heureCourte(rdv.heure)}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block text-[13.5px]">{rdv.medecinNom}</b>
                  <small className="text-xs text-muted">
                    {formatDateCourte(rdv.date)}
                    {rdv.specialite && ` · ${rdv.specialite}`}
                  </small>
                </span>
                <span
                  className={`rounded-lg px-[9px] py-1 text-[11px] font-bold ${statut.classes}`}
                >
                  {statut.texte}
                </span>
              </div>
            );
          })}
          {prochains.length === 0 && (
            <p className="py-2 text-[13px] text-muted">Aucun rendez-vous à venir.</p>
          )}
          <p className="mt-3 text-[11.5px] text-muted">
            Les noms des patients ne sont pas visibles depuis l’espace établissement : un
            rendez-vous appartient au médecin et à son patient.
          </p>
        </div>
      </div>
    </EtablissementShell>
  );
}
