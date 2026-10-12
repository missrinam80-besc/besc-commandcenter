begin;
create function private.canonical_document_url(value text) returns text language plpgsql immutable strict set search_path='' as $$
declare cleaned text; google_key text;
begin
 cleaned:=regexp_replace(btrim(value),'#.*$','');
 cleaned:=regexp_replace(cleaned,'^(https?://)([^/?#]+)',lower(substring(cleaned from '^(https?://[^/?#]+)')));
 if cleaned ~ '^https?://drive[.]google[.]com/(open|uc)[?]' then
  google_key:=substring(cleaned from '[?&]id=([A-Za-z0-9_-]+)');
  if google_key is not null then return 'https://drive.google.com/file/d/'||google_key;end if;
 end if;
 if cleaned ~ '^https?://(docs[.]google[.]com/(document|spreadsheets|presentation)/d/|drive[.]google[.]com/file/d/)' then
  google_key:=substring(cleaned from '/d/([^/?#]+)');
  return 'https://drive.google.com/file/d/'||google_key;
 end if;
 return regexp_replace(regexp_replace(cleaned,'^(https?://)([^/?#]+)',lower(substring(cleaned from '^(https?://[^/?#]+)'))),'/+$','');
end $$;
revoke all on function private.canonical_document_url(text) from public,anon;
grant execute on function private.canonical_document_url(text) to authenticated;
create table public.document_registry(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 label text not null check(char_length(btrim(label)) between 1 and 120),
 url text not null check(char_length(url)<=2000 and url ~ '^https?://[^[:space:]]+$'),
 canonical_url text generated always as (private.canonical_document_url(url)) stored,
 restricted_finance boolean not null default false,
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,canonical_url),
 unique(organization_id,id)
);
alter table public.document_registry enable row level security;
revoke all on public.document_registry from public,anon,authenticated;
grant select on public.document_registry to authenticated;
grant insert(organization_id,label,url,created_by) on public.document_registry to authenticated;
grant update(label,updated_at) on public.document_registry to authenticated;
create policy "members read document registry" on public.document_registry for select to authenticated using(private.is_active_member(organization_id) and (not restricted_finance or private.can_manage_finance(organization_id)));
create policy "managers insert document registry" on public.document_registry for insert to authenticated with check(private.is_org_manager(organization_id) and created_by=(select auth.uid()));
create policy "managers rename document registry" on public.document_registry for update to authenticated using(private.is_org_manager(organization_id)) with check(private.is_org_manager(organization_id));

alter table public.asset_document_links add column document_id uuid references public.document_registry(id);
alter table public.record_links add column document_id uuid references public.document_registry(id);
alter table public.google_resource_links add column document_id uuid references public.document_registry(id);
alter table public.asset_document_links add constraint asset_document_registry_org_fk foreign key(organization_id,document_id) references public.document_registry(organization_id,id);
alter table public.record_links add constraint record_document_registry_org_fk foreign key(organization_id,document_id) references public.document_registry(organization_id,id);
alter table public.google_resource_links add constraint google_document_registry_org_fk foreign key(organization_id,document_id) references public.document_registry(organization_id,id);

create function private.register_link_document() returns trigger language plpgsql security definer set search_path='' as $$
declare doc public.document_registry; link_url text; link_label text; supplied_id uuid; old_url text;
begin
 if auth.uid() is null then
  if session_user not in ('postgres','supabase_admin') then raise exception 'document_no_access' using errcode='42501'; end if;
 elsif not private.is_active_member(new.organization_id) then raise exception 'document_no_access' using errcode='42501'; end if;
 if tg_table_name='google_resource_links' then
  if new.resource_type<>'document' then new.document_id:=null;return new;end if;
  link_url:=new.web_url;link_label:=new.name;
  if tg_op='UPDATE' then old_url:=old.web_url;end if;
 else
  link_url:=new.url;link_label:=new.label;
  if tg_op='UPDATE' then old_url:=old.url;end if;
 end if;
 supplied_id:=new.document_id;
 if supplied_id is not null and (tg_op='INSERT' or supplied_id is distinct from old.document_id or link_url is not distinct from old_url) then
  select * into doc from public.document_registry where id=supplied_id and organization_id=new.organization_id and (not restricted_finance or private.can_manage_finance(new.organization_id));
  if not found then raise exception 'document_unavailable' using errcode='42501';end if;
  link_url:=doc.url;
  if nullif(btrim(link_label),'') is null then link_label:=doc.label;end if;
 else
  if link_url !~ '^https?://[^[:space:]]+$' or char_length(link_url)>2000 or nullif(btrim(link_label),'') is null then
   raise exception 'invalid_document_link' using errcode='23514';
  end if;
  insert into public.document_registry(organization_id,label,url,created_by)
   values(new.organization_id,left(link_label,120),link_url,coalesce(auth.uid(),new.created_by))
   on conflict(organization_id,canonical_url) do update set label=document_registry.label
   returning * into doc;
 end if;
 new.document_id:=doc.id;
 if tg_table_name='google_resource_links' then new.web_url:=link_url;new.name:=link_label;
 else new.url:=link_url;new.label:=link_label;end if;
 return new;
