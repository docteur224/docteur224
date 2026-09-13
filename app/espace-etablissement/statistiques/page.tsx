"use client";

import EtablissementShell from "@/components/etablissement/EtablissementShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import {
  formatTaux,
  libelleMois,
  useEtablissementConnecte,
  useMedecinsRattaches,
  useStatistiquesEtablissement,
} from "@/lib/etablissement";

/*
 * Statistiques — reproduit l'écran « etab-stats » de la maquette web :
 * 4 indicateurs consolidés, graphique « Rendez-vous par mois · tous
 * médecins », classement des médecins par activité.
 *
 * AUDIT : tout était faux. « 486 RDV ce mois », « 78 % d'occupation »,
 * « 5 % d'annulation » et six barres de hauteurs fixes, identiques pour
 * tous les établissements. Pire, le classement par médecin s'appuyait
 * sur `rdvSemaine`, que lib/etablissement mettait à 0 pour tout le
 * monde : les barres étaient donc toutes vides et chaque médecin
 * affichait « 0 RDV ». Les chiffres viennent maintenant de
 * `statistiques_etablissement` (migration 0054).
 *
 * Le taux d'occupation ne revient pas : il demanderait de régénérer les
 * créneaux théoriques de chaque médecin (horaires, exceptions, absences)
 * pour les comparer aux réservations. Le taux d'honorés, lui, se lit
 * directement dans le statut des rendez-vous.
 *
 * Le sélecteur « Ce mois ⌄ » était un <span> maquillé en menu : rien ne
 * s'ouvrait au clic. Les indicateurs portant chacun leur propre période
 * (aujourd'hui, la semaine, le mois, l'historique), le faux menu est
 * remplacé par la mention de la période réellement couverte.
 */

