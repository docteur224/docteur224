-- ============================================================
-- Docteur 224 — Un rappel parti ne repart pas (correctif de la 0066)
--
-- `programmer_rappels_telephone` recrée les échéances d'un rendez-vous à
-- chaque changement (rendez-vous déplacé, délais du professionnel modifiés).
-- Sur une échéance déjà existante, son `on conflict do update` remettait
-- l'état à « programmé » SANS regarder s'il était déjà parti : un médecin qui
-- ajoutait H-6 à ses délais après l'envoi du rappel J-1 faisait repartir ce
-- J-1 — le patient le recevait deux fois, et le professionnel le payait deux
-- fois.
--
-- Désormais seule une échéance encore en attente, ou annulée par un
-- changement précédent, est remise en file. Envoyée, simulée, en cours
-- d'envoi, ignorée ou abandonnée : elle reste telle quelle.
-- ============================================================

create or replace function programmer_rappels_telephone(p_rdv uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r rendez_vous;
  v_pref preferences_rappels;
  v_delai smallint;
  v_quand timestamptz;
  v_canal canal_message;
begin
  update rappels_programmes set etat = 'annule', derniere_erreur = 'Rendez-vous modifié ou annulé'
   where rendez_vous_id = p_rdv and etat = 'programme';

  select * into r from rendez_vous where id = p_rdv;
  if not found or r.statut::text not in ('en_attente', 'confirme') then
    return;
  end if;
  select * into v_pref from preferences_rappels where titulaire_id = titulaire_abonnement_medecin(r.medecin_id);
  if v_pref.titulaire_id is not null and not v_pref.rappels_actifs then
    return;
  end if;
  select c.canal into v_canal from canal_rappel(p_rdv) c;

  foreach v_delai in array coalesce(v_pref.delais_heures, '{24,2}'::smallint[]) loop
    -- La base tourne en UTC, qui est l'heure de Conakry.
    v_quand := ((r.date + r.heure) at time zone 'UTC') - make_interval(hours => v_delai);
    if v_quand > now() + interval '2 minutes' then
      insert into rappels_programmes (rendez_vous_id, delai_heures, programme_pour, canal)
      values (p_rdv, v_delai, v_quand, v_canal)
      on conflict (rendez_vous_id, delai_heures, programme_pour)
        do update set etat = 'programme', canal = excluded.canal, derniere_erreur = null
        where rappels_programmes.etat in ('programme', 'annule');
    end if;
  end loop;
end;
$$;

revoke execute on function programmer_rappels_telephone(uuid) from public, anon, authenticated;
