begin;
-- Historical items retain an unknown origin until a user explicitly chooses it.
alter table public.assets add column acquisition_type text check(acquisition_type in ('purchased','borrowed','gifted'));
create function private.normalize_asset_acquisition() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.acquisition_type in ('borrowed','gifted') then
  new.acquired_date:=null; new.purchase_value:=null; new.current_value:=null;
 end if;
 return new;
end $$;
revoke all on function private.normalize_asset_acquisition() from public,anon,authenticated;
create trigger normalize_asset_acquisition before insert or update on public.assets
for each row execute function private.normalize_asset_acquisition();

alter table public.tasks add column repair_asset_id uuid;
alter table public.tasks add constraint task_repair_asset_org_fk foreign key(organization_id,repair_asset_id)
 references public.assets(organization_id,id) on delete set null(repair_asset_id);
create index tasks_repair_asset_idx on public.tasks(organization_id,repair_asset_id) where repair_asset_id is not null and deleted_at is null;
create function private.guard_task_repair_asset() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.repair_asset_id is null then return new; end if;
 if tg_op='UPDATE' and new.repair_asset_id is not distinct from old.repair_asset_id and new.organization_id=old.organization_id then return new; end if;
 if not private.is_org_manager(new.organization_id) or not exists(
  select 1 from public.assets where id=new.repair_asset_id and organization_id=new.organization_id and deleted_at is null
 ) then raise exception 'repair_asset_unavailable' using errcode='42501'; end if;
 return new;
end $$;
revoke all on function private.guard_task_repair_asset() from public,anon,authenticated;
create trigger guard_task_repair_asset before insert or update of repair_asset_id,organization_id on public.tasks
for each row execute function private.guard_task_repair_asset();

create table public.asset_document_links (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 asset_id uuid not null,
 label text not null check(char_length(trim(label)) between 1 and 120),
 url text not null check(char_length(url)<=2000 and url ~ '^https?://[^[:space:]]+$'),
 link_type text not null default 'document' check(link_type in ('document','invoice','repair','website','other')),
 position integer not null default 0 check(position>=0),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(organization_id,asset_id) references public.assets(organization_id,id) on delete cascade,
 unique(organization_id,asset_id,url)
);
alter table public.asset_document_links enable row level security;
revoke all on public.asset_document_links from public,anon,authenticated;
grant select,insert,update,delete on public.asset_document_links to authenticated;
create policy "members read asset links" on public.asset_document_links for select to authenticated
 using(private.is_active_member(organization_id) and exists(select 1 from public.assets a where a.id=asset_id and a.organization_id=asset_document_links.organization_id and a.deleted_at is null));
create policy "managers insert asset links" on public.asset_document_links for insert to authenticated
 with check(private.is_org_manager(organization_id) and created_by=(select auth.uid()) and exists(select 1 from public.assets a where a.id=asset_id and a.organization_id=asset_document_links.organization_id and a.deleted_at is null));
create policy "managers update asset links" on public.asset_document_links for update to authenticated
 using(private.is_org_manager(organization_id))
 with check(private.is_org_manager(organization_id) and exists(select 1 from public.assets a where a.id=asset_id and a.organization_id=asset_document_links.organization_id and a.deleted_at is null));
create policy "managers delete asset links" on public.asset_document_links for delete to authenticated using(private.is_org_manager(organization_id));
create index asset_document_links_order_idx on public.asset_document_links(organization_id,asset_id,position);

-- Preserve the existing document URL; copy compatible links without clearing it.
insert into public.asset_document_links(organization_id,asset_id,label,url,created_by)
 select organization_id,id,'Bestaand document',document_url,created_by from public.assets
 where document_url ~ '^https?://[^[:space:]]+$' and char_length(document_url)<=2000
 on conflict(organization_id,asset_id,url) do nothing;

-- Translate only untouched English defaults; preserve custom organization labels.
alter table public.dossier_choice_options disable trigger guard_dossier_choice_option;
update public.dossier_choice_options set label=case value
 when 'equipment' then 'Materiaal' when 'computer' then 'Computer'
 when 'streaming' then 'Streamingmateriaal' when 'furniture' then 'Meubilair'
 when 'software' then 'Software / licentie' when 'vehicle' then 'Voertuig' else label end
 where set_key='assets.asset_type' and label=replace(value,'_',' ')
 and not exists(select 1 from public.dossier_choice_options other where other.organization_id=dossier_choice_options.organization_id and other.set_key='assets.asset_type' and other.value<>dossier_choice_options.value and lower(other.label)=lower(case dossier_choice_options.value when 'equipment' then 'Materiaal' when 'computer' then 'Computer' when 'streaming' then 'Streamingmateriaal' when 'furniture' then 'Meubilair' when 'software' then 'Software / licentie' when 'vehicle' then 'Voertuig' else dossier_choice_options.label end));
alter table public.dossier_choice_options enable trigger guard_dossier_choice_option;
do $$
declare definitions jsonb;
begin
 select jsonb_agg(case when d->>'key'='assets.asset_type' then jsonb_set(d,'{values}',(
  select jsonb_agg(v||jsonb_build_object('label',coalesce(
   '{"equipment":"Materiaal","computer":"Computer","streaming":"Streamingmateriaal","furniture":"Meubilair","software":"Software / licentie","vehicle":"Voertuig"}'::jsonb->>(v->>'value'),v->>'label')))
  from jsonb_array_elements(d->'values') v
 )) else d end) into definitions from jsonb_array_elements(private.dossier_choice_catalog()) d;
 execute format('create or replace function private.dossier_choice_catalog() returns jsonb language sql immutable set search_path='''' as %L',format('select %L::jsonb',definitions::text));
end $$;
commit;
