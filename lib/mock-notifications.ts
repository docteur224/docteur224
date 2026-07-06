import { creerMagasinLocal, useMagasinLocal } from "@/lib/stockage-local";

/*
 * Notifications simulées (Phase 10). La plateforme réelle enverra des SMS,
 * des e-mails et des notifications in-app (confirmations de RDV, rappels,
 * invitations, annonces, validations — spec C.7). En mode mocks, chaque
 * action qui déclencherait un envoi appelle simulerNotification() : le
 * message est consigné ici et visible dans le centre de notifications (🔔).
 * Quand la base sera branchée, ces appels seront remplacés par les vrais
 * envois — les écrans ne changeront pas.
 */

export type CanalNotification = "SMS" | "E-mail" | "In-app";

export interface NotificationSimulee {
  id: string;
  date: string;
  canal: CanalNotification;
  destinataire: string;
  message: string;
  lue: boolean;
}

/** Horodatage court « 6 juillet · 14:02 » (journal d'audit, annonces, notifications). */
export function horodatage(): string {
  const maintenant = new Date();
  const jourMois = maintenant.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  const heure = maintenant.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${jourMois} · ${heure}`;
}

const NOTIFICATIONS_DEFAUT: NotificationSimulee[] = [
  {
    id: "notif-bienvenue",
    date: "12 juin · 09:00",
    canal: "In-app",
    destinataire: "Vous",
    message:
      "Bienvenue ! Les SMS, e-mails et notifications que la plateforme enverrait s'affichent ici.",
    lue: false,
  },
];

const magasinNotifications = creerMagasinLocal<NotificationSimulee[]>(
  "docteur224.notifications",
  NOTIFICATIONS_DEFAUT,
  (json) => (Array.isArray(json) ? (json as NotificationSimulee[]) : NOTIFICATIONS_DEFAUT)
);

export function useNotificationsSimulees(): NotificationSimulee[] {
  return useMagasinLocal(magasinNotifications);
}

/** Consigne un envoi simulé, une entrée par canal. Les plus récentes d'abord. */
export function simulerNotification(
  canaux: CanalNotification[],
  destinataire: string,
  message: string
): void {
  const horodate = horodatage();
  const nouvelles = canaux.map((canal, i) => ({
    id: `notif-${Date.now()}-${i}`,
    date: horodate,
    canal,
    destinataire,
    message,
    lue: false,
  }));
  magasinNotifications.ecrire([...nouvelles, ...magasinNotifications.lire()].slice(0, 50));
}

export function marquerToutesLues(): void {
  const liste = magasinNotifications.lire();
  if (liste.every((n) => n.lue)) return;
  magasinNotifications.ecrire(liste.map((n) => (n.lue ? n : { ...n, lue: true })));
}

export function viderNotifications(): void {
  magasinNotifications.ecrire([]);
}
