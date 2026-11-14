-- ============================================================
-- Docteur 224 — Le blog, géré depuis l'administration
--
-- La rubrique « Conseils santé » (0091) reste ce qu'elle est : des FICHES de
-- prévention d'ordre général, sans date ni auteur, chacune terminée par
-- « quand consulter ». Le BLOG est autre chose : des ARTICLES datés, signés,
-- rangés par catégorie et par mots-clés, écrits pour être lus puis partagés —
-- actualités de la plateforme, dossiers de fond, portraits, nouveautés.
--
-- Comme pour les conseils, tout se rédige depuis l'administration habilitée aux
-- « Paramètres » (a_permission_admin('parametres')), sans toucher au code :
--   - `blog_categories` : les rubriques du blog (CRUD complet) ;
--   - `blog_articles`   : les articles (brouillon / publié, à la une, vedette) ;
--   - `blog_reseaux`    : les liens « Suivez-nous » de la barre latérale.
--
-- L'image de couverture vit sur Cloudinary (dossier docteur224/blog) : on ne
-- range ici que son URL servie et son `public_id`, pour détruire le fichier
-- facturé quand l'article change d'image ou disparaît.
--
-- Le compteur de vues (`vues`) alimente la section « Articles populaires ». Il
-- s'incrémente par une fonction SECURITY DEFINER bornée aux articles PUBLIÉS :
-- un visiteur anonyme ne peut qu'ajouter +1 à un article déjà public, jamais
-- lire ni écrire autre chose — la RLS reste fermée en écriture par ailleurs.
-- ============================================================

-- ------------------------------------------------------------
-- Catégories
-- ------------------------------------------------------------
create table if not exists blog_categories (
  id uuid primary key default gen_random_uuid(),
  -- Figé à la création : une correction de nom ne doit pas casser un lien
  -- /blog/categorie/<slug> déjà partagé.
  slug text not null unique,
  nom text not null,
  description text,
  emoji text,
  position integer not null default 0,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);

create index if not exists blog_categories_ordre
  on blog_categories (position, nom);

alter table blog_categories enable row level security;

-- Lecture ouverte à tous (anonymes compris) : les catégories habillent le site
-- public. Écriture réservée à la permission « Paramètres ».
drop policy if exists sel_blog_categories on blog_categories;
create policy sel_blog_categories on blog_categories for select
  using (true);

drop policy if exists mod_blog_categories on blog_categories;
create policy mod_blog_categories on blog_categories for all
  using (a_permission_admin('parametres'))
  with check (a_permission_admin('parametres'));

-- ------------------------------------------------------------
-- Articles
-- ------------------------------------------------------------
create table if not exists blog_articles (
  id uuid primary key default gen_random_uuid(),

  -- Adresse publique (/blog/<slug>), FIGÉE à la création.
  slug text not null unique,

  titre text not null,
  -- L'extrait s'affiche sur la carte et dans l'aperçu de partage : court, il
  -- donne envie d'ouvrir l'article.
  extrait text not null,
  -- Le corps, rédigé dans l'éditeur riche, stocké en HTML. Repassé par une
  -- liste blanche stricte au rendu (le contenu est servi à des anonymes).
  contenu text not null default '',

  categorie_id uuid references blog_categories (id) on delete set null,
  -- Mots-clés libres, affichés en pastilles et cherchables.
  tags text[] not null default '{}',
  -- Signature de l'article (nom affiché). Nulle = « L'équipe Docteur 224 ».
  auteur text,

  -- La couverture, sur Cloudinary. Nulle = repli sur un dégradé et l'emoji de
  -- la catégorie.
  couverture_url text,
  couverture_id text,

  -- Compteur de lectures, pour la section « Articles populaires ».
  vues integer not null default 0,

  -- À la une : l'article vedette en grand, en tête de la page blog. Plusieurs
  -- peuvent l'être ; l'affichage ne met en avant que le plus récent.
  vedette boolean not null default false,
  -- Publié ou brouillon : le public ne voit que les articles publiés.
  publie boolean not null default false,

  -- Date de publication, affichée au lecteur. Posée à la création ; elle sert
  -- aussi d'ordre « Derniers articles ».
  publie_le timestamptz not null default now(),
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);

create index if not exists blog_articles_publies
  on blog_articles (publie, publie_le desc);
create index if not exists blog_articles_categorie
  on blog_articles (categorie_id);
create index if not exists blog_articles_populaires
  on blog_articles (publie, vues desc);

alter table blog_articles enable row level security;

-- Lecture : le public ne voit que les articles PUBLIÉS ; l'administration
-- habilitée aux « Paramètres » voit aussi les brouillons (pour son écran).
drop policy if exists sel_blog_articles on blog_articles;
create policy sel_blog_articles on blog_articles for select
  using (publie or a_permission_admin('parametres'));

drop policy if exists mod_blog_articles on blog_articles;
create policy mod_blog_articles on blog_articles for all
  using (a_permission_admin('parametres'))
  with check (a_permission_admin('parametres'));

-- ------------------------------------------------------------
-- Liens « Suivez-nous » (barre latérale du blog)
-- ------------------------------------------------------------
create table if not exists blog_reseaux (
  id uuid primary key default gen_random_uuid(),
  -- Clé de réseau connue de l'affichage (facebook, x, instagram, linkedin,
  -- youtube, tiktok, whatsapp). Une clé inconnue s'affiche avec une icône
  -- générique plutôt que de casser la page.
  reseau text not null,
  url text not null,
  position integer not null default 0,
  actif boolean not null default true,
  cree_le timestamptz not null default now()
);

