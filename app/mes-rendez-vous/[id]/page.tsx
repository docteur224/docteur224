"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import PatientShell from "@/components/patient/PatientShell";
import AppBarMobile from "@/components/mobile/AppBarMobile";
import { capitaliser, depuisISO, formatDateLongue, MOIS_ABREGES, versISO } from "@/lib/dates";
import { formatGNF } from "@/lib/format";
import {
  construireICS,
  DUREE_CONSULTATION_MINUTES,
  formatTelephone,
  lienCarte,
  numeroComposable,
  telechargerICS,
} from "@/lib/rdv-utils";
import { annulerRendezVous, useRendezVous, type DetailRendezVous } from "@/lib/patient";

/*
 * Détail d'un rendez-vous — ouvert depuis une carte de /mes-rendez-vous.
 * Reprend l'organisation d'une fiche de rendez-vous : statut, praticien,
 * patient concerné, motif, lieu de consultation (téléphone + carte), tarif,
 * puis les actions. Web et mobile, comme le reste de l'espace patient.
 */

const LIBELLES_STATUT: Record<DetailRendezVous["statut"], string> = {
  en_attente: "En attente",
  confirme: "Confirmé",
  annule: "Annulé",
  honore: "Honoré",
};

/** Classes de la pastille de statut, version web. */
const TONS_STATUT: Record<DetailRendezVous["statut"], string> = {
  en_attente: "bg-amber-soft text-amber",
  confirme: "bg-green-soft text-green",
  annule: "bg-red-soft text-red",
  honore: "bg-teal-soft text-blue",
};

/** Classes de la pastille de statut, version mobile (.badge de la maquette). */
const BADGES_MOBILE: Record<DetailRendezVous["statut"], string> = {
  en_attente: "wait",
  confirme: "ok",
  annule: "no",
  honore: "ok",
};

