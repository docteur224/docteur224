-- Les messages de la plateforme ne sont pas débités d'un quota professionnel.
--
-- L'envoi d'essai de /espace-admin/messagerie part au nom de l'administrateur
-- qui l'a déclenché. Or un admin n'a pas d'abonnement : `sms_restants` lui
-- renvoie 0, et `enregistrer_message` refusait donc systématiquement le test —
-- le seul moyen de vérifier qu'une configuration d'agrégateur fonctionne était
-- inutilisable.
--
-- Le quota protège le professionnel d'une facture qu'il n'a pas choisie. Un
-- message émis par la plateforme elle-même ne relève pas de cette protection :
-- il est journalisé et coûté comme les autres — la facture de l'agrégateur,
-- elle, ne fait pas de différence — mais il n'est plafonné par aucun quota.

create or replace function enregistrer_message(
  p_titulaire uuid,
  p_destinataire text,
  p_motif text,
  p_canal canal_message default 'sms',
  p_segments smallint default 1,
  p_cout_unitaire integer default 150,
  p_statut statut_message default 'envoye',
  p_reference text default null,
  p_erreur text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_quota_restant integer;
  v_sur_credit boolean := false;
  v_admin boolean;
begin
  select role = 'admin' into v_admin from utilisateurs where id = p_titulaire;

  if p_canal = 'sms' and p_statut <> 'echec' and not coalesce(v_admin, false) then
    v_quota_restant := greatest(0,
      coalesce((select quota_sms from abonnements where titulaire_id = p_titulaire limit 1), 0)
        - sms_consommes(p_titulaire));
    if v_quota_restant < p_segments then
      v_sur_credit := true;
      if credits_sms(p_titulaire) < p_segments then
        raise exception 'Quota SMS épuisé et crédit insuffisant (% segments demandés, % restants).',
          p_segments, sms_restants(p_titulaire)
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  insert into messages_envoyes
    (titulaire_id, destinataire, motif, canal, statut, cout_gnf, segments,
     reference_externe, erreur, sur_credit)
  values (p_titulaire, p_destinataire, p_motif, p_canal, p_statut,
          p_segments * p_cout_unitaire, p_segments, p_reference, p_erreur, v_sur_credit)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function enregistrer_message(uuid, text, text, canal_message, smallint, integer, statut_message, text, text) from public;
revoke execute on function enregistrer_message(uuid, text, text, canal_message, smallint, integer, statut_message, text, text) from authenticated;
revoke execute on function enregistrer_message(uuid, text, text, canal_message, smallint, integer, statut_message, text, text) from anon;
