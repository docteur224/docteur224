"use client";

import Link from "next/link";
import EtablissementShell from "@/components/etablissement/EtablissementShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import {
  DETAILS_PALIERS,
  NOMS_PALIERS,
  libelleTaille,
  useEtablissementConnecte,
  useMedecinsRattaches,
} from "@/lib/etablissement";
import { useAbonnement } from "@/lib/pro";
import { formatGNF } from "@/lib/format";
import { formatDateLongue } from "@/lib/dates";

/*
 * Abonnement — le palier de l'établissement (spec C.6.1 / C.10.2).
 *
 * AUDIT : cet écran décrivait une grille tarifaire qui n'existait nulle
 * part. Trois paliers écrits en dur (« Cabinet 1–3 », « Clinique 4–15 »,
 * « Hôpital 16+ »), des tarifs en toutes lettres (« Tarif individuel »,
 * « Sur devis »), et une échéance inventée : « actif jusqu'au 30 juin
 * 2026 · paiement Orange Money (démonstration) », la même date pour tout
 * le monde.
 *
 * Plus grave, le « palier actuel » était DEVINÉ à partir du nombre de
 * médecins rattachés, alors que ce qui est facturé est la formule de la
 * table `abonnements`. Les deux n'ont aucune raison de coïncider : une
 * clinique de deux médecins lisait « Palier Cabinet · Actuel ».
 *
 * Tout vient maintenant de la base : la formule, le statut et l'échéance
 * de `abonnements`, les prix, quotas et tailles de `tarifs_plateforme`
 * (les mêmes que règle /espace-admin/abonnements).
 *
 * Le palier ne « s'ajuste » d'ailleurs pas tout seul, contrairement à ce
 * que l'écran répétait deux fois : c'est l'administration qui requalifie
 * une structure devenue trop grande (lib/admin → requalifierVers). Quand
 * la taille dépasse le palier, on le dit — au lieu de laisser croire à
 * une bascule automatique qui n'arrivera jamais.
 */

