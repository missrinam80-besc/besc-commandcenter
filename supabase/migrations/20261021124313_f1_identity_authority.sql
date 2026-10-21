begin;
-- F1 is additive. No account, mandate, verification or workflow role is seeded.
alter table public.association_members add column community_person_id uuid references public.community_people(id) on delete restrict;
alter table public.association_members add column f1_revision bigint not null default 1;
create unique index association_member_person_active on public.association_members(organization_id,community_person_id) where deleted_at is null and community_person_id is not null;
create table public.association_identity_verifications (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 member_id uuid not null references public.association_members(id) on delete restrict,
 person_id uuid not null references public.community_people(id) on delete restrict,
 account_user_id uuid not null references public.profiles(id) on delete restrict,
 proof_document_id uuid not null references public.document_registry(id) on delete restrict,
 binding_revision bigint not null, mandate_snapshot_hash text not null, verified_by uuid not null references public.profiles(id),
 verified_at timestamptz not null default clock_timestamp(), revoked_at timestamptz, reason text,
 unique(organization_id,id)
);
create unique index f1_verification_current on public.association_identity_verifications(organization_id,member_id) where revoked_at is null;
create index f1_verification_person on public.association_identity_verifications(person_id);
create index f1_verification_account on public.association_identity_verifications(account_user_id);
create index f1_verification_proof on public.association_identity_verifications(proof_document_id);
create index f1_verification_actor on public.association_identity_verifications(verified_by);
create table public.workflow_assignments (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 user_id uuid not null references public.profiles(id),
 role text not null check(role in('governance_editor','consent_registrar','publication_editor','publication_reviewer','partner_editor')),
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default clock_timestamp(), revoked_at timestamptz,
 unique(organization_id,id)
);
create unique index f1_assignment_current on public.workflow_assignments(organization_id,user_id,role) where revoked_at is null;
create index f1_assignment_user on public.workflow_assignments(user_id);
create index f1_assignment_actor on public.workflow_assignments(created_by);
create table private.f1_context(tx bigint primary key, organization_id uuid not null, actor uuid not null, operation text not null);
create table private.f1_receipts(organization_id uuid not null, actor uuid not null, operation text not null, request_id uuid not null, payload jsonb not null, result jsonb not null, created_at timestamptz not null default clock_timestamp(), primary key(organization_id,actor,operation,request_id));
revoke all on private.f1_context,private.f1_receipts from public,anon,authenticated,service_role;

-- Low-volume governance operations and relevant existing writers take the same
-- statement-level gate BEFORE row locks. This prevents lock-order inversion and
-- authorization races, including mutations through existing invoker RPCs.
create function private.f1_lock() returns void language sql volatile set search_path='' as $$select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('besc:f1:workflows:v1',0))$$;
create function private.f1_gate() returns trigger language plpgsql security invoker set search_path='' as $$begin perform private.f1_lock();return null;end$$;
revoke all on function private.f1_lock(),private.f1_gate() from public,anon;
-- The gate only serializes: existing server writes retain this helper without
-- gaining access to any F1 workflow, receipt, verification or decision.
grant execute on function private.f1_lock(),private.f1_gate() to authenticated,service_role;
do $$declare t text;begin foreach t in array array['association_members','community_people','governance_mandates','organization_members','portal_access','compliance_deadlines','meetings','administrative_documents','document_registry','document_registry_sources','record_links','google_resource_links','asset_document_links','approval_requests','record_relationships','partners','campaigns','content_items','events'] loop execute format('create trigger f1_statement_gate before insert or update or delete on public.%I for each statement execute function private.f1_gate()',t);end loop;end$$;

