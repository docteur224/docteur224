-- Correction d'étanchéité du compteur SMS posé par la 0034.
--
-- La 0034 affirmait en commentaire que `enregistrer_sms` n'était pas ouverte
-- aux clients. C'était FAUX : Postgres accorde EXECUTE à PUBLIC par défaut sur
-- toute fonction créée, et je n'avais écrit aucun REVOKE. Vérifié en base —
-- `has_function_privilege('authenticated', …, 'execute')` renvoyait true sur
-- les trois fonctions. Trois conséquences, toutes exploitables depuis la
-- console du navigateur d'un compte quelconque :
--
--   1. enregistrer_sms(<id d'autrui>, …) — SECURITY DEFINER — permettait de
--      brûler le quota d'un confrère, ou de fabriquer un historique d'envois.
--   2. sms_consommes / sms_restants acceptaient l'id de n'importe qui et
--      renvoyaient ses chiffres.
--   3. La vue consommation_sms_mois n'avait pas `security_invoker` : depuis
--      Postgres 15 c'est le défaut, et une vue s'exécute alors avec les droits
--      de son PROPRIÉTAIRE. Elle contournait donc la RLS de `abonnements` et
--      de `sms_envoyes`, exposant à tout compte connecté la formule et la
--      consommation de tous les professionnels de la plateforme.
--
-- Le fond de l'erreur : avoir cru qu'une absence de policy suffisait à fermer
-- un accès. Elle ferme les tables, pas les fonctions ni les vues.

-- ---------- 1 · La vue lit avec les droits de l'appelant ----------
-- `security_invoker = on` fait s'appliquer la RLS de `abonnements` (le
-- titulaire voit la sienne, l'admin Finance voit tout) et celle de
-- `sms_envoyes`. La vue n'appelle plus aucune fonction SECURITY DEFINER :
-- l'agrégat est inline, donc filtré par la RLS comme n'importe quelle lecture.
create or replace view consommation_sms_mois
with (security_invoker = on) as
select
  a.titulaire_id,
  a.type_titulaire,
  a.formule,
  a.quota_sms,
  coalesce(c.segments, 0)::integer as consommes,
  greatest(0, a.quota_sms - coalesce(c.segments, 0))::integer as restants,
  coalesce(c.cout, 0)::integer as cout_gnf
from abonnements a
left join lateral (
  select sum(s.segments) as segments, sum(s.cout_gnf) as cout
  from sms_envoyes s
  where s.titulaire_id = a.titulaire_id
    and s.statut <> 'echec'
    and s.envoye_le >= date_trunc('month', current_date)
    and s.envoye_le < date_trunc('month', current_date) + interval '1 month'
) c on true;

-- ---------- 2 · Les fonctions redeviennent internes ----------
-- Elles restent SECURITY DEFINER parce qu'`enregistrer_sms` doit compter les
-- envois sans être bridée par la RLS ; ce qui change, c'est QUI peut les
-- appeler. Seul le service_role (routes serveur) écrit un envoi. Les clients
-- lisent leur consommation par la vue ci-dessus, qui les filtre.
revoke execute on function enregistrer_sms(uuid, text, text, smallint, integer, statut_sms, text, text) from public;
revoke execute on function enregistrer_sms(uuid, text, text, smallint, integer, statut_sms, text, text) from authenticated;
revoke execute on function enregistrer_sms(uuid, text, text, smallint, integer, statut_sms, text, text) from anon;

revoke execute on function sms_consommes(uuid, date) from public;
revoke execute on function sms_consommes(uuid, date) from authenticated;
revoke execute on function sms_consommes(uuid, date) from anon;

revoke execute on function sms_restants(uuid) from public;
revoke execute on function sms_restants(uuid) from authenticated;
revoke execute on function sms_restants(uuid) from anon;

-- ---------- 3 · La vue reste lisible, la RLS fait le tri ----------
revoke all on consommation_sms_mois from anon;
grant select on consommation_sms_mois to authenticated;
