-- ============================================================
-- Docteur 224 — Les conseils santé, gérés depuis l'administration
--
-- La page « Conseils santé » listait jusqu'ici six fiches ÉCRITES EN DUR dans
-- le composant. Les corriger ou en ajouter une demandait un déploiement. On
-- range donc ces fiches en base, pour que l'administration habilitée aux
-- « Paramètres » les rédige, les illustre, les publie ou les retire sans
-- toucher au code.
--
-- Ce n'est pas un blog : chaque fiche reste un CONSEIL DE PRÉVENTION d'ordre
-- général, aligné sur les recommandations de santé publique, qui se termine
-- par « quand consulter ». L'avertissement en tête de page n'est pas
-- décoratif, et aucune fiche ne porte de posologie ni de traitement.
--
-- Pourquoi une table dédiée plutôt qu'une ligne de `parametres_plateforme` :
-- un titre, un résumé, un corps, une liste de gestes, une image et un ordre
-- d'affichage méritent leurs colonnes typées, comme la charte publique (0079).
--
-- L'image vit sur Cloudinary (comme les photos de professionnels) : on ne
-- range ici que son URL servie et son `public_id`, pour pouvoir détruire le
-- fichier facturé quand la fiche change d'image ou disparaît.
-- ============================================================

create table if not exists conseils_sante (
  id uuid primary key default gen_random_uuid(),

  -- Le slug est l'adresse publique de la fiche (/conseils-sante/<slug>) : il
  -- est FIGÉ à la création et ne suit pas les corrections de titre, pour qu'un
  -- lien déjà partagé ne tombe jamais sur un 404.
  slug text not null unique,

  emoji text,
  categorie text,
  titre text not null,
  -- Le résumé est ce qui s'affiche sur la carte et dans l'aperçu de partage :
  -- court, il donne envie d'ouvrir « En savoir plus ».
  resume text not null,
  -- Le corps détaillé, lu sur la page de la fiche. Les paragraphes sont
  -- séparés par une ligne vide ; l'affichage se charge de la mise en forme.
  contenu text not null default '',
  -- Les gestes clés, en liste à puces cochées sur la fiche.
  gestes text[] not null default '{}',
  -- « Quand consulter » : le garde-fou de chaque fiche, jamais vide d'intention.
  quand_consulter text,

  -- L'illustration, sur Cloudinary. Nulle = repli sur un dégradé et l'emoji.
  image_url text,
  image_id text,

  -- Une fiche en vedette s'affiche en grand, en tête de page. Plusieurs peuvent
  -- l'être ; l'affichage ne met en avant que la première (par position).
  vedette boolean not null default false,
  -- Publiée ou brouillon : le public ne voit que les fiches publiées.
  publie boolean not null default true,
  -- L'ordre d'affichage, le plus petit en premier.
  position integer not null default 0,

  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);

create index if not exists conseils_sante_ordre
  on conseils_sante (publie, position, cree_le desc);

alter table conseils_sante enable row level security;

-- Lecture : le public ne voit que les fiches PUBLIÉES ; l'administration
-- habilitée aux « Paramètres » voit aussi les brouillons (pour son écran).
-- Le site public est servi à des visiteurs anonymes : ces fiches n'ont rien
-- de sensible, elles sont faites pour être lues.
drop policy if exists sel_conseils_sante on conseils_sante;
create policy sel_conseils_sante on conseils_sante for select
  using (publie or a_permission_admin('parametres'));

-- Écriture réservée à l'administration habilitée aux « Paramètres » (le compte
-- principal passe toujours, par construction de a_une_permission_admin). Comme
-- la charte publique (0079), habiller le site public relève des réglages de la
-- plateforme.
drop policy if exists mod_conseils_sante on conseils_sante;
create policy mod_conseils_sante on conseils_sante for all
  using (a_permission_admin('parametres'))
  with check (a_permission_admin('parametres'));

