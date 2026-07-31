"use client";

import { useState } from "react";
import Link from "next/link";
import PatientShell from "@/components/patient/PatientShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import Etoiles from "@/components/site/Etoiles";
import EtoilesSaisie from "@/components/site/EtoilesSaisie";
import { formatDateCourte } from "@/lib/dates";
import { modifierMonAvis, supprimerMonAvis, useMesAvis, type MonAvis } from "@/lib/avis";

/*
 * Mes avis — relire, corriger ou retirer les avis déjà déposés. Les notes des
 * médecins sont recalculées par le trigger `avis_recalcule_note` : rien à
 * mettre à jour à la main ici.
 */

export default function MesAvis() {
  const { avis, chargement, recharger } = useMesAvis();
  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [brouillon, setBrouillon] = useState({ note: 5, commentaire: "" });
  const [aSupprimer, setASupprimer] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  function commencerEdition(a: MonAvis) {
    setEnEdition(a.id);
    setBrouillon({ note: a.note, commentaire: a.commentaire });
    setASupprimer(null);
    setMessage("");
  }

  async function enregistrer(a: MonAvis) {
    const res = await modifierMonAvis(a.id, brouillon);
    setMessage(res.erreur ? `⚠️ ${res.erreur}` : "✓ Votre avis a été mis à jour.");
    setEnEdition(null);
    recharger();
  }

  /* Suppression en deux temps, comme sur « Mes proches ». */
  async function supprimer(a: MonAvis) {
    if (aSupprimer !== a.id) {
      setASupprimer(a.id);
      setMessage("");
      return;
    }
    const res = await supprimerMonAvis(a.id);
    setMessage(res.erreur ? `⚠️ ${res.erreur}` : "✓ Votre avis a été retiré.");
    setASupprimer(null);
    recharger();
  }

  const vide = !chargement && avis.length === 0;
  const couleurMessage = message.startsWith("⚠️") ? "text-red" : "text-green";

  /** Le corps commun aux deux rendus, un avis à la fois. */
  const contenu = (a: MonAvis, mobile: boolean) => {
    const edite = enEdition === a.id;
    return (
      <>
        <div className={mobile ? "" : "flex flex-wrap items-start justify-between gap-3"}>
          <div>
            <Link
              href={`/medecin/${a.medecinId}`}
              className={
                mobile
                  ? ""
                  : "text-sm font-extrabold hover:text-teal"
              }
            >
              <b>{a.medecinNom}</b>
            </Link>
            <div className={mobile ? "" : "text-[11.5px] text-muted"}>
              <small>
                {a.specialite}
                {a.dateConsultation ? ` · consultation du ${formatDateCourte(a.dateConsultation)}` : ""}
              </small>
            </div>
          </div>
          {!edite && (
            <div className={mobile ? "" : "flex flex-none gap-2"} style={mobile ? { display: "flex", gap: 6, marginTop: 8 } : undefined}>
              <button
                type="button"
                className={
                  mobile
                    ? "btnm gh"
                    : "rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue transition-colors hover:bg-bg"
                }
                onClick={() => commencerEdition(a)}
              >
                Modifier
              </button>
              <button
                type="button"
                className={
                  mobile
                    ? "btnm dg"
                    : "rounded-[9px] border-[1.5px] border-[#F3C9C2] bg-white px-3 py-1.5 text-[11.5px] font-bold text-red transition-colors hover:bg-red-soft"
                }
                onClick={() => supprimer(a)}
              >
                {aSupprimer === a.id ? "Confirmer" : "Retirer"}
              </button>
            </div>
          )}
        </div>

        {edite ? (
          <div style={{ marginTop: 12 }}>
            {/* `nom` unique : les deux rendus (mobile et web) coexistent dans
                le DOM, deux groupes de radios homonymes se voleraient la
                sélection. */}
            <EtoilesSaisie
              nom={`note-${mobile ? "m" : "w"}-${a.id}`}
              note={brouillon.note}
              onChange={(n) => setBrouillon({ ...brouillon, note: n })}
            />
            <textarea
              rows={4}
              className={
                mobile
                  ? "inp"
                  : "mt-3 w-full rounded-[11px] border border-line bg-white px-[13px] py-2.5 text-[13.5px] leading-relaxed outline-none focus:border-teal"
              }
              value={brouillon.commentaire}
              onChange={(e) => setBrouillon({ ...brouillon, commentaire: e.target.value })}
            />
            <div className={mobile ? "" : "mt-3 flex gap-2"} style={mobile ? { display: "flex", gap: 6 } : undefined}>
              <button
                type="button"
                className={
                  mobile
                    ? "btnm"
                    : "rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
                }
                onClick={() => enregistrer(a)}
              >
                Enregistrer
              </button>
              <button
                type="button"
                className={
                  mobile
                    ? "btnm gh"
                    : "rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
                }
                onClick={() => setEnEdition(null)}
              >
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 10 }}>
            <Etoiles note={a.note} />
            {a.commentaire && (
              <p
                className={mobile ? "" : "mt-1.5 text-[13px] leading-relaxed text-[#3f5360]"}
                style={mobile ? { fontSize: 12.5, lineHeight: 1.6, marginTop: 6 } : undefined}
              >
                {a.commentaire}
              </p>
            )}
            {a.statut !== "publie" && (
              <p
                className={mobile ? "" : "mt-1.5 text-[11.5px] font-bold text-red"}
                style={mobile ? { fontSize: 11.5, fontWeight: 700, color: "var(--red)" } : undefined}
              >
                Cet avis n’est plus affiché publiquement (modération).
              </p>
            )}
            {a.reponseMedecin && (
              <div
                className={mobile ? "" : "mt-2 rounded-xl bg-teal-soft px-3 py-2"}
                style={
                  mobile
                    ? { marginTop: 8, background: "var(--teal-soft, #EAF4F9)", borderRadius: 10, padding: "8px 10px" }
                    : undefined
                }
              >
                <b className={mobile ? "" : "block text-[11.5px] font-extrabold text-blue"} style={mobile ? { fontSize: 11.5 } : undefined}>
                  Réponse de {a.medecinNom}
                </b>
                <span
                  className={mobile ? "" : "text-[12.5px] text-[#3f5360]"}
                  style={mobile ? { fontSize: 12 } : undefined}
                >
                  {a.reponseMedecin}
                </span>
              </div>
            )}
          </div>
        )}
      </>
    );
  };

  return (
    <PatientShell>
      {/* ===== Version mobile ===== */}
      <div className="md:hidden">
        <EnTeteMobile retour="/patient/compte" titre="Mes avis" />
        <div className="pad">
          {chargement && (
            <p className="muted" style={{ fontSize: 13 }}>
              Chargement…
            </p>
          )}
          {vide && (
            <div className="card2">
              <h4>Aucun avis déposé</h4>
              <p className="muted" style={{ fontSize: 12.5 }}>
                Après une consultation honorée, vous pourrez noter le médecin depuis le détail du
                rendez-vous.
              </p>
            </div>
          )}
          {avis.map((a) => (
            <div key={a.id} className="card2">
              {contenu(a, true)}
            </div>
          ))}
          {message && (
            <div
              style={{
                color: message.startsWith("⚠️") ? "var(--red)" : "var(--green)",
                fontSize: 12.5,
                fontWeight: 700,
              }}
            >
              {message}
            </div>
          )}
        </div>
      </div>

      {/* ===== Version web ===== */}
      <div className="hidden md:block">
        <div className="mb-5">
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Mes avis</h2>
          <small className="text-[13px] text-muted">
            Les avis que vous avez laissés — vous pouvez les corriger ou les retirer à tout moment
          </small>
        </div>

        {chargement && <p className="text-[13px] text-muted">Chargement…</p>}

        {vide && (
          <div className="rounded-2xl border border-line bg-white p-8 text-center">
            <div className="mb-2 text-3xl" aria-hidden>
              ⭐
            </div>
            <b className="block text-sm font-extrabold">Vous n’avez pas encore donné d’avis</b>
            <p className="mx-auto mt-1 max-w-[460px] text-[12.5px] text-muted">
              Un avis se dépose depuis le détail d’une consultation honorée : c’est ce qui garantit
              qu’il vient d’un patient réellement reçu.
            </p>
            <Link
              href="/mes-rendez-vous"
              className="mt-4 inline-block rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
            >
              Voir mes rendez-vous
            </Link>
          </div>
        )}

        <div className="grid gap-3">
          {avis.map((a) => (
            <div key={a.id} className="rounded-2xl border border-line bg-white p-4">
              {contenu(a, false)}
            </div>
          ))}
        </div>

        {message && <p className={`mt-3 text-[12.5px] font-bold ${couleurMessage}`}>{message}</p>}
      </div>
    </PatientShell>
  );
}
