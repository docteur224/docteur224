"use client";

import MedecinShell from "@/components/medecin/MedecinShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import DialoguePaiement from "@/components/pro/DialoguePaiement";
import { formatGNF } from "@/lib/format";
import { useState } from "react";
import { useAbonnement } from "@/lib/pro";
import { LIBELLES_STATUT, usePaiements } from "@/lib/paiements";
import RappelsEtSms from "@/components/medecin/RappelsEtSms";

/*
 * Mon abonnement — reproduit l'écran « med-abonnement » de la maquette web
 * (spec C.4.4) : abonnement en cours, bascule Mensuel / Annuel, formules
 * Standard et Premium. Le choix est écrit dans la table `abonnements`.
 * Rappel spec : la prise de RDV reste gratuite pour les patients.
 *
 * Choisir une formule ouvre le dialogue de paiement (migration 0040) — sauf
 * quand rien n'est facturé : pendant la période gratuite de lancement ou un
 * essai, présenter un écran de règlement ferait payer ce qui est offert. Le
 * choix est alors enregistré directement, comme avant.
 */



/*
 * Le quota SMS est LU dans la grille tarifaire, pas écrit ici.
 *
 * La carte annonçait « Statistiques avancées · quota SMS » sous Premium et
 * rien sous Standard, ce qui laissait croire que le Standard n'en avait
 * aucun — il en a 100 par mois. Et la mention étant en dur, elle a survécu
 * telle quelle au recalage des quotas : un chiffre affiché doit venir de la
 * même source que celui qui sera appliqué.
 *
 * « par mois » est explicite parce que la carte peut afficher un prix annuel :
 * sans ça, « 200 SMS » se lit comme 200 pour l'année.
 */
const avantages = (formule: "standard" | "premium", quotaSms: number): string[] => [
  ...(formule === "standard"
    ? ["Profil & fiche enrichie", "Agenda & gestion des RDV", "Disponibilités & créneaux", "1 assistant(e)"]
    : [
        "Tout le Standard",
        "Mise en avant (en vedette)",
        "Priorité dans la recherche",
        "Plus de photos & d'assistant(e)s",
        "Statistiques avancées",
      ]),
  `${quotaSms.toLocaleString("fr-FR")} SMS inclus par mois`,
  // WhatsApp ne consomme pas le quota : c'est l'argument qui rend les rappels
  // abordables, et il n'apparaissait nulle part.
  "Rappels WhatsApp hors quota",
];