create function private.f1_human(o uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and auth.role()='authenticated' and exists(select 1 from public.organization_members where organization_id=o and user_id=auth.uid() and status='active')
$$;
create function private.f1_mandate_hash(o uuid,m uuid) returns text language sql stable security definer set search_path='' set timezone='UTC' as $$select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(g) order by g.id),'[]'::jsonb)::text,'UTF8')),'hex') from public.governance_mandates g where g.organization_id=o and g.member_id=m$$;
revoke all on function private.f1_mandate_hash(uuid,uuid) from public,anon,authenticated,service_role;
create function private.f1_chair(o uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.f1_human(o) and (select count(*)=1 from public.governance_mandates g join public.association_members m on m.id=g.member_id and m.organization_id=g.organization_id join public.community_people p on p.id=m.community_person_id and p.organization_id=m.organization_id join public.association_identity_verifications v on v.member_id=m.id and v.organization_id=m.organization_id and v.person_id=p.id and v.account_user_id=p.account_user_id and v.binding_revision=m.f1_revision and v.revoked_at is null
 where v.mandate_snapshot_hash=private.f1_mandate_hash(o,m.id) and g.organization_id=o and g.role='chair' and g.status='active' and g.deleted_at is null and m.status='active' and m.deleted_at is null and p.deleted_at is null and p.account_user_id=auth.uid() and g.start_date<=(clock_timestamp() at time zone 'Europe/Brussels')::date and (g.end_date is null or g.end_date>=(clock_timestamp() at time zone 'Europe/Brussels')::date))
 and (select count(*)=1 from public.governance_mandates g join public.association_members m on m.id=g.member_id and m.organization_id=g.organization_id where g.organization_id=o and g.role='chair' and g.status='active' and g.deleted_at is null and m.status='active' and m.deleted_at is null and g.start_date<=(clock_timestamp() at time zone 'Europe/Brussels')::date and(g.end_date is null or g.end_date>=(clock_timestamp() at time zone 'Europe/Brussels')::date))
$$;
create function private.f1_role(o uuid,r text) returns boolean language sql stable security definer set search_path='' as $$select private.f1_human(o) and ((r='governance_editor' and private.f1_chair(o)) or exists(select 1 from public.workflow_assignments where organization_id=o and user_id=auth.uid() and role=r and revoked_at is null))$$;
create function private.f1_writing(o uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from private.f1_context where tx=txid_current() and organization_id=o and (actor=auth.uid() or (auth.uid() is null and session_user in('postgres','supabase_admin') and coalesce(current_setting('role',true),'none') in('none','postgres','supabase_admin'))))$$;
create function private.f1_audit(o uuid,entity uuid,op text) returns void language sql security definer set search_path='' as $$insert into public.audit_log(organization_id,entity_type,entity_id,action,actor_id,entity_label,metadata) values(o,'f1_workflow',entity,'updated',auth.uid(),'Werkstroom gewijzigd',jsonb_build_object('operation',op))$$;
revoke all on function private.f1_human(uuid),private.f1_chair(uuid),private.f1_role(uuid,text),private.f1_writing(uuid),private.f1_audit(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.f1_human(uuid),private.f1_chair(uuid),private.f1_role(uuid,text) to authenticated;

create function private.f1_binding_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='INSERT' then if new.community_person_id is not null and not private.f1_writing(new.organization_id) then raise exception 'f1_binding_operation_required' using errcode='42501';end if;new.f1_revision:=1;
 else
  if new.organization_id<>old.organization_id then raise exception 'f1_organization_immutable' using errcode='42501';end if;
  if new.community_person_id is distinct from old.community_person_id then
   if not private.f1_writing(new.organization_id) then raise exception 'f1_binding_operation_required' using errcode='42501';end if;
   new.f1_revision:=old.f1_revision+1;
  else new.f1_revision:=old.f1_revision;end if;
 end if;
 if new.community_person_id is not null and not exists(select 1 from public.community_people where id=new.community_person_id and organization_id=new.organization_id and deleted_at is null) then raise exception 'f1_person_unavailable' using errcode='23503';end if;
 return new;
end$$;
revoke all on function private.f1_binding_guard() from public,anon,authenticated,service_role;
create trigger f1_member_binding before insert or update on public.association_members for each row execute function private.f1_binding_guard();

create function private.f1_verify_binding(o uuid,m uuid,p uuid,u uuid,proof uuid,verifier uuid) returns uuid language plpgsql security definer set search_path='' as $$declare rev bigint;answer uuid;begin
 if not exists(select 1 from public.document_registry where id=proof and organization_id=o) or not exists(select 1 from public.organization_members where organization_id=o and user_id=u and status='active') or not exists(select 1 from public.organization_members where organization_id=o and user_id=verifier and status='active') or not exists(select 1 from public.community_people where id=p and organization_id=o and account_user_id=u and deleted_at is null) then raise exception 'f1_binding_unavailable' using errcode='42501';end if;
 if auth.uid() is not null and not private.f1_document_visible(o,proof) then raise exception 'f1_document_unavailable' using errcode='42501';end if;
 update public.document_registry set restricted_governance=true where organization_id=o and id=proof;
 update public.association_members set community_person_id=p where id=m and organization_id=o and status='active' and deleted_at is null returning f1_revision into rev;
 if not found then raise exception 'f1_member_unavailable' using errcode='42501';end if;
 update public.association_identity_verifications set revoked_at=clock_timestamp(),reason='Opnieuw geverifieerd' where organization_id=o and member_id=m and revoked_at is null;
 insert into public.association_identity_verifications(organization_id,member_id,person_id,account_user_id,proof_document_id,binding_revision,mandate_snapshot_hash,verified_by) values(o,m,p,u,proof,rev,private.f1_mandate_hash(o,m),verifier) returning id into answer;return answer;
end$$;
revoke all on function private.f1_verify_binding(uuid,uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- Maintenance-only first binding. Never callable by authenticated/service_role.
-- A reviewed board/identity decision is required before this is used on DEV.
create function private.f1_bootstrap(o uuid,m uuid,p uuid,u uuid,proof uuid,verifier uuid) returns uuid language plpgsql security invoker set search_path='' as $$declare answer uuid;begin
 if current_user not in('postgres','supabase_admin') or coalesce(current_setting('role',true),'none') not in('none','postgres','supabase_admin') then raise exception 'f1_bootstrap_maintenance_only' using errcode='42501';end if;
 perform private.f1_lock();
 if exists(select 1 from public.association_identity_verifications where organization_id=o and revoked_at is null) then raise exception 'f1_bootstrap_already_completed';end if;
 if not exists(select 1 from public.governance_mandates where organization_id=o and member_id=m and role='chair' and status='active' and deleted_at is null) then raise exception 'f1_bootstrap_mandate_missing';end if;
 insert into private.f1_context values(txid_current(),o,coalesce(auth.uid(),verifier),'identity.bootstrap');
 -- Guards bind to auth.uid(); maintenance sets no browser-authenticated claims.
 update public.association_members set community_person_id=p where id=m and organization_id=o;
 answer:=private.f1_verify_binding(o,m,p,u,proof,verifier);
 delete from private.f1_context where tx=txid_current();
 insert into public.audit_log(organization_id,entity_type,entity_id,action,actor_id,metadata) values(o,'f1_bootstrap',m,'updated',verifier,jsonb_build_object('verification_id',answer));
 return answer;
end$$;
revoke all on function private.f1_bootstrap(uuid,uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function private.f1_identity(o uuid,op text,d jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare answer uuid;begin
 if not private.f1_chair(o) then raise exception 'f1_chair_required' using errcode='42501';end if;
 if op='identity.verify' then
  if not exists(select 1 from public.association_members where id=(d->>'member_id')::uuid and organization_id=o and f1_revision=(d->>'expected_revision')::bigint) then raise exception 'f1_revision_conflict' using errcode='40001';end if;
  answer:=private.f1_verify_binding(o,(d->>'member_id')::uuid,(d->>'person_id')::uuid,(d->>'account_user_id')::uuid,(d->>'proof_document_id')::uuid,auth.uid());
 elsif op='identity.revoke' then
  if length(btrim(coalesce(d->>'reason','')))<2 then raise exception 'f1_reason_required';end if;
  update public.association_identity_verifications set revoked_at=clock_timestamp(),reason=left(d->>'reason',1000) where id=(d->>'id')::uuid and organization_id=o and revoked_at is null returning id into answer;
 elsif op='identity.assign' then
  if not exists(select 1 from public.organization_members where organization_id=o and user_id=(d->>'user_id')::uuid and status='active') then raise exception 'f1_user_unavailable';end if;
  insert into public.workflow_assignments(organization_id,user_id,role,created_by) values(o,(d->>'user_id')::uuid,d->>'role',auth.uid()) returning id into answer;
 elsif op='identity.unassign' then update public.workflow_assignments set revoked_at=clock_timestamp() where organization_id=o and id=(d->>'id')::uuid and revoked_at is null returning id into answer;
 else raise exception 'f1_unknown_operation';end if;
 if answer is null then raise exception 'f1_not_available' using errcode='42501';end if;return jsonb_build_object('id',answer);
end$$;
revoke all on function private.f1_identity(uuid,text,jsonb) from public,anon,authenticated,service_role;

create function public.f1_workflow(p_organization_id uuid,p_operation text,p_data jsonb,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare previous private.f1_receipts;answer jsonb;begin
 if (not private.f1_human(p_organization_id) and not(p_operation in('consent.give','consent.withdraw') and private.f1_account(p_organization_id))) or p_request_id is null then raise exception 'f1_not_authorized' using errcode='42501';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>64000 or p_operation !~ '^(identity|governance|consent|partner|publication)[.][a-z_]+$' then raise exception 'f1_invalid_input' using errcode='22023';end if;
 perform private.f1_validate(p_operation,p_data);perform private.f1_lock();
 select * into previous from private.f1_receipts where organization_id=p_organization_id and actor=auth.uid() and operation=p_operation and request_id=p_request_id;
 if found then if previous.payload<>p_data then raise exception 'f1_request_conflict' using errcode='40001';end if;return previous.result;end if;
 insert into private.f1_context values(txid_current(),p_organization_id,auth.uid(),p_operation);
 if p_operation like 'identity.%' then answer:=private.f1_identity(p_organization_id,p_operation,p_data);
 elsif p_operation like 'governance.%' then answer:=private.f1_governance(p_organization_id,p_operation,p_data);
 elsif p_operation like 'consent.%' then answer:=private.f1_consent(p_organization_id,p_operation,p_data);
 elsif p_operation like 'partner.%' then answer:=private.f1_partner(p_organization_id,p_operation,p_data);
 elsif p_operation like 'publication.%' then answer:=private.f1_publication(p_organization_id,p_operation,p_data);
 else raise exception 'f1_unknown_operation';end if;
 perform private.f1_audit(p_organization_id,(answer->>'id')::uuid,p_operation);
 insert into private.f1_receipts values(p_organization_id,auth.uid(),p_operation,p_request_id,p_data,answer,clock_timestamp());
 delete from private.f1_context where tx=txid_current();return answer;
end$$;
revoke all on function public.f1_workflow(uuid,text,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.f1_workflow(uuid,text,jsonb,uuid) to authenticated;

alter table public.association_identity_verifications enable row level security;
alter table public.workflow_assignments enable row level security;
revoke all on public.association_identity_verifications,public.workflow_assignments from public,anon,authenticated,service_role;
grant select on public.association_identity_verifications,public.workflow_assignments to authenticated;
create policy f1_verified_read on public.association_identity_verifications for select to authenticated using(private.f1_role(organization_id,'governance_editor'));
create policy f1_assignments_read on public.workflow_assignments for select to authenticated using(private.f1_human(organization_id) and (user_id=auth.uid() or private.f1_chair(organization_id)));
commit;
