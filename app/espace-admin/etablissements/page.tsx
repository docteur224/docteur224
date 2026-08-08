"use client";

import Link from "next/link";
import AdminShell from "@/components/admin/AdminShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import { useEtablissementsInscrits, type EtablissementInscrit } from "@/lib/admin";

/*
 * Établissements — toutes les structures de la plateforme, lues en base.
 *
 * L'écran affichait quatre structures écrites en dur (Clinique Ambroise Paré,
 * Hôpital Donka, CHU de Conakry, Polyclinique de Ratoma), reprises de la
 * maquette : il ne montrait donc jamais les établissements réellement
 * inscrits, et le compte de médecins y était décoratif.
 *
 * Il porte maintenant le signal de requalification : le palier d'abonnement
 * est figé au type déclaré à l'inscription, quand la structure n'a encore
 * aucun médecin. Une clinique passée à 18 praticiens reste facturée au palier
 * clinique jusqu'à ce que quelqu'un le remarque — d'où le repère ici.
 */

const NOM_PALIER: Record<string, string> = {
  structure: "Structure de proximité",
  cabinet: "Cabinet / plateau technique",
  clinique: "Clinique / centre médical",
  hopital: "Hôpital / centre hospitalier",
};

const DEGRADES = [
  "linear-gradient(135deg,#16A085,#0E6655)",
  "linear-gradient(135deg,#2E9CCA,#15506B)",
  "linear-gradient(135deg,#6C5CE7,#341F97)",
];

/** Teinte stable par structure : la même carte garde sa couleur d'un chargement à l'autre. */
const degrade = (id: string, statut: string) =>
  statut === "valide"
    ? DEGRADES[[...id].reduce((s, c) => s + c.charCodeAt(0), 0) % DEGRADES.length]
    : "linear-gradient(135deg,#9AA8B2,#647A89)";

const palier = (formule: string | null) => (formule ? NOM_PALIER[formule] ?? formule : "sans abonnement");

function detail(e: EtablissementInscrit): string {
  return [e.type, e.ville, `${e.medecins} médecin${e.medecins > 1 ? "s" : ""}`, palier(e.formule)]
    .filter(Boolean)
    .join(" · ");
}

function messageRequalification(e: EtablissementInscrit): string {
  return `${e.medecins} médecins — au-delà du plafond du palier ${palier(e.formule)}. À basculer vers ${palier(e.requalifierVers)}.`;
}

export default function EtablissementsAdmin() {
  const { etablissements } = useEtablissementsInscrits();
  const aRequalifier = etablissements.filter((e) => e.requalifierVers);

  /*
   * Phrase assemblée hors du JSX : « structure{n > 1 ? "s" : ""} à » perdait
   * l'espace au singulier (« 1 structureà requalifier »), et le reste était
   * écrit au pluriel quelle que soit la quantité.
   */
  const n = aRequalifier.length;
  const alerte =
    n > 1
      ? `${n} structures à requalifier : leur effectif dépasse le plafond de leur palier d’abonnement, elles sont donc sous-facturées.`
      : `1 structure à requalifier : son effectif dépasse le plafond de son palier d’abonnement, elle est donc sous-facturée.`;

  return (
    <AdminShell>
      {/* ===== Version mobile (écran « m-admin-etabs » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <EnTeteMobile retour="/espace-admin/plus" titre="Établissements" />
        <div className="pad">
          {aRequalifier.length > 0 && (
            <div className="privnote" style={{ background: "var(--amber-soft)", marginBottom: 12 }}>
              <span aria-hidden>⚠️</span>
              <div>{alerte}</div>
            </div>
          )}
          <div className="card2">
            <h4>Structures inscrites</h4>
            {etablissements.length === 0 && (
              <p className="muted" style={{ fontSize: 12.5, margin: "6px 0" }}>
                Aucune structure inscrite pour l&apos;instant.
              </p>
            )}
            {etablissements.map((e) => (
              <div key={e.id} className="asstrowm">
                <span className="av" aria-hidden style={{ background: degrade(e.id, e.statut) }}>
                  🏥
                </span>
                <span className="meta">
                  <b>{e.nom}</b>
                  <small>{detail(e)}</small>
                  {e.requalifierVers && (
                    <small style={{ color: "var(--amber)", fontWeight: 700 }}>
                      {messageRequalification(e)}
                    </small>
                  )}
                </span>
                {e.statut === "valide" ? (
                  <span className="pill ok">Vérifié</span>
                ) : e.statut === "en_attente" ? (
                  <Link href="/espace-admin/validations" className="pill soon">
                    Attente
                  </Link>
                ) : (
                  <span className="pill">Rejeté</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== Version web ===== */}
      <div className="hidden md:block">
        <div className="mb-5">
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Établissements</h2>
          <small className="text-[13px] text-muted">Toutes les structures de la plateforme</small>
        </div>

        {aRequalifier.length > 0 && (
          <div className="mb-4 flex items-start gap-[9px] rounded-[11px] bg-amber-soft px-[13px] py-[11px] text-[12.5px] font-semibold leading-relaxed text-amber">
            <span aria-hidden>⚠️</span>
            <div>
              {alerte} Les bornes se règlent dans{" "}
              <Link href="/espace-admin/abonnements" className="underline">
                Abonnements
              </Link>
              .
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-1 text-[15px] font-extrabold">Structures inscrites</h3>
          {etablissements.length === 0 && (
            <p className="py-3 text-[13px] text-muted">Aucune structure inscrite pour l&apos;instant.</p>
          )}
          {etablissements.map((e) => (
            <div
              key={e.id}
              className="flex flex-wrap items-center gap-[13px] border-b border-line py-[14px] last:border-b-0"
            >
              <span
                aria-hidden
                className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl text-sm text-white"
                style={{ background: degrade(e.id, e.statut) }}
              >
                🏥
              </span>
              <div className="min-w-0 flex-1">
                <b className="block text-sm font-extrabold">{e.nom}</b>
                <small className="text-xs text-muted">{detail(e)}</small>
                {e.requalifierVers && (
                  <small className="mt-0.5 block text-xs font-bold text-amber">
                    ⚠️ {messageRequalification(e)}
                  </small>
                )}
              </div>
              {e.statut === "valide" ? (
                <span className="rounded-lg bg-green-soft px-[9px] py-1 text-[11px] font-bold text-green">
                  Vérifié
                </span>
              ) : e.statut === "en_attente" ? (
                <>
                  <span className="rounded-lg bg-amber-soft px-[9px] py-1 text-[11px] font-bold text-amber">
                    En attente
                  </span>
                  <Link
                    href="/espace-admin/validations"
                    className="rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue transition-colors hover:bg-bg"
                  >
                    Vérifier
                  </Link>
                </>
              ) : (
                <span className="rounded-lg bg-red-soft px-[9px] py-1 text-[11px] font-bold text-red">
                  Rejeté
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
