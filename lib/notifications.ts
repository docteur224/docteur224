"use client";

import { useCallback, useEffect, useState } from "react";
import { creerClientNavigateur } from "@/lib/supabase/client";

/*
 * Notifications (migration 0013). Les lignes sont écrites par des triggers
 * SQL, jamais par le client : ici on ne fait que lire et marquer lu.
 *
 * Le compteur de la pastille est partagé entre toutes les cloches montées
 * (barre mobile, en-tête web) via un cache de module, pour qu'une lecture
 * dans le panneau mette à jour la pastille sans nouvelle requête.
 */

export interface Notification {
  id: string;
  type: string;
  titre: string;
  corps: string | null;
  lien: string | null;
  lu: boolean;
  creeLe: string;
}

interface LigneNotification {
  id: string;
  type: string;
  titre: string;
  corps: string | null;
  lien: string | null;
  lu_le: string | null;
  cree_le: string;
}

const versNotification = (l: LigneNotification): Notification => ({
  id: l.id,
  type: l.type,
  titre: l.titre,
  corps: l.corps,
  lien: l.lien,
  lu: l.lu_le !== null,
  creeLe: l.cree_le,
});

/** Les 30 dernières suffisent : au-delà, c'est de l'historique. */
const PLAFOND = 30;

let cache: Notification[] | undefined;
const ecouteurs = new Set<(n: Notification[]) => void>();

function diffuser(liste: Notification[]) {
  cache = liste;
  ecouteurs.forEach((e) => e(liste));
}

async function charger(): Promise<void> {
  const supabase = creerClientNavigateur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    diffuser([]);
    return;
  }
  const { data } = await supabase
    .from("notifications")
    .select("id, type, titre, corps, lien, lu_le, cree_le")
    .order("cree_le", { ascending: false })
    .limit(PLAFOND);
  diffuser(((data ?? []) as LigneNotification[]).map(versNotification));
}

export function useNotifications(): {
  notifications: Notification[];
  nonLues: number;
  marquerLue: (id: string) => Promise<void>;
  toutMarquerLu: () => Promise<void>;
  recharger: () => void;
} {
  const [notifications, setNotifications] = useState<Notification[]>(cache ?? []);

  useEffect(() => {
    ecouteurs.add(setNotifications);
    if (cache === undefined) {
      cache = []; // une seule requête même si plusieurs cloches montent
      charger();
    }
    return () => {
      ecouteurs.delete(setNotifications);
    };
  }, []);

  const marquerLue = useCallback(async (id: string) => {
    // L'affichage bascule tout de suite : le clic ouvre l'écran visé, on ne
    // fait pas attendre l'aller-retour réseau pour éteindre la pastille.
    diffuser((cache ?? []).map((n) => (n.id === id ? { ...n, lu: true } : n)));
    await creerClientNavigateur()
      .from("notifications")
      .update({ lu_le: new Date().toISOString() })
      .eq("id", id);
  }, []);

  const toutMarquerLu = useCallback(async () => {
    diffuser((cache ?? []).map((n) => ({ ...n, lu: true })));
    await creerClientNavigateur().rpc("marquer_notifications_lues");
  }, []);

  return {
    notifications,
    nonLues: notifications.filter((n) => !n.lu).length,
    marquerLue,
    toutMarquerLu,
    recharger: () => {
      cache = undefined;
      charger();
    },
  };
}

/** Icône par famille d'événement (le type vient des triggers SQL). */
export function iconeNotification(type: string): string {
  if (type.startsWith("rdv_annule")) return "❌";
  if (type.startsWith("rdv_confirme")) return "✅";
  if (type.startsWith("rdv_reprogramme")) return "🔄";
  if (type.startsWith("rdv_")) return "📅";
  if (type.startsWith("avis_")) return "⭐";
  if (type.startsWith("invitation_")) return "✉️";
  if (type === "compte_valide") return "🎉";
  if (type === "compte_refuse") return "⚠️";
  if (type === "document") return "📄";
  return "🔔";
}

/** « à l'instant », « il y a 3 h », « il y a 2 j ». */
export function ilYA(iso: string, maintenant = new Date()): string {
  const minutes = Math.floor((maintenant.getTime() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.floor(minutes / 60);
  if (heures < 24) return `il y a ${heures} h`;
  const jours = Math.floor(heures / 24);
  if (jours < 7) return `il y a ${jours} j`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