alter table blog_reseaux enable row level security;

drop policy if exists sel_blog_reseaux on blog_reseaux;
create policy sel_blog_reseaux on blog_reseaux for select
  using (true);

drop policy if exists mod_blog_reseaux on blog_reseaux;
create policy mod_blog_reseaux on blog_reseaux for all
  using (a_permission_admin('parametres'))
  with check (a_permission_admin('parametres'));

-- ------------------------------------------------------------
-- Compteur de vues — +1 sur un article PUBLIÉ, appelable par un anonyme.
--
-- SECURITY DEFINER : la fonction tourne avec les droits du propriétaire et
-- traverse la RLS, mais son seul pouvoir est d'ajouter 1 au compteur d'un
-- article déjà public. Elle ne rend rien et ne touche à rien d'autre.
-- ------------------------------------------------------------
create or replace function incrementer_vue_article(p_slug text)
returns void
language sql
security definer
set search_path = public
as $$
  update blog_articles
     set vues = vues + 1
   where slug = p_slug
     and publie;
$$;

grant execute on function incrementer_vue_article(text) to anon, authenticated;

-- ------------------------------------------------------------
-- Amorce : quelques catégories et trois articles publiés, pour que le blog ne
-- soit pas vide le jour où la migration passe. `on conflict do nothing` sur le
-- slug rend la migration rejouable sans écraser un contenu déjà corrigé.
-- ------------------------------------------------------------
insert into blog_categories (slug, nom, description, emoji, position) values
  ('actualites', 'Actualités', 'Les nouveautés de la plateforme Docteur 224.', '📣', 1),
  ('sante-publique', 'Santé publique', 'Prévention, campagnes et grands enjeux de santé en Guinée.', '🩺', 2),
  ('temoignages', 'Témoignages', 'Patients et professionnels racontent.', '💬', 3),
  ('conseils-pratiques', 'Conseils pratiques', 'Bien utiliser la plateforme et préparer ses rendez-vous.', '🧭', 4)
on conflict (slug) do nothing;

insert into blog_articles (slug, titre, extrait, contenu, categorie_id, tags, auteur, vedette, publie, publie_le)
select
  v.slug, v.titre, v.extrait, v.contenu,
  (select id from blog_categories where slug = v.cat_slug),
  v.tags, v.auteur, v.vedette, true, v.publie_le
from (values
  (
    'docteur224-lance-son-blog',
    'Docteur 224 lance son blog',
    'Un nouvel espace pour suivre l''actualité de la plateforme, la prévention et les conseils qui vous aident à mieux vous soigner au quotidien.',
    E'<p>Nous sommes heureux d''ouvrir le blog de Docteur 224. Vous y trouverez l''actualité de la plateforme, des dossiers de prévention alignés sur les recommandations de santé publique, des témoignages de patients et de professionnels, et des conseils pratiques pour tirer le meilleur de vos rendez-vous.</p><h2>Pourquoi un blog ?</h2><p>Nos fiches « Conseils santé » restent des repères de prévention, courts et stables. Le blog, lui, vit au rythme de l''actualité : il raconte, explique et donne la parole. Les deux se complètent.</p><p>Bonne lecture — et n''hésitez pas à partager les articles autour de vous.</p>',
    'actualites',
    array['plateforme', 'nouveauté'],
    'L''équipe Docteur 224',
    true,
    now()
  ),
  (
    'preparer-son-premier-rendez-vous-en-ligne',
    'Préparer son premier rendez-vous en ligne',
    'Quelques gestes simples pour arriver serein : documents utiles, antécédents à noter, questions à préparer. Tout se joue avant la consultation.',
    E'<p>Un rendez-vous bien préparé, c''est une consultation plus utile. Voici comment vous y prendre.</p><h2>Rassemblez vos documents</h2><p>Carnet de vaccination, ordonnances en cours, résultats d''examens récents : apportez tout ce qui éclaire votre situation.</p><h2>Notez vos antécédents</h2><p>Maladies connues, allergies, traitements réguliers. Ces informations font gagner un temps précieux au médecin.</p><h2>Préparez vos questions</h2><p>Écrivez à l''avance ce qui vous préoccupe. On oublie souvent l''essentiel une fois dans le cabinet.</p>',
    'conseils-pratiques',
    array['rendez-vous', 'consultation'],
    'L''équipe Docteur 224',
    false,
    now() - interval '3 days'
  ),
  (
    'la-prevention-commence-par-un-geste',
    'La prévention commence par un geste',
    'Se laver les mains, dormir sous moustiquaire, faire contrôler sa tension : les petits gestes qui changent une vie de santé, rappelés simplement.',
    E'<p>La santé ne se joue pas seulement dans le cabinet du médecin. Elle se construit chaque jour, par des gestes simples et réguliers.</p><h2>Des gestes à la portée de tous</h2><ul><li>Se laver les mains au savon avant de manger.</li><li>Dormir sous une moustiquaire imprégnée, toute l''année.</li><li>Faire contrôler sa tension une fois par an à partir de 40 ans.</li></ul><p>Aucun de ces gestes ne coûte cher. Tous protègent, vous et vos proches. Retrouvez le détail dans nos <em>Conseils santé</em>.</p>',
    'sante-publique',
    array['prévention', 'hygiène'],
    'L''équipe Docteur 224',
    false,
    now() - interval '7 days'
  )
) as v(slug, titre, extrait, contenu, cat_slug, tags, auteur, vedette, publie_le)
on conflict (slug) do nothing;
