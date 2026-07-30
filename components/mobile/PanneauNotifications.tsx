"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { ilYA, iconeNotification, useNotifications } from "@/lib/notifications";

/**
 * Panneau des notifications — ouvert par la cloche de la barre haute.
 * Même feuille descendante que la recherche rapide, pour que les deux
 * actions de la barre se comportent pareil.
 *
 * Le contenu vient de la table `notifications`, alimentée par les triggers
 * de la migration 0013 : réservation, confirmation, annulation,
 * reprogrammation, avis, invitations, validation de compte.
 */
export default function PanneauNotifications({
  ouvert,
  fermer,
}: {
  ouvert: boolean;
  fermer: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { notifications, nonLues, marquerLue, toutMarquerLu } = useNotifications();

  useEffect(() => {
    if (ouvert) fermer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") fermer();
    };
    document.addEventListener("keydown", surTouche);
    const debordement = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", surTouche);
      document.body.style.overflow = debordement;
    };
  }, [ouvert, fermer]);

  return (
    <div className={`recherche-hote md:hidden${ouvert ? " ouvert" : ""}`} aria-hidden={!ouvert}>
      <button
        type="button"
        className="recherche-voile"
        aria-label="Fermer les notifications"
        tabIndex={ouvert ? 0 : -1}
        onClick={fermer}
      />
      <div
        className="recherche-feuille"
        role="dialog"
        aria-modal={ouvert}
        aria-label="Notifications"
      >
        <div className="recherche-tete">
          <b>Notifications</b>
          {nonLues > 0 && (
            <button
              type="button"
              className="notif-tout-lu"
              tabIndex={ouvert ? 0 : -1}
              onClick={toutMarquerLu}
            >
              Tout marquer lu
            </button>
          )}
          <button
            type="button"
            className="tb-btn"
            aria-label="Fermer les notifications"
            tabIndex={ouvert ? 0 : -1}
            onClick={fermer}
          >
            ✕
          </button>
        </div>

        <div className="notif-liste">
          {notifications.length === 0 ? (
            <p className="notif-vide">
              Aucune notification pour l’instant. Vous serez prévenu ici dès qu’un rendez-vous
              sera confirmé, déplacé ou annulé.
            </p>
          ) : (
            notifications.map((n) => {
              const contenu = (
                <>
                  <span className="i" aria-hidden>
                    {iconeNotification(n.type)}
                  </span>
                  <span className="tx">
                    <b>{n.titre}</b>
                    {n.corps && <small>{n.corps}</small>}
                    <time dateTime={n.creeLe}>{ilYA(n.creeLe)}</time>
                  </span>
                  {!n.lu && <span className="point" aria-label="Non lue" />}
                </>
              );
              const classe = `notif${n.lu ? "" : " non-lue"}`;
              return n.lien ? (
                <Link
                  key={n.id}
                  href={n.lien}
                  className={classe}
                  tabIndex={ouvert ? 0 : -1}
                  onClick={(e) => {
                    e.preventDefault();
                    marquerLue(n.id);
                    fermer();
                    router.push(n.lien!);
                  }}
                >
                  {contenu}
                </Link>
              ) : (
                <button
                  key={n.id}
                  type="button"
                  className={classe}
                  tabIndex={ouvert ? 0 : -1}
                  onClick={() => marquerLue(n.id)}
                >
                  {contenu}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
