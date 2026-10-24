"use client";

import Link from "next/link";
import FilMessages from "@/components/site/FilMessages";
import Icone from "@/components/site/Icone";
import { useConsentementRappels, useRappelsPatient, useTitulaireDuProche, type Rappel } from "@/lib/conversations";
import { formatDateCourte } from "@/lib/dates";
import { lirePatientCle } from "@/lib/pro";
import type { ContexteFiche } from "../contexte";
import { CARTE, COMPTE, EtatVide, Squelettes, TITRE_SECTION } from "../ui";

/*
 * Module « Relation patient » de la fiche (migration 0066) :
 *
 *  - MESSAGERIE avec le patient. Pour la fiche d'un proche, on correspond
 *    avec le titulaire du compte, et les messages portent le nom du proche ;
 *    une fiche créée au cabinet, sans compte, n'a personne à qui écrire ;
 *  - RAPPELS par SMS / WhatsApp : ce à quoi le patient consent, ce que vos
 *    réglages prévoient, et ce qui est parti (ou pas, et pourquoi) ;
 *  - TÉLÉCONSULTATION : annoncée, pas encore ouverte.
 */

const ETATS: Record<Rappel["etat"], { libelle: string; classe: string }> = {
  programme: { libelle: "Prévu", classe: "bg-teal-soft text-blue" },
  en_cours: { libelle: "Envoi en cours", classe: "bg-teal-soft text-blue" },
  envoye: { libelle: "Envoyé", classe: "bg-green-soft text-green" },
  simule: { libelle: "Simulé (mode test)", classe: "bg-amber-soft text-amber" },
  echec: { libelle: "Échec, nouvel essai", classe: "bg-red-soft text-red" },
  abandonne: { libelle: "Non envoyé", classe: "bg-red-soft text-red" },
  annule: { libelle: "Annulé", classe: "bg-bg text-muted" },
  ignore: { libelle: "Non envoyé", classe: "bg-bg text-muted" },
};

