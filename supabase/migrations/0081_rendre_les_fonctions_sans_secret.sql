/*
 * Retour en arrière sur quatre révocations de la 0080.
 *
 * La 0080 a rendu au serveur seul une douzaine de fonctions
 * `security definer`. Quatre d'entre elles n'avaient rien à cacher, et la
 * passe de vérification l'a montré noir sur blanc : `test-rdv-centre-appel`,
 * `test-avis`, `test-notifications` et `test-medecins-colonnes` appellent
 * `creneau_ouvert_medecin` et `recalculer_note_medecin` avec une simple
 * session administrateur, et ne répondaient plus.
 *
 * Le critère est le même pour les quatre : elles ne disent QUE ce que la
 * plateforme publie déjà ailleurs.
 *
 *   - `creneau_ouvert_medecin`, `absence_couvre` : l'ouverture d'un créneau,
 *     que `heures_indisponibles` et `prochaines_dispos_medecins` donnent
 *     publiquement — il faut bien pouvoir prendre rendez-vous sans compte ;
 *   - `soins_depuis_tarifs` : la grille tarifaire, lisible sur la fiche
 *     publique de chaque praticien ;
 *   - `recalculer_note_medecin` : un recalcul à partir des avis PUBLIÉS, qui
 *     ne peut rien changer d'autre que remettre la note d'accord avec eux.
 *
 * Restent rendues au serveur celles qui, elles, donnaient un pouvoir ou un
 * renseignement que rien ne publie : `creer_notification` (déposer une
 * notification et un VRAI courriel, titre et corps au choix),
 * `email_destinataire` (l'adresse de n'importe quel compte),
 * `programmer_rappels_rdv` et `annuler_rappels_rdv` (la file de rappels d'un
 * rendez-vous quelconque), `titulaire_du_document`,
 * `titulaire_abonnement_medecin` et `formule_du_medecin` (ce qu'un praticien
 * paie), `moyen_paiement_ouvert`, `rls_auto_enable`.
 *
 * Leçon retenue : une révocation qui n'empêche rien ne protège rien, et
 * coûte un écran.
 */

grant execute on function public.creneau_ouvert_medecin(uuid, date, time)
  to anon, authenticated;
grant execute on function public.absence_couvre(uuid, date, time)
  to anon, authenticated;
grant execute on function public.soins_depuis_tarifs(uuid)
  to anon, authenticated;
grant execute on function public.recalculer_note_medecin(uuid)
  to anon, authenticated;
