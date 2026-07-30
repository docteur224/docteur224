"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ilYA, iconeNotification, useNotifications } from "@/lib/notifications";
import { useProfilConnecte } from "@/lib/patient";

/**
 * Cloche des notifications, version web (≥ md) : bouton + panneau déroulant
 * ancré dessous. Le pendant mobile est PanneauNotifications, monté dans la
 * barre haute ; les deux lisent la même table et le même cache client.
 *
 * Rien n'est rendu pour un visiteur : il n'a pas de notifications.
 */
export default function ClocheNotifications({ surFonce = false }: { surFonce?: boolean }) {
  const { profil } = useProfilConnecte();
  const { notifications, nonLues, marquerLue, toutMarquerLu } = useNotifications();
  // `versLaDroite` : sens d'ouverture, décidé à l'ouverture d'après la place
  // disponible. Dans une sidebar la cloche est à gauche de l'écran, le panneau
  // doit se déployer vers la droite ; dans le TopNav c'est l'inverse.
  const [ouvert, setOuvert] = useState<false | { versLaDroite: boolean }>(false);
  const conteneur = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const basculer = () =>
    setOuvert((etat) => {
      if (etat) return false;
      const r = conteneur.current?.getBoundingClientRect();
      return { versLaDroite: (r?.left ?? 0) < window.innerWidth / 2 };
    });

  // Un clic à l'extérieur ou Échap referme le panneau.
  useEffect(() => {
    if (!ouvert) return;
    const auClic = (e: MouseEvent) => {
      if (!conteneur.current?.contains(e.target as Node)) setOuvert(false);
    };
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOuvert(false);
    };
    document.addEventListener("mousedown", auClic);
    document.addEventListener("keydown", surTouche);
    return () => {
      document.removeEventListener("mousedown", auClic);
      document.removeEventListener("keydown", surTouche);
    };
  }, [ouvert]);

  if (!profil) return null;

  return (
    <div ref={conteneur} className="relative hidden md:block">
      <button
        type="button"
        onClick={basculer}
        aria-label={nonLues > 0 ? `Notifications — ${nonLues} non lue(s)` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={ouvert !== false}
        className={`relative grid h-[38px] w-[38px] place-items-center rounded-[11px] border text-base transition-colors ${
          surFonce
            ? "border-white/25 bg-white/10 hover:bg-white/20"
            : "border-line bg-white hover:bg-bg"
        }`}
      >
        🔔
        {nonLues > 0 && (
          <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-white bg-red px-1 text-[10px] font-extrabold text-white">
            {nonLues > 9 ? "9+" : nonLues}
          </span>
        )}
      </button>

      {/* Ancré sous la cloche, et déployé du côté où il y a la place : aligné
          à gauche du bouton dans une sidebar, à droite dans le TopNav. */}
      {ouvert && (
        <div
          role="dialog"
          aria-label="Notifications"
          className={`absolute top-[46px] z-50 w-[340px] max-w-[calc(100vw-32px)] overflow-hidden rounded-2xl border border-line bg-white shadow-card ${
            ouvert.versLaDroite ? "left-0" : "right-0"
          }`}
        >
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <b className="text-[13.5px] font-extrabold">Notifications</b>
            {nonLues > 0 && (
              <button
                type="button"
                onClick={toutMarquerLu}
                className="ml-auto text-[11.5px] font-extrabold text-teal hover:underline"
              >
                Tout marquer lu
              </button>
            )}
          </div>

          <div className="max-h-[380px] overflow-y-auto p-2">
            {notifications.length === 0 ? (
              <p className="px-3 py-5 text-[12.5px] leading-relaxed text-muted">
                Aucune notification pour l’instant. Vous serez prévenu ici dès qu’un rendez-vous
                sera confirmé, déplacé ou annulé.
              </p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    marquerLue(n.id);
                    setOuvert(false);
                    if (n.lien) router.push(n.lien);
                  }}
                  className={`mb-1.5 flex w-full items-start gap-[11px] rounded-xl border p-[11px] text-left last:mb-0 ${
                    n.lu ? "border-line bg-white hover:bg-bg" : "border-[#cde6f2] bg-teal-soft"
                  }`}
                >
                  <span className="flex-none text-[15px]" aria-hidden>
                    {iconeNotification(n.type)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block text-[13px] font-extrabold">{n.titre}</b>
                    {n.corps && (
                      <small className="mt-0.5 block text-[11.5px] leading-snug text-muted">
                        {n.corps}
                      </small>
                    )}
                    <time dateTime={n.creeLe} className="mt-1 block text-[10.5px] font-bold text-muted">
                      {ilYA(n.creeLe)}
                    </time>
                  </span>
                  {!n.lu && (
                    <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-teal" aria-hidden />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
