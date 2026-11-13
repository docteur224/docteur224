import type { Metadata } from "next";
import Link from "next/link";
import TopNav from "@/components/site/TopNav";
import Footer from "@/components/site/Footer";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import PiedPageMobile from "@/components/mobile/PiedPageMobile";
import TabBarMobile from "@/components/mobile/TabBarMobile";

export const metadata: Metadata = {
  title: "À propos | Docteur 224",
  description:
    "Docteur 224 met en relation les patients guinéens et les professionnels de santé : recherche par spécialité et par ville, réservation en ligne, confirmation par SMS et e-mail.",
};

/*
 * Page « À propos » — version premium.
 *
 * Rupture avec le gabarit PageContenu des autres pages éditoriales : cette
 * page porte l'image de marque, elle a donc droit à un héros photographique
 * et à des blocs illustrés. Le chrome (TopNav / Footer web, en-tête + tabbar
 * mobiles) reste celui du reste du site pour ne pas en faire une impasse.
 *
 * Règle maison : aucun chiffre inventé. Chaque affirmation correspond à une
 * fonctionnalité réellement présente dans l'application. Les photos sont
 * auto-hébergées (/public/apropos) pour qu'aucun lien externe ne casse.
 */

/** Les trois temps du parcours, repris de l'accueil. */
const ETAPES = [
  {
    n: "1",
    titre: "Cherchez",
    texte: "Par spécialité, par ville, par établissement ou par nom du praticien.",
  },
  {
    n: "2",
    titre: "Choisissez un créneau",
    texte: "Les disponibilités affichées sont celles que le praticien tient à jour.",
  },
  {
    n: "3",
    titre: "Confirmez",
    texte: "La réservation est gratuite, confirmée par SMS et par e-mail.",
  },
];

/*
 * Pictogrammes de la bande de repères. SVG en ligne (et non emoji) : rendu
 * identique sur tous les appareils, couleur pilotée par la charte (teal).
 */
const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-5 w-5",
  "aria-hidden": true,
};

const IconeTarif = () => (
  <svg {...svgProps}>
    <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.83 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" />
    <circle cx="7.5" cy="7.5" r="1.2" />
  </svg>
);
const IconeMessage = () => (
  <svg {...svgProps}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="m3.6 6.5 8.4 6 8.4-6" />
  </svg>
);
const IconeBouclier = () => (
  <svg {...svgProps}>
    <path d="M12 3 5 5.8V11c0 4.4 3 7.4 7 9 4-1.6 7-4.6 7-9V5.8L12 3Z" />
    <path d="m8.8 12 2.2 2.2 4.2-4.3" />
  </svg>
);
const IconeEtoile = () => (
  <svg {...svgProps}>
    <path d="M12 3.5 14.6 9l5.9.8-4.3 4.1 1 5.8-5.2-2.8L6.8 19.7l1-5.8L3.5 9.8 9.4 9 12 3.5Z" />
  </svg>
);

/** Repères factuels — tous adossés à une fonctionnalité existante. */
const REPERES = [
  { k: "Gratuit", v: "Réservation sans frais", Icone: IconeTarif },
  { k: "SMS + e-mail", v: "Confirmation immédiate", Icone: IconeMessage },
  { k: "Vérifiés", v: "Comptes pros contrôlés", Icone: IconeBouclier },
  { k: "Authentiques", v: "Avis après consultation", Icone: IconeEtoile },
];

/** Nos engagements — ce qui guide les choix de la plateforme. */
const VALEURS = [
  {
    i: "🌍",
    t: "Accessible",
    d: "Pensée pour un téléphone et une connexion lente, dans un français clair.",
  },
  {
    i: "🤝",
    t: "Proche",
    d: "Des médecins et des établissements guinéens, au plus près de chez vous.",
  },
  {
    i: "🛡️",
    t: "De confiance",
    d: "Des comptes contrôlés et des avis qui émanent de patients réellement reçus.",
  },
  {
    i: "🔒",
    t: "Respectueuse",
    d: "Le minimum de données, accessibles à vous seul : aucun dossier médical conservé.",
  },
];