export default function DetailRdv() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { rdv, chargement, recharger } = useRendezVous(id);

  if (chargement) {
    return (
      <PatientShell>
        <div className="md:hidden">
          <AppBarMobile retour="/mes-rendez-vous" titre="Rendez-vous" />
        </div>
        <div className="pad pt-4 md:pt-0">
          <div className="rounded-2xl border border-line bg-white p-8 text-center text-[13px] text-muted">
            Chargement du rendez-vous…
          </div>
        </div>
      </PatientShell>
    );
  }

  if (!rdv) {
    return (
      <PatientShell>
        <div className="md:hidden">
          <AppBarMobile retour="/mes-rendez-vous" titre="Rendez-vous" />
        </div>
        <div className="pad pt-4 md:pt-0">
          <div className="rounded-2xl border border-line bg-white p-8 text-center">
            <div className="text-3xl" aria-hidden>
              🔍
            </div>
            <b className="mt-3 block text-base font-extrabold">Rendez-vous introuvable</b>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              Ce rendez-vous n’existe plus ou ne fait pas partie de vos rendez-vous.
            </p>
            <Link
              href="/mes-rendez-vous"
              className="mt-4 inline-block rounded-[11px] bg-teal px-[18px] py-[11px] text-[13.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
            >
              Retour à mes rendez-vous
            </Link>
          </div>
        </div>
      </PatientShell>
    );
  }

  const d = depuisISO(rdv.date);
  const annule = rdv.statut === "annule";
  const passe = rdv.date < versISO(new Date());
  const modifiable = !annule && !passe;
  const adresseComplete = [rdv.adresse, rdv.quartier, rdv.ville].filter(Boolean).join(", ");
  const carte = lienCarte({
    localisation: rdv.localisation,
    etablissementNom: rdv.etablissementNom,
    adresse: rdv.adresse,
    quartier: rdv.quartier,
    ville: rdv.ville,
  });
  const tel = numeroComposable(rdv.telephone);

  async function annuler() {
    if (!rdv) return;
    if (window.confirm("Voulez-vous vraiment annuler ce rendez-vous ?")) {
      await annulerRendezVous(rdv.id);
      recharger();
    }
  }

  function ajouterAAgenda() {
    if (!rdv) return;
    telechargerICS(
      `rdv-docteur224-${rdv.date}.ics`,
      construireICS({
        id: rdv.id,
        date: rdv.date,
        heure: rdv.heure,
        titre: `Consultation — ${rdv.medecinNom}`,
        lieu: [rdv.etablissementNom, adresseComplete].filter(Boolean).join(", "),
        description: [
          `${rdv.specialite} · ${rdv.medecinNom}`,
          rdv.motif ? `Motif : ${rdv.motif}` : "",
          `Patient : ${rdv.pourQui}`,
          rdv.telephone ? `Téléphone : ${rdv.telephone}` : "",
          "Rendez-vous pris sur Docteur 224.",
        ]
          .filter(Boolean)
          .join("\n"),
      })
    );
  }

  /* ----- Fragments partagés entre les deux versions ----- */

  const lignesLieu = (
    <>
      {rdv.etablissementType && (
        <div className="text-[12.5px] text-muted">{rdv.etablissementType}</div>
      )}
      {adresseComplete && <div className="text-[13px]">{adresseComplete}</div>}
    </>
  );

  return (
    <PatientShell>
      {/* ===================== VERSION MOBILE ===================== */}
      <div className="md:hidden">
        <div style={{ paddingBottom: 6 }}>
          <AppBarMobile
            retour="/mes-rendez-vous"
            titre="Rendez-vous"
            sousTitre={`${d.getDate()} ${MOIS_ABREGES[d.getMonth()].toLowerCase()} · ${rdv.heure}`}
          />
        </div>

        <div className="pad" style={{ paddingTop: 12 }}>
          {/* Bandeau date + statut */}
          <div className="appt">
            <div className="top">
              <div className="when">
                <b>{d.getDate()}</b>
                <small>{MOIS_ABREGES[d.getMonth()]}</small>
              </div>
              <div className="who" style={{ flex: 1 }}>
                <b>{rdv.medecinNom}</b>
                <small>
                  {rdv.specialite} · {rdv.heure}
                </small>
              </div>
              <span className={`badge ${BADGES_MOBILE[rdv.statut]}`}>
                {LIBELLES_STATUT[rdv.statut]}
              </span>
            </div>
            <div className="hr" />
            <div className="det">📅 {capitaliser(formatDateLongue(rdv.date))}</div>
            <div className="det">
              🕐 {rdv.heure} · durée estimée {DUREE_CONSULTATION_MINUTES} min
            </div>
            <div className="acts">
              <Link href={`/medecin/${rdv.medecinId}`}>Voir la fiche du médecin</Link>
            </div>
          </div>

          {/* Patient concerné */}
          <div className="appt">
            <b style={{ fontSize: 14, fontWeight: 800, display: "block", marginBottom: 10 }}>
              Patient
            </b>
            <div className="det">👤 {rdv.pourQui}</div>
            {rdv.motif && <div className="det">📝 Motif : {rdv.motif}</div>}
          </div>

          {/* Lieu de consultation */}
          <div className="appt">
            <b style={{ fontSize: 14, fontWeight: 800, display: "block", marginBottom: 10 }}>
              Détails de l’établissement
            </b>
            {rdv.telephone && (
              <>
                <div className="det">📞 Téléphone du lieu de consultation</div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
                  {formatTelephone(rdv.telephone)}
                </div>
                <a className="btn ghost" href={`tel:${tel}`} style={{ marginBottom: 12 }}>
                  📞 Appeler l’établissement
                </a>
              </>
            )}
            <div className="det">📍 Se rendre à la consultation</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{rdv.etablissementNom}</div>
            <div style={{ marginTop: 2 }}>{lignesLieu}</div>
            {carte && (
              <a
                className="btn ghost"
                href={carte}
                target="_blank"
                rel="noopener noreferrer"
                style={{ marginTop: 12 }}
              >
                📍 Ouvrir la carte
              </a>
            )}
          </div>

          {/* Tarif */}
          {rdv.tarif > 0 && (
            <div className="appt">
              <b style={{ fontSize: 14, fontWeight: 800, display: "block", marginBottom: 10 }}>
                Tarif de la consultation
              </b>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{formatGNF(rdv.tarif)}</div>
              <div className="det" style={{ marginTop: 6 }}>
                💵 À régler sur place — la réservation est gratuite
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
            <button type="button" className="btn ghost" onClick={ajouterAAgenda}>
              🗓️ Ajouter à mon agenda
            </button>
            {modifiable && (
              <>
                <Link className="btn ghost" href={`/medecin/${rdv.medecinId}`}>
                  Modifier le rendez-vous
                </Link>
                <button
                  type="button"
                  className="btn ghost"
                  style={{ color: "var(--red)", borderColor: "var(--red-soft)" }}
                  onClick={annuler}
                >
                  Annuler le rendez-vous
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ===================== VERSION WEB ===================== */}
      <div className="hidden md:block">
        <button
          type="button"
          onClick={() => router.push("/mes-rendez-vous")}
          className="mb-4 text-[13px] font-bold text-muted transition-colors hover:text-blue"
        >
          ← Mes rendez-vous
        </button>

        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">
              Rendez-vous du {formatDateLongue(rdv.date)}
            </h2>
            <small className="text-[13px] text-muted">
              {rdv.heure} · {rdv.specialite} · durée estimée {DUREE_CONSULTATION_MINUTES} min
            </small>
          </div>
          <span
            className={`rounded-lg px-[10px] py-[5px] text-[10.5px] font-extrabold uppercase tracking-[.03em] ${TONS_STATUT[rdv.statut]}`}
          >
            {LIBELLES_STATUT[rdv.statut]}
          </span>
        </div>

        <div className="grid gap-[14px] lg:grid-cols-[1fr_320px]">
          <div className="flex flex-col gap-[14px]">
            {/* Praticien */}
            <section className="rounded-2xl border border-line bg-white p-[18px]">
              <div className="flex items-center gap-[18px]">
                <div className="rounded-[13px] bg-teal-soft px-4 py-3 text-center">
                  <b className="block text-[22px] font-extrabold leading-none text-blue">
                    {d.getDate()}
                  </b>
                  <small className="text-[10px] font-bold uppercase text-blue">
                    {MOIS_ABREGES[d.getMonth()]}
                  </small>
                </div>
                <div>
                  <b className="block text-[15px] font-extrabold">{rdv.medecinNom}</b>
                  <div className="mt-1 text-[12.5px] text-muted">
                    🩺 {rdv.specialite} · {rdv.heure}
                  </div>
                  <Link
                    href={`/medecin/${rdv.medecinId}`}
                    className="mt-2 inline-block text-[12.5px] font-bold text-teal hover:underline"
                  >
                    Voir la fiche du médecin →
                  </Link>
                </div>
              </div>
            </section>

            {/* Patient */}
            <section className="rounded-2xl border border-line bg-white p-[18px]">
              <b className="mb-3 block text-[14px] font-extrabold">Patient</b>
              <div className="text-[13px]">👤 {rdv.pourQui}</div>
              {rdv.motif && (
                <div className="mt-2 text-[13px] text-muted">📝 Motif : {rdv.motif}</div>
              )}
            </section>

            {/* Établissement */}
            <section className="rounded-2xl border border-line bg-white p-[18px]">
              <b className="mb-3 block text-[14px] font-extrabold">
                Détails de l’établissement de santé
              </b>

              {rdv.telephone && (
                <div className="mb-4 border-b border-line pb-4">
                  <div className="text-[12.5px] font-bold text-muted">
                    📞 Téléphone du lieu de consultation
                  </div>
                  <div className="mt-1 text-[15px] font-bold">{formatTelephone(rdv.telephone)}</div>
                  <a
                    href={`tel:${tel}`}
                    className="mt-2 inline-block rounded-[10px] border-[1.5px] border-line bg-white px-[15px] py-[9px] text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
                  >
                    📞 Appeler l’établissement
                  </a>
                </div>
              )}

              <div className="text-[12.5px] font-bold text-muted">📍 Se rendre à la consultation</div>
              <div className="mt-1 text-[14px] font-bold">{rdv.etablissementNom}</div>
              <div className="mt-0.5">{lignesLieu}</div>
              {carte && (
                <a
                  href={carte}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block rounded-[10px] border-[1.5px] border-line bg-white px-[15px] py-[9px] text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
                >
                  📍 Ouvrir la carte
                </a>
              )}
            </section>
          </div>

          {/* Colonne latérale : tarif + actions */}
          <aside className="flex flex-col gap-[14px]">
            {rdv.tarif > 0 && (
              <section className="rounded-2xl border border-line bg-white p-[18px]">
                <b className="mb-2 block text-[14px] font-extrabold">Tarif de la consultation</b>
                <div className="text-[22px] font-extrabold text-blue">{formatGNF(rdv.tarif)}</div>
                <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
                  💵 À régler sur place. La réservation en ligne est gratuite.
                </p>
              </section>
            )}

            <section className="rounded-2xl border border-line bg-white p-[18px]">
              <b className="mb-3 block text-[14px] font-extrabold">Actions</b>
              <div className="flex flex-col gap-[9px]">
                <button
                  type="button"
                  onClick={ajouterAAgenda}
                  className="rounded-[10px] border-[1.5px] border-line bg-white px-[15px] py-[10px] text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
                >
                  🗓️ Ajouter à mon agenda
                </button>
                {modifiable ? (
                  <>
                    <Link
                      href={`/medecin/${rdv.medecinId}`}
                      className="rounded-[10px] border-[1.5px] border-line bg-white px-[15px] py-[10px] text-center text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
                    >
                      Modifier le rendez-vous
                    </Link>
                    <button
                      type="button"
                      onClick={annuler}
                      className="rounded-[10px] border-[1.5px] border-red-soft bg-white px-[15px] py-[10px] text-[12.5px] font-bold text-red transition-colors hover:bg-red-soft"
                    >
                      Annuler le rendez-vous
                    </button>
                  </>
                ) : (
                  <p className="text-[12.5px] leading-relaxed text-muted">
                    {annule
                      ? "Ce rendez-vous a été annulé."
                      : "Ce rendez-vous est passé. Réservez-en un nouveau depuis la recherche."}
                  </p>
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </PatientShell>
  );
}
