"use client";

import { useState } from "react";
import { repondreInvitation, useInvitationsRecues } from "@/lib/etablissement";

/*
 * Invitations de rattachement reçues par le médecin.
 *
 * CE BLOC MANQUAIT, et avec lui toute la fin du parcours de l'espace
 * établissement. La fonction `repondre_invitation` existe en base depuis
 * la migration 0007, le gestionnaire pouvait inviter depuis
 * /espace-etablissement/medecins, et le trigger de notifications
 * envoyait bien au médecin un « Invitation reçue » pointant vers
 * /espace-medecin/compte… où il n'y avait rien. `repondreInvitation()`
 * n'était appelée par AUCUN écran : aucune invitation n'a jamais pu être
 * acceptée, donc aucun médecin n'a jamais pu être rattaché.
 *
 * Le choix appartient au médecin, et à lui seul : l'établissement ne peut
 * pas rattacher quelqu'un sans son accord (c'est pour cela que la
 * fonction est SECURITY DEFINER et vérifie `medecin_id = auth.uid()`).
 *
 * Le bloc ne s'affiche que s'il y a quelque chose à dire : une invitation
 * en attente, ou un rattachement en cours. Un médecin indépendant qui n'a
 * jamais été sollicité ne voit rien.
 */

const LIBELLES = {
  envoyee: { texte: "En attente", classes: "bg-amber-soft text-amber" },
  acceptee: { texte: "Acceptée", classes: "bg-green-soft text-green" },
  refusee: { texte: "Refusée", classes: "bg-[#FBE9E7] text-red" },
} as const;