export default function AbonnementMedecin() {
  const { abonnement, tarifs, changerFormule } = useAbonnement();
  const formule = abonnement?.formule ?? "standard";
  const [periodeVue, setPeriodeVue] = useState<"mensuel" | "annuel" | null>(null);
  const periode = periodeVue ?? ((abonnement?.periode as "mensuel" | "annuel") ?? "mensuel");
  const [message, setMessage] = useState("");
  const { moyens, paiements, enAttente, gratuit, recharger: rechargerPaiements } = usePaiements();
  /*
   * Ce que le dialogue doit régler : `null` = fermé. On y garde la formule
   * plutôt qu'un simple booléen, parce qu'on peut demander Premium tout en
   * étant encore Standard — c'est même le cas normal.
   */
  const [aRegler, setARegler] = useState<{ formule: "standard" | "premium"; reprise: boolean } | null>(
    null
  );

  const prix = (f: string) => {
    const t = tarifs.find((x) => x.formule === f);
    return { mensuel: t?.prixMensuel ?? 0, annuel: t?.prixAnnuel ?? 0 };
  };
  const TARIFS = { standard: prix("standard"), premium: prix("premium") };
  const quota = (f: string) => tarifs.find((x) => x.formule === f)?.quotaSms ?? 0;
  const AVANTAGES_STANDARD = avantages("standard", quota("standard"));
  const AVANTAGES_PREMIUM = avantages("premium", quota("premium"));
  const finAbo = abonnement?.dateFin ?? "";

  async function choisir(f: "standard" | "premium") {
    setMessage("");
    if (gratuit) {
      // Rien à encaisser : le statut est calculé côté serveur d'après les
      // réglages de gratuité, l'écran n'a pas à réclamer un règlement.
      const res = await changerFormule(f, periode);
      setMessage(res.erreur ? `⚠️ ${res.erreur}` : "✓ Formule mise à jour — rien à payer pour l’instant");
      return;
    }
    setARegler({ formule: f, reprise: false });
  }

  const libelleFormule = formule === "premium" ? "Premium" : "Standard";
  const libellePeriode = periode === "annuel" ? "Annuel" : "Mensuel";

  /*
   * L'écran affichait « Actif » en dur, quel que soit l'état réel — et il
   * disait donc vrai par accident, puisque l'ancien code d'écriture s'attribuait
   * `statut: "actif"` depuis le navigateur. Maintenant que le statut est
   * calculé côté serveur d'après les réglages de gratuité, il faut le lire :
   * pendant la phase pilote un abonnement est en « essai », pas « actif ».
   */
  const STATUTS: Record<string, { label: string; ok: boolean }> = {
    actif: { label: "Actif", ok: true },
    essai: { label: "Essai", ok: true },
    expire: { label: "Expiré", ok: false },
    annule: { label: "Annulé", ok: false },
  };
  const etat = STATUTS[abonnement?.statut ?? ""] ?? { label: "Aucun", ok: false };

  const nomFormule = (f: string) => (f === "premium" ? "Premium" : "Standard");
  const dateCourte = (iso: string) =>
    new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  /* Les demandes closes ; celle en cours a son propre bandeau, juste au-dessus. */
  const historique = paiements.filter((p) => p.statut !== "en_attente").slice(0, 5);

  /*
   * Le bouton d'une carte de formule dit trois choses différentes, et les
   * deux rendus doivent dire la même : c'est déjà votre formule / son
   * paiement est en cours / choisissez-la. Sans le cas du milieu, un médecin
   * qui a déjà versé recliquerait « Choisir Premium » et ouvrirait une
   * seconde demande pour un seul versement.
   */
  const etatBouton = (f: "standard" | "premium") => {
    if (formule === f) return { libelle: "Formule actuelle", action: null };
    if (enAttente && enAttente.formule === f) {
      return {
        libelle: "Paiement en cours →",
        action: () => setARegler({ formule: f, reprise: true }),
      };
    }
    return { libelle: `Choisir ${nomFormule(f)}`, action: () => choisir(f) };
  };

  const boutonMobile = (f: "standard" | "premium") => {
    const b = etatBouton(f);
    return b.action ? (
      <button type="button" className="btnm gh" style={{ width: "100%" }} onClick={b.action}>
        {b.libelle}
      </button>
    ) : (
      <button type="button" className="btnm" style={{ width: "100%" }} disabled>
        {b.libelle}
      </button>
    );
  };

  const boutonWeb = (f: "standard" | "premium") => {
    const b = etatBouton(f);
    return b.action ? (
      <button
        type="button"
        onClick={b.action}
        className="w-full rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
      >
        {b.libelle}
      </button>
    ) : (
      <button
        type="button"
        disabled
        className="w-full cursor-default rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white"
      >
        {b.libelle}
      </button>
    );
  };

  return (
    <MedecinShell reserveAuMedecin>
      {/* ===== Version mobile (écran « m-med-abonnement » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <EnTeteMobile retour="/espace-medecin/compte" titre="Mon abonnement" />
        <div className="pad">
          <div className="card2">
            <h4>Abonnement actuel</h4>
            <div className="setrow">
              <div>
                <b>
                  {libelleFormule} · {libellePeriode}
                </b>
                <small>
                  {finAbo ? `Jusqu'au ${finAbo}` : abonnement ? "Sans échéance" : "Aucun abonnement"}
                </small>
              </div>
              <span className={`pill${etat.ok ? " ok" : ""}`}>{etat.label}</span>
            </div>
            <div className="privnote info">
              <span aria-hidden>ℹ️</span>
              <div>
                La prise de RDV reste <b>gratuite pour vos patients</b>.
              </div>
            </div>
          </div>

          {/* Règlement en cours : tant qu'il n'est pas rapproché, l'abonnement
              ci-dessus n'a pas bougé — le dire évite un second versement. */}
          {enAttente && (
            <div className="card2">
              <h4>Règlement en cours</h4>
              <div className="setrow">
                <div>
                  <b>
                    {nomFormule(enAttente.formule)} ·{" "}
                    {enAttente.periode === "annuel" ? "Annuel" : "Mensuel"}
                  </b>
                  <small>
                    {formatGNF(enAttente.montantGnf)} · réf. {enAttente.reference}
                  </small>
                </div>
                <span className="pill soon">En attente</span>
              </div>
              <button
                type="button"
                className="btnm"
                style={{ width: "100%" }}
                onClick={() =>
                  setARegler({
                    formule: enAttente.formule === "premium" ? "premium" : "standard",
                    reprise: true,
                  })
                }
              >
                Voir les instructions de paiement
              </button>
            </div>
          )}

          <div className="card2">
            <h4>Changer de formule</h4>
            {message && <p style={{ color: "var(--green)", fontSize: 12.5, fontWeight: 700 }}>{message}</p>}
            <div className="seg">
              <button
                type="button"
                className={periode === "mensuel" ? "on" : undefined}
                onClick={() => setPeriodeVue("mensuel")}
              >
                Mensuel
              </button>
              <button
                type="button"
                className={periode === "annuel" ? "on" : undefined}
                onClick={() => setPeriodeVue("annuel")}
              >
                Annuel
              </button>
            </div>
            <div className={`plan${formule === "standard" ? " cur" : ""}`}>
              {formule === "standard" && <span className="tag">Actuel</span>}
              <h4>Standard</h4>
              <div className="pr">
                {formatGNF(TARIFS.standard[periode])}{" "}
                <span style={{ fontSize: 11, color: "var(--muted)" }}>
                  /{periode === "annuel" ? "an" : "mois"}
                </span>
              </div>
              <ul>
                {AVANTAGES_STANDARD.map((avantage) => (
                  <li key={avantage}>{avantage}</li>
                ))}
              </ul>
              {boutonMobile("standard")}
            </div>
            <div className={`plan${formule === "premium" ? " cur" : ""}`}>
              {formule === "premium" && <span className="tag">Actuel</span>}
              <h4>Premium</h4>
              <div className="pr">
                {formatGNF(TARIFS.premium[periode])}{" "}
                <span style={{ fontSize: 11, color: "var(--muted)" }}>
                  /{periode === "annuel" ? "an" : "mois"}
                </span>
              </div>
              <ul>
                {AVANTAGES_PREMIUM.map((avantage, i) => (
                  <li key={avantage}>{i === 1 ? <b>{avantage}</b> : avantage}</li>
                ))}
              </ul>
              {boutonMobile("premium")}
            </div>
          </div>

          {/* Rappels et crédits SMS : la carte n'existait que sur ordinateur,
              donc le bouton de recharge — et maintenant son paiement — était
              hors d'atteinte depuis un téléphone. Son balisage est déjà
              responsive (grilles `sm:`), il tient dans la colonne mobile. */}
          <RappelsEtSms />

          {historique.length > 0 && (
            <div className="card2">
              <h4>Mes paiements</h4>
              {historique.map((p) => (
                <div key={p.id} className="setrow">
                  <div>
                    <b>
                      {nomFormule(p.formule)} · {formatGNF(p.montantGnf)}
                    </b>
                    <small>
                      {dateCourte(p.creeLe)} · réf. {p.reference}
                      {p.motifRefus ? ` · ${p.motifRefus}` : ""}
                    </small>
                  </div>
                  <span
                    className={`pill${
                      p.statut === "confirme" ? " ok" : p.statut === "refuse" ? " bad" : " lock"
                    }`}
                  >
                    {LIBELLES_STATUT[p.statut]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ===== Version web (inchangée) ===== */}
      <div className="hidden md:block">
      <div className="mb-5">
        <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Mon abonnement</h2>
        <small className="text-[13px] text-muted">Votre présence sur Docteur 224</small>
      </div>

      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">Abonnement actuel</h3>
        <div className="flex items-center justify-between gap-[14px] py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">
              Formule {libelleFormule} · {libellePeriode}
            </b>
            <small className="text-xs text-muted">
              {finAbo ? `Jusqu'au ${finAbo}` : abonnement ? "Sans échéance" : "Aucun abonnement"}
            </small>
          </div>
          <span
            className={`rounded-lg px-[9px] py-1 text-[11px] font-bold ${etat.ok ? "bg-green-soft text-green" : "bg-red-soft text-red"}`}
          >
            {etat.label}
          </span>
        </div>
        <div className="flex items-start gap-[9px] rounded-xl bg-teal-soft px-[14px] py-3 text-[12.5px] font-semibold leading-relaxed text-blue">
          <span aria-hidden>ℹ️</span>
          <div>
            La prise de rendez-vous reste <b>gratuite pour vos patients</b>. Vous payez uniquement
            votre abonnement.
          </div>
        </div>
      </div>

      {/* Règlement en cours. Il ne change rien à la carte ci-dessus tant qu'il
          n'est pas rapproché : le dire ici évite un second versement. */}
      {enAttente && (
        <div className="mb-4 flex flex-wrap items-center gap-[14px] rounded-2xl border-[1.5px] border-amber bg-amber-soft p-5">
          <span aria-hidden className="text-xl">
            ⏳
          </span>
          <div className="min-w-0 flex-1">
            <b className="block text-[13.5px] font-extrabold text-amber">
              Règlement en cours · {nomFormule(enAttente.formule)}{" "}
              {enAttente.periode === "annuel" ? "annuel" : "mensuel"}
            </b>
            <small className="text-xs font-semibold text-amber">
              {formatGNF(enAttente.montantGnf)} · référence {enAttente.reference} — votre formule
              change dès que notre équipe confirme la réception.
            </small>
          </div>
          <button
            type="button"
            onClick={() =>
              setARegler({
                formule: enAttente.formule === "premium" ? "premium" : "standard",
                reprise: true,
              })
            }
            className="rounded-[9px] bg-amber px-[14px] py-2 text-[12.5px] font-bold text-white transition-opacity hover:opacity-90"
          >
            Instructions de paiement
          </button>
        </div>
      )}

      <div className="rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-[14px] text-[15px] font-extrabold">Changer de formule</h3>
        {message && <p className="mb-2 text-[12.5px] font-bold text-green">{message}</p>}

        {/* Bascule Mensuel / Annuel */}
        <div className="mb-[10px] inline-flex overflow-hidden rounded-[10px] border border-line">
          <button
            type="button"
            onClick={() => setPeriodeVue("mensuel")}
            className={`px-4 py-2 text-[12.5px] font-bold ${
              periode === "mensuel" ? "bg-teal-soft text-blue" : "bg-white text-muted"
            }`}
          >
            Mensuel
          </button>
          <button
            type="button"
            onClick={() => setPeriodeVue("annuel")}
            className={`px-4 py-2 text-[12.5px] font-bold ${
              periode === "annuel" ? "bg-teal-soft text-blue" : "bg-white text-muted"
            }`}
          >
            Annuel (2 mois offerts)
          </button>
        </div>

        <div className="mt-1.5 grid gap-[14px] md:grid-cols-2">
          {/* Standard */}
          <div
            className={`relative rounded-[14px] border-[1.5px] p-4 ${
              formule === "standard" ? "border-teal shadow-[0_0_0_3px_var(--teal-soft)]" : "border-line"
            }`}
          >
            {formule === "standard" && (
              <span className="absolute -top-[10px] right-[14px] rounded-full bg-teal px-[10px] py-[3px] text-[10.5px] font-extrabold text-white">
                Actuel
              </span>
            )}
            <h4 className="text-[15px] font-extrabold">Standard</h4>
            <div className="my-1.5 text-[22px] font-extrabold text-blue">
              {formatGNF(TARIFS.standard[periode])}{" "}
              <span className="text-xs font-semibold text-muted">
                /{periode === "annuel" ? "an" : "mois"}
              </span>
            </div>
            <ul className="mb-3 mt-2">
              {AVANTAGES_STANDARD.map((avantage) => (
                <li key={avantage} className="relative py-1 pl-5 text-[12.5px]">
                  <span className="absolute left-0 font-extrabold text-green" aria-hidden>
                    ✓
                  </span>
                  {avantage}
                </li>
              ))}
            </ul>
            {boutonWeb("standard")}
          </div>

          {/* Premium */}
          <div
            className={`relative rounded-[14px] border-[1.5px] p-4 ${
              formule === "premium" ? "border-teal shadow-[0_0_0_3px_var(--teal-soft)]" : "border-line"
            }`}
          >
            {formule === "premium" && (
              <span className="absolute -top-[10px] right-[14px] rounded-full bg-teal px-[10px] py-[3px] text-[10.5px] font-extrabold text-white">
                Actuel
              </span>
            )}
            <h4 className="text-[15px] font-extrabold">Premium</h4>
            <div className="my-1.5 text-[22px] font-extrabold text-blue">
              {formatGNF(TARIFS.premium[periode])}{" "}
              <span className="text-xs font-semibold text-muted">
                /{periode === "annuel" ? "an" : "mois"}
              </span>
            </div>
            <ul className="mb-3 mt-2">
              {AVANTAGES_PREMIUM.map((avantage, i) => (
                <li key={avantage} className="relative py-1 pl-5 text-[12.5px]">
                  <span className="absolute left-0 font-extrabold text-green" aria-hidden>
                    ✓
                  </span>
                  {i === 1 ? <b>{avantage}</b> : avantage}
                </li>
              ))}
            </ul>
            {boutonWeb("premium")}
          </div>
        </div>

        <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
          {gratuit
            ? "🎁 Aucun règlement n’est demandé pendant la période gratuite : changez de formule librement."
            : "💳 Règlement par Orange Money, MTN Mobile Money ou carte bancaire. Votre formule change une fois le versement confirmé par notre équipe."}
        </p>
      </div>

      {historique.length > 0 && (
        <div className="mt-4 rounded-2xl border border-line bg-white p-5">
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[15px] font-extrabold">Derniers paiements</h3>
            {/* Cette carte ne montre que les cinq derniers : l'historique
                complet, ses filtres et ses reçus vivent sur leur propre écran. */}
            <a
              href="/espace-medecin/paiements"
              className="text-[12.5px] font-bold text-teal hover:underline"
            >
              Tout l’historique et mes reçus →
            </a>
          </div>
          {historique.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center gap-3 border-b border-line py-[13px] last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <b className="block text-[13.5px]">
                  {nomFormule(p.formule)} · {p.periode === "annuel" ? "annuel" : "mensuel"} ·{" "}
                  {formatGNF(p.montantGnf)}
                </b>
                <small className="text-xs text-muted">
                  {dateCourte(p.creeLe)} · réf. {p.reference}
                  {p.motifRefus ? ` · ${p.motifRefus}` : ""}
                </small>
              </div>
              <span
                className={`rounded-lg px-[9px] py-1 text-[11px] font-bold ${
                  p.statut === "confirme"
                    ? "bg-green-soft text-green"
                    : p.statut === "refuse"
                      ? "bg-red-soft text-red"
                      : "bg-bg text-muted"
                }`}
              >
                {LIBELLES_STATUT[p.statut]}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Rappels et crédits SMS : ce que l'abonnement finance vraiment côté
          patients, et de quoi recharger quand le quota du mois est épuisé. */}
      <div className="mt-4">
        <RappelsEtSms />
      </div>
      </div>

      {/* Monté UNE fois, hors des blocs mobile et web : c'est une surcouche
          plein écran, et l'écran rend toujours les deux versions — en poser
          une dans chacune en créerait deux, dont une invisible. */}
      {aRegler && (
        <DialoguePaiement
          achat={{
            type: "abonnement",
            formule: aRegler.formule,
            libelle: nomFormule(aRegler.formule),
            /* En reprise, c'est la périodicité DÉJÀ payée qui compte, pas
               celle que la bascule de l'écran affiche au moment du clic. */
            periode: !aRegler.reprise
              ? periode
              : enAttente?.periode === "annuel"
                ? "annuel"
                : "mensuel",
            onPeriode: aRegler.reprise ? undefined : setPeriodeVue,
            prix: TARIFS[aRegler.formule],
          }}
          moyens={moyens}
          reprise={aRegler.reprise ? enAttente : null}
          onFermer={() => setARegler(null)}
          apres={rechargerPaiements}
        />
      )}
    </MedecinShell>
  );
}
