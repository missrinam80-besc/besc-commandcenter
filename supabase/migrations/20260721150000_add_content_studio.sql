create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  title text not null check (char_length(title) between 3 and 180),
  description text,
  content_type text not null default 'social_post' check (content_type in ('idea','blog','social_post','short_reel','youtube_video','livestream','podcast','tutorial','review','newsletter','community_post','partner_post','event_promo')),
  status text not null default 'idea' check (status in ('idea','research','draft','production','review','approved','scheduled','published','repurpose','archived')),
  priority public.priority_level not null default 'normal',
  owner_id uuid references public.profiles(id) on delete set null,
  primary_channel text check (primary_channel is null or primary_channel in ('Discord','Twitch','YouTube','TikTok','Instagram','Facebook','X','Threads','LinkedIn','Blogger','Website','Nieuwsbrief')),
  channels text[] not null default '{}',
  deadline date,
  publication_at timestamptz,
  drive_url text,
  canva_url text,
  publication_url text,
  approval_status text not null default 'not_required' check (approval_status in ('not_required','pending','changes_requested','approved')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.content_items enable row level security;
grant select,insert,update,delete on public.content_items to authenticated;
create policy "members read content" on public.content_items for select to authenticated using (private.is_active_member(organization_id));
create policy "managers create content" on public.content_items for insert to authenticated with check (private.is_org_manager(organization_id));
create policy "managers update content" on public.content_items for update to authenticated using (private.is_org_manager(organization_id)) with check (private.is_org_manager(organization_id));
create policy "managers delete content" on public.content_items for delete to authenticated using (private.is_org_manager(organization_id));

create index content_items_org_status_publication_idx on public.content_items (organization_id,status,publication_at) where deleted_at is null;
create index content_items_project_idx on public.content_items (project_id) where deleted_at is null;
create index content_items_owner_idx on public.content_items (owner_id) where deleted_at is null;

alter table public.tasks add column content_id uuid references public.content_items(id) on delete set null;
create index tasks_content_idx on public.tasks (content_id) where deleted_at is null;

alter table public.migration_source_links drop constraint migration_source_links_target_table_check;
alter table public.migration_source_links add constraint migration_source_links_target_table_check check (target_table in ('projects','inbox_items','tasks','legacy_records','content_items'));
alter table public.legacy_records drop constraint legacy_records_conversion_complete;
alter table public.legacy_records add constraint legacy_records_conversion_complete check (
  (converted_target_table is null and converted_target_id is null and converted_at is null)
  or (converted_target_table in ('inbox_items','tasks','projects','content_items') and converted_target_id is not null and converted_at is not null)
);

create or replace function public.convert_legacy_record(
  p_record_id uuid, p_target_table text, p_title text, p_description text default null,
  p_priority public.priority_level default 'normal', p_project_id uuid default null
) returns uuid language plpgsql security invoker set search_path='' as $$
declare legacy public.legacy_records%rowtype; source_link public.migration_source_links%rowtype; new_id uuid;
begin
  select * into legacy from public.legacy_records where id=p_record_id and deleted_at is null for update;
  if not found then raise exception 'historical record not found'; end if;
  if not private.is_org_manager(legacy.organization_id) then raise exception 'not authorized'; end if;
  if legacy.converted_target_id is not null then raise exception 'historical record already converted'; end if;
  if length(trim(p_title)) < 3 then raise exception 'title is too short'; end if;
  if p_project_id is not null and not exists (select 1 from public.projects where id=p_project_id and organization_id=legacy.organization_id and deleted_at is null) then raise exception 'project not found'; end if;

  if p_target_table='inbox_items' then
    insert into public.inbox_items (organization_id,title,description,source,priority,created_by) values (legacy.organization_id,trim(p_title),nullif(trim(p_description),''),'monday',p_priority,(select auth.uid())) returning id into new_id;
  elsif p_target_table='tasks' then
    insert into public.tasks (organization_id,project_id,title,description,priority,created_by) values (legacy.organization_id,p_project_id,trim(p_title),nullif(trim(p_description),''),p_priority,(select auth.uid())) returning id into new_id;
  elsif p_target_table='projects' then
    insert into public.projects (organization_id,title,description,status,priority,owner_id,created_by) values (legacy.organization_id,trim(p_title),nullif(trim(p_description),''),'planned',p_priority,(select auth.uid()),(select auth.uid())) returning id into new_id;
  elsif p_target_table='content_items' then
    insert into public.content_items (organization_id,project_id,title,description,content_type,status,priority,owner_id,created_by) values (legacy.organization_id,p_project_id,trim(p_title),nullif(trim(p_description),''),'idea','idea',p_priority,(select auth.uid()),(select auth.uid())) returning id into new_id;
  else raise exception 'unsupported target table'; end if;

  select * into source_link from public.migration_source_links where target_table='legacy_records' and target_id=legacy.id order by imported_at desc limit 1;
  if source_link.id is not null then
    insert into public.migration_source_links (organization_id,source_system,source_workspace,source_board_id,source_item_id,target_table,target_id,source_url,source_payload,imported_by)
    values (legacy.organization_id,source_link.source_system,source_link.source_workspace,source_link.source_board_id,source_link.source_item_id,p_target_table,new_id,source_link.source_url,source_link.source_payload,(select auth.uid()));
  end if;
  update public.legacy_records set converted_target_table=p_target_table,converted_target_id=new_id,converted_at=now(),lifecycle='completed',updated_at=now() where id=legacy.id;
  return new_id;
end; $$;
