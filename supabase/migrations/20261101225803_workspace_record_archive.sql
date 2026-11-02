begin;

-- Overview visibility is separate from evidence, ticket state and retention.
create table public.workspace_record_archives (
 organization_id uuid not null references public.organizations(id),
 entity_type text not null check(entity_type in('document','ticket')),
 record_id uuid not null,
 archived_at timestamptz,
 changed_at timestamptz not null default now(),
 changed_by uuid references public.profiles(id),
 version bigint not null check(version > 0),
 primary key(organization_id,entity_type,record_id)
);
alter table public.workspace_record_archives enable row level security;
revoke all on public.workspace_record_archives from public,anon,authenticated,service_role;
grant select on public.workspace_record_archives to authenticated;
create policy workspace_archive_visible_source on public.workspace_record_archives
for select to authenticated using(
 case entity_type
 when 'document' then exists(select 1 from public.document_registry d
  where d.id=record_id and d.organization_id=workspace_record_archives.organization_id)
 when 'ticket' then exists(select 1 from public.support_tickets t
  where t.id=record_id and t.organization_id=workspace_record_archives.organization_id)
 else false end
);

create view public.document_registry_workspace with(security_invoker=true) as
 select d.id,d.organization_id,d.label,d.url,d.created_at,
  a.archived_at,coalesce(a.version,0::bigint) as archive_version
 from public.document_registry d left join public.workspace_record_archives a
 on a.organization_id=d.organization_id and a.entity_type='document' and a.record_id=d.id;
create view public.support_tickets_workspace with(security_invoker=true) as
 select t.id,t.organization_id,t.subject,t.status,t.link_status,t.created_at,
  a.archived_at,coalesce(a.version,0::bigint) as archive_version
 from public.support_tickets t left join public.workspace_record_archives a
 on a.organization_id=t.organization_id and a.entity_type='ticket' and a.record_id=t.id;
revoke all on public.document_registry_workspace,public.support_tickets_workspace
 from public,anon,authenticated,service_role;
grant select on public.document_registry_workspace,public.support_tickets_workspace to authenticated;

create function public.set_workspace_record_archive(
 p_org uuid,p_entity text,p_record uuid,p_archived boolean,p_expected_version bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
declare target_label text; current_state public.workspace_record_archives%rowtype;
 new_version bigint; actor uuid:=auth.uid(); stamp timestamptz;
begin
 if actor is null or p_entity is null or p_entity not in('document','ticket')
  or p_archived is null or p_expected_version is null or p_expected_version<0 then
  raise exception 'workspace_archive_unavailable' using errcode='42501';
 end if;
 if p_entity='document' then
  perform private.f1_lock();
  if not private.is_org_manager(p_org) or not private.f1_document_visible(p_org,p_record) then
   raise exception 'workspace_archive_unavailable' using errcode='42501';
  end if;
  select label into target_label from public.document_registry
   where organization_id=p_org and id=p_record for update;
 else
  if not private.can_manage_tickets(p_org) then
   raise exception 'workspace_archive_unavailable' using errcode='42501';
  end if;
  select subject into target_label from public.support_tickets
   where organization_id=p_org and id=p_record for update;
 end if;
 if not found then raise exception 'workspace_archive_unavailable' using errcode='42501';end if;
 -- Recheck current permissions after any wait on the source row.
 if (p_entity='document' and(not private.is_org_manager(p_org) or not private.f1_document_visible(p_org,p_record)))
  or(p_entity='ticket' and not private.can_manage_tickets(p_org)) then
  raise exception 'workspace_archive_unavailable' using errcode='42501';
 end if;
 select * into current_state from public.workspace_record_archives
  where organization_id=p_org and entity_type=p_entity and record_id=p_record for update;
 if coalesce(current_state.version,0)<>p_expected_version then
  raise exception 'workspace_archive_version_conflict' using errcode='40001';
 end if;
 if (current_state.archived_at is not null)=p_archived then
  return jsonb_build_object('archived',p_archived,'version',coalesce(current_state.version,0));
 end if;
 stamp:=clock_timestamp();new_version:=coalesce(current_state.version,0)+1;
 insert into public.workspace_record_archives(organization_id,entity_type,record_id,archived_at,changed_at,changed_by,version)
 values(p_org,p_entity,p_record,case when p_archived then stamp else null end,stamp,actor,new_version)
 on conflict(organization_id,entity_type,record_id) do update set
  archived_at=excluded.archived_at,changed_at=excluded.changed_at,
  changed_by=excluded.changed_by,version=excluded.version;
 insert into public.audit_log(organization_id,entity_type,entity_id,action,actor_id,entity_label,metadata)
 values(p_org,case p_entity when 'document' then 'document_registry' else 'support_tickets' end,
  p_record,case when p_archived then 'archived' else 'updated' end,actor,target_label,
  jsonb_build_object('operation',case when p_archived then 'workspace.archive' else 'workspace.restore' end,
   'workspace_archive_only',true,'archive_version',new_version));
 return jsonb_build_object('archived',p_archived,'version',new_version);
end$$;
revoke all on function public.set_workspace_record_archive(uuid,text,uuid,boolean,bigint)
 from public,anon,authenticated,service_role;
grant execute on function public.set_workspace_record_archive(uuid,text,uuid,boolean,bigint) to authenticated;

-- A new incoming requester message must never disappear in an archived ticket.
-- The parent ticket is locked before archive state, matching the staff operation.
create function private.restore_workspace_ticket_on_incoming() returns trigger
language plpgsql security definer set search_path='' as $$
declare changed bigint;
begin
 if new.direction<>'requester' then return new;end if;
 perform 1 from public.support_tickets where organization_id=new.organization_id and id=new.ticket_id for update;
 update public.workspace_record_archives set archived_at=null,changed_at=clock_timestamp(),
  changed_by=null,version=version+1
 where organization_id=new.organization_id and entity_type='ticket' and record_id=new.ticket_id
  and archived_at is not null returning version into changed;
 if found then
  insert into public.audit_log(organization_id,entity_type,entity_id,action,metadata)
  values(new.organization_id,'support_tickets',new.ticket_id,'updated',
   jsonb_build_object('operation','workspace.incoming_message_restore','workspace_archive_only',true,
    'archive_version',changed));
 end if;
 return new;
end$$;
create trigger workspace_incoming_ticket_restore after insert on public.support_ticket_messages
for each row execute function private.restore_workspace_ticket_on_incoming();

-- Existing physical deletion/retention keeps its original meaning and permissions.
create function private.remove_workspace_archive_for_deleted_source() returns trigger
language plpgsql security definer set search_path='' as $$begin
 delete from public.workspace_record_archives where organization_id=old.organization_id
 and entity_type=case tg_table_name when 'document_registry' then 'document' else 'ticket' end
 and record_id=old.id;
 return old;
end$$;
create trigger workspace_document_source_deleted after delete on public.document_registry
 for each row execute function private.remove_workspace_archive_for_deleted_source();
create trigger workspace_ticket_source_deleted after delete on public.support_tickets
 for each row execute function private.remove_workspace_archive_for_deleted_source();
revoke all on function private.restore_workspace_ticket_on_incoming(),
 private.remove_workspace_archive_for_deleted_source() from public,anon,authenticated,service_role;

commit;