end $$;
revoke all on function private.register_link_document() from public,anon,authenticated;
create trigger register_asset_link before insert or update on public.asset_document_links for each row execute function private.register_link_document();
create trigger register_record_link before insert or update on public.record_links for each row execute function private.register_link_document();
create trigger register_google_document before insert or update on public.google_resource_links for each row execute function private.register_link_document();

update public.asset_document_links set url=url;
update public.record_links set url=url where char_length(url)<=2000 and url ~ '^https?://[^[:space:]]+$';
alter table public.google_resource_links disable trigger community_document_guard;
update public.google_resource_links set web_url=web_url where resource_type='document' and char_length(web_url)<=2000 and web_url ~ '^https?://[^[:space:]]+$';

alter table public.google_resource_links enable trigger community_document_guard;

-- Uniqueness of canonical registrations prevents duplicate links within one fiche.
-- Preserve pre-existing duplicate attachments; future inserts are checked by trigger.
create function private.guard_document_attachment() returns trigger language plpgsql security definer set search_path='' as $$
declare duplicate boolean;
begin
 if new.document_id is null then return new;end if;
 if tg_table_name='asset_document_links' then
  perform 1 from public.assets where id=new.asset_id and organization_id=new.organization_id for update;
  select exists(select 1 from public.asset_document_links where asset_id=new.asset_id and organization_id=new.organization_id and document_id=new.document_id and id<>new.id) into duplicate;
 elsif tg_table_name='record_links' then
  perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text||new.entity_type||new.entity_id::text,0));
  select exists(select 1 from public.record_links where organization_id=new.organization_id and entity_type=new.entity_type and entity_id=new.entity_id and document_id=new.document_id and id<>new.id) into duplicate;
 else return new;end if;
 if duplicate then raise exception 'document_already_linked' using errcode='23505';end if;
 return new;
end $$;
revoke all on function private.guard_document_attachment() from public,anon,authenticated;
create trigger zz_guard_asset_document before insert or update of document_id,url,asset_id on public.asset_document_links for each row execute function private.guard_document_attachment();
create trigger zz_guard_record_document before insert or update of document_id,url,entity_id,entity_type on public.record_links for each row execute function private.guard_document_attachment();

create table public.document_registry_sources(
 organization_id uuid not null references public.organizations(id) on delete cascade,
 table_name text not null,
 record_id uuid not null,
 field_name text not null,
 document_id uuid not null,
 primary key(organization_id,table_name,record_id,field_name),
 foreign key(organization_id,document_id) references public.document_registry(organization_id,id) on delete cascade
);
alter table public.document_registry_sources enable row level security;
revoke all on public.document_registry_sources from public,anon,authenticated;
grant select on public.document_registry_sources to authenticated;
create policy "members see visible document sources" on public.document_registry_sources for select to authenticated using(private.is_active_member(organization_id) and exists(select 1 from public.document_registry d where d.id=document_id and d.organization_id=document_registry_sources.organization_id));

create function private.register_root_document_links() returns trigger language plpgsql security definer set search_path='' as $$
declare row_data jsonb; field text; source_url text; doc_id uuid; source_label text; source_org uuid; finance boolean;
begin
 row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 source_org:=(row_data->>'organization_id')::uuid;
 if auth.uid() is null then
  if session_user not in ('postgres','supabase_admin') then raise exception 'document_no_access' using errcode='42501';end if;
 elsif not private.is_active_member(source_org) then raise exception 'document_no_access' using errcode='42501';end if;
 finance:=tg_table_name in ('expenses','income_entries');
 for field in select unnest(tg_argv) loop
  source_url:=row_data->>field;
  if tg_op='DELETE' or nullif(btrim(source_url),'') is null or source_url ~ '^https?://drive[.]google[.]com/drive/(u/[0-9]+/)?folders/' then
   delete from public.document_registry_sources where organization_id=source_org and table_name=tg_table_name and record_id=(row_data->>'id')::uuid and field_name=field;
  elsif source_url ~ '^https?://[^[:space:]]+$' and char_length(source_url)<=2000 then
   source_label:=left(coalesce(row_data->>'title',row_data->>'name','Document')||' · '||case field when 'proof_url' then 'Bewijsstuk' when 'declaration_url' then 'Declaratie' when 'contract_url' then 'Contract' when 'minutes_url' then 'Notulen' else 'Document' end,120);
   insert into public.document_registry(organization_id,label,url,restricted_finance,created_by)
    values(source_org,source_label,source_url,finance,coalesce(auth.uid(),(row_data->>'created_by')::uuid,(row_data->>'submitted_by')::uuid))
    on conflict(organization_id,canonical_url) do update set restricted_finance=document_registry.restricted_finance or excluded.restricted_finance returning id into doc_id;
   insert into public.document_registry_sources(organization_id,table_name,record_id,field_name,document_id)
    values(source_org,tg_table_name,(row_data->>'id')::uuid,field,doc_id)
    on conflict(organization_id,table_name,record_id,field_name) do update set document_id=excluded.document_id;
  end if;
 end loop;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function private.register_root_document_links() from public,anon,authenticated;
