"use client";

import Link from "next/link";
import EtablissementShell from "@/components/etablissement/EtablissementShell";
import AppBarMobile from "@/components/mobile/AppBarMobile";
import { PALIERS, palierPour, useEtablissementConnecte, useMedecinsRattaches } from "@/lib/etablissement";

/*
 * Abonnement — reproduit l'écran « etab-abonnement » de la maquette web
 * (spec C.6.1 / C.10.2) : paliers Cabinet / Clinique / Hôpital selon le
 * nombre de médecins rattachés. Le palier courant est calculé en direct :
 * il change tout seul quand un médecin rejoint ou quitte l'établissement.
 */

const DETAILS_PALIERS: Record<string, string[]> = {
  Cabinet: ["Fiche établissement publique", "Jusqu’à 3 médecins rattachés", "Statistiques de base"],
  Clinique: [
    "Tout le palier Cabinet",
    "De 4 à 15 médecins rattachés",
    "Statistiques consolidées",
    "Tarif dégressif par médecin",
  ],
  "Hôpital / Grand centre": [
    "Tout le palier Clinique",
    "16 médecins et plus",
    "Accompagnement dédié",
    "Facturation sur devis",
  ],
};

export default function AbonnementEtablissement() {
  const { etablissement } = useEtablissementConnecte();
  const { rattaches } = useMedecinsRattaches(etablissement?.id);
  const palierActuel = palierPour(rattaches.length);

  return (
    <EtablissementShell>
      {/* ===== Version mobile (écran « m-etab-abonnement » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <AppBarMobile retour="/espace-etablissement/compte" titre="Abonnement" />
        <div className="pad">
          <div className="card2">
            <h4>Plan actuel</h4>
            <div className="setrow">
              <div>
                <b>
                  Palier {palierActuel.nom} · {rattaches.length} médecin
                  {rattaches.length > 1 ? "s" : ""}
                </b>
                <small>{palierActuel.tarif} · actif jusqu&apos;au 30 juin 2026</small>
              </div>
              <span className="pill ok">Actif</span>
            </div>
            <div className="privnote info">
              <span aria-hidden>ℹ️</span>
              <div>
                Le palier s&apos;ajuste <b>automatiquement</b> au nombre de médecins rattachés. La
                prise de RDV reste <b>gratuite pour les patients</b>.
              </div>
            </div>
          </div>
          <div className="card2">
            <h4>Paliers</h4>
            <table className="atab">
              <thead>
                <tr>
                  <th>Palier</th>
                  <th>Médecins</th>
                  <th>Tarif</th>
                </tr>
              </thead>
              <tbody>
                {PALIERS.map((palier) => {
                  const actuel = palier.nom === palierActuel.nom;
                  return (
                    <tr key={palier.nom}>
                      <td>{actuel ? <b>{palier.nom}</b> : palier.nom}</td>
                      <td>{palier.medecins}</td>
                      <td>{actuel ? <span className="pill ok">Actuel</span> : palier.tarif}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
              Tarifs indicatifs de démonstration. Invitez ou retirez des médecins depuis{" "}
              <Link href="/espace-etablissement/medecins" style={{ color: "var(--teal)", fontWeight: 700 }}>
                Médecins
              </Link>
              .
            </p>
          </div>
        </div>
      </div>

      {/* ===== Version web (inchangée) ===== */}
      <div className="hidden md:block">
      <div className="mb-5">
        <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Abonnement</h2>
        <small className="text-[13px] text-muted">
          Votre palier suit le nombre de médecins rattachés
        </small>
      </div>

      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">Palier actuel</h3>
        <div className="flex items-center justify-between gap-[14px] py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">
              Palier {palierActuel.nom} · {rattaches.length} médecin
              {rattaches.length > 1 ? "s" : ""} rattaché{rattaches.length > 1 ? "s" : ""}
            </b>
            <small className="text-xs text-muted">
              {palierActuel.tarif} · actif jusqu’au 30 juin 2026 · paiement Orange Money
              (démonstration)
            </small>
          </div>
          <span className="rounded-lg bg-green-soft px-[9px] py-1 text-[11px] font-bold text-green">
            Actif
          </span>
        </div>
        <div className="flex items-start gap-[9px] rounded-xl bg-teal-soft px-[14px] py-3 text-[12.5px] font-semibold leading-relaxed text-blue">
          <span aria-hidden>ℹ️</span>
          <div>
            Le palier s’ajuste <b>automatiquement</b> au nombre de médecins rattachés — invitez ou
            retirez des médecins depuis l’onglet{" "}
            <Link href="/espace-etablissement/medecins" className="font-bold text-teal">
              Médecins
            </Link>
            . La prise de rendez-vous reste <b>gratuite pour les patients</b>.
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-[14px] text-[15px] font-extrabold">Les paliers</h3>
        <div className="grid gap-[14px] md:grid-cols-3">
          {PALIERS.map((palier) => {
            const actuel = palier.nom === palierActuel.nom;
            return (
              <div
                key={palier.nom}
                className={`relative rounded-[14px] border-[1.5px] p-4 ${
                  actuel ? "border-teal shadow-[0_0_0_3px_var(--teal-soft)]" : "border-line"
                }`}
              >
                {actuel && (
                  <span className="absolute -top-[10px] right-[14px] rounded-full bg-teal px-[10px] py-[3px] text-[10.5px] font-extrabold text-white">
                    Actuel
                  </span>
                )}
                <h4 className="text-[15px] font-extrabold">{palier.nom}</h4>
                <div className="my-1.5 text-[13px] font-extrabold text-blue">
                  {palier.medecins} médecins
                  <span className="block text-xs font-semibold text-muted">{palier.tarif}</span>
                </div>
                <ul className="mt-2">
                  {(DETAILS_PALIERS[palier.nom] ?? []).map((avantage) => (
                    <li key={avantage} className="relative py-1 pl-5 text-[12.5px]">
                      <span className="absolute left-0 font-extrabold text-green" aria-hidden>
                        ✓
                      </span>
                      {avantage}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <p className="mt-[14px] text-[11.5px] text-muted">
          Tarifs indicatifs de démonstration — la grille tarifaire définitive et le paiement
          mobile money seront branchés avec la base de données.
        </p>
      </div>
      </div>
    </EtablissementShell>
  );
}
