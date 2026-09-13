-- ============================================================
-- Docteur 224 — Espace établissement : ce qui ne marchait pas
--
-- Audit de /espace-etablissement. Trois manques venaient de la base,
-- et c'est ce fichier qui les comble. Le reste (boutons morts, écrans
-- en lecture seule) est corrigé côté application.
--
--   1. RATTACHER ÉTAIT UN ALLER SIMPLE. L'écran Abonnement promet
--      « invitez ou retirez des médecins depuis l'onglet Médecins »,
--      mais aucun retrait n'existait — et il ne POUVAIT pas exister :
--      `upd_medecins_soi` réserve l'écriture de medecins.etablissement_id
--      au médecin lui-même. Le gestionnaire n'a donc jamais pu défaire
--      un rattachement, même posé par erreur. `detacher_medecin` fait
--      ce que `repondre_invitation` fait dans l'autre sens : une
--      fonction SECURITY DEFINER, et elle seule, écrit ce champ.
--
--   2. LE SITE WEB N'AVAIT PAS DE COLONNE. La fiche affichait un champ
--      « Site web » que rien ne remplissait : `siteWeb` était codé à ""
--      dans lib/etablissement.ts faute de colonne. Ligne toujours vide.
--
--   3. LES STATISTIQUES ÉTAIENT INVENTÉES. « 486 RDV ce mois », « 78 %
--      d'occupation », six barres en dur : les mêmes chiffres pour tous
--      les établissements. Le gestionnaire ne peut PAS lire `rendez_vous`
--      (aucune policy ne le lui accorde, et c'est volontaire : les
--      rendez-vous appartiennent au médecin et à son patient). D'où
--      `statistiques_etablissement` : elle traverse cette frontière
--      une fois, et ne rend que des AGRÉGATS — jamais une ligne de
--      rendez-vous, jamais un nom de patient.
--
-- Le taux d'occupation ne revient pas : il demanderait de régénérer les
-- créneaux théoriques de chaque médecin (horaires_types × exceptions ×
-- absences) pour les comparer aux réservations. Un chiffre faux valait
-- moins que pas de chiffre ; il cède la place au taux d'honorés, qui se
-- lit directement dans `rendez_vous.statut`.
-- ============================================================

-- ---------- 1. Site web ----------
alter table etablissements add column if not exists site_web text;

comment on column etablissements.site_web is
  'Adresse du site de l''établissement, affichée sur la fiche publique.';

-- ---------- 2. Retirer un médecin de l'établissement ----------
/*
 * Symétrique de `repondre_invitation` : là-bas le médecin accepte et
 * s'attache, ici le gestionnaire le détache.
 *
 * L'invitation acceptée est SUPPRIMÉE au passage, et pas seulement
 * marquée : `unique (etablissement_id, medecin_id)` interdirait sinon
 * toute nouvelle invitation du même médecin, et le retrait deviendrait
 * définitif. Un retrait doit pouvoir se rejouer.
 *
 * Le médecin est prévenu — il découvrirait autrement son changement de
 * rattachement sur sa propre fiche publique.
 */
