begin;
alter table public.google_resource_links drop constraint google_resource_links_entity_type_check;
alter table public.google_resource_links add constraint google_resource_links_entity_type_check
 check(entity_type in ('project','event','meeting','partner','campaign','community_person'));
create function private.guard_community_document() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.entity_type='community_person' then
  perform 1 from public.community_people where id=new.entity_id and organization_id=new.organization_id and deleted_at is null for share;
  if not found then raise exception 'community_document_person_unavailable' using errcode='42501'; end if;
 end if;
 return new;
end $$;
revoke all on function private.guard_community_document() from public,anon,authenticated;
create trigger community_document_guard before insert or update on public.google_resource_links for each row execute function private.guard_community_document();
commit;
