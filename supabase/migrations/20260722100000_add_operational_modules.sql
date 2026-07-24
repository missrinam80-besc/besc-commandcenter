create table public.partners (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 180), partner_type text not null default 'partner', status text not null default 'prospect', priority public.priority_level not null default 'normal',
  contact_name text, email text, website text, sector text, collaboration_type text, estimated_value numeric(12,2), last_contact date, next_follow_up date,
  drive_url text, notes text, owner_id uuid references public.profiles(id) on delete set null, created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  check (partner_type in ('sponsor','partner','supplier','event_partner','media','community','studio','venue')),
  check (status in ('prospect','contact','waiting','conversation','proposal','active','inactive','rejected','archived'))
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  partner_id uuid references public.partners(id) on delete set null, project_id uuid references public.projects(id) on delete set null, event_id uuid references public.events(id) on delete set null,
  title text not null check (char_length(title) between 3 and 180), campaign_type text not null default 'social', status text not null default 'idea', priority public.priority_level not null default 'normal',
  start_date date, end_date date, channels text[] not null default '{}', deliverables text, reporting_status text not null default 'not_required', budget numeric(12,2), value numeric(12,2), drive_url text, notes text,
  owner_id uuid references public.profiles(id) on delete set null, created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  check (campaign_type in ('social','partner','sponsor','giveaway','crowdfunding','event_promo','stream','blog')),
  check (status in ('idea','review','approved','production','scheduled','live','reporting','completed','cancelled','archived')),
  check (reporting_status in ('not_required','todo','draft','sent','approved'))
);

create table public.community_people (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 180), handle text, person_type text not null default 'volunteer', status text not null default 'active',
  email text, discord_handle text, language text, platforms text[] not null default '{}', interests text[] not null default '{}', skills text[] not null default '{}', availability text,
  streamteam_level text, onboarding_status text not null default 'not_started', drive_url text, notes text, owner_id uuid references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  check (person_type in ('crew','streamer','creator','volunteer','moderator','guest','external')),
  check (status in ('candidate','onboarding','tryout','active','paused','inactive','rejected','archived')),
  check (onboarding_status in ('not_started','in_progress','completed','not_required'))
);

create table public.social_posts (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  content_id uuid references public.content_items(id) on delete set null, campaign_id uuid references public.campaigns(id) on delete set null, event_id uuid references public.events(id) on delete set null, partner_id uuid references public.partners(id) on delete set null,
  title text not null check (char_length(title) between 3 and 180), platform text not null default 'Discord', post_type text not null default 'publication', status text not null default 'idea',
  copy text, hashtags text, call_to_action text, scheduled_at timestamptz, published_at timestamptz, canva_url text, planning_url text, publication_url text, notes text,
  owner_id uuid references public.profiles(id) on delete set null, created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  check (platform in ('Discord','Twitch','YouTube','TikTok','Instagram','Facebook','X','Threads','LinkedIn','Blogger','Website','Nieuwsbrief')),
  check (post_type in ('teaser','publication','reminder','follow_up','recap','clip','story','carousel','community','partner')),
  check (status in ('idea','copy_needed','visual_needed','review','approved','scheduled','published','repurpose','archived'))
);