create or replace function detacher_medecin(p_medecin_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_etab_id uuid;
  v_etab_nom text;
begin
  select m.etablissement_id into v_etab_id from medecins m where m.id = p_medecin_id;
  if v_etab_id is null then
    raise exception 'Ce médecin n''est rattaché à aucun établissement.';
  end if;

  select e.nom into v_etab_nom
  from etablissements e
  where e.id = v_etab_id and (e.gestionnaire_id = auth.uid() or est_admin());
  if v_etab_nom is null then
    raise exception 'Seul le gestionnaire de l''établissement peut retirer ce médecin.';
  end if;

  update medecins set etablissement_id = null where id = p_medecin_id;
  delete from invitations_etablissement
    where etablissement_id = v_etab_id and medecin_id = p_medecin_id;

  perform creer_notification(
    p_medecin_id, 'rattachement_retire', 'Rattachement retiré',
    v_etab_nom || ' a retiré votre rattachement.', '/espace-medecin/compte',
    'etablissement', v_etab_id);
end;
$$;

grant execute on function detacher_medecin(uuid) to authenticated;

-- ---------- 3. Statistiques consolidées ----------
/*
 * Un seul aller-retour rend tout l'espace : le tableau de bord et
 * l'écran Statistiques lisent le même JSON, donc ils ne peuvent pas
 * annoncer deux nombres différents pour la même chose (le tableau de
 * bord affichait 32 RDV, les statistiques 486).
 *
 * CE QUI SORT D'ICI est toujours un compte ou une moyenne. `prochains`
 * est la seule liste, et elle porte l'heure, le médecin et le statut —
 * pas le patient. La règle de cloisonnement reste donc entière : le
 * gestionnaire voit la CHARGE de son établissement, pas sa patientèle.
 */
create or replace function statistiques_etablissement(p_etablissement_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_ok boolean;
  v_medecins uuid[];
  v_resultat jsonb;
begin
  select exists (
    select 1 from etablissements e
    where e.id = p_etablissement_id
      and (e.gestionnaire_id = auth.uid() or est_admin())
  ) into v_ok;
  if not v_ok then
    raise exception 'Statistiques réservées au gestionnaire de l''établissement.';
  end if;

  select coalesce(array_agg(m.id), '{}') into v_medecins
  from medecins m where m.etablissement_id = p_etablissement_id;

  with rdv as (
    select * from rendez_vous where medecin_id = any (v_medecins)
  )
  select jsonb_build_object(
    'medecins', cardinality(v_medecins),

    'assistants', (
      select count(*) from assistants a where a.medecin_id = any (v_medecins)
    ),

    'rdvAujourdhui', (select count(*) from rdv where rdv.date = current_date),
    'rdvSemaine',    (select count(*) from rdv
                      where rdv.date >= date_trunc('week', current_date)::date
                        and rdv.date <  (date_trunc('week', current_date) + interval '7 days')::date),
    'rdvMois',       (select count(*) from rdv
                      where rdv.date >= date_trunc('month', current_date)::date
                        and rdv.date <  (date_trunc('month', current_date) + interval '1 month')::date),

    -- Part des rendez-vous annulés, sur l'ensemble de l'historique de
    -- l'établissement : un taux calculé sur le mois courant sauterait
    -- de 0 à 50 % au premier jour du mois.
    'tauxAnnulation', (
      select case when count(*) = 0 then null
             else round(100.0 * count(*) filter (where statut = 'annule') / count(*)) end
      from rdv
    ),
    -- Honorés parmi les rendez-vous passés et tranchés (ni en attente,
    -- ni à venir) : c'est la question « les patients viennent-ils ? ».
    'tauxHonores', (
      select case when count(*) = 0 then null
             else round(100.0 * count(*) filter (where statut = 'honore') / count(*)) end
      from rdv where statut in ('honore', 'annule') and rdv.date < current_date
    ),

    -- Six mois glissants, mois vides compris : un trou dans la série
    -- décalerait les barres et mentirait sur la tendance. Le mois sort
    -- en « AAAA-MM » et non en toutes lettres : le libellé dépendrait
    -- sinon du `lc_time` du serveur (qui rend « Apr », « May »), alors
    -- que l'application a déjà ses noms de mois français (lib/dates).
    'parMois', (
      select coalesce(jsonb_agg(to_jsonb(x) - 'debut' order by x.debut), '[]'::jsonb) from (
        select
          m.debut,
          to_char(m.debut, 'YYYY-MM') as mois,
          (select count(*) from rdv
           where rdv.date >= m.debut::date
             and rdv.date < (m.debut + interval '1 month')::date) as total
        from generate_series(
          date_trunc('month', current_date) - interval '5 months',
          date_trunc('month', current_date),
          interval '1 month'
        ) as m(debut)
      ) x
    ),

    -- Activité de la semaine en cours, par médecin rattaché.
    'parMedecin', (
      select coalesce(jsonb_object_agg(t.medecin_id, t.n), '{}'::jsonb) from (
        select medecin_id, count(*) as n from rdv
        where rdv.date >= date_trunc('week', current_date)::date
          and rdv.date <  (date_trunc('week', current_date) + interval '7 days')::date
        group by medecin_id
      ) t
    ),

    -- Prochains rendez-vous, sans identité de patient (voir en-tête).
    -- L'alias est entre guillemets : tout le reste de ce JSON est en
    -- camelCase et le client le lit tel quel. Sans les guillemets,
    -- PostgreSQL rendrait `medecin_id`, et le tableau de bord — qui lit
    -- `medecinId` — ne retrouverait plus aucun nom de médecin.
    'prochains', (
      select coalesce(jsonb_agg(to_jsonb(p) order by p.date, p.heure), '[]'::jsonb) from (
        select rdv.id, rdv.date, rdv.heure, rdv.statut, rdv.medecin_id as "medecinId"
        from rdv
        where (rdv.date > current_date
               or (rdv.date = current_date and rdv.heure >= current_time))
          and rdv.statut in ('en_attente', 'confirme')
        order by rdv.date, rdv.heure
        limit 6
      ) p
    )
  ) into v_resultat;

  return v_resultat;
end;
$$;

grant execute on function statistiques_etablissement(uuid) to authenticated;

-- ---------- 4. Ce que le gestionnaire n'écrit pas ----------
/*
 * L'écran Informations devient modifiable (il était figé, avec un
 * bandeau « la modification sera possible quand la base de données sera
 * branchée » alors qu'elle l'était depuis longtemps). Avant d'ouvrir
 * cette porte, il faut fermer les deux qui donnaient sur autre chose.
 *
 * `upd_etablissements` dit « le gestionnaire met à jour SON
 * établissement », sans dire QUELLES colonnes. Une policy ne sait pas
 * distinguer un champ d'un autre, donc deux colonnes étaient écrivables
 * depuis le navigateur, et l'ont toujours été :
 *
 *   type            → il pilote le palier facturé
 *                     (lib/abonnement-inscription → palierPourType) :
 *                     un CHU se déclarait « Poste de santé » ;
 *   gestionnaire_id → l'établissement se donnait à un autre compte.
 *
 * `statut` n'est PAS repris ici : `trg_statut_reserve_admin` (0018, puis
 * 0045) le garde déjà, et avec une nuance qu'il ne faut pas écraser —
 * le titulaire a le droit de mettre sa propre fiche en pause
 * (valide ↔ suspendu), sans pouvoir se valider. Dupliquer le contrôle
 * ici reviendrait à interdire cette pause.
 *
 * Même règle que `utilisateurs.statut`, que le client n'écrit jamais, et
 * même mécanique que `bloquer_escalade_role` : ce qui relève d'une
 * DÉCISION DE LA PLATEFORME se change côté admin, pas depuis la fiche.
 *
 * L'INSERT n'est pas concerné : l'inscription crée la ligne avec son
 * type et son statut 'en_attente', et c'est bien ce qu'on veut garder.
 */
/*
 * Volontairement SANS `security definer`, contrairement aux autres
 * fonctions de ce fichier : le corps n'a besoin d'aucun privilège (il ne
 * lit que NEW et OLD, et `est_admin()` est déjà définer). Surtout, un
 * SECURITY DEFINER remplacerait `current_user` par le PROPRIÉTAIRE de la
 * fonction — `postgres` — et la garde s'exempterait donc elle-même à
 * chaque appel. Ici, `current_user` est bien le rôle qui écrit.
 */
create or replace function bloquer_champs_reserves_etablissement()
returns trigger
language plpgsql set search_path = public as $$
begin
  -- L'admin décide ; les routes serveur (clé service_role) et les
  -- migrations agissent au nom de la plateforme, pas d'un gestionnaire.
  if est_admin() or current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;
  if new.type is distinct from old.type then
    raise exception 'Le type d''établissement fixe le palier facturé : sa modification passe par l''administration de la plateforme.';
  end if;
  if new.gestionnaire_id is distinct from old.gestionnaire_id then
    raise exception 'Le gestionnaire d''un établissement ne se change pas depuis la fiche.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_champs_reserves_etablissement on etablissements;
create trigger trg_champs_reserves_etablissement
  before update on etablissements
  for each row execute function bloquer_champs_reserves_etablissement();
