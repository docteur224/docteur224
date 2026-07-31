"use client";

import { useState } from "react";
import Link from "next/link";
import PatientShell from "@/components/patient/PatientShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import { ilYA, iconeNotification, useNotifications } from "@/lib/notifications";

/*
 * Notifications, écran plein format. La cloche du bandeau montre les
 * dernières ; ici on les parcourt toutes, avec un filtre « non lues » et le
 * bouton « tout marquer lu ». Le hook et son cache sont ceux de la cloche :
 * marquer une notification lue depuis cet écran éteint la pastille partout.
 */
export default function NotificationsPatient() {
  const { notifications, nonLues, marquerLue, toutMarquerLu } = useNotifications();
  const [seulementNonLues, setSeulementNonLues] = useState(false);

  const visibles = seulementNonLues ? notifications.filter((n) => !n.lu) : notifications;
  const vide = visibles.length === 0;

  /* Une notification porte souvent un lien : on la marque lue au clic, sans
     attendre le réseau (le hook le fait de façon optimiste). */
  const ligne = (mobile: boolean) =>
    visibles.map((n) => {
      const corps = (
        <>
          <span
            aria-hidden
            className={
              mobile
                ? "av"
                : "grid h-[38px] w-[38px] flex-none place-items-center rounded-xl bg-teal-soft text-base"
            }
            style={mobile ? { background: "#EAF4F9", color: "#15506B" } : undefined}
          >
            {iconeNotification(n.type)}
          </span>
          <span className={mobile ? "meta" : "min-w-0 flex-1"}>
            <b className={mobile ? "" : "block text-[13.5px] font-bold"}>{n.titre}</b>
            {n.corps && (
              <small className={mobile ? "" : "block text-[12px] text-muted"}>{n.corps}</small>
            )}
            <small className={mobile ? "" : "block text-[11px] text-muted"}>{ilYA(n.creeLe)}</small>
          </span>
          {!n.lu && (
            <span
              aria-label="Non lue"
              title="Non lue"
              className={mobile ? "" : "mt-1.5 h-2 w-2 flex-none rounded-full bg-teal"}
              style={
                mobile
                  ? { width: 8, height: 8, borderRadius: 999, background: "var(--teal)", flex: "none" }
                  : undefined
              }
            />
          )}
        </>
      );

      const classe = mobile
        ? "asstrowm"
        : `flex items-start gap-3 border-b border-line px-4 py-[13px] last:border-b-0 ${
            n.lu ? "" : "bg-[#F7FBFD]"
          }`;

      return n.lien ? (
        <Link key={n.id} href={n.lien} className={classe} onClick={() => marquerLue(n.id)}>
          {corps}
        </Link>
      ) : (
        <button
          key={n.id}
          type="button"
          className={classe}
          style={{ width: "100%", textAlign: "left" }}
          onClick={() => marquerLue(n.id)}
        >
          {corps}
        </button>
      );
    });

  return (
    <PatientShell>
      {/* ===== Version mobile ===== */}
      <div className="md:hidden">
        <EnTeteMobile retour="/patient/compte" titre="Notifications" />
        <div className="pad">
          <div className="tabsm" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className={`tabm${seulementNonLues ? "" : " on"}`}
              onClick={() => setSeulementNonLues(false)}
            >
              Toutes
            </button>
            <button
              type="button"
              className={`tabm${seulementNonLues ? " on" : ""}`}
              onClick={() => setSeulementNonLues(true)}
            >
              Non lues {nonLues > 0 ? `(${nonLues})` : ""}
            </button>
          </div>
          <div className="card2">
            {vide && (
              <p className="muted" style={{ fontSize: 13 }}>
                {seulementNonLues ? "Tout est lu." : "Aucune notification pour l’instant."}
              </p>
            )}
            {ligne(true)}
          </div>
          {nonLues > 0 && (
            <button type="button" className="btn ghost block" onClick={toutMarquerLu}>
              Tout marquer comme lu
            </button>
          )}
        </div>
      </div>

      {/* ===== Version web ===== */}
      <div className="hidden md:block">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Notifications</h2>
            <small className="text-[13px] text-muted">
              {nonLues > 0
                ? `${nonLues} notification${nonLues > 1 ? "s" : ""} non lue${nonLues > 1 ? "s" : ""}`
                : "Tout est lu"}
            </small>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSeulementNonLues(!seulementNonLues)}
              className={`rounded-[9px] border-[1.5px] px-3 py-1.5 text-[11.5px] font-bold transition-colors ${
                seulementNonLues
                  ? "border-teal bg-teal-soft text-blue"
                  : "border-line bg-white text-muted hover:bg-bg"
              }`}
            >
              Non lues seulement
            </button>
            {nonLues > 0 && (
              <button
                type="button"
                onClick={toutMarquerLu}
                className="rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
              >
                Tout marquer comme lu
              </button>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          {vide ? (
            <p className="px-4 py-8 text-center text-[13px] text-muted">
              {seulementNonLues ? "Tout est lu." : "Aucune notification pour l’instant."}
            </p>
          ) : (
            ligne(false)
          )}
        </div>

        <p className="mt-3 text-[11.5px] text-muted">
          Les rappels par SMS et e-mail se règlent dans{" "}
          <Link href="/patient/parametres" className="font-bold text-teal hover:underline">
            Paramètres
          </Link>
          .
        </p>
      </div>
    </PatientShell>
  );
}
