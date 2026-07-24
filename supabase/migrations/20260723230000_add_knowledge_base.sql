create table public.knowledge_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check(char_length(name) between 2 and 100),
  description text,
  color text not null default '#6b7280',
  sort_order integer not null default 0,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(organization_id,name)
);

create table public.knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid references public.knowledge_categories(id) on delete set null,
  title text not null check(char_length(title) between 3 and 180),
  summary text,
  body text,
  article_type text not null default 'guide' check(article_type in('procedure','guide','policy','faq','onboarding','template','reference','other')),
  status text not null default 'draft' check(status in('draft','review','published','outdated','archived')),
  tags text[] not null default '{}',
  drive_url text,
  owner_id uuid references public.profiles(id) on delete set null,
  review_due_date date,
  published_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.knowledge_revisions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.knowledge_articles(id) on delete cascade,
  title text not null,
  summary text,
  body text,
  status text not null,
  changed_by uuid not null references public.profiles(id),
  change_note text,
  created_at timestamptz not null default now()
);

alter table public.knowledge_categories enable row level security;
alter table public.knowledge_articles enable row level security;
alter table public.knowledge_revisions enable row level security;
grant select,insert,update,delete on public.knowledge_categories,public.knowledge_articles,public.knowledge_revisions to authenticated;

create policy "members read knowledge categories" on public.knowledge_categories for select to authenticated using(private.is_active_member(organization_id));
create policy "managers create knowledge categories" on public.knowledge_categories for insert to authenticated with check(private.is_org_manager(organization_id) and created_by=(select auth.uid()));
create policy "managers update knowledge categories" on public.knowledge_categories for update to authenticated using(private.is_org_manager(organization_id)) with check(private.is_org_manager(organization_id));
create policy "managers delete knowledge categories" on public.knowledge_categories for delete to authenticated using(private.is_org_manager(organization_id));

create policy "members read published knowledge articles" on public.knowledge_articles for select to authenticated
using(private.is_active_member(organization_id) and (status='published' or private.is_org_manager(organization_id)));
create policy "managers create knowledge articles" on public.knowledge_articles for insert to authenticated with check(private.is_org_manager(organization_id) and created_by=(select auth.uid()));
create policy "managers update knowledge articles" on public.knowledge_articles for update to authenticated using(private.is_org_manager(organization_id)) with check(private.is_org_manager(organization_id));
create policy "managers delete knowledge articles" on public.knowledge_articles for delete to authenticated using(private.is_org_manager(organization_id));

create policy "members read article revisions" on public.knowledge_revisions for select to authenticated using(
  exists(select 1 from public.knowledge_articles a where a.id=article_id and private.is_active_member(a.organization_id) and (a.status='published' or private.is_org_manager(a.organization_id)))
);
create policy "managers create article revisions" on public.knowledge_revisions for insert to authenticated with check(
  changed_by=(select auth.uid()) and exists(select 1 from public.knowledge_articles a where a.id=article_id and private.is_org_manager(a.organization_id))
);

create index knowledge_categories_org_sort_idx on public.knowledge_categories(organization_id,sort_order) where deleted_at is null;
create index knowledge_articles_org_status_idx on public.knowledge_articles(organization_id,status,updated_at desc) where deleted_at is null;
create index knowledge_articles_category_idx on public.knowledge_articles(category_id) where deleted_at is null;
create index knowledge_articles_owner_idx on public.knowledge_articles(owner_id) where deleted_at is null;
create index knowledge_articles_review_idx on public.knowledge_articles(organization_id,review_due_date) where deleted_at is null and status='published';
create index knowledge_revisions_article_idx on public.knowledge_revisions(article_id,created_at desc);
