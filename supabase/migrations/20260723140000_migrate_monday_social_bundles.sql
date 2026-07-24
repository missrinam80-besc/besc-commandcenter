alter table public.social_posts
  alter column platform drop not null,
  add column bundle_kind text not null default 'single'
    check (bundle_kind in ('single', 'bundle'));

create table public.social_post_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  social_post_id uuid not null references public.social_posts(id) on delete cascade,
  platform text not null check (platform in ('Discord','Twitch','YouTube','TikTok','Instagram','Facebook','X','Threads','LinkedIn','Blogger','Website','Nieuwsbrief')),
  status text not null default 'idea' check (status in ('idea','copy_needed','visual_needed','review','approved','scheduled','published','repurpose','archived')),
  copy text,
  hashtags text,
  call_to_action text,
  scheduled_at timestamptz,
  published_at timestamptz,
  planning_url text,
  publication_url text,
  notes text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (social_post_id, platform)
);

alter table public.social_post_variants enable row level security;
grant select, insert, update, delete on public.social_post_variants to authenticated;
create policy "members read social_post_variants" on public.social_post_variants for select to authenticated using (private.is_active_member(organization_id));
create policy "managers create social_post_variants" on public.social_post_variants for insert to authenticated with check (private.is_org_manager(organization_id));
create policy "managers update social_post_variants" on public.social_post_variants for update to authenticated using (private.is_org_manager(organization_id)) with check (private.is_org_manager(organization_id));
create policy "managers delete social_post_variants" on public.social_post_variants for delete to authenticated using (private.is_org_manager(organization_id));
create index social_post_variants_org_post_idx on public.social_post_variants(organization_id, social_post_id);
create index social_post_variants_schedule_idx on public.social_post_variants(organization_id, scheduled_at) where status <> 'archived';
create index social_post_variants_created_by_idx on public.social_post_variants(created_by);

do $$
declare
  legacy record;
  source_link public.migration_source_links%rowtype;
  raw jsonb;
  new_id uuid;
  publication_moment timestamptz;
  mapped_type text;
  mapped_status text;
  channel text;
  mapped_platform text;
begin
  for legacy in
    select * from public.legacy_records
    where deleted_at is null
      and converted_target_table is null
      and payload->>'board_name' = '[MKT] Social campaigns'
    order by created_at, id
    for update
  loop
    raw := coalesce(legacy.payload->'raw_fields', '{}'::jsonb);
    begin
      publication_moment := nullif(raw->>'Pub. datum', '')::date::timestamp at time zone 'Europe/Brussels';
    exception when others then
      publication_moment := null;
    end;

    mapped_type := case
      when lower(coalesce(raw->>'Post type', '')) like 'teaser%' then 'teaser'
      when lower(coalesce(raw->>'Post type', '')) like 'publicatie%' then 'publication'
      when lower(coalesce(raw->>'Post type', '')) like 'follow-up%' then 'follow_up'
      when lower(coalesce(raw->>'Post type', '')) like '%recap%' then 'recap'
      when lower(coalesce(raw->>'Post type', '')) like '%stor%' then 'story'
      else 'community'
    end;
    mapped_status := case when lower(coalesce(legacy.source_status, '')) = 'gepubliceerd' then 'published' else 'idea' end;

    select * into source_link
    from public.migration_source_links
    where target_table = 'legacy_records' and target_id = legacy.id
    order by imported_at desc limit 1;
    if source_link.id is null then raise exception 'missing source link %', legacy.id; end if;

    insert into public.social_posts(
      organization_id, content_id, title, platform, post_type, status,
      scheduled_at, published_at, notes, owner_id, created_by, bundle_kind
    ) values (
      legacy.organization_id,
      (select c.id from public.content_items c where c.organization_id = legacy.organization_id and lower(trim(c.title)) = lower(trim(legacy.title)) and c.deleted_at is null order by c.created_at limit 1),
      trim(legacy.title), null, mapped_type, mapped_status,
      publication_moment,
      case when mapped_status = 'published' then publication_moment else null end,
      nullif(concat_ws(E'\n',
        case when coalesce(raw->>'Thema', '') <> '' then 'Thema: ' || (raw->>'Thema') end,
        case when coalesce(raw->>'eigenaar', '') <> '' then 'Oorspronkelijke eigenaar: ' || (raw->>'eigenaar') end,
        case when coalesce(raw->>'Social kanalen', '') <> '' then 'Kanalen in monday: ' || (raw->>'Social kanalen') end
      ), ''),
      source_link.imported_by, source_link.imported_by, 'bundle'
    ) returning id into new_id;

    for channel in
      select distinct trim(value)
      from regexp_split_to_table(coalesce(raw->>'Social kanalen', ''), '\s*,\s*') as value
      where trim(value) <> ''
    loop
      mapped_platform := case lower(channel)
        when 'discord' then 'Discord'
        when 'facebook post' then 'Facebook'
        when 'instagram post' then 'Instagram'
        when 'linkedin post' then 'LinkedIn'
        when 'threads' then 'Threads'
        when 'x post' then 'X'
        when 'tiktok' then 'TikTok'
        when 'youtube' then 'YouTube'
        when 'twitch' then 'Twitch'
        else null
      end;
      if mapped_platform is not null then
        insert into public.social_post_variants(
          organization_id, social_post_id, platform, status, scheduled_at,
          published_at, notes, created_by
        ) values (
          legacy.organization_id, new_id, mapped_platform, mapped_status,
          publication_moment,
          case when mapped_status = 'published' then publication_moment else null end,
          'Overgenomen uit monday-kanaal: ' || channel,
          source_link.imported_by
        ) on conflict (social_post_id, platform) do nothing;
      end if;
    end loop;

    insert into public.migration_source_links(
      organization_id, source_system, source_workspace, source_board_id,
      source_item_id, target_table, target_id, source_url, source_payload, imported_by
    ) values (
      legacy.organization_id, source_link.source_system, source_link.source_workspace,
      source_link.source_board_id, source_link.source_item_id, 'social_posts', new_id,
      source_link.source_url, source_link.source_payload, source_link.imported_by
    );

    update public.legacy_records
    set converted_target_table = 'social_posts', converted_target_id = new_id,
        converted_at = now(), lifecycle = 'completed', updated_at = now()
    where id = legacy.id;
  end loop;
end $$;
