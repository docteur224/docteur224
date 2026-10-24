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
 *
 * Ce cache se RELIT : toutes les 30 s tant que l'onglet est visible, au
 * retour sur l'onglet, et à chaque changement de compte. Lu une seule fois,
 * il ignorait tout ce qui arrivait pendant la session (un message du
 * médecin n'apparaissait qu'après un rechargement complet), et gardait la
 * liste du compte précédent quand on en changeait dans le même onglet.
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

const RELEVE_MS = 30_000;

/**
 * La liste (les PLAFOND dernières) et les non-lues plus anciennes qu'elle ne
 * montre pas : compter les seules non-lues de la liste plafonnait la
 * pastille, qui restait figée quand une nouvelle en poussait une ancienne
 * non lue hors de la fenêtre.
 */
interface Etat {
  liste: Notification[];
  horsListe: number;
}
const VIDE: Etat = { liste: [], horsListe: 0 };

let cache: Etat | undefined;
/** Compte auquel appartient le cache : un autre compte le vide. */
let proprietaire: string | null | undefined;
/** Numéro de la dernière lecture lancée : une réponse plus ancienne est jetée. */
let tour = 0;
const ecouteurs = new Set<(e: Etat) => void>();
let arreter: (() => void) | null = null;

function diffuser(etat: Etat) {
  cache = etat;
  ecouteurs.forEach((e) => e(etat));
}

async function charger(): Promise<void> {
  const ce = ++tour;
  const supabase = creerClientNavigateur();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id ?? null;
  if (ce !== tour) return;
  if (uid !== proprietaire) {
    proprietaire = uid;
    diffuser(VIDE); // jamais, même un instant, la liste d'un autre compte
  }
  if (!uid) return;
  const [{ data, error }, { count, error: erreurCompte }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, type, titre, corps, lien, lu_le, cree_le")
      .order("cree_le", { ascending: false })
      .limit(PLAFOND),
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("lu_le", null),
  ]);
  // Réponse d'une lecture dépassée, ou échec réseau : on garde l'affichage.
  if (ce !== tour || error || erreurCompte) return;
  const liste = ((data ?? []) as LigneNotification[]).map(versNotification);
  diffuser({ liste, horsListe: Math.max(0, (count ?? 0) - liste.filter((n) => !n.lu).length) });
}

/** Relève, retour sur l'onglet, changement de compte : tant qu'une cloche est montée. */
function demarrerReleve(): () => void {
  const minuteur = setInterval(() => {
    if (document.visibilityState === "visible") charger();
  }, RELEVE_MS);
  const auRetour = () => {
    if (document.visibilityState === "visible") charger();
  };
  document.addEventListener("visibilitychange", auRetour);
  const { data: abo } = creerClientNavigateur().auth.onAuthStateChange((evenement, session) => {
    if (evenement === "TOKEN_REFRESHED" || evenement === "INITIAL_SESSION") return;
    if ((session?.user.id ?? null) === proprietaire) return;
    // Hors du rappel : supabase-js déconseille d'y attendre un autre appel.
    setTimeout(charger, 0);
  });
  return () => {
    clearInterval(minuteur);
    document.removeEventListener("visibilitychange", auRetour);
    abo.subscription.unsubscribe();
  };
}

/** Relit tout de suite (après une action qui a pu en marquer comme lues). */
export function rafraichirNotifications(): void {
  if (ecouteurs.size) charger();
}

export function useNotifications(): {
  notifications: Notification[];
  nonLues: number;
  marquerLue: (id: string) => Promise<void>;
  toutMarquerLu: () => Promise<void>;
  recharger: () => void;
} {
  const [etat, setEtat] = useState<Etat>(cache ?? VIDE);

  useEffect(() => {
    ecouteurs.add(setEtat);
    if (cache === undefined) {
      cache = VIDE; // une seule requête même si plusieurs cloches montent
      charger();
    }
    arreter ??= demarrerReleve();
    return () => {
      ecouteurs.delete(setEtat);
      if (!ecouteurs.size) {
        arreter?.();
        arreter = null;
      }
    };
  }, []);

  const marquerLue = useCallback(async (id: string) => {
    // L'affichage bascule tout de suite : le clic ouvre l'écran visé, on ne
    // fait pas attendre l'aller-retour réseau pour éteindre la pastille.
    const avant = cache ?? VIDE;
    diffuser({ ...avant, liste: avant.liste.map((n) => (n.id === id ? { ...n, lu: true } : n)) });
    await creerClientNavigateur()
      .from("notifications")
      .update({ lu_le: new Date().toISOString() })
      .eq("id", id);
  }, []);

  const toutMarquerLu = useCallback(async () => {
    diffuser({ liste: (cache ?? VIDE).liste.map((n) => ({ ...n, lu: true })), horsListe: 0 });
    await creerClientNavigateur().rpc("marquer_notifications_lues");
  }, []);

  return {
    notifications: etat.liste,
    nonLues: etat.liste.filter((n) => !n.lu).length + etat.horsListe,
    marquerLue,
    toutMarquerLu,
    recharger: () => {
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
  if (type === "transmission") return "📨";
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
