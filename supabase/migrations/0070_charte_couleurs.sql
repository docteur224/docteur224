-- ============================================================
-- Docteur 224 — Les couleurs de son espace, rattachées au compte
--
-- Jusqu'ici le choix vivait dans le navigateur : perdu en changeant
-- d'appareil, perdu en vidant le cache. Il appartient au compte.
--
-- Une table par UTILISATEUR et non par rôle, pour la même raison que
-- `preferences_email` (migration 0059) : un médecin, un assistant, un
-- patient et un administrateur règlent tous l'affichage de leur espace, et
-- aucun n'a de raison d'être traité à part.
--
-- DEUX COULEURS, pas une palette. Tout le reste — fonds, encres, bordures,
-- survols — en est dérivé côté applicatif (lib/charte-couleurs.ts). On ne
-- range donc ni les couleurs calculées ni la feuille de style produite :
-- figer un résultat de calcul, c'est s'interdire de corriger le calcul.
--
-- CE QUE LA CHARTE NE TOUCHE PAS, et qui n'a donc rien à faire ici : les
-- couleurs de statut (un rendez-vous confirmé doit rester distinguable
-- d'une alerte, quelle que soit la charte), les pastilles d'avatar (elles
-- distinguent des personnes), le site public et les documents remis.
-- ============================================================

create table if not exists preferences_affichage (
  utilisateur_id uuid primary key references utilisateurs (id) on delete cascade,
  charte_principale text,
  charte_accent text,
  maj_le timestamptz not null default now(),

  /*
   * Le format est vérifié ICI et pas seulement à la saisie. Ces valeurs
   * finissent dans une feuille de style : une chaîne libre y ouvrirait la
   * porte à `red;}html{display:none`. L'applicatif filtre déjà, mais une
   * base qui fait confiance à son client n'est pas une protection.
   */
  constraint charte_principale_hex
    check (charte_principale is null or charte_principale ~ '^#[0-9a-f]{6}$'),
  constraint charte_accent_hex
    check (charte_accent is null or charte_accent ~ '^#[0-9a-f]{6}$'),

  /*
   * Les deux ensemble, ou aucune. Une demi-charte — principale choisie,
   * accent laissé d'origine — donne un espace bancal que personne n'a
   * demandé. Vide des deux côtés : c'est la charte Docteur 224.
   */
  constraint charte_complete
    check ((charte_principale is null) = (charte_accent is null))
);

alter table preferences_affichage enable row level security;

/*
 * Chacun ne voit et ne règle que son propre affichage. Contrairement à
 * `preferences_email`, l'administration n'y a pas accès en lecture : un
 * choix de couleurs ne se soutient pas, ne se modère pas, et quiconque
 * s'est rendu l'écran pénible le remet d'origine en un clic.
 */
drop policy if exists sel_pref_affichage on preferences_affichage;
create policy sel_pref_affichage on preferences_affichage for select
  using (utilisateur_id = auth.uid());

drop policy if exists ins_pref_affichage on preferences_affichage;
create policy ins_pref_affichage on preferences_affichage for insert
  with check (utilisateur_id = auth.uid());

drop policy if exists upd_pref_affichage on preferences_affichage;
create policy upd_pref_affichage on preferences_affichage for update
  using (utilisateur_id = auth.uid()) with check (utilisateur_id = auth.uid());

/*
 * Revenir aux couleurs d'origine efface la ligne plutôt que d'y écrire les
 * valeurs par défaut : absence et « j'ai choisi exactement la charte
 * Docteur 224 » se valent à l'affichage, et une ligne de moins est une
 * ligne qui ne se désynchronise pas quand la charte d'origine évolue.
 */
drop policy if exists del_pref_affichage on preferences_affichage;
create policy del_pref_affichage on preferences_affichage for delete
  using (utilisateur_id = auth.uid());