export default function InvitationsEtablissement({
  mobile = false,
  variante = "carte",
  onRattachement,
  className = "mb-4 max-w-[520px]",
  uniquementEnAttente = false,
}: {
  mobile?: boolean;
  /**
   * « carte » — bloc autonome, avec son titre (hub /espace-medecin/compte).
   * « champ » — sans cadre ni titre, glissé sous le champ « Établissement
   *   de rattachement » de /espace-medecin/profil : le nom est déjà affiché
   *   juste au-dessus, la carte ferait doublon.
   */
  variante?: "carte" | "champ";
  /**
   * Appelé avec le nom de l'établissement après une acceptation. Le champ
   * « Établissement de rattachement » de /espace-medecin/profil est peint
   * depuis `useContextePro`, qui n'a pas de rechargement : sans ce rappel,
   * il resterait sur « Aucun » juste au-dessus du message d'acceptation.
   */
  onRattachement?: (nomEtablissement: string) => void;
  /**
   * Enveloppe de la carte web. Le défaut vaut pour une page qui empile ses
   * blocs ; dans une grille qui gère déjà son `gap` (« Mon compte »), on
   * passe une chaîne vide pour ne pas doubler l'espacement.
   */
  className?: string;
  /**
   * N'afficher que s'il y a une réponse à donner. Un tableau de bord montre
   * ce qui attend quelque chose : rappeler en permanence « vous êtes
   * rattaché à X », sans action possible, n'y serait que du bruit. Les
   * écrans de compte, eux, gardent l'état complet.
   */
  uniquementEnAttente?: boolean;
}) {
  const { invitations, rattachement, chargement, recharger } = useInvitationsRecues();
  const [enCours, setEnCours] = useState<string | null>(null);
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);

  const enAttente = invitations.filter((i) => i.statut === "envoyee");
  if (chargement) return null;
  /*
   * Rien à dire, rien à afficher. `message` fait partie de la condition :
   * refuser la dernière invitation vidait la liste, et le bloc — donc la
   * confirmation — disparaissait dans le même rendu.
   */
  if (enAttente.length === 0 && !rattachement && !message) return null;
  // Tableau de bord : rien en attente, rien à montrer (le `message` reste,
  // le temps que le praticien lise ce que son clic a donné).
  if (uniquementEnAttente && enAttente.length === 0 && !message) return null;

  async function repondre(id: string, accepte: boolean, nom: string) {
    setEnCours(id);
    setMessage(null);
    const res = await repondreInvitation(id, accepte);
    setEnCours(null);
    setMessage({
      texte:
        res.erreur ??
        (accepte ? `Vous êtes désormais rattaché à ${nom}.` : `Invitation de ${nom} refusée.`),
      erreur: Boolean(res.erreur),
    });
    if (!res.erreur) {
      recharger();
      if (accepte) onRattachement?.(nom);
    }
  }

  const corps = (
    <>
      {rattachement && (
        <p
          className={
            variante === "champ"
              ? "mt-1.5 text-[11.5px] text-muted"
              : mobile
                ? "muted"
                : "mb-3 text-[12.5px] text-muted"
          }
          style={mobile && variante !== "champ" ? { fontSize: 12.5 } : undefined}
        >
          {variante === "champ" ? (
            <>
              Pour quitter cet établissement, demandez-lui de vous retirer depuis son onglet
              « Médecins » : un rattachement se défait des deux côtés.
            </>
          ) : (
            <>
              Vous êtes rattaché à <b>{rattachement.nom}</b>
              {rattachement.type && ` · ${rattachement.type}`}. Pour en partir, demandez à
              l’établissement de vous retirer depuis son onglet « Médecins ».
            </>
          )}
        </p>
      )}

      {enAttente.map((invitation) => (
        <div
          key={invitation.id}
          className="flex flex-wrap items-center gap-[13px] border-b border-line py-[14px] last:border-b-0"
        >
          <span
            aria-hidden
            className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl text-lg text-white"
            style={{ background: invitation.gradient }}
          >
            🏥
          </span>
          <div className="min-w-0 flex-1">
            <b className="block text-sm font-extrabold">{invitation.etablissementNom}</b>
            <small className="text-xs text-muted">
              {invitation.etablissementType} · reçue le {invitation.envoyeeLe}
            </small>
          </div>
          <span
            className={`rounded-lg px-[9px] py-1 text-[11px] font-bold ${LIBELLES[invitation.statut].classes}`}
          >
            {LIBELLES[invitation.statut].texte}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={enCours !== null || rattachement !== null}
              title={
                rattachement
                  ? "Un médecin ne peut être rattaché qu'à un seul établissement."
                  : undefined
              }
              onClick={() => repondre(invitation.id, true, invitation.etablissementNom)}
              className="rounded-[9px] bg-teal px-3 py-1.5 text-[11.5px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {enCours === invitation.id ? "…" : "Accepter"}
            </button>
            <button
              type="button"
              disabled={enCours !== null}
              onClick={() => repondre(invitation.id, false, invitation.etablissementNom)}
              className="rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-muted disabled:opacity-50"
            >
              Refuser
            </button>
          </div>
        </div>
      ))}

      {enAttente.length > 0 && rattachement && (
        <p className="mt-2 text-[11.5px] text-muted">
          Un médecin ne peut être rattaché qu’à un seul établissement : quittez le vôtre avant
          d’accepter une autre invitation.
        </p>
      )}

      {message && (
        <p
          role="status"
          className={`mt-2 text-[12.5px] font-bold ${message.erreur ? "text-[#C0392B]" : "text-green"}`}
        >
          {message.erreur ? "⚠️ " : "✓ "}
          {message.texte}
        </p>
      )}
    </>
  );

  // Glissé sous un champ existant : ni cadre ni titre, le libellé du champ
  // au-dessus dit déjà de quoi il s'agit.
  if (variante === "champ") return <>{corps}</>;

  if (mobile) {
    return (
      <div className="card2">
        <h4>
          🏥 Établissement
          {enAttente.length > 0 && ` · ${enAttente.length} invitation(s)`}
        </h4>
        {corps}
      </div>
    );
  }

  return (
    <div className={`${className} rounded-2xl border border-line bg-white p-5`}>
      <h3 className="mb-1 text-[15px] font-extrabold">
        Établissement
        {enAttente.length > 0 && ` · ${enAttente.length} invitation(s)`}
      </h3>
      {corps}
    </div>
  );
}
