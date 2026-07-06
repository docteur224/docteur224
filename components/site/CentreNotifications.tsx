"use client";

import { useState } from "react";
import {
  marquerToutesLues,
  useNotificationsSimulees,
  viderNotifications,
  type CanalNotification,
} from "@/lib/mock-notifications";

/**
 * Centre de notifications simulées (Phase 10) — cloche flottante présente sur
 * tout le site. Liste les SMS, e-mails et notifications in-app que la
 * plateforme enverrait réellement (confirmations, rappels, invitations,
 * annonces, validations). Outil de démonstration : n'existe pas dans les
 * maquettes, disparaîtra quand les vrais envois seront branchés.
 */

const STYLE_CANAL: Record<CanalNotification, string> = {
  SMS: "bg-green-soft text-green",
  "E-mail": "bg-teal-soft text-blue",
  "In-app": "bg-amber-soft text-amber",
};

export default function CentreNotifications() {
  const notifications = useNotificationsSimulees();
  const [ouvert, setOuvert] = useState(false);
  const nonLues = notifications.filter((n) => !n.lue).length;

  function basculer() {
    if (!ouvert) marquerToutesLues();
    setOuvert(!ouvert);
  }

  return (
    <>
      {ouvert && (
        <div className="fixed bottom-[84px] right-5 z-50 flex max-h-[60vh] w-[360px] max-w-[calc(100vw-40px)] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-card">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <b className="text-[14px] font-extrabold">🔔 Notifications simulées</b>
            <span className="flex items-center gap-2">
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={viderNotifications}
                  className="rounded-[9px] border-[1.5px] border-line bg-white px-2.5 py-1 text-[11px] font-bold text-muted transition-colors hover:bg-bg"
                >
                  Vider
                </button>
              )}
              <button
                type="button"
                onClick={() => setOuvert(false)}
                aria-label="Fermer les notifications"
                className="grid h-7 w-7 place-items-center rounded-[9px] text-muted transition-colors hover:bg-bg"
              >
                ✕
              </button>
            </span>
          </div>
          <p className="border-b border-[#F2D9B6] bg-[#FFF5E9] px-4 py-2 text-[11.5px] font-semibold leading-relaxed text-[#8A5A1B]">
            Démonstration — en production, ces messages partiraient réellement par SMS, e-mail ou
            notification.
          </p>
          <div className="overflow-y-auto">
            {notifications.length === 0 && (
              <p className="px-4 py-6 text-center text-[12.5px] text-muted">
                Aucune notification pour le moment. Réservez un rendez-vous, envoyez une
                invitation ou une annonce…
              </p>
            )}
            {notifications.map((notification) => (
              <div key={notification.id} className="border-b border-line px-4 py-3 last:border-b-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-lg px-[8px] py-[3px] text-[10.5px] font-extrabold ${STYLE_CANAL[notification.canal]}`}
                  >
                    {notification.canal}
                  </span>
                  <b className="min-w-0 flex-1 truncate text-[12px] font-extrabold">
                    → {notification.destinataire}
                  </b>
                  <small className="text-[10.5px] text-muted">{notification.date}</small>
                </div>
                <p className="text-[12.5px] leading-relaxed text-[#3f5360]">
                  {notification.message}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={basculer}
        aria-label={`Notifications simulées${nonLues > 0 ? ` (${nonLues} non lues)` : ""}`}
        className="fixed bottom-5 right-5 z-50 grid h-[52px] w-[52px] place-items-center rounded-full bg-blue text-xl text-white shadow-card transition-transform hover:scale-105"
      >
        🔔
        {nonLues > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-[19px] min-w-[19px] place-items-center rounded-full bg-red px-1 text-[10.5px] font-extrabold">
            {nonLues}
          </span>
        )}
      </button>
    </>
  );
}
