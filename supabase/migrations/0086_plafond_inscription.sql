-- Docteur 224 — Plafond sur la création de compte (/api/inscription)
--
-- La route /api/inscription crée un compte Auth à chaque appel valide, avec la
-- clé service_role, SANS session : elle est joignable par n'importe qui. Sans
-- frein, elle sert à inonder la base de comptes — et chaque création consomme
-- aussi une adresse e-mail confirmée. On lui pose les deux mêmes freins que
-- l'OTP (migration 0077), au même principe : on RÉSERVE l'essai avant d'agir,
-- et un essai bloqué compte quand même, pour que marteler n'ouvre rien.
--
-- Table additive, aucune policy : comme `codes_telephone`, elle n'est lue et
-- écrite que par la route en service_role. Le navigateur n'a rien à y voir.
--
-- Rejouable sans casse.

-- ---------- 1 · Les tentatives de création, par IP et par numéro ----------
create table if not exists tentatives_inscription (
  id uuid primary key default gen_random_uuid(),
  -- L'une ou l'autre peut manquer : un patient s'inscrit sans numéro, et un
  -- en-tête de proxy absent laisse l'IP nulle. Une colonne nulle ne plafonne
  -- rien (voir la fonction) — elle ne bloque jamais faute de savoir qui agit.
  ip text,
  telephone text,
  cree_le timestamptz not null default now()
);

create index if not exists tentatives_inscription_ip
  on tentatives_inscription (ip, cree_le desc);
create index if not exists tentatives_inscription_tel
  on tentatives_inscription (telephone, cree_le desc);

alter table tentatives_inscription enable row level security;

-- ---------- 2 · Réserver une tentative, et dire si un plafond est atteint ----------
--
-- Deux fenêtres indépendantes :
--   - par IP  : au plus 5 créations par heure (la 6e est refusée) ;
--   - par numéro : au plus 3 créations par jour (la 4e est refusée).
--
-- La ligne est d'abord INSÉRÉE, puis comptée (elle-même comprise) : cent
-- requêtes en rafale prennent donc chacune leur place avant d'être comptées,
-- comme pour l'OTP. Un dépassement laisse la ligne : marteler resserre le
-- verrou au lieu de le contourner.
create or replace function reserver_inscription(p_ip text, p_telephone text)
returns table (o_trop_ip boolean, o_trop_tel boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_ip integer;
  v_tel integer;
begin
  -- Auto-nettoyage : la plus longue fenêtre est d'un jour ; au-delà de deux,
  -- une ligne ne plafonne plus rien. La table reste ainsi minuscule sans
  -- dépendre d'une tâche planifiée. L'inscription est rare : ce coût est nul.
  delete from tentatives_inscription where cree_le < now() - interval '2 days';

  insert into tentatives_inscription (ip, telephone) values (p_ip, p_telephone);

  select count(*) into v_ip
    from tentatives_inscription
   where p_ip is not null and ip = p_ip
     and cree_le > now() - interval '1 hour';

  select count(*) into v_tel
    from tentatives_inscription
   where p_telephone is not null and telephone = p_telephone
     and cree_le > now() - interval '1 day';

  return query select
    (p_ip is not null and v_ip > 5),
    (p_telephone is not null and v_tel > 3);
end;
$$;

revoke execute on function reserver_inscription(text, text) from public, anon, authenticated;
grant execute on function reserver_inscription(text, text) to service_role;
