-- Préférences de notification du patient (spec : rappels SMS/e-mail
-- désactivables dans les Paramètres de l'espace patient).
alter table patients
  add column pref_rappels_sms boolean not null default true,
  add column pref_rappels_email boolean not null default true,
  add column pref_offres boolean not null default false,
  add column langue text not null default 'fr';
