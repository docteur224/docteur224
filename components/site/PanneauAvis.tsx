import Etoiles from "@/components/site/Etoiles";
import SignalerAvis from "@/components/site/SignalerAvis";
import { formatNote } from "@/lib/format";
import { MOIS_LONGS } from "@/lib/dates";
import { repartitionNotes, type AvisPublic } from "@/lib/donnees";

/*
 * Volet « Avis » de la fiche médecin : note moyenne, répartition par étoile,
 * puis la liste des avis publiés avec la réponse du médecin quand il y en a.
 *
 * Composant serveur : les avis arrivent déjà chargés par la page, rien ici
 * n'a besoin d'interactivité.
 */

/** « 14 mars 2026 » à partir d'un timestamptz Postgres. */
function dateLisible(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getDate()} ${MOIS_LONGS[d.getMonth()]} ${d.getFullYear()}`;
}

function Initiale({ auteur }: { auteur: string }) {
  return (
    <span
      aria-hidden
      className="grid h-9 w-9 flex-none place-items-center rounded-full bg-teal-soft text-[13px] font-extrabold text-blue"
    >
      {auteur.charAt(0).toUpperCase() || "?"}
    </span>
  );
}

export default function PanneauAvis({
  avis,
  nomMedecin,
}: {
  avis: AvisPublic[];
  nomMedecin: string;
}) {
  const { moyenne, total, lignes } = repartitionNotes(avis);

  if (total === 0) {
    return (
      <div className="px-[26px] py-6">
        <div className="py-8 text-center">
          <div className="text-3xl" aria-hidden>
            ⭐
          </div>
          <b className="mt-3 block text-[15px] font-extrabold">Aucun avis pour le moment</b>
          <p className="mx-auto mt-2 max-w-[380px] text-[13px] leading-relaxed text-muted">
            Les avis sont publiés par les patients après une consultation honorée.
            Soyez le premier à partager votre expérience avec {nomMedecin}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-[26px] py-6">
      {/* ===== Synthèse : moyenne + répartition ===== */}
      <div className="mb-6 grid gap-6 rounded-2xl border border-line bg-bg p-5 sm:grid-cols-[170px_1fr]">
        <div className="text-center sm:border-r sm:border-line">
          <b className="block text-[38px] font-extrabold leading-none text-blue">
            {formatNote(moyenne)}
          </b>
          <div className="mt-2">
            <Etoiles note={moyenne} taille={17} />
          </div>
          <small className="mt-1.5 block text-xs text-muted">
            {total} avis vérifié{total > 1 ? "s" : ""}
          </small>
        </div>
        <div className="flex flex-col justify-center gap-[7px]">
          {lignes.map((l) => (
            <div key={l.etoiles} className="flex items-center gap-[10px] text-[12px]">
              <span className="w-[38px] flex-none font-bold text-muted">{l.etoiles} ★</span>
              <span className="h-[7px] flex-1 overflow-hidden rounded-full bg-[#E3EAEF]">
                <span
                  className="block h-full rounded-full bg-[#E8A33D]"
                  style={{ width: `${l.pourcentage}%` }}
                />
              </span>
              <span className="w-[26px] flex-none text-right font-bold text-muted">{l.nb}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ===== Liste des avis ===== */}
      <ul className="flex flex-col gap-[14px]">
        {avis.map((a) => (
          <li key={a.id} className="rounded-2xl border border-line bg-white p-[18px]">
            <div className="flex items-start gap-3">
              <Initiale auteur={a.auteur} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <b className="text-[13.5px] font-extrabold">{a.auteur}</b>
                  <span className="rounded-md bg-green-soft px-[7px] py-[2px] text-[10px] font-bold text-green">
                    ✔ Consultation vérifiée
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <Etoiles note={a.note} />
                  <small className="text-[11.5px] text-muted">{dateLisible(a.creeLe)}</small>
                </div>
                {a.commentaire && (
                  <p className="mt-2 text-[13px] leading-[1.6] text-[#3f5360]">{a.commentaire}</p>
                )}

                {a.reponseMedecin && (
                  <div className="mt-3 rounded-xl border-l-[3px] border-teal bg-teal-soft/50 px-[14px] py-[11px]">
                    <b className="block text-[12px] font-extrabold text-blue">
                      Réponse de {nomMedecin}
                    </b>
                    <p className="mt-1 text-[12.5px] leading-[1.6] text-[#3f5360]">
                      {a.reponseMedecin}
                    </p>
                    {a.reponseLe && (
                      <small className="mt-1 block text-[11px] text-muted">
                        {dateLisible(a.reponseLe)}
                      </small>
                    )}
                  </div>
                )}

                {/* Sans ce bouton, la file de modération ne se remplirait
                    jamais : les avis sont publiés dès leur dépôt. */}
                <SignalerAvis avisId={a.id} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