-- ------------------------------------------------------------
-- Reprise des six fiches qui vivaient dans le composant, pour que la page ne
-- soit pas vide le jour où la migration passe. `on conflict do nothing` sur le
-- slug rend la migration rejouable sans écraser une fiche déjà corrigée.
-- ------------------------------------------------------------
insert into conseils_sante (slug, emoji, categorie, titre, resume, contenu, gestes, quand_consulter, vedette, publie, position) values
(
  'se-proteger-du-paludisme', '🦟', 'Prévention',
  'Se protéger du paludisme',
  'La moustiquaire imprégnée, l''élimination des eaux stagnantes et des vêtements couvrants le soir : les gestes simples qui protègent toute la famille.',
  E'Le paludisme se transmet par la piqûre de moustiques qui piquent surtout la nuit. La meilleure protection reste d''éviter la piqûre, toute l''année — y compris en saison sèche, où le risque baisse mais ne disparaît pas.\n\nAutour de la maison, la moindre eau qui stagne devient un gîte à moustiques en quelques jours : vieux pneus, récipients oubliés, flaques. Les vider ou les couvrir réduit le nombre de moustiques là où vit la famille.\n\nUne fièvre n''est jamais à traiter « au cas où » : un test rapide, disponible dans la plupart des centres, tranche en quelques minutes. Prendre un antipaludique sans test retarde le vrai diagnostic quand ce n''est pas le paludisme.',
  array[
    'Dormir chaque nuit sous une moustiquaire imprégnée, y compris en saison sèche.',
    'Éliminer les eaux stagnantes autour de la maison : elles servent de gîtes aux moustiques.',
    'Couvrir bras et jambes le soir, moment où les moustiques piquent le plus.'
  ],
  'Toute fièvre doit être testée avant d''être traitée. Ne prenez pas d''antipaludique « au cas où » : un test rapide se fait en quelques minutes.',
  true, true, 1
),
(
  'eau-hygiene-et-diarrhees', '💧', 'Prévention',
  'Eau, hygiène et diarrhées',
  'Une eau traitée, des mains lavées au savon et une bonne hydratation : l''essentiel pour éviter les diarrhées et leurs complications.',
  E'La plupart des diarrhées viennent d''une eau ou d''aliments contaminés. Traiter ou bouillir l''eau de boisson, puis la garder dans un récipient fermé, coupe la chaîne de contamination la plus courante.\n\nSe laver les mains au savon avant de manger et après être allé aux toilettes est le geste le plus efficace, et le moins cher, contre ces maladies.\n\nEn cas de diarrhée, le vrai danger n''est pas la diarrhée elle-même mais la déshydratation, surtout chez l''enfant et la personne âgée : il faut continuer à boire abondamment, par petites gorgées régulières.',
  array[
    'Boire de l''eau traitée ou bouillie, et la conserver dans un récipient fermé.',
    'Se laver les mains au savon avant de manger et après être allé aux toilettes.',
    'En cas de diarrhée, continuer à boire abondamment : la déshydratation est le vrai danger.'
  ],
  'Consultez sans attendre si la diarrhée dure plus de trois jours, contient du sang, ou touche un nourrisson ou une personne âgée.',
  false, true, 2
),
(
  'suivre-une-grossesse', '🤰', 'Maternité',
  'Suivre une grossesse',
  'Commencer les consultations tôt, poursuivre le suivi jusqu''au bout et préparer l''accouchement : un suivi régulier protège la mère et l''enfant.',
  E'Un suivi de grossesse commencé tôt permet de repérer à temps ce qui, sinon, se découvre dans l''urgence. Les consultations prénatales se commencent dès les premiers mois, sans attendre qu''un problème se manifeste.\n\nLe suivi se poursuit jusqu''à l''accouchement, même quand tout va bien : c''est justement quand tout va bien qu''on vérifie que cela continue.\n\nPréparer le lieu d''accouchement à l''avance, avec la sage-femme ou le médecin, évite d''avoir à décider dans la précipitation le jour venu.',
  array[
    'Commencer les consultations prénatales dès les premiers mois, sans attendre un problème.',
    'Poursuivre le suivi jusqu''à l''accouchement, même quand tout va bien.',
    'Préparer le lieu d''accouchement à l''avance avec la sage-femme ou le médecin.'
  ],
  'En urgence : saignements, maux de tête intenses, gonflement brutal du visage ou des mains, fièvre, ou diminution des mouvements du bébé.',
  false, true, 3
),
(
  'tension-et-diabete', '❤️', 'Maladies chroniques',
  'Tension et diabète',
  'Deux maladies qui avancent sans bruit : un contrôle régulier, une hygiène de vie simple et un traitement suivi en changent le cours.',
  E'L''hypertension et le diabète évoluent longtemps sans aucun symptôme : on peut en être atteint des années sans le savoir. C''est pourquoi le contrôle régulier compte autant — une mesure de tension une fois par an à partir de 40 ans ne coûte presque rien.\n\nL''hygiène de vie pèse lourd : réduire le sel, l''alcool et le tabac, marcher trente minutes par jour. Ces gestes agissent sur les deux maladies à la fois.\n\nUn traitement prescrit se poursuit même quand on se sent bien. Se sentir bien ne veut pas dire guéri : c''est, le plus souvent, le signe que le traitement fait son travail.',
  array[
    'Faire contrôler sa tension au moins une fois par an à partir de 40 ans.',
    'Réduire le sel, l''alcool et le tabac ; marcher trente minutes par jour.',
    'Un traitement prescrit se poursuit même quand on se sent bien : c''est le principe.'
  ],
  'Soif intense, fatigue inhabituelle, vision troublée ou essoufflement justifient une consultation sans tarder.',
  false, true, 4
),
(
  'vaccination-des-enfants', '👶', 'Enfance',
  'Vaccination des enfants',
  'Respecter le calendrier, garder le carnet et ne pas renoncer en cas de retard : la vaccination protège l''enfant et ceux qui l''entourent.',
  E'Le calendrier vaccinal protège l''enfant contre des maladies graves, au moment où il y est le plus vulnérable. Respecter les dates, rappels compris, c''est ce qui donne au vaccin toute son efficacité.\n\nLe carnet de vaccination est le seul document qui dit où en est l''enfant : le conserver et l''apporter à chaque consultation évite les doses oubliées comme les doses répétées inutilement.\n\nUne fièvre légère dans les jours qui suivent un vaccin est fréquente et passagère — ce n''est pas une raison d''interrompre le calendrier.',
  array[
    'Respecter le calendrier vaccinal, y compris les rappels.',
    'Conserver le carnet de vaccination et l''apporter à chaque consultation.',
    'Une fièvre légère après un vaccin est fréquente et passagère.'
  ],
  'Un retard se rattrape : présentez-vous au centre de santé plutôt que de renoncer aux doses suivantes.',
  false, true, 5
),
(
  'bouche-et-dents', '🦷', 'Au quotidien',
  'Bouche et dents',
  'Un brossage deux fois par jour, moins de sucre et une visite annuelle suffisent à éviter la plupart des problèmes dentaires.',
  E'La santé de la bouche se joue surtout sur des gestes quotidiens : un brossage matin et soir retire la plaque avant qu''elle n''abîme les dents et les gencives.\n\nLes boissons sucrées sont les premières responsables des caries, chez l''enfant comme chez l''adulte : les limiter protège plus sûrement que n''importe quel soin après coup.\n\nUn examen une fois par an, même sans douleur, permet de prendre une carie à ses débuts, quand le soin est simple et rapide.',
  array[
    'Se brosser les dents deux fois par jour, matin et soir.',
    'Limiter les boissons sucrées, premières responsables des caries.',
    'Faire examiner ses dents une fois par an, même sans douleur.'
  ],
  'Une douleur qui réveille la nuit, une gencive gonflée ou une dent mobile ne se traitent pas seules.',
  false, true, 6
)
on conflict (slug) do nothing;
