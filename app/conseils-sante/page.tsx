import type { Metadata } from "next";
import Link from "next/link";
import PageContenu, { AppelAction, Rubrique } from "@/components/site/PageContenu";

export const metadata: Metadata = {
  title: "Conseils santé | Docteur 224",
  description:
    "Prévention du paludisme, eau et hygiène, suivi de grossesse, tension et diabète, vaccination des enfants : les gestes qui protègent, et les signes qui doivent amener à consulter.",
};

/*
 * Conseils santé — contenu de prévention volontairement général, aligné sur
 * les recommandations de santé publique. Aucune posologie, aucun traitement :
 * chaque fiche se termine par « quand consulter », qui renvoie vers un
 * professionnel. L'avertissement en tête de page n'est pas décoratif.
 */
const FICHES = [
  {
    emoji: "🦟",
    titre: "Se protéger du paludisme",
    gestes: [
      "Dormir chaque nuit sous une moustiquaire imprégnée, y compris en saison sèche.",
      "Éliminer les eaux stagnantes autour de la maison : elles servent de gîtes aux moustiques.",
      "Couvrir bras et jambes le soir, moment où les moustiques piquent le plus.",
    ],
    consulter:
      "Toute fièvre doit être testée avant d’être traitée. Ne prenez pas d’antipaludique « au cas où » : un test rapide se fait en quelques minutes.",
  },
  {
    emoji: "💧",
    titre: "Eau, hygiène et diarrhées",
    gestes: [
      "Boire de l’eau traitée ou bouillie, et la conserver dans un récipient fermé.",
      "Se laver les mains au savon avant de manger et après être allé aux toilettes.",
      "En cas de diarrhée, continuer à boire abondamment : la déshydratation est le vrai danger.",
    ],
    consulter:
      "Consultez sans attendre si la diarrhée dure plus de trois jours, contient du sang, ou touche un nourrisson ou une personne âgée.",
  },
  {
    emoji: "🤰",
    titre: "Suivre une grossesse",
    gestes: [
      "Commencer les consultations prénatales dès les premiers mois, sans attendre un problème.",
      "Poursuivre le suivi jusqu’à l’accouchement, même quand tout va bien.",
      "Préparer le lieu d’accouchement à l’avance avec la sage-femme ou le médecin.",
    ],
    consulter:
      "En urgence : saignements, maux de tête intenses, gonflement brutal du visage ou des mains, fièvre, ou diminution des mouvements du bébé.",
  },
  {
    emoji: "❤️",
    titre: "Tension et diabète",
    gestes: [
      "Faire contrôler sa tension au moins une fois par an à partir de 40 ans.",
      "Réduire le sel, l’alcool et le tabac ; marcher trente minutes par jour.",
      "Un traitement prescrit se poursuit même quand on se sent bien : c’est le principe.",
    ],
    consulter:
      "L’hypertension et le diabète évoluent longtemps sans symptôme. Soif intense, fatigue inhabituelle, vision troublée ou essoufflement justifient une consultation.",
  },
  {
    emoji: "👶",
    titre: "Vaccination des enfants",
    gestes: [
      "Respecter le calendrier vaccinal, y compris les rappels.",
      "Conserver le carnet de vaccination et l’apporter à chaque consultation.",
      "Une fièvre légère après un vaccin est fréquente et passagère.",
    ],
    consulter:
      "Un retard se rattrape : présentez-vous au centre de santé plutôt que de renoncer aux doses suivantes.",
  },
  {
    emoji: "🦷",
    titre: "Bouche et dents",
    gestes: [
      "Se brosser les dents deux fois par jour, matin et soir.",
      "Limiter les boissons sucrées, premières responsables des caries.",
      "Faire examiner ses dents une fois par an, même sans douleur.",
    ],
    consulter:
      "Une douleur qui réveille la nuit, une gencive gonflée ou une dent mobile ne se traitent pas seules.",
  },
];