export default function StatistiquesEtablissement() {
  const { etablissement, chargement: chargementFiche } = useEtablissementConnecte();
  const { rattaches } = useMedecinsRattaches(etablissement?.id);
  const { stats, chargement, erreur } = useStatistiquesEtablissement(etablissement?.id);

  const rdvDe = (id: string) => stats?.parMedecin[id] ?? 0;
  const classement = [...rattaches].sort((a, b) => rdvDe(b.id) - rdvDe(a.id));
  const maxRdv = Math.max(1, ...classement.map((m) => rdvDe(m.id)));

  // Les barres sont relatives au mois le plus chargé de la fenêtre ; un
  // dénominateur nul (aucun rendez-vous du tout) donnerait NaN.
  const parMois = stats?.parMois ?? [];
  const maxMois = Math.max(1, ...parMois.map((m) => m.total));

  /*
   * Sans établissement, le hook de statistiques ne part jamais et son
   * `chargement` resterait à true : l'écran aurait annoncé « Chargement… »
   * indéfiniment au lieu de dire ce qui se passe.
   */
  const messageEtat =
    !chargementFiche && !etablissement
      ? "Ce compte n’est gestionnaire d’aucun établissement."
      : erreur
        ? `Statistiques indisponibles : ${erreur}`
        : chargement
          ? "Chargement des statistiques…"
          : null;

  return (
    <EtablissementShell>
      {/* ===== Version mobile (écran « m-etab-stats » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <EnTeteMobile retour="/espace-etablissement/compte" titre="Statistiques" />
        <div className="pad">
          <div className="statcards inpad two">
            <div className="sc b1">
              <b>{stats?.rdvMois ?? "—"}</b>
              <small>RDV ce mois</small>
            </div>
            <div className="sc b2">
              <b>{rattaches.length}</b>
              <small>Médecins actifs</small>
            </div>
            <div className="sc b3">
              <b>{formatTaux(stats?.tauxHonores)}</b>
              <small>Honorés</small>
            </div>
            <div className="sc b1">
              <b>{formatTaux(stats?.tauxAnnulation)}</b>
              <small>Annulation</small>
            </div>
          </div>
          <div className="card2" style={{ marginTop: 12 }}>
            <h4>RDV par mois</h4>
            <div className="bars">
              {parMois.map((mois) => (
                <div key={mois.mois} className="b">
                  <div
                    className="bar"
                    style={{ height: `${Math.round((mois.total / maxMois) * 100)}%` }}
                    title={`${mois.total} RDV`}
                  />
                  <small>{libelleMois(mois.mois)}</small>
                </div>
              ))}
            </div>
          </div>
          <div className="card2">
            <h4>Médecins les plus consultés · cette semaine</h4>
            {classement.map((medecin) => (
              <div key={medecin.id} className="asstrowm">
                <span className="av" aria-hidden style={{ background: medecin.gradient }}>
                  {medecin.initiales}
                </span>
                <span className="meta">
                  <b>{medecin.nom}</b>
                  <small>
                    {medecin.specialite} · {rdvDe(medecin.id)} RDV
                  </small>
                </span>
                <span className="budget" style={{ width: 70, flex: "none" }}>
                  <span style={{ width: `${(rdvDe(medecin.id) / maxRdv) * 100}%` }} />
                </span>
              </div>
            ))}
            {classement.length === 0 && (
              <p className="muted" style={{ fontSize: 13 }}>
                Aucun médecin rattaché.
              </p>
            )}
          </div>
          {messageEtat && (
            <p className="muted" style={{ fontSize: 11.5 }}>
              {messageEtat}
            </p>
          )}
        </div>
      </div>

      {/* ===== Version web ===== */}
      <div className="hidden md:block">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Statistiques</h2>
            <small className="text-[13px] text-muted">
              Activité consolidée de tous les médecins rattachés
            </small>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-2xl border border-line bg-white p-[18px]">
            <span className="text-lg" aria-hidden>
              📅
            </span>
            <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-blue">
              {stats?.rdvMois ?? "—"}
            </b>
            <small className="text-xs font-semibold text-muted">RDV ce mois</small>
          </div>
          <div className="rounded-2xl border border-line bg-white p-[18px]">
            <span className="text-lg" aria-hidden>
              👨‍⚕️
            </span>
            <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-teal">
              {rattaches.length}
            </b>
            <small className="text-xs font-semibold text-muted">Médecins actifs</small>
          </div>
          <div className="rounded-2xl border border-line bg-white p-[18px]">
            <span className="text-lg" aria-hidden>
              ✅
            </span>
            <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-green">
              {formatTaux(stats?.tauxHonores)}
            </b>
            <small className="text-xs font-semibold text-muted">
              Taux d’honorés · rendez-vous passés
            </small>
          </div>
          <div className="rounded-2xl border border-line bg-white p-[18px]">
            <span className="text-lg" aria-hidden>
              ✕
            </span>
            <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-amber">
              {formatTaux(stats?.tauxAnnulation)}
            </b>
            <small className="text-xs font-semibold text-muted">
              Taux d’annulation · depuis l’ouverture
            </small>
          </div>
        </div>

        <div className="mb-4 rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-[14px] text-[15px] font-extrabold">
            Rendez-vous par mois · tous médecins
          </h3>
          <div className="flex h-[180px] items-end gap-[14px] px-1 pt-[10px]">
            {parMois.map((mois) => (
              <div
                key={mois.mois}
                className="flex h-full flex-1 flex-col items-center justify-end gap-2"
              >
                <b className="text-[11px] font-extrabold text-blue">{mois.total}</b>
                <div
                  className="w-full max-w-[46px] rounded-t-lg bg-[linear-gradient(180deg,var(--teal),var(--blue))]"
                  style={{ height: `${Math.round((mois.total / maxMois) * 100)}%` }}
                />
                <small className="text-[11px] font-bold text-muted">
                  {libelleMois(mois.mois)}
                </small>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11.5px] text-muted">Six derniers mois.</p>
        </div>

        <div className="rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-1 text-[15px] font-extrabold">Activité par médecin · cette semaine</h3>
          {classement.map((medecin) => (
            <div
              key={medecin.id}
              className="flex items-center gap-[13px] border-b border-line py-[14px] last:border-b-0"
            >
              <span
                aria-hidden
                className="grid h-[36px] w-[36px] flex-none place-items-center rounded-[10px] text-xs font-extrabold text-white"
                style={{ background: medecin.gradient }}
              >
                {medecin.initiales}
              </span>
              <div className="w-[190px] min-w-0 flex-none">
                <b className="block truncate text-[13px] font-extrabold">{medecin.nom}</b>
                <small className="text-[11.5px] text-muted">{medecin.specialite}</small>
              </div>
              <div className="h-[10px] flex-1 overflow-hidden rounded-full bg-bg">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,var(--teal),var(--blue))]"
                  style={{ width: `${(rdvDe(medecin.id) / maxRdv) * 100}%` }}
                />
              </div>
              <b className="w-14 flex-none text-right text-[13px] font-extrabold text-blue">
                {rdvDe(medecin.id)} RDV
              </b>
            </div>
          ))}
          {classement.length === 0 && (
            <p className="py-2 text-[13px] text-muted">
              Aucun médecin rattaché : invitez un médecin pour voir apparaître son activité.
            </p>
          )}
          {messageEtat && <p className="mt-3 text-[11.5px] text-muted">{messageEtat}</p>}
        </div>
      </div>
    </EtablissementShell>
  );
}
