begin;
-- Classification support only. No accounts, contacts, roles or permissions are seeded.
alter table public.community_people drop constraint community_people_person_type_check;
alter table public.community_people add constraint community_people_person_type_check
 check(person_type in('crew','streamer','creator','volunteer','moderator','guest','external','functional_account'));

-- These are person-only bindings. Account-based login/access/history is deliberately
-- absent: a functional contact keeps its existing account identity and access.
create function private.functional_person_bindings()
returns table(schema_name text,table_name text,column_name text)
language sql immutable security invoker set search_path='' as $$values
 ('public','association_members','community_person_id'),
 ('public','association_identity_verifications','person_id'),
 ('public','consent_records','person_id'),
 ('public','community_assignments','person_id'),
 ('public','event_schedule_items','person_id'),
 ('public','event_materials','responsible_person_id'),
 ('public','event_giveaways','responsible_person_id'),
 ('public','assets','owner_person_id'),
 ('public','kpi_records','community_person_id'),
 ('private','campaign_participants','person_id'),
 ('private','creator_profiles','person_id')
$$;

-- Integrity checks must see referenced contacts even under caller RLS. They are
-- private trigger functions, have no callable API grants and never mutate access.
create function private.guard_functional_person_reference() returns trigger
language plpgsql security definer set search_path='' as $$
declare person uuid; org uuid; profile_type text; person_org uuid; begin
 perform private.f1_lock();
 if tg_op='UPDATE' and to_jsonb(new)->tg_argv[0] is not distinct from to_jsonb(old)->tg_argv[0]
    and new.organization_id is not distinct from old.organization_id then return new; end if;
 person:=nullif(to_jsonb(new)->>tg_argv[0],'')::uuid;org:=new.organization_id;
 select person_type,organization_id into profile_type,person_org from public.community_people
   where id=person for share;
 if person_org is distinct from org and person is not null and found then
   raise exception 'person_reference_unavailable' using errcode='23503';
 end if;
 if profile_type='functional_account' then
   raise exception 'functional_account_not_a_person' using errcode='23514';
 end if;
 return new;
end$$;

create function private.guard_functional_contact_classification() returns trigger
language plpgsql security definer set search_path='' as $$
declare binding record; referenced boolean; begin
 perform private.f1_lock();
 if new.person_type<>'functional_account' or old.person_type='functional_account' then return new;end if;
 -- Classification checks need a fresh snapshot after the common workflow lock.
 -- Refuse stale-snapshot bulk writers instead of missing a concurrent new binding.
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'functional_account_classification_requires_read_committed' using errcode='25001';
 end if;
 -- Do not reinterpret an existing person's membership, consent or contribution.
 -- Historical bindings remain intact and require a separate explicit resolution.
 for binding in select * from private.functional_person_bindings() loop
  execute format('select exists(select 1 from %I.%I where organization_id=$1 and %I=$2)',
   binding.schema_name,binding.table_name,binding.column_name)
   into referenced using new.organization_id,new.id;
  if referenced then raise exception 'functional_account_has_person_bindings' using errcode='23514';end if;
 end loop;
 return new;
end$$;

revoke all on function private.functional_person_bindings(),
 private.guard_functional_person_reference(),private.guard_functional_contact_classification()
 from public,anon,authenticated,service_role;

do $$declare binding record;begin
 for binding in select * from private.functional_person_bindings() loop
  execute format('create trigger functional_person_reference_guard before insert or update of %I,organization_id on %I.%I for each row execute function private.guard_functional_person_reference(%L)',
   binding.column_name,binding.schema_name,binding.table_name,binding.column_name);
 end loop;
end$$;
create trigger functional_contact_classification_guard before update of person_type
 on public.community_people for each row execute function private.guard_functional_contact_classification();
commit;
