"use client";

import Link from "next/link";
import PatientShell from "@/components/patient/PatientShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import AvatarMedecin from "@/components/site/AvatarMedecin";
import Etoiles from "@/components/site/Etoiles";
import { useFavori, useMesFavoris, type MedecinFavori } from "@/lib/favoris";
import { formatGNF } from "@/lib/format";

/*
 * Mes médecins favoris. Sert au rebooking : le patient retrouve d'un coup
 * les praticiens qu'il consulte, sans repasser par la recherche.
 */

const initiales = (nom: string) =>
  nom
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m.charAt(0))
    .join("")
    .toUpperCase() || "?";

/** Le cœur d'une carte : il retire de la liste et doit la faire recharger. */
function BoutonRetirer({
  medecin,
  apres,
  mobile = false,
}: {
  medecin: MedecinFavori;
  apres: () => void;
  mobile?: boolean;
}) {
  const { basculer } = useFavori(medecin.id);
  const libelle = `Retirer ${medecin.civilite} ${medecin.nom} de mes favoris`;
  return (
    <button
      type="button"
      aria-label={libelle}
      title={libelle}
      onClick={async () => {
        await basculer();
        apres();
      }}
      className={
        mobile
          ? "btnm dg"
          : "rounded-[9px] border-[1.5px] border-[#F3C9C2] bg-white px-3 py-1.5 text-[11.5px] font-bold text-red transition-colors hover:bg-red-soft"
      }
    >
      ♥ Retirer
    </button>
  );
}

export default function MesFavoris() {
  const { favoris, chargement, recharger } = useMesFavoris();

  const vide = !chargement && favoris.length === 0;

  return (
    <PatientShell>
      {/* ===== Version mobile ===== */}
      <div className="md:hidden">
        <EnTeteMobile retour="/patient/compte" titre="Mes favoris" />
        <div className="pad">
          <div className="card2">
            <h4>Médecins mis de côté</h4>
            {chargement && (
              <p className="muted" style={{ fontSize: 13 }}>
                Chargement…
              </p>
            )}
            {vide && (
              <p className="muted" style={{ fontSize: 13 }}>
                Aucun favori pour l’instant. Ouvrez la fiche d’un médecin et touchez « ♡ Favori ».
              </p>
            )}
            {favoris.map((m) => (
              <div key={m.id} className="asstrowm">
                <Link href={`/medecin/${m.id}`} className="meta" style={{ flex: 1 }}>
                  <b>
                    {m.civilite} {m.nom}
                  </b>
                  <small>
                    {m.specialite} · {m.ville}
                    {m.tarif ? ` · ${formatGNF(m.tarif)}` : ""}
                  </small>
                </Link>
                <BoutonRetirer mobile medecin={m} apres={recharger} />
              </div>
            ))}
          </div>
          {!vide && (
            <Link href="/resultats" className="btn ghost block">
              Chercher d’autres médecins
            </Link>
          )}
        </div>
      </div>

      {/* ===== Version web ===== */}
      <div className="hidden md:block">
        <div className="mb-5">
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Mes favoris</h2>
          <small className="text-[13px] text-muted">
            Les médecins que vous avez mis de côté, pour reprendre rendez-vous plus vite
          </small>
        </div>

        {chargement && <p className="text-[13px] text-muted">Chargement…</p>}

        {vide && (
          <div className="rounded-2xl border border-line bg-white p-8 text-center">
            <div className="mb-2 text-3xl" aria-hidden>
              ♡
            </div>
            <b className="block text-sm font-extrabold">Aucun favori pour l’instant</b>
            <p className="mx-auto mt-1 max-w-[420px] text-[12.5px] text-muted">
              Sur la fiche d’un médecin, cliquez sur « Favori » : il apparaîtra ici et vous
              n’aurez plus à le chercher.
            </p>
            <Link
              href="/resultats"
              className="mt-4 inline-block rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
            >
              Trouver un médecin
            </Link>
          </div>
        )}

        <div className="grid gap-3 lg:grid-cols-2">
          {favoris.map((m) => (
            <div
              key={m.id}
              className="flex items-start gap-[13px] rounded-2xl border border-line bg-white p-4"
            >
              <AvatarMedecin
                photoUrl={m.photo}
                initiales={initiales(m.nom)}
                gradient="linear-gradient(135deg,#2E9CCA,#15506B)"
                taille={52}
                arrondi={14}
              />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/medecin/${m.id}`}
                  className="block truncate text-sm font-extrabold hover:text-teal"
                >
                  {m.civilite} {m.nom}
                </Link>
                <div className="text-[12.5px] font-bold text-teal">{m.specialite}</div>
                <div className="mt-0.5 truncate text-[11.5px] text-muted">
                  {m.etablissement} · {m.ville}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {m.nbAvis > 0 && (
                    <span className="flex items-center gap-1 text-[11.5px] text-muted">
                      <Etoiles note={m.note ?? 0} taille={12} /> {m.nbAvis} avis
                    </span>
                  )}
                  {m.tarif ? (
                    <span className="text-[11.5px] font-bold text-blue">
                      {formatGNF(m.tarif)}
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/medecin/${m.id}`}
                    className="rounded-[9px] bg-teal px-3 py-1.5 text-[11.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
                  >
                    Prendre rendez-vous
                  </Link>
                  <BoutonRetirer medecin={m} apres={recharger} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PatientShell>
  );
}