const delai = (h: number) => (h >= 24 ? `J-${h / 24}` : `H-${h}`);
const quand = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { timeZone: "Africa/Conakry", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function ModuleRelation({ ctx }: { ctx: ContexteFiche }) {
  const { type, id } = lirePatientCle(ctx.cle);
  const { patientId: titulaireProche, chargement: chargementProche } = useTitulaireDuProche(type === "proche" ? id : null);
  // À qui l'on écrit : le patient lui-même, ou le titulaire du compte du proche.
  const patientId = type === "compte" ? id : type === "proche" ? titulaireProche : null;
  const colonne = type === "compte" ? "patient_id" : type === "proche" ? "proche_id" : "patient_sans_compte_id";

  return (
    <div className="grid gap-4">
      <section className={CARTE} aria-labelledby="titre-messagerie">
        <h3 id="titre-messagerie" className={`${TITRE_SECTION} mb-1`}>
          Messagerie
        </h3>
        {type === "sans_compte" ? (
          <EtatVide
            icone="message"
            titre="Pas de messagerie pour une fiche cabinet"
            texte="Ce patient n’a pas de compte Docteur 224 : il ne peut ni lire ni recevoir de message. Appelez-le au numéro de sa fiche."
          />
        ) : chargementProche || !patientId || !ctx.medecinId ? (
          <Squelettes n={2} hauteur={80} />
        ) : (
          <>
            <p className="mb-3 text-[12px] text-muted">
              {type === "proche"
                ? `Vous correspondez avec ${ctx.dossier?.titulaire ?? "le titulaire du compte"}, qui gère le compte de ${ctx.nomComplet}.`
                : "Le patient est prévenu de chaque nouveau message par une notification."}{" "}
              Pas d’urgence par message : il n’y a pas de garde.
            </p>
            <FilMessages
              patientId={patientId}
              medecinId={ctx.medecinId}
              moiId={ctx.medecinId}
              interlocuteur={type === "proche" ? (ctx.dossier?.titulaire ?? "le titulaire") : ctx.nomComplet}
              procheId={type === "proche" ? id : null}
              prochesNoms={type === "proche" ? { [id]: ctx.nomComplet } : {}}
              idChamp="message-fiche"
              onActivite={() => ctx.signalerChangement("relation")}
              onErreur={ctx.signalerEchec}
            />
          </>
        )}
      </section>

      <SectionRappels patientId={patientId} colonne={colonne} id={id} sansCompte={type === "sans_compte"} />

      <section className={CARTE} aria-labelledby="titre-teleconsultation">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="titre-teleconsultation" className={TITRE_SECTION}>
            Téléconsultation
          </h3>
          <span className="rounded-full bg-amber-soft px-3 py-1 text-[11.5px] font-bold text-amber">Bientôt disponible</span>
        </div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          Consultations vidéo depuis l’agenda : lien sécurisé envoyé au patient, salle d’attente, compte rendu versé au
          dossier clinique. Cette section les accueillera.
        </p>
      </section>
    </div>
  );
}

function SectionRappels({
  patientId,
  colonne,
  id,
  sansCompte,
}: {
  patientId: string | null;
  colonne: "patient_id" | "proche_id" | "patient_sans_compte_id";
  id: string;
  sansCompte: boolean;
}) {
  const { consentement: c, chargement } = useConsentementRappels(sansCompte ? null : patientId);
  const { rappels, chargement: chargementRappels } = useRappelsPatient(colonne, id, 0);
  const simules = rappels.some((r) => r.etat === "simule");

  const pastille = (ok: boolean, libelle: string) => (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-bold ${
        ok ? "bg-green-soft text-green" : "bg-bg text-muted"
      }`}
    >
      <Icone nom={ok ? "coche" : "croix"} taille={11} epaisseur={2.6} />
      {libelle}
    </span>
  );

  return (
    <section className={CARTE} aria-labelledby="titre-rappels">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 id="titre-rappels" className={TITRE_SECTION}>
          Rappels de rendez-vous <span className={COMPTE}>SMS · WhatsApp</span>
        </h3>
        <Link
          href="/espace-medecin/abonnement"
          className="inline-flex min-h-9 items-center text-[12.5px] font-bold text-teal hover:underline pointer-coarse:min-h-11"
        >
          Régler mes rappels
        </Link>
      </div>

      {sansCompte ? (
        <p className="text-[12.5px] text-muted">
          Fiche cabinet sans compte : aucun consentement enregistré, aucun rappel ne part par SMS ni WhatsApp.
        </p>
      ) : chargement || !c ? (
        <Squelettes n={1} hauteur={50} />
      ) : (
        <div className="grid gap-2.5">
          <div>
            <div className="mb-1.5 text-[11.5px] font-bold text-muted">Consentement du patient</div>
            <div className="flex flex-wrap gap-1.5">
              {pastille(c.whatsapp, "WhatsApp")}
              {pastille(c.sms, "SMS")}
              {pastille(c.telephone, "Numéro renseigné")}
            </div>
          </div>
          <p className="text-[12.5px]">
            <span className="text-muted">Vos réglages : </span>
            {c.rappelsActifs ? (
              <>
                {c.delais.map(delai).join(" et ")} · WhatsApp {c.whatsappAutorise ? "autorisé" : "désactivé"} · SMS{" "}
                {c.smsAutorise ? "autorisé (décompté de votre quota)" : "désactivé"}
              </>
            ) : (
              "rappels désactivés"
            )}
          </p>
          <p className="text-[12.5px] font-semibold">
            {!c.rappelsActifs
              ? "Aucun rappel ne partira : vous les avez désactivés."
              : !c.telephone
                ? "Aucun rappel ne partira : le patient n’a pas de numéro."
                : c.whatsapp && c.whatsappAutorise
                  ? "Ses rappels partiront par WhatsApp."
                  : c.sms && c.smsAutorise
                    ? "Ses rappels partiront par SMS."
                    : "Aucun rappel ne partira : le patient n’a consenti à aucun des canaux que vous autorisez."}
          </p>
        </div>
      )}

      <h4 className="mb-2 mt-4 text-[13px] font-extrabold">Historique des envois</h4>
      {chargementRappels ? (
        <Squelettes n={1} hauteur={44} />
      ) : rappels.length === 0 ? (
        <p className="text-[12.5px] text-muted">
          Aucun rappel programmé pour l’instant : ils se créent avec chaque rendez-vous à venir.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {rappels.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-[12.5px]">
              <b className="min-w-[150px]">
                RDV du {formatDateCourte(r.rdvDate)} · {r.rdvHeure.slice(0, 5)}
              </b>
              <span className="text-muted">
                {delai(r.delaiHeures)} · {r.canal ? (r.canal === "whatsapp" ? "WhatsApp" : "SMS") : "aucun canal"} ·{" "}
                {r.envoyeLe ? `parti le ${quand(r.envoyeLe)}` : `prévu le ${quand(r.programmePour)}`}
              </span>
              <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold ${ETATS[r.etat].classe}`}>
                {/* Un échec repasse « programmé » jusqu'à trois tentatives. */}
                {r.etat === "programme" && r.erreur ? "Nouvel essai prévu" : ETATS[r.etat].libelle}
              </span>
              {r.erreur && r.etat !== "envoye" && r.etat !== "simule" && (
                <span className="w-full text-[11.5px] text-muted">{r.erreur}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {simules && (
        <p className="mt-2 text-[11.5px] text-muted">
          « Simulé » : aucun fournisseur SMS/WhatsApp n’est encore configuré. Le rappel est compté, pas envoyé.
        </p>
      )}
    </section>
  );
}
