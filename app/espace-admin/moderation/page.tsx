"use client";

import { useState } from "react";
import AdminShell from "@/components/admin/AdminShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import IndicateursAvis from "@/components/admin/IndicateursAvis";
import {
  modererAvis,
  traiterSignalement,
  useAvisAModerer,
  useSignalements,
} from "@/lib/admin";

/*
 * Modération — reproduit l'écran « admin-moderation » de la maquette web :
 * signalements et avis à traiter. Chaque décision retire l'élément de la
 * file et est tracée dans le journal d'audit.
 *
 * L'écran porte deux métiers distincts, séparés en deux vues plutôt qu'en un
 * seul long défilement : « File » est l'action du quotidien (traiter ce qui
 * est signalé), « Indicateurs » sert à piloter et à récompenser.
 */

type Vue = "file" | "indicateurs";

export default function ModerationAdmin() {
  const { signalements, recharger: rechargerSignalements } = useSignalements();
  const { avis, recharger: rechargerAvis } = useAvisAModerer();
  const [vue, setVue] = useState<Vue>("file");

  const boutonPrimaire =
    "rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc]";
  const boutonGhost =
    "rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg";
  const boutonDanger =
    "rounded-[9px] border-[1.5px] border-[#F3CDC8] bg-white px-[14px] py-2 text-[12.5px] font-bold text-red transition-colors hover:bg-[#FBE9E7]";

  const aTraiter = signalements.length + avis.length;

  const bascule = (
    <div role="tablist" aria-label="Vue de la modération" className="flex flex-wrap gap-2">
      {(
        [
          { cle: "file" as const, label: `🚩 File de modération${aTraiter > 0 ? ` (${aTraiter})` : ""}` },
          { cle: "indicateurs" as const, label: "📊 Indicateurs & classements" },
        ]
      ).map((o) => (
        <button
          key={o.cle}
          type="button"
          role="tab"
          aria-selected={vue === o.cle}
          onClick={() => setVue(o.cle)}
          className={`rounded-full border-[1.5px] px-[15px] py-[8px] text-[12.5px] font-bold transition-colors ${
            vue === o.cle
              ? "border-teal bg-teal-soft text-blue"
              : "border-line bg-white text-muted hover:bg-bg"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );

  return (
    <AdminShell>
      {/* ===== Version mobile (écran « m-admin-moderation » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <EnTeteMobile retour="/espace-admin/plus" titre="Modération" />
        <div className="pad">
          <div style={{ marginBottom: 12 }}>{bascule}</div>

          {vue === "indicateurs" ? (
            <IndicateursAvis />
          ) : (
            <>
              <div className="abannerm">
                <span aria-hidden>🚩</span>
                <div>
                  Signalements et avis abusifs. Un signalement confirmé peut entraîner un
                  avertissement ou une suspension.
                </div>
              </div>
              <div className="card2">
                <h4>Signalements · {signalements.length}</h4>
                {signalements.length === 0 && (
                  <p className="muted" style={{ fontSize: 12.5 }}>
                    ✅ Tous les signalements ont été traités.
                  </p>
                )}
                {signalements.map((signalement) => (
                  <div key={signalement.id} className="asstrowm">
                    <span
                      className="av"
                      aria-hidden
                      style={{ background: "linear-gradient(135deg,#9AA8B2,#647A89)" }}
                    >
                      ⚠️
                    </span>
                    <span className="meta">
                      <b>{signalement.titre}</b>
                      <small>{signalement.detail}</small>
                    </span>
                    <span style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <button
                        type="button"
                        className="btnm"
                        onClick={() =>
                          traiterSignalement(signalement, "examiné").then(rechargerSignalements)
                        }
                      >
                        Examiner
                      </button>
                      <button
                        type="button"
                        className={signalement.sanction === "Suspendre" ? "btnm dg" : "btnm gh"}
                        onClick={() =>
                          traiterSignalement(
                            signalement,
                            signalement.sanction === "Suspendre" ? "suspendu" : "averti"
                          ).then(rechargerSignalements)
                        }
                      >
                        {signalement.sanction}
                      </button>
                    </span>
                  </div>
                ))}
              </div>
              <div className="card2">
                <h4>Avis à modérer · {avis.length}</h4>
                {avis.length === 0 && (
                  <p className="muted" style={{ fontSize: 12.5 }}>
                    ✅ Tous les avis ont été modérés.
                  </p>
                )}
                {avis.map((a) => (
                  <div key={a.id} className="reviewmod">
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <b style={{ fontSize: 12.5 }}>{a.titre}</b>
                      <span className="pill soon">{a.etiquette}</span>
                    </div>
                    <p className="muted" style={{ fontSize: 11.5, margin: "7px 0 9px" }}>
                      {a.extrait}
                    </p>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="btnm gh"
                        onClick={() => modererAvis(a, "conservé").then(rechargerAvis)}
                      >
                        Conserver
                      </button>
                      <button
                        type="button"
                        className="btnm gh"
                        onClick={() => modererAvis(a, "masqué").then(rechargerAvis)}
                      >
                        Masquer
                      </button>
                      <button
                        type="button"
                        className="btnm dg"
                        onClick={() => modererAvis(a, "supprimé").then(rechargerAvis)}
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ===== Version web ===== */}
      <div className="hidden md:block">
        <div className="mb-4">
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Modération des avis</h2>
          <small className="text-[13px] text-muted">
            Traiter ce qui est signalé, et suivre la qualité perçue des médecins
          </small>
        </div>

        <div className="mb-4">{bascule}</div>

        {vue === "indicateurs" ? (
          <IndicateursAvis />
        ) : (
          <>
            <div className="mb-4 flex items-start gap-[9px] rounded-xl border border-[#BFE0EF] bg-teal-soft px-[14px] py-3 text-[12.5px] font-semibold leading-relaxed text-blue">
              <span aria-hidden>🚩</span>
              <div>
                Traitez les signalements et les avis abusifs. Un signalement confirmé peut entraîner
                un avertissement ou une suspension du compte concerné.
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
                    onClick={() =>
                      traiterSignalement(signalement, "examiné").then(rechargerSignalements)
                    }
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
                      ).then(rechargerSignalements)
                    }
                    className={signalement.sanction === "Suspendre" ? boutonDanger : boutonGhost}
                  >
                    {signalement.sanction}
                  </button>
                </div>
              ))}
              <p className="mt-3 text-[11.5px] text-muted">
                « Examiner » classe le signalement après examen. Chaque décision est tracée dans le
                journal d’audit.
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
                      onClick={() => modererAvis(a, "conservé").then(rechargerAvis)}
                      className={boutonGhost}
                    >
                      Conserver
                    </button>
                    <button
                      type="button"
                      onClick={() => modererAvis(a, "masqué").then(rechargerAvis)}
                      className={boutonGhost}
                    >
                      Masquer
                    </button>
                    <button
                      type="button"
                      onClick={() => modererAvis(a, "supprimé").then(rechargerAvis)}
                      className={boutonDanger}
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}
