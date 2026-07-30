import Link from "next/link";
import TopNav from "@/components/site/TopNav";
import Footer from "@/components/site/Footer";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import TabBarMobile from "@/components/mobile/TabBarMobile";
import AvatarMedecin from "@/components/site/AvatarMedecin";
import { formatNote } from "@/lib/format";
import {
  chargerEtablissements,
  chargerMedecins,
  chargerSpecialites,
  nomComplet,
} from "@/lib/donnees";

/** Les vedettes et référentiels sont relus au plus toutes les 60 s. */
export const revalidate = 60;

/**
 * Page d'accueil — reproduit l'écran « accueil » de la maquette web
 * (hero de recherche à 3 filtres, spécialités, comment ça marche, vedettes).
 * Les cartes sont alimentées par Supabase (lib/donnees.ts).
 */
export default async function Accueil() {
  const [tousMedecins, tousEtablissements, specialites] = await Promise.all([
    chargerMedecins(),
    chargerEtablissements(),
    chargerSpecialites(),
  ]);
  const medecinsEnVedette = tousMedecins.slice(0, 3);
  const etablissementsEnVedette = tousEtablissements.slice(0, 3);
  const getEtablissement = (id: string) => tousEtablissements.find((e) => e.id === id);
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <TopNav lienActif="trouver" />

      {/* ================= VERSION MOBILE (écran « accueil » de la maquette mobile) ================= */}
      <div className="with-tabbar md:hidden">
        {/* La barre doit rester le frère immédiat du héros : c'est ce qui
            permet au dégradé de remonter dessous (.topbar.hero + .hero). */}
        <EnTeteMobile variante="hero" />
        <div className="hero">
          <div className="hi">Bonjour 👋</div>
          <h2>
            Trouvez un médecin
            <br />
            et prenez rendez-vous
          </h2>
          <form action="/resultats" className="searchbox">
            <label className="field">
              <span className="ic" aria-hidden>
                🩺
              </span>
              <input name="specialite" placeholder="Spécialité (ex. Pédiatrie)" />
            </label>
            <label className="field">
              <span className="ic" aria-hidden>
                📍
              </span>
              <input name="ville" placeholder="Ville (ex. Conakry)" />
            </label>
            <label className="field">
              <span className="ic" aria-hidden>
                🔎
              </span>
              <input name="q" placeholder="Médecin ou établissement" />
            </label>
            <button type="submit" className="btn block">
              🔎 Rechercher
            </button>
          </form>
        </div>
        <div className="pad">
          <div className="section-t">Spécialités courantes</div>
          <div className="chips scroll">
            {specialites.slice(0, 5).map((s) => (
              <Link
                key={s.nom}
                href={`/resultats?specialite=${encodeURIComponent(s.nom)}`}
                className="speccard"
              >
                <span className="em" aria-hidden>
                  {s.emoji}
                </span>
                <b>{s.nom}</b>
              </Link>
            ))}
          </div>

          <div className="section-t">Comment ça marche</div>
          <div className="steps">
            <div className="step">
              <div className="n">1</div>
              <div>
                <b>Cherchez</b>
                <small>Par spécialité, ville ou nom du médecin.</small>
              </div>
            </div>
            <div className="step">
              <div className="n">2</div>
              <div>
                <b>Choisissez un créneau</b>
                <small>Voyez les disponibilités en temps réel.</small>
              </div>
            </div>
            <div className="step">
              <div className="n">3</div>
              <div>
                <b>Confirmez</b>
                <small>Recevez un SMS et un e-mail de confirmation.</small>
              </div>
            </div>
          </div>

          <div className="section-t">Médecins en vedette</div>
          {medecinsEnVedette.map((m) => {
            const etab = getEtablissement(m.etablissementId);
            return (
              <Link key={m.id} href={`/medecin/${m.id}`} className="doc">
                {m.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.photoUrl} alt="" className="av" style={{ objectFit: "cover" }} />
                ) : (
                  <span className="av" aria-hidden style={{ background: m.gradient }}>
                    {m.initiales}
                  </span>
                )}
                <span className="info">
                  <b>{nomComplet(m)}</b>
                  <span className="spec">{m.specialite}</span>
                  <span className="meta">
                    📍 {etab?.nom} · {m.ville}
                  </span>
                  <span className="row2">
                    <span className={`pill ${m.disponibilite.type === "aujourdhui" ? "ok" : "soon"}`}>
                      {m.disponibilite.label}
                    </span>
                    {/* Pas de tarif : la réservation est gratuite. */}
                  </span>
                </span>
              </Link>
            );
          })}

          <div className="section-t">Établissements en vedette</div>
          {etablissementsEnVedette.map((e) => (
            <Link key={e.id} href={`/resultats?q=${encodeURIComponent(e.nom)}`} className="doc">
              <span className="av" aria-hidden style={{ background: e.gradient }}>
                🏥
              </span>
              <span className="info">
                <b>{e.nom}</b>
                <span className="spec">{e.type}</span>
                <span className="meta">
                  📍 {e.quartier} · {e.ville}
                </span>
                <span className="row2">
                  <span className="pill ok">
                    {e.nbMedecins}
                    {e.id === "e-chu" ? "+" : ""} médecins
                  </span>
                  <span className="price">★ {formatNote(e.note)}</span>
                </span>
              </span>
            </Link>
          ))}
        </div>
        <TabBarMobile role="public" />
      </div>

      {/* ================= VERSION WEB (inchangée) ================= */}
      <div className="hidden md:block">
      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden bg-[linear-gradient(150deg,var(--blue)_0%,var(--blue-deep)_100%)] px-[30px] pb-16 pt-[54px] text-center text-white">
        <span
          aria-hidden
          className="absolute -right-20 -top-20 h-[280px] w-[280px] rounded-full bg-[rgba(46,156,202,.22)]"
        />
        <span
          aria-hidden
          className="absolute -bottom-[110px] -left-[60px] h-60 w-60 rounded-full bg-[rgba(46,156,202,.14)]"
        />
        <span className="relative inline-block rounded-[30px] bg-white/12 px-[14px] py-[6px] text-[13px] font-bold tracking-[.04em] opacity-85">
          🇬🇳 La santé accessible en Guinée
        </span>
        <h1 className="relative mx-auto mb-[10px] mt-4 text-[30px] font-extrabold leading-[1.12] tracking-[-1px] md:text-[40px]">
          Trouvez un médecin et
          <br />
          prenez rendez-vous en ligne
        </h1>
        <p className="relative mx-auto max-w-[560px] text-base opacity-90">
          Recherchez par spécialité, ville ou établissement. Réservez en quelques clics et recevez
          votre confirmation par SMS.
        </p>

        {/* Bandeau de recherche à 3 filtres (spec C.1.1) */}
        <form
          action="/resultats"
          className="relative mx-auto mt-7 flex max-w-[780px] flex-col items-stretch gap-1 rounded-2xl bg-white p-2 text-ink shadow-[0_18px_40px_rgba(0,0,0,.22)] md:flex-row md:items-center"
        >
          <label className="flex flex-1 items-center gap-[10px] rounded-[11px] px-[14px] py-3 text-left">
            <span className="text-base text-teal" aria-hidden>
              🩺
            </span>
            <span className="block w-full">
              <b className="block text-xs font-bold text-ink">Spécialité</b>
              <input
                name="specialite"
                placeholder="Ex. Cardiologie"
                className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-muted"
              />
            </span>
          </label>
          <label className="flex flex-1 items-center gap-[10px] rounded-[11px] border-t border-line px-[14px] py-3 text-left md:border-l md:border-t-0">
            <span className="text-base text-teal" aria-hidden>
              📍
            </span>
            <span className="block w-full">
              <b className="block text-xs font-bold text-ink">Ville</b>
              <input
                name="ville"
                placeholder="Ex. Kankan"
                className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-muted"
              />
            </span>
          </label>
          <label className="flex flex-1 items-center gap-[10px] rounded-[11px] border-t border-line px-[14px] py-3 text-left md:border-l md:border-t-0">
            <span className="text-base text-teal" aria-hidden>
              🔎
            </span>
            <span className="block w-full">
              <b className="block text-xs font-bold text-ink">Médecin ou établissement</b>
              <input
                name="q"
                placeholder="Ex. Dr Barry, Clinique A. Paré"
                className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-muted"
              />
            </span>
          </label>
          <button
            type="submit"
            className="rounded-[11px] bg-teal px-[26px] py-[15px] text-[15px] font-bold text-white transition-colors hover:bg-[#2790bc]"
          >
            🔎 Rechercher
          </button>
        </form>

        <div className="relative mt-[30px] flex justify-center gap-[42px]">
          <div>
            <b className="block text-2xl font-extrabold">320+</b>
            <small className="text-xs font-semibold opacity-80">Médecins inscrits</small>
          </div>
          <div>
            <b className="block text-2xl font-extrabold">8</b>
            <small className="text-xs font-semibold opacity-80">Villes couvertes</small>
          </div>
          <div>
            <b className="block text-2xl font-extrabold">15 000+</b>
            <small className="text-xs font-semibold opacity-80">Patients accompagnés</small>
          </div>
        </div>
      </section>

      {/* ===== SPÉCIALITÉS ===== */}
      <section className="py-[46px]">
        <div className="mx-auto max-w-[1020px] px-[30px]">
          <h2 className="text-center text-2xl font-extrabold tracking-[-0.4px]">
            Trouvez le bon spécialiste
          </h2>
          <p className="mt-[7px] text-center text-sm text-muted">
            Accédez directement aux spécialités les plus demandées.
          </p>
          <div className="mt-[26px] flex flex-wrap justify-center gap-3">
            {specialites.map((s) => (
              <Link
                key={s.nom}
                href={`/resultats?specialite=${encodeURIComponent(s.nom)}`}
                className="flex min-w-[104px] flex-col items-center gap-[7px] rounded-[14px] border border-line bg-white px-5 py-4 transition hover:-translate-y-0.5 hover:shadow-[0_8px_18px_rgba(16,59,80,.1)]"
              >
                <span className="text-[26px]" aria-hidden>
                  {s.emoji}
                </span>
                <b className="text-[13px] font-bold">{s.nom}</b>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ===== COMMENT ÇA MARCHE ===== */}
      <section id="comment-ca-marche" className="border-y border-line bg-white py-[46px]">
        <div className="mx-auto max-w-[1020px] px-[30px]">
          <h2 className="text-center text-2xl font-extrabold tracking-[-0.4px]">
            Comment ça marche
          </h2>
          <p className="mt-[7px] text-center text-sm text-muted">
            Trois étapes simples, même avec une connexion lente.
          </p>
          <div className="mt-[30px] grid gap-[18px] md:grid-cols-3">
            {[
              {
                n: "1",
                titre: "Cherchez",
                texte: "Par spécialité, ville, établissement ou nom du médecin.",
              },
              {
                n: "2",
                titre: "Choisissez un créneau",
                texte:
                  "Consultez les disponibilités réelles et réservez l'horaire qui vous convient.",
              },
              {
                n: "3",
                titre: "Confirmez",
                texte:
                  "Recevez une confirmation par SMS et e-mail, avec un rappel avant le rendez-vous.",
              },
            ].map((etape) => (
              <div
                key={etape.n}
                className="rounded-2xl border border-line bg-white px-[22px] py-[26px] text-center"
              >
                <div className="mx-auto mb-[14px] grid h-[46px] w-[46px] place-items-center rounded-[14px] bg-teal-soft text-lg font-extrabold text-blue">
                  {etape.n}
                </div>
                <b className="mb-1.5 block text-base font-extrabold">{etape.titre}</b>
                <small className="text-[13px] leading-normal text-muted">{etape.texte}</small>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== MÉDECINS EN VEDETTE ===== */}
      <section className="py-[46px]">
        <div className="mx-auto max-w-[1020px] px-[30px]">
          <h2 className="text-center text-2xl font-extrabold tracking-[-0.4px]">
            Médecins en vedette à Conakry
          </h2>
          <p className="mt-[7px] text-center text-sm text-muted">
            Des professionnels vérifiés, près de chez vous.
          </p>
          <div className="mt-[30px] grid gap-[18px] md:grid-cols-3">
            {medecinsEnVedette.map((m) => {
              const etab = getEtablissement(m.etablissementId);
              return (
                <Link
                  key={m.id}
                  href={`/medecin/${m.id}`}
                  className="rounded-2xl border border-line bg-white p-5 text-center transition hover:-translate-y-[3px] hover:shadow-[0_12px_26px_rgba(16,59,80,.1)]"
                >
                  <div className="mx-auto mb-3 w-16">
                    <AvatarMedecin
                      photoUrl={m.photoUrl}
                      initiales={m.initiales}
                      gradient={m.gradient}
                      taille={64}
                    />
                  </div>
                  <b className="block text-base font-extrabold">{nomComplet(m)}</b>
                  <div className="mb-2 mt-0.5 text-[13px] font-bold text-teal">{m.specialite}</div>
                  <div className="text-xs leading-relaxed text-muted">
                    📍 {etab?.nom}
                    <br />
                    {m.ville}
                  </div>
                  <div className="mt-[14px] flex items-center justify-between border-t border-line pt-[14px]">
                    <span className="text-[12.5px] font-bold text-amber">★ {formatNote(m.note)}</span>
                    {/* Pas de tarif : la réservation est gratuite. */}
                    <span className="text-[12.5px] font-bold text-teal">
                      {m.disponibilite.label}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== ÉTABLISSEMENTS EN VEDETTE ===== */}
      <section className="border-t border-line bg-white py-[46px]">
        <div className="mx-auto max-w-[1020px] px-[30px]">
          <h2 className="text-center text-2xl font-extrabold tracking-[-0.4px]">
            Établissements en vedette
          </h2>
          <p className="mt-[7px] text-center text-sm text-muted">
            Cliniques, hôpitaux et centres de santé partenaires.
          </p>
          <div className="mt-[30px] grid gap-[18px] md:grid-cols-3">
            {etablissementsEnVedette.map((e) => (
              <Link
                key={e.id}
                href={`/resultats?q=${encodeURIComponent(e.nom)}`}
                className="rounded-2xl border border-line bg-white p-5 text-center transition hover:-translate-y-[3px] hover:shadow-[0_12px_26px_rgba(16,59,80,.1)]"
              >
                <span
                  aria-hidden
                  className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-2xl text-[22px] text-white"
                  style={{ background: e.gradient }}
                >
                  🏥
                </span>
                <b className="block text-base font-extrabold">{e.nom}</b>
                <div className="mb-2 mt-0.5 text-[13px] font-bold text-teal">{e.type}</div>
                <div className="text-xs leading-relaxed text-muted">
                  📍 {e.quartier}
                  <br />
                  {e.ville}
                </div>
                <div className="mt-[14px] flex items-center justify-between border-t border-line pt-[14px]">
                  <span className="text-[12.5px] font-bold text-amber">★ {formatNote(e.note)}</span>
                  <span className="text-[13px] font-extrabold">
                    {e.nbMedecins}
                    {e.id === "e-chu" ? "+" : ""} médecins
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
      </div>

      <Footer />
    </div>
  );
}
