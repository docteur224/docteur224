"use client";

import AdminShell from "@/components/admin/AdminShell";
import {
  modererAvis,
  traiterSignalement,
  useAvisAModerer,
  useSignalements,
} from "@/lib/mock-admin";

/*
 * Modération — reproduit l'écran « admin-moderation » de la maquette web :
 * signalements et avis à traiter. Chaque décision retire l'élément de la
 * file et est tracée dans le journal d'audit.
 */

export default function ModerationAdmin() {
  const signalements = useSignalements();
  const avis = useAvisAModerer();

  const boutonPrimaire =
    "rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc]";
  const boutonGhost =
    "rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg";
  const boutonDanger =
    "rounded-[9px] border-[1.5px] border-[#F3CDC8] bg-white px-[14px] py-2 text-[12.5px] font-bold text-red transition-colors hover:bg-[#FBE9E7]";

  return (
    <AdminShell>
      <div className="mb-5">
        <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Modération</h2>
        <small className="text-[13px] text-muted">Signalements et avis à traiter</small>
      </div>

      <div className="mb-4 flex items-start gap-[9px] rounded-xl border border-[#BFE0EF] bg-teal-soft px-[14px] py-3 text-[12.5px] font-semibold leading-relaxed text-blue">
        <span aria-hidden>🚩</span>
        <div>
          Traitez les signalements et les avis abusifs. Un signalement confirmé peut entraîner un
          avertissement ou une suspension du compte concerné.
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">
          Signalements · {signalements.length}
        </h3>
        {signalements.length === 0 && (
          <p className="py-3 text-[12.5px] text-muted">
            ✅ Tous les signalements ont été traités.
          </p>
        )}
        {signalements.map((signalement) => (
          <div
            key={signalement.id}
            className="flex flex-wrap items-center gap-[13px] border-b border-line py-[14px] last:border-b-0"
          >
            <span
              aria-hidden
              className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl text-sm text-white"
              style={{ background: "linear-gradient(135deg,#9AA8B2,#647A89)" }}
            >
              ⚠️
            </span>
            <div className="min-w-0 flex-1">
              <b className="block text-sm font-extrabold">{signalement.titre}</b>
              <small className="text-xs text-muted">{signalement.detail}</small>
            </div>
            <button
              type="button"
              onClick={() => traiterSignalement(signalement, "examiné")}
              className={boutonPrimaire}
            >
              Examiner
            </button>
            <button
              type="button"
              onClick={() =>
                traiterSignalement(
                  signalement,
                  signalement.sanction === "Suspendre" ? "suspendu" : "averti"
                )
              }
              className={signalement.sanction === "Suspendre" ? boutonDanger : boutonGhost}
            >
              {signalement.sanction}
            </button>
          </div>
        ))}
        <p className="mt-3 text-[11.5px] text-muted">
          Mode démonstration : « Examiner » classe le signalement après examen. Chaque décision
          est tracée dans le journal d’audit.
        </p>
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">Avis à modérer · {avis.length}</h3>
        {avis.length === 0 && (
          <p className="py-3 text-[12.5px] text-muted">✅ Tous les avis ont été modérés.</p>
        )}
        {avis.map((a) => (
          <div key={a.id} className="mt-[10px] rounded-xl border border-line p-[13px]">
            <div className="flex flex-wrap items-center justify-between gap-[10px]">
              <b className="text-[13.5px]">{a.titre}</b>
              <span className="rounded-lg bg-amber-soft px-[9px] py-1 text-[11px] font-bold text-amber">
                {a.etiquette}
              </span>
            </div>
            <p className="mb-[10px] mt-2 text-[12.5px] text-muted">{a.extrait}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => modererAvis(a, "conservé")}
                className={boutonGhost}
              >
                Conserver
              </button>
              <button
                type="button"
                onClick={() => modererAvis(a, "masqué")}
                className={boutonGhost}
              >
                Masquer
              </button>
              <button
                type="button"
                onClick={() => modererAvis(a, "supprimé")}
                className={boutonDanger}
              >
                Supprimer
              </button>
            </div>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