/** Signes qui imposent une consultation immédiate, quel que soit l'âge. */
const URGENCES = [
  "Difficulté à respirer ou essoufflement au repos",
  "Douleur dans la poitrine",
  "Fièvre élevée qui ne baisse pas, surtout chez un nourrisson",
  "Perte de connaissance, convulsions, confusion",
  "Saignement abondant ou qui ne s’arrête pas",
  "Faiblesse soudaine d’un côté du corps, difficulté à parler",
];

export default function ConseilsSante() {
  return (
    <PageContenu
      titre="Conseils santé"
      emoji="🌿"
      chapeau="Les gestes de prévention qui comptent au quotidien, et surtout : les signes qui doivent amener à consulter sans attendre."
    >
      <div className="mb-4 flex items-start gap-3 rounded-2xl border border-[#f0dcbe] bg-amber-soft p-[16px] md:p-5">
        <span className="text-[18px] leading-none" aria-hidden>
          ⚠️
        </span>
        <p className="text-[12.5px] leading-relaxed text-[#7a5320] md:text-[13.5px]">
          Ces conseils sont d’ordre général et ne remplacent pas l’avis d’un professionnel de
          santé. En cas de doute sur votre état ou celui d’un proche, consultez.
        </p>
      </div>

      <Rubrique>Fiches pratiques</Rubrique>
      <div className="grid gap-2.5 md:grid-cols-2 md:gap-4">
        {FICHES.map((f) => (
          <article
            key={f.titre}
            className="flex flex-col rounded-2xl border border-line bg-white p-[18px] md:p-5"
          >
            <span
              aria-hidden
              className="grid h-[38px] w-[38px] place-items-center rounded-xl bg-teal-soft text-[19px]"
            >
              {f.emoji}
            </span>
            <h2 className="mt-3 text-[15px] font-extrabold md:text-[16px]">{f.titre}</h2>
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {f.gestes.map((g) => (
                <li
                  key={g}
                  className="flex gap-2 text-[12.5px] leading-relaxed text-muted md:text-[13.5px]"
                >
                  <span aria-hidden className="text-teal">
                    ✓
                  </span>
                  {g}
                </li>
              ))}
            </ul>
            <p className="mt-3.5 rounded-xl bg-bg px-3 py-2.5 text-[12px] leading-relaxed text-[#3a4a55] md:text-[12.5px]">
              <b className="text-blue">Quand consulter · </b>
              {f.consulter}
            </p>
          </article>
        ))}
      </div>

      <Rubrique>Consulter sans attendre</Rubrique>
      <div className="rounded-2xl border border-[#f0cdc7] bg-red-soft p-[18px] md:p-6">
        <b className="text-[14px] font-extrabold text-red md:text-[16px]">
          Ces signes imposent une consultation immédiate
        </b>
        <ul className="mt-3 grid gap-1.5 md:grid-cols-2">
          {URGENCES.map((u) => (
            <li
              key={u}
              className="flex gap-2 text-[12.5px] leading-relaxed text-[#7b332a] md:text-[13.5px]"
            >
              <span aria-hidden>•</span>
              {u}
            </li>
          ))}
        </ul>
        <p className="mt-3.5 text-[12px] leading-relaxed text-[#7b332a] md:text-[13px]">
          N’attendez pas un rendez-vous en ligne : rendez-vous au service d’urgences le plus proche
          ou appelez les secours.
        </p>
      </div>

      <AppelAction
        titre="Un doute sur un symptôme ?"
        texte="Un médecin généraliste est le bon premier interlocuteur : il oriente ensuite vers le spécialiste s’il y a lieu."
      >
        <Link
          href="/resultats?specialite=M%C3%A9decine%20g%C3%A9n%C3%A9rale"
          className="rounded-[11px] bg-teal px-[18px] py-[11px] text-[13.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
        >
          Trouver un généraliste
        </Link>
        <Link
          href="/faq"
          className="rounded-[11px] border-[1.5px] border-line bg-white px-[18px] py-[11px] text-[13.5px] font-bold text-blue transition-colors hover:bg-bg"
        >
          Questions fréquentes
        </Link>
      </AppelAction>
    </PageContenu>
  );
}