do $$ declare t text; begin foreach t in array array['partners','campaigns','community_people','social_posts'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  execute format('create policy "members read %1$s" on public.%1$I for select to authenticated using (private.is_active_member(organization_id))',t);
  execute format('create policy "managers create %1$s" on public.%1$I for insert to authenticated with check (private.is_org_manager(organization_id))',t);
  execute format('create policy "managers update %1$s" on public.%1$I for update to authenticated using (private.is_org_manager(organization_id)) with check (private.is_org_manager(organization_id))',t);
  execute format('create policy "managers delete %1$s" on public.%1$I for delete to authenticated using (private.is_org_manager(organization_id))',t);
end loop; end $$;

create index partners_org_status_followup_idx on public.partners(organization_id,status,next_follow_up) where deleted_at is null;
create index campaigns_org_status_dates_idx on public.campaigns(organization_id,status,start_date,end_date) where deleted_at is null;
create index campaigns_partner_idx on public.campaigns(partner_id) where deleted_at is null;
create index community_people_org_status_idx on public.community_people(organization_id,status,person_type) where deleted_at is null;
create index social_posts_org_status_schedule_idx on public.social_posts(organization_id,status,scheduled_at) where deleted_at is null;
create index social_posts_campaign_idx on public.social_posts(campaign_id) where deleted_at is null;

alter table public.migration_source_links drop constraint migration_source_links_target_table_check;
alter table public.migration_source_links add constraint migration_source_links_target_table_check check (target_table in ('projects','inbox_items','tasks','legacy_records','content_items','events','partners','campaigns','community_people','social_posts'));
alter table public.legacy_records drop constraint legacy_records_conversion_complete;
alter table public.legacy_records add constraint legacy_records_conversion_complete check (
  (converted_target_table is null and converted_target_id is null and converted_at is null)
  or (converted_target_table in ('inbox_items','tasks','projects','content_items','events','partners','campaigns','community_people','social_posts') and converted_target_id is not null and converted_at is not null)
);

create or replace function public.convert_legacy_operational(p_record_id uuid,p_target_table text,p_title text,p_description text default null,p_priority public.priority_level default 'normal',p_project_id uuid default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare legacy public.legacy_records%rowtype; source_link public.migration_source_links%rowtype; new_id uuid;
begin
  select * into legacy from public.legacy_records where id=p_record_id and deleted_at is null for update;
  if not found then raise exception 'historical record not found'; end if;
  if not private.is_org_manager(legacy.organization_id) then raise exception 'not authorized'; end if;
  if legacy.converted_target_id is not null then raise exception 'historical record already converted'; end if;
  if length(trim(p_title))<3 then raise exception 'title is too short'; end if;
  if p_project_id is not null and not exists(select 1 from public.projects where id=p_project_id and organization_id=legacy.organization_id and deleted_at is null) then raise exception 'project not found'; end if;
  if p_target_table='partners' then insert into public.partners(organization_id,name,notes,priority,owner_id,created_by) values(legacy.organization_id,trim(p_title),nullif(trim(p_description),''),p_priority,(select auth.uid()),(select auth.uid())) returning id into new_id;
  elsif p_target_table='campaigns' then insert into public.campaigns(organization_id,project_id,title,notes,priority,owner_id,created_by) values(legacy.organization_id,p_project_id,trim(p_title),nullif(trim(p_description),''),p_priority,(select auth.uid()),(select auth.uid())) returning id into new_id;
  elsif p_target_table='community_people' then insert into public.community_people(organization_id,display_name,notes,owner_id,created_by) values(legacy.organization_id,trim(p_title),nullif(trim(p_description),''),(select auth.uid()),(select auth.uid())) returning id into new_id;
  elsif p_target_table='social_posts' then insert into public.social_posts(organization_id,title,copy,owner_id,created_by) values(legacy.organization_id,trim(p_title),nullif(trim(p_description),''),(select auth.uid()),(select auth.uid())) returning id into new_id;
  else raise exception 'unsupported target table'; end if;
  select * into source_link from public.migration_source_links where target_table='legacy_records' and target_id=legacy.id order by imported_at desc limit 1;
  if source_link.id is not null then insert into public.migration_source_links(organization_id,source_system,source_workspace,source_board_id,source_item_id,target_table,target_id,source_url,source_payload,imported_by) values(legacy.organization_id,source_link.source_system,source_link.source_workspace,source_link.source_board_id,source_link.source_item_id,p_target_table,new_id,source_link.source_url,source_link.source_payload,(select auth.uid())); end if;
  update public.legacy_records set converted_target_table=p_target_table,converted_target_id=new_id,converted_at=now(),lifecycle='completed',updated_at=now() where id=legacy.id;
  return new_id;
end; $$;