/** Corps responsive, rendu à l'identique dans la branche mobile et web. */
const contenu = (
  <>
    {/* ======================= HÉROS PHOTOGRAPHIQUE ======================= */}
    <section className="relative isolate overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/apropos/hero-soignants.jpg"
        alt="Une médecin souriante, stéthoscope autour du cou"
        className="absolute inset-0 h-full w-full object-cover object-[center_26%]"
        width={1680}
        height={1080}
        fetchPriority="high"
      />
      {/* Voile dégradé bleu, repris du héros d'accueil : garde le texte lisible
          tout en laissant le sourire de la praticienne transparaître à droite. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(118deg,rgba(14,59,80,0.94)_0%,rgba(15,63,84,0.80)_38%,rgba(18,70,94,0.54)_64%,rgba(20,74,100,0.38)_100%)]"
      />
      <div className="relative mx-auto max-w-[1200px] px-5 py-16 text-white md:px-[30px] md:py-[104px]">
        <span className="inline-block rounded-[30px] bg-white/15 px-[14px] py-[6px] text-[12.5px] font-bold tracking-[0.04em] backdrop-blur-sm md:text-[13px]">
          🇬🇳 La santé accessible en Guinée
        </span>
        <h1 className="mt-4 max-w-[680px] text-[30px] font-extrabold leading-[1.1] tracking-[-0.8px] md:text-[46px]">
          Rapprocher chaque Guinéen d’un professionnel de santé
        </h1>
        <p className="mt-4 max-w-[560px] text-[14.5px] leading-relaxed opacity-90 md:text-[16px]">
          Docteur 224 rassemble les médecins, les établissements et leurs créneaux réels au même
          endroit. Trouver le bon praticien, voir ses disponibilités et réserver en ligne — sans
          appel ni file d’attente, depuis un simple téléphone.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/resultats"
            className="pointer-coarse:py-3 rounded-[12px] bg-white px-5 py-3 text-[14px] font-bold text-blue shadow-sm transition-colors hover:bg-teal-soft"
          >
            Trouver un médecin
          </Link>
          <Link
            href="/inscription/professionnel"
            className="pointer-coarse:py-3 rounded-[12px] border-[1.5px] border-white/40 px-5 py-3 text-[14px] font-bold text-white transition-colors hover:bg-white/10"
          >
            Je suis professionnel de santé
          </Link>
        </div>
      </div>
    </section>

    {/* ======================= REPÈRES (carte flottante) ======================= */}
    <div className="mx-auto -mt-8 w-full max-w-[1200px] px-5 md:-mt-10 md:px-[30px]">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line shadow-[0_14px_36px_-20px_rgba(14,59,80,0.5)] md:grid-cols-4">
        {REPERES.map((r) => (
          <div
            key={r.k}
            className="flex flex-col items-center bg-white px-3 py-5 text-center md:px-4 md:py-6"
          >
            <span className="grid h-12 w-12 place-items-center rounded-[14px] bg-[linear-gradient(135deg,var(--teal),var(--blue))] text-white shadow-[0_4px_10px_-3px_rgba(21,80,107,0.5)]">
              <r.Icone />
            </span>
            <b className="mt-3 block text-[14px] font-extrabold md:text-[15.5px]">{r.k}</b>
            <span className="mt-0.5 block text-[11.5px] leading-tight text-muted md:text-[12.5px]">
              {r.v}
            </span>
          </div>
        ))}
      </div>
    </div>

    {/* ======================= NOTRE RAISON D’ÊTRE ======================= */}
    <section className="mx-auto w-full max-w-[1200px] px-5 py-12 md:px-[30px] md:py-[72px]">
      <div className="grid items-center gap-7 md:grid-cols-2 md:gap-12">
        <div>
          <span className="text-[12px] font-extrabold uppercase tracking-[0.12em] text-teal">
            Notre raison d’être
          </span>
          <h2 className="mt-2.5 text-[23px] font-extrabold leading-tight tracking-[-0.4px] md:text-[30px]">
            Prendre rendez-vous ne devrait pas être une épreuve
          </h2>
          <p className="mt-3.5 text-[14px] leading-relaxed text-muted md:text-[15px]">
            Obtenir une consultation demande souvent de se déplacer ou d’appeler plusieurs fois un
            secrétariat, sans jamais savoir si le praticien est disponible. Nous avons bâti Docteur
            224 pour que cette étape tienne en quelques minutes.
          </p>
          <p className="mt-3 text-[14px] leading-relaxed text-muted md:text-[15px]">
            Les disponibilités affichées sont celles que les praticiens tiennent à jour eux-mêmes :
            vous réservez un créneau réel, pas une promesse de rappel.
          </p>
          <ul className="mt-5 space-y-2.5">
            {[
              "Une recherche ouverte à tous, sans compte",
              "Des créneaux réels, mis à jour par les praticiens",
              "Une confirmation par SMS et par e-mail",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2.5 text-[13.5px] md:text-[14px]">
                <span
                  aria-hidden
                  className="mt-0.5 grid h-[20px] w-[20px] flex-none place-items-center rounded-full bg-teal-soft text-[11px] font-extrabold text-teal"
                >
                  ✓
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative overflow-hidden rounded-[22px] border border-line shadow-[0_18px_40px_-26px_rgba(14,59,80,0.5)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/apropos/consultation.jpg"
            alt="Un soignant souriant ausculte une patiente lors d’une consultation"
            className="h-full max-h-[440px] w-full object-cover"
            width={1200}
            height={1000}
            loading="lazy"
          />
        </div>
      </div>
    </section>

    {/* ======================= COMMENT ÇA MARCHE ======================= */}
    <section className="border-y border-line bg-white">
      <div className="mx-auto w-full max-w-[1200px] px-5 py-12 md:px-[30px] md:py-[72px]">
        <div className="text-center">
          <span className="text-[12px] font-extrabold uppercase tracking-[0.12em] text-teal">
            Comment ça marche
          </span>
          <h2 className="mx-auto mt-2.5 max-w-[560px] text-[23px] font-extrabold tracking-[-0.4px] md:text-[30px]">
            Trois étapes simples, même avec une connexion lente
          </h2>
        </div>
        <div className="mt-8 grid gap-4 md:mt-11 md:grid-cols-3 md:gap-5">
          {ETAPES.map((e) => (
            <div
              key={e.n}
              className="rounded-2xl border border-line bg-white p-5 md:p-6"
            >
              <span
                aria-hidden
                className="grid h-10 w-10 place-items-center rounded-[13px] bg-teal-soft text-[17px] font-extrabold text-blue"
              >
                {e.n}
              </span>
              <b className="mt-4 block text-[15px] font-extrabold md:text-[16px]">{e.titre}</b>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted md:text-[13.5px]">
                {e.texte}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* ======================= POUR QUI ======================= */}
    <section className="mx-auto w-full max-w-[1200px] px-5 py-12 md:px-[30px] md:py-[72px]">
      <div className="text-center">
        <span className="text-[12px] font-extrabold uppercase tracking-[0.12em] text-teal">
          Pour qui
        </span>
        <h2 className="mx-auto mt-2.5 max-w-[560px] text-[23px] font-extrabold tracking-[-0.4px] md:text-[30px]">
          Une plateforme pensée pour les deux côtés du rendez-vous
        </h2>
      </div>
      <div className="mt-8 grid gap-5 md:mt-11 md:grid-cols-2 md:gap-6">
        {/* Patients */}
        <article className="overflow-hidden rounded-[22px] border border-line bg-white shadow-[0_14px_36px_-28px_rgba(14,59,80,0.5)]">
          <div className="relative h-[200px] md:h-[240px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/apropos/patient.jpg"
              alt="Un patient souriant"
              className="absolute inset-0 h-full w-full object-cover object-[center_28%]"
              width={1100}
              height={950}
              loading="lazy"
            />
            <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-[12px] font-extrabold text-blue backdrop-blur">
              🧑 Pour les patients
            </span>
          </div>
          <div className="p-5 md:p-6">
            <p className="text-[13.5px] leading-relaxed text-muted md:text-[14px]">
              La réservation est gratuite. Vous retrouvez vos rendez-vous à venir et passés, vous les
              modifiez ou les annulez en ligne, et vous gérez ceux de vos proches — enfant, conjoint,
              parent — sans qu’ils aient besoin d’un compte.
            </p>
            <Link
              href="/resultats"
              className="mt-4 inline-flex items-center gap-1.5 text-[13.5px] font-bold text-teal transition-colors hover:text-blue"
            >
              Prendre rendez-vous →
            </Link>
          </div>
        </article>

        {/* Professionnels */}
        <article className="overflow-hidden rounded-[22px] border border-line bg-white shadow-[0_14px_36px_-28px_rgba(14,59,80,0.5)]">
          <div className="relative h-[200px] md:h-[240px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/apropos/professionnel.jpg"
              alt="Un professionnel de santé souriant en tenue médicale"
              className="absolute inset-0 h-full w-full object-cover object-[center_20%]"
              width={1000}
              height={1100}
              loading="lazy"
            />
            <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-[12px] font-extrabold text-blue backdrop-blur">
              🩺 Pour les professionnels
            </span>
          </div>
          <div className="p-5 md:p-6">
            <p className="text-[13.5px] leading-relaxed text-muted md:text-[14px]">
              Médecins, cliniques, hôpitaux et cabinets disposent d’un agenda en ligne, d’horaires
              types et d’exceptions, d’une fiche publique et de statistiques de fréquentation. Un
              médecin peut déléguer une partie de la gestion à ses assistant(e)s, avec des
              permissions précises.
            </p>
            <Link
              href="/inscription/professionnel"
              className="mt-4 inline-flex items-center gap-1.5 text-[13.5px] font-bold text-teal transition-colors hover:text-blue"
            >
              Inscrire mon cabinet →
            </Link>
          </div>
        </article>
      </div>
    </section>

    {/* ======================= CONFIANCE & DONNÉES ======================= */}
    <section className="border-y border-line bg-white">
      <div className="mx-auto w-full max-w-[1200px] px-5 py-12 md:px-[30px] md:py-[72px]">
        <div className="text-center">
          <span className="text-[12px] font-extrabold uppercase tracking-[0.12em] text-teal">
            Confiance &amp; données
          </span>
          <h2 className="mx-auto mt-2.5 max-w-[560px] text-[23px] font-extrabold tracking-[-0.4px] md:text-[30px]">
            La confiance se construit sur des règles claires
          </h2>
        </div>
        <div className="mt-8 grid gap-4 md:mt-11 md:grid-cols-3 md:gap-5">
          {[
            {
              i: "⭐",
              t: "Des avis qui engagent",
              d: "Un avis ne peut être déposé qu’après une consultation honorée, et une seule fois par consultation. Le praticien dispose d’un droit de réponse, et tout avis peut être signalé puis examiné.",
            },
            {
              i: "✅",
              t: "Des comptes vérifiés",
              d: "Les comptes professionnels sont contrôlés par notre équipe avant la mise en ligne : un praticien n’apparaît dans les résultats qu’une fois son dossier validé.",
            },
            {
              i: "🔒",
              t: "Vos données restent les vôtres",
              d: "Docteur 224 ne conserve aucun dossier médical. Seuls vos rendez-vous et les informations nécessaires à leur prise sont enregistrés — et chaque compte n’accède qu’aux siens.",
            },
          ].map((c) => (
            <div key={c.t} className="rounded-2xl border border-line bg-white p-5 md:p-6">
              <span
                aria-hidden
                className="grid h-[38px] w-[38px] place-items-center rounded-[11px] bg-teal-soft text-[18px]"
              >
                {c.i}
              </span>
              <b className="mt-3.5 block text-[15px] font-extrabold md:text-[16px]">{c.t}</b>
              <p className="mt-2 text-[13px] leading-relaxed text-muted md:text-[13.5px]">{c.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* ======================= NOS ENGAGEMENTS ======================= */}
    <section className="mx-auto w-full max-w-[1200px] px-5 py-12 md:px-[30px] md:py-[72px]">
      <div className="text-center">
        <span className="text-[12px] font-extrabold uppercase tracking-[0.12em] text-teal">
          Nos engagements
        </span>
        <h2 className="mx-auto mt-2.5 max-w-[560px] text-[23px] font-extrabold tracking-[-0.4px] md:text-[30px]">
          Ce qui guide chacun de nos choix
        </h2>
      </div>
      <div className="mt-8 grid grid-cols-2 gap-4 md:mt-11 md:grid-cols-4 md:gap-5">
        {VALEURS.map((v) => (
          <div key={v.t} className="rounded-2xl border border-line bg-white p-5">
            <span className="text-[24px]" aria-hidden>
              {v.i}
            </span>
            <b className="mt-3 block text-[14.5px] font-extrabold md:text-[15px]">{v.t}</b>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted md:text-[13px]">{v.d}</p>
          </div>
        ))}
      </div>
    </section>

    {/* ======================= APPEL À L’ACTION ======================= */}
    <section className="mx-auto w-full max-w-[1200px] px-5 pb-14 md:px-[30px] md:pb-[88px]">
      <div className="relative isolate overflow-hidden rounded-[24px] bg-[linear-gradient(135deg,var(--blue)_0%,var(--blue-deep)_100%)] px-6 py-10 text-white md:px-12 md:py-14">
        <span
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-[220px] w-[220px] rounded-full bg-white/10"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-20 -left-10 h-[200px] w-[200px] rounded-full bg-white/[0.07]"
        />
        <div className="relative max-w-[620px]">
          <h2 className="text-[24px] font-extrabold leading-tight tracking-[-0.4px] md:text-[32px]">
            Prêt à prendre rendez-vous ?
          </h2>
          <p className="mt-3 text-[14px] leading-relaxed opacity-90 md:text-[15px]">
            La recherche est ouverte à tous et la réservation ne prend que quelques minutes. Les
            professionnels de santé peuvent inscrire leur cabinet gratuitement.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/resultats"
              className="pointer-coarse:py-3 rounded-[12px] bg-white px-5 py-3 text-[14px] font-bold text-blue transition-colors hover:bg-teal-soft"
            >
              Trouver un médecin
            </Link>
            <Link
              href="/inscription/professionnel"
              className="pointer-coarse:py-3 rounded-[12px] border-[1.5px] border-white/40 px-5 py-3 text-[14px] font-bold text-white transition-colors hover:bg-white/10"
            >
              Je suis professionnel de santé
            </Link>
          </div>
        </div>
      </div>
    </section>
  </>
);

export default function APropos() {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <TopNav />

      {/* ===================== MOBILE ===================== */}
      <div className="with-tabbar md:hidden">
        <EnTeteMobile variante="page" titre="À propos" retour="/" />
        {contenu}
        <PiedPageMobile />
        <TabBarMobile role="public" />
      </div>

      {/* ====================== WEB ======================= */}
      <main className="hidden flex-1 md:block">{contenu}</main>

      <Footer />
    </div>
  );
}
