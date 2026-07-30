"use client";

import MedecinShell from "@/components/medecin/MedecinShell";
import GrilleDisponibilites from "@/components/pro/GrilleDisponibilites";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import { useContextePro } from "@/lib/pro";

/*
 * Mes disponibilités — reproduit l'écran « med-dispos » de la maquette web :
 * jours d'ouverture (horaires-types réels), grille de créneaux de 30 min
 * (08:00 → 20:00) à 3 états Ouvert / Fermé / Réservé (règle C.4.3 :
 * réservé = verrouillé). Chaque bascule écrit une exception dans la table
 * `creneaux_exceptions`, immédiatement visible côté patient.
 */

const NOMS_COURTS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const NOMS_LONGS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

export default function Disponibilites() {
  const { medecin, chargement } = useContextePro();

  // Horaires-types réels, agrégés par jour (lundi → dimanche)
  const parJour = (jour: number): [string, string] | null => {
    const plages = (medecin?.plages ?? []).filter((p) => p.jour_semaine === jour);
    if (plages.length === 0) return null;
    const debuts = plages.map((p) => p.heure_debut.slice(0, 5)).sort();
    const fins = plages.map((p) => p.heure_fin.slice(0, 5)).sort();
    return [debuts[0], fins[fins.length - 1]];
  };
  const ordreJours = [1, 2, 3, 4, 5, 6, 0];
  const JOURS_OUVERTURE = ordreJours.map((j) => ({ jour: NOMS_COURTS[j], heures: parJour(j) }));
  const JOURS_SEMAINE_LONGS = ordreJours.map((j) => ({ jour: NOMS_LONGS[j], heures: parJour(j) }));

  if (chargement) {
    return (
      <MedecinShell>
        <p className="p-6 text-[13px] text-muted">Chargement…</p>
      </MedecinShell>
    );
  }

  if (!medecin) {
    // Connecté mais sans profil médecin accessible (le shell redirige les
    // non-professionnels vers /connexion ; ce message couvre le cas restant).
    return (
      <MedecinShell>
        <p className="p-6 text-[13px] text-muted">
          Profil médecin introuvable. Reconnectez-vous avec un compte professionnel.
        </p>
      </MedecinShell>
    );
  }

  return (
    <MedecinShell>
      {/* ===== Version mobile (écran « m-med-dispos » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <EnTeteMobile retour="/espace-medecin/compte" titre="Mes disponibilités" />
        <div className="pad">
          <div className="card2">
            <h4>Horaires de la semaine</h4>
            <div className="weekm">
              {JOURS_SEMAINE_LONGS.map((j) => (
                <div key={j.jour} className={`wdm${j.heures === null ? " closed" : ""}`}>
                  <b>{j.jour}</b>
                  <span className="h">
                    {j.heures === null ? "Fermé" : `${j.heures[0]} – ${j.heures[1]}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <GrilleDisponibilites medecinId={medecin.id} peutModifier />
          <div className="card2" style={{ marginTop: 12 }}>
            <h4>Congés et absences</h4>
            <div className="setrow">
              <div>
                <b>Vacances annuelles</b>
                <small>1 – 15 août 2026</small>
              </div>
              <span className="pill soon">Programmé</span>
            </div>
            <div className="setrow">
              <div>
                <b>Jour de congé</b>
                <small>Chaque dimanche</small>
              </div>
              <span className="pill ok">Récurrent</span>
            </div>
          </div>
          <button
            type="button"
            className="btn ghost block"
            disabled
            title="Disponible dans une phase ultérieure"
            style={{ opacity: 0.5, cursor: "not-allowed" }}
          >
            + Ajouter une absence
          </button>
        </div>
      </div>

      {/* ===== Version web (inchangée) ===== */}
      <div className="hidden md:block">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Mes disponibilités</h2>
          <small className="text-[13px] text-muted">
            Ouvrez ou fermez vos créneaux de consultation
          </small>
        </div>
        <span className="text-[12.5px] font-bold text-green">
          ✓ Modifications enregistrées automatiquement
        </span>
      </div>

      {/* Jours d'ouverture (horaire-type hebdomadaire) */}
      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-[14px] text-[15px] font-extrabold">Jours d’ouverture</h3>
        <div className="grid grid-cols-4 gap-[10px] sm:grid-cols-7">
          {JOURS_OUVERTURE.map((j) => (
            <div
              key={j.jour}
              className={`rounded-[13px] border border-line bg-white px-2 py-3 text-center ${
                j.heures === null ? "opacity-55" : ""
              }`}
            >
              <b className="mb-[9px] block text-[12.5px] font-extrabold">{j.jour}</b>
              {j.heures === null ? (
                <span className="text-[11px] text-muted">Fermé</span>
              ) : (
                j.heures.map((h) => (
                  <div
                    key={h}
                    className="mb-[5px] rounded-[7px] bg-teal-soft py-[5px] text-[11px] font-bold text-blue"
                  >
                    {h}
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Grille de créneaux partagée (le médecin a tous les droits) */}
      <div className="mb-4">
        <GrilleDisponibilites medecinId={medecin.id} peutModifier />
      </div>

      {/* Congés et absences (démonstration) */}
      <div className="rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">Congés et absences</h3>
        <div className="flex items-center justify-between gap-[14px] border-b border-line py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">Vacances annuelles</b>
            <small className="text-xs text-muted">Du 1 au 15 août 2026</small>
          </div>
          <span className="rounded-lg bg-amber-soft px-[9px] py-1 text-[11px] font-bold text-amber">
            Programmé
          </span>
        </div>
        <div className="flex items-center justify-between gap-[14px] py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">Jour de congé</b>
            <small className="text-xs text-muted">Chaque dimanche</small>
          </div>
          <span className="rounded-lg bg-green-soft px-[9px] py-1 text-[11px] font-bold text-green">
            Récurrent
          </span>
        </div>
        <button
          type="button"
          disabled
          title="Disponible dans une phase ultérieure"
          className="mt-[14px] cursor-not-allowed rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue opacity-50"
        >
          + Ajouter une absence
        </button>
      </div>
      </div>
    </MedecinShell>
  );
}