create trigger register_asset_document_url after insert or update of document_url or delete on public.assets for each row execute function private.register_root_document_links('document_url');
create trigger register_expense_documents after insert or update of proof_url,declaration_url or delete on public.expenses for each row execute function private.register_root_document_links('proof_url','declaration_url');
create trigger register_income_documents after insert or update of proof_url or delete on public.income_entries for each row execute function private.register_root_document_links('proof_url');
create trigger register_partner_contract after insert or update of contract_url or delete on public.partners for each row execute function private.register_root_document_links('contract_url');
create trigger register_meeting_minutes after insert or update of minutes_url or delete on public.meetings for each row execute function private.register_root_document_links('minutes_url');
create trigger register_administrative_document after insert or update of drive_url or delete on public.administrative_documents for each row execute function private.register_root_document_links('drive_url');

create trigger register_project_document after insert or update of drive_url or delete on public.projects for each row execute function private.register_root_document_links('drive_url');
create trigger register_event_document after insert or update of drive_url or delete on public.events for each row execute function private.register_root_document_links('drive_url');
create trigger register_campaign_document after insert or update of drive_url or delete on public.campaigns for each row execute function private.register_root_document_links('drive_url');
create trigger register_community_document after insert or update of drive_url or delete on public.community_people for each row execute function private.register_root_document_links('drive_url');
create trigger register_knowledge_document after insert or update of drive_url or delete on public.knowledge_articles for each row execute function private.register_root_document_links('drive_url');
create trigger register_content_document after insert or update of drive_url,canva_url,publication_url or delete on public.content_items for each row execute function private.register_root_document_links('drive_url','canva_url','publication_url');
create trigger register_launch_document after insert or update of drive_url or delete on public.merch_launches for each row execute function private.register_root_document_links('drive_url');

-- Backfill registry metadata without touching any original fiche or its timestamps.
do $$
declare entry text; table_name text; field_name text; item jsonb; source_url text; doc_id uuid; finance boolean;
begin
 for entry in select unnest(array['assets.document_url','expenses.proof_url','expenses.declaration_url','income_entries.proof_url','partners.contract_url','meetings.minutes_url','administrative_documents.drive_url','projects.drive_url','events.drive_url','campaigns.drive_url','community_people.drive_url','knowledge_articles.drive_url','content_items.drive_url','content_items.canva_url','content_items.publication_url','merch_launches.drive_url']) loop
  table_name:=split_part(entry,'.',1);field_name:=split_part(entry,'.',2);finance:=table_name in ('expenses','income_entries');
  for item in execute format('select to_jsonb(t) from public.%I t where %I is not null',table_name,field_name) loop
   source_url:=item->>field_name;
   if source_url !~ '^https?://[^[:space:]]+$' or char_length(source_url)>2000 or source_url ~ '^https?://drive[.]google[.]com/drive/(u/[0-9]+/)?folders/' then continue;end if;
   insert into public.document_registry(organization_id,label,url,restricted_finance,created_by)
    values((item->>'organization_id')::uuid,left(coalesce(item->>'title',item->>'name','Document'),120),source_url,finance,coalesce((item->>'created_by')::uuid,(item->>'submitted_by')::uuid))
    on conflict(organization_id,canonical_url) do update set restricted_finance=document_registry.restricted_finance or excluded.restricted_finance returning id into doc_id;
   insert into public.document_registry_sources values((item->>'organization_id')::uuid,table_name,(item->>'id')::uuid,field_name,doc_id)
    on conflict(organization_id,table_name,record_id,field_name) do update set document_id=excluded.document_id;
  end loop;
 end loop;
end $$;
commit;
