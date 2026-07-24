create table public.shop_products (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check(char_length(name) between 2 and 180), product_type text not null default 'other' check(product_type in('emote','overlay','alert','panel','bundle','merch','digital','other')),
  status text not null default 'idea' check(status in('idea','design','ready','published','paused','archived')), price numeric(12,2) check(price is null or price>=0), style text,
  platforms text[] not null default '{}', description text, asset_url text, shop_url text, owner_id uuid references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.merch_launches (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check(char_length(title) between 3 and 180), collection_name text, status text not null default 'idea' check(status in('idea','planning','production','scheduled','live','completed','cancelled','archived')),
  launch_date date, timing text, description text, drive_url text, owner_id uuid references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.meetings (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check(char_length(title) between 3 and 180), meeting_type text not null default 'workgroup' check(meeting_type in('board','general_assembly','workgroup','project','partner','other')),
  status text not null default 'planned' check(status in('planned','confirmed','completed','cancelled','archived')), meeting_at timestamptz, attendees text[] not null default '{}',
  notes text, decisions text, action_points text, minutes_url text, created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.meeting_action_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, meeting_id uuid not null references public.meetings(id) on delete cascade,
  title text not null check(char_length(title) between 2 and 500), assignee_text text, status text not null default 'todo' check(status in('todo','doing','done','cancelled')), task_id uuid references public.tasks(id) on delete set null,
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

do $$ declare t text; begin foreach t in array array['shop_products','merch_launches','meetings','meeting_action_items'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  execute format('create policy "members read %1$s" on public.%1$I for select to authenticated using (private.is_active_member(organization_id))',t);
  execute format('create policy "managers create %1$s" on public.%1$I for insert to authenticated with check (private.is_org_manager(organization_id))',t);
  execute format('create policy "managers update %1$s" on public.%1$I for update to authenticated using (private.is_org_manager(organization_id)) with check (private.is_org_manager(organization_id))',t);
  execute format('create policy "managers delete %1$s" on public.%1$I for delete to authenticated using (private.is_org_manager(organization_id))',t);
end loop; end $$;
create index shop_products_org_status_idx on public.shop_products(organization_id,status) where deleted_at is null;
create index shop_products_owner_idx on public.shop_products(owner_id) where deleted_at is null;
create index merch_launches_org_status_date_idx on public.merch_launches(organization_id,status,launch_date) where deleted_at is null;
create index merch_launches_owner_idx on public.merch_launches(owner_id) where deleted_at is null;
create index meetings_org_date_idx on public.meetings(organization_id,meeting_at desc) where deleted_at is null;
create index meeting_action_items_meeting_idx on public.meeting_action_items(organization_id,meeting_id,status);
create index meeting_action_items_task_idx on public.meeting_action_items(task_id);

alter table public.migration_source_links drop constraint migration_source_links_target_table_check;
alter table public.migration_source_links add constraint migration_source_links_target_table_check check(target_table in('projects','inbox_items','tasks','legacy_records','content_items','events','partners','campaigns','community_people','social_posts','shop_products','merch_launches','meetings'));
alter table public.legacy_records drop constraint legacy_records_conversion_complete;
alter table public.legacy_records add constraint legacy_records_conversion_complete check(
  (converted_target_table is null and converted_target_id is null and converted_at is null)
  or (converted_target_table in('inbox_items','tasks','projects','content_items','events','partners','campaigns','community_people','social_posts','shop_products','merch_launches','meetings') and converted_target_id is not null and converted_at is not null)
);

do $$
declare legacy record; source_link public.migration_source_links%rowtype; raw jsonb; new_id uuid; meeting_day timestamptz; price_value numeric; action_text text; action_title text; action_owner text;
begin
  for legacy in select * from public.legacy_records where deleted_at is null and converted_target_table is null and payload->>'board_name'='[SHOP] Product catalog' order by created_at,id for update loop
    raw:=coalesce(legacy.payload->'raw_fields','{}'::jsonb);
    begin price_value:=replace(nullif(raw->>'Prijs (€)',''),',','.')::numeric; exception when others then price_value:=null; end;
    select * into source_link from public.migration_source_links where target_table='legacy_records' and target_id=legacy.id order by imported_at desc limit 1;if source_link.id is null then raise exception 'missing source link %',legacy.id;end if;
    insert into public.shop_products(organization_id,name,product_type,status,price,style,platforms,description,asset_url,shop_url,owner_id,created_by)
    values(legacy.organization_id,trim(legacy.title),case lower(coalesce(raw->>'Type product','')) when 'emote' then 'emote' when 'overlay' then 'overlay' when 'alert' then 'alert' when 'panel' then 'panel' when 'bundel' then 'bundle' else 'other' end,case when lower(coalesce(legacy.source_status,'')) like '%ontwerp%' then 'design' else 'idea' end,price_value,nullif(raw->>'Stijl',''),case when coalesce(raw->>'Platform','')='' then '{}'::text[] else regexp_split_to_array(raw->>'Platform','\s*,\s*') end,nullif(raw->>'Beschrijving & notities',''),nullif(raw->>'Bestanden (Drive/Canva)',''),nullif(raw->>'Preview / shoplink',''),source_link.imported_by,source_link.imported_by) returning id into new_id;
    insert into public.migration_source_links(organization_id,source_system,source_workspace,source_board_id,source_item_id,target_table,target_id,source_url,source_payload,imported_by) values(legacy.organization_id,source_link.source_system,source_link.source_workspace,source_link.source_board_id,source_link.source_item_id,'shop_products',new_id,source_link.source_url,source_link.source_payload,source_link.imported_by);
    update public.legacy_records set converted_target_table='shop_products',converted_target_id=new_id,converted_at=now(),lifecycle='completed',updated_at=now() where id=legacy.id;
  end loop;
  for legacy in select * from public.legacy_records where deleted_at is null and converted_target_table is null and payload->>'board_name'='[SHOP] Merch pipeline' order by created_at,id for update loop
    raw:=coalesce(legacy.payload->'raw_fields','{}'::jsonb);select * into source_link from public.migration_source_links where target_table='legacy_records' and target_id=legacy.id order by imported_at desc limit 1;if source_link.id is null then raise exception 'missing source link %',legacy.id;end if;
    insert into public.merch_launches(organization_id,title,collection_name,status,launch_date,timing,description,drive_url,owner_id,created_by)
    values(legacy.organization_id,trim(legacy.title),case when position(' - ' in legacy.title)>0 then trim(split_part(legacy.title,' - ',2)) else trim(legacy.title) end,'idea',nullif(raw->>'Date','')::date,nullif(raw->>'timing',''),nullif(concat_ws(E'\n',case when coalesce(raw->>'Person','')<>'' then 'Oorspronkelijke verantwoordelijke: '||(raw->>'Person') end,case when coalesce(legacy.source_status,'')<>'' then 'monday-groep: '||legacy.source_status end),''),nullif(raw->>'monday Doc',''),source_link.imported_by,source_link.imported_by) returning id into new_id;
    insert into public.migration_source_links(organization_id,source_system,source_workspace,source_board_id,source_item_id,target_table,target_id,source_url,source_payload,imported_by) values(legacy.organization_id,source_link.source_system,source_link.source_workspace,source_link.source_board_id,source_link.source_item_id,'merch_launches',new_id,source_link.source_url,source_link.source_payload,source_link.imported_by);
    update public.legacy_records set converted_target_table='merch_launches',converted_target_id=new_id,converted_at=now(),lifecycle='completed',updated_at=now() where id=legacy.id;
  end loop;
  for legacy in select * from public.legacy_records where deleted_at is null and converted_target_table is null and payload->>'board_name'='[MEET] Meetings master' order by created_at,id for update loop
    raw:=coalesce(legacy.payload->'raw_fields','{}'::jsonb);begin meeting_day:=nullif(raw->>'Datum meeting','')::date::timestamp at time zone 'Europe/Brussels';exception when others then meeting_day:=null;end;
    select * into source_link from public.migration_source_links where target_table='legacy_records' and target_id=legacy.id order by imported_at desc limit 1;if source_link.id is null then raise exception 'missing source link %',legacy.id;end if;
    insert into public.meetings(organization_id,title,meeting_type,status,meeting_at,attendees,notes,decisions,action_points,minutes_url,created_by)
    values(legacy.organization_id,trim(legacy.title),case lower(coalesce(raw->>'Type','')) when 'algemene vergadering' then 'general_assembly' when 'werkgroep' then 'workgroup' when 'bestuur' then 'board' else 'other' end,'completed',meeting_day,case when coalesce(raw->>'Deelnemers','')='' then '{}'::text[] else regexp_split_to_array(raw->>'Deelnemers','\s*,\s*') end,nullif(raw->>'Notulen',''),nullif(raw->>'Decisions',''),nullif(raw->>'Action points',''),nullif(raw->>'Notulen',''),source_link.imported_by) returning id into new_id;
    for action_text in select trim(value) from regexp_split_to_table(coalesce(raw->>'Action points',''),';') value where trim(value)<>'' loop
      action_title:=trim(split_part(action_text,'→',1));action_owner:=nullif(trim(split_part(action_text,'→',2)),'');
      insert into public.meeting_action_items(organization_id,meeting_id,title,assignee_text,status,created_by) values(legacy.organization_id,new_id,action_title,action_owner,'todo',source_link.imported_by);
    end loop;
    insert into public.migration_source_links(organization_id,source_system,source_workspace,source_board_id,source_item_id,target_table,target_id,source_url,source_payload,imported_by) values(legacy.organization_id,source_link.source_system,source_link.source_workspace,source_link.source_board_id,source_link.source_item_id,'meetings',new_id,source_link.source_url,source_link.source_payload,source_link.imported_by);
    update public.legacy_records set converted_target_table='meetings',converted_target_id=new_id,converted_at=now(),lifecycle='completed',updated_at=now() where id=legacy.id;
  end loop;
end $$;