export default function AbonnementEtablissement() {
  const { etablissement } = useEtablissementConnecte();
  const { rattaches } = useMedecinsRattaches(etablissement?.id);
  const { abonnement, tarifs } = useAbonnement();

  // Les paliers de structure sont ceux qui portent une taille ; standard
  // et premium sont les formules individuelles des médecins.
  const paliers = tarifs
    .filter((t) => t.medecinsMin !== null || t.medecinsMax !== null)
    .sort((a, b) => (a.prixMensuel ?? 0) - (b.prixMensuel ?? 0));

  const courant = paliers.find((p) => p.formule === abonnement?.formule) ?? null;
  const annuel = abonnement?.periode === "annuel";
  const nb = rattaches.length;

  // Même règle que l'écran admin : on ne parle de requalification que si
  // la taille dépasse le plafond du palier courant.
  const depasse =
    courant !== null && courant.medecinsMax !== null && nb > courant.medecinsMax;
  const palierConseille = depasse
    ? paliers.find(
        (p) =>
          (p.medecinsMin === null || nb >= p.medecinsMin) &&
          (p.medecinsMax === null || nb <= p.medecinsMax)
      )
    : null;

  const nomCourant = courant ? (NOMS_PALIERS[courant.formule] ?? courant.formule) : null;
  const prixCourant = courant
    ? `${formatGNF(annuel ? courant.prixAnnuel : courant.prixMensuel)} / ${annuel ? "an" : "mois"}`
    : null;

  const LIBELLES_STATUT_ABO: Record<string, { texte: string; pill: string; classes: string }> = {
    essai: { texte: "Essai", pill: "soon", classes: "bg-amber-soft text-amber" },
    actif: { texte: "Actif", pill: "ok", classes: "bg-green-soft text-green" },
    expire: { texte: "Expiré", pill: "no", classes: "bg-[#FBE9E7] text-red" },
    annule: { texte: "Annulé", pill: "no", classes: "bg-[#FBE9E7] text-red" },
  };
  const statut = abonnement ? LIBELLES_STATUT_ABO[abonnement.statut] : null;

  const echeance = abonnement?.dateFin
    ? `${abonnement.statut === "essai" ? "essai jusqu’au" : "actif jusqu’au"} ${formatDateLongue(abonnement.dateFin)}`
    : "sans échéance enregistrée";

  /* Résumé du palier courant, partagé par les deux mises en page. */
  const resume = courant ? (
    <>
      {nomCourant} · {prixCourant}
      <br />
      {libelleTaille(courant.medecinsMin, courant.medecinsMax)} · {nb} rattaché
      {nb > 1 ? "s" : ""} · {courant.quotaSms.toLocaleString("fr-FR")} SMS inclus par mois
      <br />
      {echeance}
    </>
  ) : (
    <>Aucun abonnement ouvert pour cet établissement.</>
  );

  /*
   * Le texte de l'avertissement est écrit une fois ; seule l'enveloppe
   * change. `.privnote` n'existe que sous 767px (app/mobile.css), et le
   * web a sa propre carte : un élément unique portant les deux jeux de
   * classes n'aurait tenu que par accident.
   */
  const texteDepassement = palierConseille ? (
    <>
      Votre établissement compte <b>{nb} médecins</b>, au-delà du plafond du palier{" "}
      <b>{nomCourant}</b>. L’administration de la plateforme le requalifiera vers{" "}
      <b>{NOMS_PALIERS[palierConseille.formule] ?? palierConseille.formule}</b>.
    </>
  ) : (
    <>
      Votre établissement compte <b>{nb} médecins</b>, au-delà du plafond du palier{" "}
      <b>{nomCourant}</b>.
    </>
  );

  return (
    <EtablissementShell>
      {/* ===== Version mobile (écran « m-etab-abonnement » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <EnTeteMobile retour="/espace-etablissement/compte" titre="Abonnement" />
        <div className="pad">
          <div className="card2">
            <h4>Palier actuel</h4>
            <div className="setrow">
              <div>
                <b>{nomCourant ?? "Aucun abonnement"}</b>
                <small>{resume}</small>
              </div>
              {statut && <span className={`pill ${statut.pill}`}>{statut.texte}</span>}
            </div>
            {depasse && (
              <div className="privnote">
                <span aria-hidden>⚠️</span>
                <div>{texteDepassement}</div>
              </div>
            )}
            <div className="privnote info">
              <span aria-hidden>ℹ️</span>
              <div>
                Le palier suit la <b>taille</b> de la structure ; sa requalification est décidée
                par la plateforme. La prise de RDV reste <b>gratuite pour les patients</b>.
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
                  <th>{annuel ? "Par an" : "Par mois"}</th>
                </tr>
              </thead>
              <tbody>
                {paliers.map((palier) => {
                  const actuel = palier.formule === courant?.formule;
                  const nom = NOMS_PALIERS[palier.formule] ?? palier.formule;
                  return (
                    <tr key={palier.formule}>
                      <td>{actuel ? <b>{nom}</b> : nom}</td>
                      <td>{libelleTaille(palier.medecinsMin, palier.medecinsMax)}</td>
                      <td>
                        {actuel ? (
                          <span className="pill ok">Actuel</span>
                        ) : (
                          formatGNF(annuel ? palier.prixAnnuel : palier.prixMensuel)
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {paliers.length === 0 && (
              <p className="muted" style={{ fontSize: 13 }}>
                Grille tarifaire indisponible.
              </p>
            )}
            <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
              Invitez ou retirez des médecins depuis{" "}
              <Link
                href="/espace-etablissement/medecins"
                style={{ color: "var(--teal)", fontWeight: 700 }}
              >
                Médecins
              </Link>
              .
            </p>
          </div>
        </div>
      </div>

      {/* ===== Version web ===== */}
      <div className="hidden md:block">
        <div className="mb-5">
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Abonnement</h2>
          <small className="text-[13px] text-muted">
            Le palier facturé à votre établissement
          </small>
        </div>

        <div className="mb-4 rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-1 text-[15px] font-extrabold">Palier actuel</h3>
          <div className="flex items-start justify-between gap-[14px] py-[15px]">
            <div>
              <b className="block text-[13.5px] font-bold">{nomCourant ?? "Aucun abonnement"}</b>
              <small className="text-xs leading-relaxed text-muted">{resume}</small>
            </div>
            {statut && (
              <span className={`flex-none rounded-lg px-[9px] py-1 text-[11px] font-bold ${statut.classes}`}>
                {statut.texte}
              </span>
            )}
          </div>
          {depasse && (
            <div className="mb-2 flex items-start gap-[9px] rounded-xl bg-amber-soft px-[14px] py-3 text-[12.5px] font-semibold leading-relaxed text-amber">
              <span aria-hidden>⚠️</span>
              <div>{texteDepassement}</div>
            </div>
          )}
          <div className="flex items-start gap-[9px] rounded-xl bg-teal-soft px-[14px] py-3 text-[12.5px] font-semibold leading-relaxed text-blue">
            <span aria-hidden>ℹ️</span>
            <div>
              Le palier suit la <b>taille</b> de la structure — invitez ou retirez des médecins
              depuis l’onglet{" "}
              <Link href="/espace-etablissement/medecins" className="font-bold text-teal">
                Médecins
              </Link>
              . Sa requalification est décidée par la plateforme. La prise de rendez-vous reste{" "}
              <b>gratuite pour les patients</b>.
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-[14px] text-[15px] font-extrabold">Les paliers</h3>
          <div className="grid gap-[14px] md:grid-cols-2 xl:grid-cols-4">
            {paliers.map((palier) => {
              const actuel = palier.formule === courant?.formule;
              return (
                <div
                  key={palier.formule}
                  className={`relative rounded-[14px] border-[1.5px] p-4 ${
                    actuel ? "border-teal shadow-[0_0_0_3px_var(--teal-soft)]" : "border-line"
                  }`}
                >
                  {actuel && (
                    <span className="absolute -top-[10px] right-[14px] rounded-full bg-teal px-[10px] py-[3px] text-[10.5px] font-extrabold text-white">
                      Actuel
                    </span>
                  )}
                  <h4 className="text-[15px] font-extrabold">
                    {NOMS_PALIERS[palier.formule] ?? palier.formule}
                  </h4>
                  <div className="my-1.5 text-[13px] font-extrabold text-blue">
                    {libelleTaille(palier.medecinsMin, palier.medecinsMax)}
                    <span className="block text-xs font-semibold text-muted">
                      {formatGNF(annuel ? palier.prixAnnuel : palier.prixMensuel)} /{" "}
                      {annuel ? "an" : "mois"}
                    </span>
                  </div>
                  <ul className="mt-2">
                    {[
                      ...(DETAILS_PALIERS[palier.formule] ?? []),
                      `${palier.quotaSms.toLocaleString("fr-FR")} SMS inclus par mois`,
                      ...(palier.assistantsInclus !== null
                        ? [`${palier.assistantsInclus} assistant(e)s inclus`]
                        : []),
                    ].map((avantage) => (
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
          {paliers.length === 0 && (
            <p className="py-2 text-[13px] text-muted">Grille tarifaire indisponible.</p>
          )}
          <p className="mt-[14px] text-[11.5px] text-muted">
            Prix affichés {annuel ? "à l’année" : "au mois"}, tels que réglés par la plateforme.
          </p>
        </div>
      </div>
    </EtablissementShell>
  );
}
