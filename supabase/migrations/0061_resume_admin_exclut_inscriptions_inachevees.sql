-- Le résumé du jour comptait des dossiers que la console Validations ne
-- montre pas : programmer_resume_admin() (migration 0059) comptait tout
-- medecin/etablissement au statut 'en_attente', sans exclure les
-- inscriptions inachevées (etape_inscription non nul). La console, elle,
-- les exclut depuis le début (lib/admin.ts : « un parcours d'inscription
-- inachevé n'est pas un dossier à examiner, le professionnel n'a pas fini
-- de le déposer »). Un admin recevait donc un mail annonçant des dossiers
-- qu'il ne pouvait pas trouver dans la file.
create or replace function programmer_resume_admin()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  a record;
  v_pros integer;
  v_etabs integer;
  v_signalements integer;
  v_corps text;
  v_total integer;
  v_envois integer := 0;
begin
  select count(*) into v_pros from medecins where statut = 'en_attente' and etape_inscription is null;
  select count(*) into v_etabs from etablissements where statut = 'en_attente' and etape_inscription is null;
  select count(*) into v_signalements from signalements where statut = 'nouveau';

  for a in
    select u.id, u.admin_principal, u.sous_roles_admin
    from utilisateurs u
    where u.role = 'admin' and u.statut = 'actif' and not u.suspendu_par_admin
  loop
    v_corps := '';
    v_total := 0;

    if a.admin_principal or a.sous_roles_admin && array['validations'] then
      if v_pros > 0 then
        v_corps := v_corps || 'Praticiens à valider : ' || v_pros || E'\n';
        v_total := v_total + v_pros;
      end if;
      if v_etabs > 0 then
        v_corps := v_corps || 'Établissements à valider : ' || v_etabs || E'\n';
        v_total := v_total + v_etabs;
      end if;
    end if;

    if a.admin_principal or a.sous_roles_admin && array['moderation'] then
      if v_signalements > 0 then
        v_corps := v_corps || 'Signalements à traiter : ' || v_signalements || E'\n';
        v_total := v_total + v_signalements;
      end if;
    end if;

    if v_total > 0 then
      perform programmer_email(
        a.id,
        'resume_admin',
        'Votre résumé du jour',
        rtrim(v_corps, E'\n'),
        '/espace-admin',
        'resume',
        null,
        null,
        now());
      v_envois := v_envois + 1;
    end if;
  end loop;

  return v_envois;
end;
$$;
