begin;
create table public.processing_purposes(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),purpose_code text not null check(purpose_code in('public_profile','campaign_participation','private_platform_insights')),
 text_version integer not null check(text_version>0),title text not null check(length(btrim(title)) between 2 and 180),body text not null check(length(btrim(body)) between 10 and 10000),allowed_scope jsonb not null check(jsonb_typeof(allowed_scope)='object' and octet_length(allowed_scope::text)<=8000),
 legal_basis text not null check(length(btrim(legal_basis)) between 2 and 2000),retention_policy text not null check(length(btrim(retention_policy)) between 2 and 4000),policy_document_id uuid not null references public.document_registry(id) on delete restrict,
 status text not null default 'draft' check(status in('draft','active','withdrawn')),created_by uuid not null references public.profiles(id),created_at timestamptz not null default clock_timestamp(),activated_by uuid references public.profiles(id),activated_at timestamptz,
 unique(organization_id,purpose_code,text_version),unique(organization_id,id)
);
create index f1_purpose_doc on public.processing_purposes(policy_document_id);
create index f1_purpose_creator on public.processing_purposes(created_by);
create index f1_purpose_activator on public.processing_purposes(activated_by);
create table public.consent_records(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),person_id uuid not null references public.community_people(id) on delete restrict,
 account_user_id uuid not null references public.profiles(id) on delete restrict,purpose_id uuid not null references public.processing_purposes(id) on delete restrict,
 scope jsonb not null check(jsonb_typeof(scope)='object'),method text not null check(method in('self','external_evidence')),
 external_evidence_id uuid references public.document_registry(id) on delete restrict,created_by uuid not null references public.profiles(id),recorded_at timestamptz not null default clock_timestamp(),expires_at timestamptz,
 unique(organization_id,id),check(method<>'external_evidence' or external_evidence_id is not null)
);
create index f1_consent_person on public.consent_records(organization_id,person_id);
create index f1_consent_user on public.consent_records(account_user_id);
create index f1_consent_purpose on public.consent_records(purpose_id);
create index f1_consent_evidence on public.consent_records(external_evidence_id);
create index f1_consent_creator on public.consent_records(created_by);
create table public.consent_withdrawals(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),consent_id uuid not null unique references public.consent_records(id) on delete restrict,
 withdrawn_by uuid not null references public.profiles(id),withdrawn_at timestamptz not null default clock_timestamp(),reason text check(length(reason)<=2000),unique(organization_id,id)
);
create index f1_withdraw_actor on public.consent_withdrawals(withdrawn_by);
create function private.f1_account(o uuid) returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null and auth.role()='authenticated' and (exists(select 1 from public.organization_members where organization_id=o and user_id=auth.uid() and status='active') or exists(select 1 from public.portal_access where organization_id=o and user_id=auth.uid() and status='active'))$$;
create function private.f1_consent_valid(o uuid,i uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.consent_records c join public.processing_purposes p on p.id=c.purpose_id and p.organization_id=c.organization_id join public.community_people cp on cp.id=c.person_id and cp.organization_id=c.organization_id and cp.account_user_id=c.account_user_id and cp.deleted_at is null where c.id=i and c.organization_id=o and p.status='active' and(c.expires_at is null or c.expires_at>clock_timestamp()) and not exists(select 1 from public.consent_withdrawals w where w.consent_id=c.id) and (exists(select 1 from public.organization_members m where m.organization_id=o and m.user_id=c.account_user_id and m.status='active') or exists(select 1 from public.portal_access a where a.organization_id=o and a.user_id=c.account_user_id and a.status='active')))
$$;
revoke all on function private.f1_account(uuid),private.f1_consent_valid(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.f1_account(uuid),private.f1_consent_valid(uuid,uuid) to authenticated;

create function private.f1_consent(o uuid,op text,d jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare answer uuid;p public.processing_purposes;c public.consent_records;person public.community_people;begin
 if op='consent.purpose' then
  if not private.f1_role(o,'consent_registrar') then raise exception 'f1_not_authorized' using errcode='42501';end if;
  if not private.f1_document_visible(o,(d->>'policy_document_id')::uuid) then raise exception 'f1_document_unavailable';end if;
  insert into public.processing_purposes(organization_id,purpose_code,text_version,title,body,allowed_scope,legal_basis,retention_policy,policy_document_id,created_by) values(o,d->>'purpose_code',(d->>'text_version')::integer,d->>'title',d->>'body',d->'allowed_scope',d->>'legal_basis',d->>'retention_policy',(d->>'policy_document_id')::uuid,auth.uid()) returning id into answer;
 elsif op in('consent.activate_purpose','consent.withdraw_purpose') then
  if not private.f1_chair(o) or d->>'policy_confirmed' is distinct from 'true' then raise exception 'f1_policy_decision_required' using errcode='42501';end if;
  if op='consent.activate_purpose' then
   select * into p from public.processing_purposes where organization_id=o and id=(d->>'id')::uuid and status='draft';
   if p.id is null or exists(select 1 from public.processing_purposes where organization_id=o and purpose_code=p.purpose_code and text_version>=p.text_version and status='active') then raise exception 'f1_purpose_version_conflict';end if;
   update public.processing_purposes set status='withdrawn' where organization_id=o and purpose_code=p.purpose_code and status='active';
  end if;
  update public.processing_purposes set status=case when op='consent.activate_purpose' then 'active' else 'withdrawn' end,activated_by=auth.uid(),activated_at=clock_timestamp() where organization_id=o and id=(d->>'id')::uuid and status=case when op='consent.activate_purpose' then 'draft' else 'active' end returning id into answer;
 elsif op in('consent.give','consent.record_external') then
  select * into p from public.processing_purposes where organization_id=o and id=(d->>'purpose_id')::uuid and status='active';
  if not found or not coalesce(d->'scope' <@ p.allowed_scope,false) or jsonb_typeof(d->'scope')<>'object' or d->'scope'='{}'::jsonb then raise exception 'f1_purpose_or_scope_unavailable';end if;
  if op='consent.give' then
   if d->>'accepted' is distinct from 'true' then raise exception 'f1_consent_confirmation_required';end if;
   select * into person from public.community_people where organization_id=o and account_user_id=auth.uid() and deleted_at is null;
  else
   if not private.f1_role(o,'consent_registrar') or not private.f1_document_visible(o,(d->>'external_evidence_id')::uuid) then raise exception 'f1_not_authorized' using errcode='42501';end if;
   select * into person from public.community_people where organization_id=o and id=(d->>'person_id')::uuid and deleted_at is null and account_user_id is not null;
  end if;
  if person.id is null then raise exception 'f1_person_unavailable';end if;
  if nullif(d->>'expires_at','')::timestamptz<=clock_timestamp() then raise exception 'f1_expiry_invalid';end if;
  insert into public.consent_records(organization_id,person_id,account_user_id,purpose_id,scope,method,external_evidence_id,created_by,expires_at) values(o,person.id,person.account_user_id,p.id,d->'scope',case when op='consent.give' then 'self' else 'external_evidence' end,case when op='consent.record_external' then (d->>'external_evidence_id')::uuid else null end,auth.uid(),nullif(d->>'expires_at','')::timestamptz) returning id into answer;
 elsif op='consent.withdraw' then
  select * into c from public.consent_records where organization_id=o and id=(d->>'id')::uuid and account_user_id=auth.uid();
  if not found then raise exception 'f1_not_available' using errcode='42501';end if;
  -- A second acceptance of the same purpose must not survive goal withdrawal.
  insert into public.consent_withdrawals(organization_id,consent_id,withdrawn_by,reason) select o,x.id,auth.uid(),left(d->>'reason',2000) from public.consent_records x where x.organization_id=o and x.person_id=c.person_id and x.account_user_id=auth.uid() and x.purpose_id=c.purpose_id on conflict(consent_id) do nothing;
  select id into answer from public.consent_withdrawals where consent_id=c.id;
 else raise exception 'f1_unknown_operation';end if;
 if answer is null then raise exception 'f1_not_available';end if;return jsonb_build_object('id',answer);
end$$;
revoke all on function private.f1_consent(uuid,text,jsonb) from public,anon,authenticated,service_role;

alter table public.processing_purposes enable row level security;
alter table public.consent_records enable row level security;
alter table public.consent_withdrawals enable row level security;
revoke all on public.processing_purposes,public.consent_records,public.consent_withdrawals from public,anon,authenticated,service_role;
-- Purpose policy/evidence fields are never returned by the self-service function.
grant select on public.processing_purposes,public.consent_records,public.consent_withdrawals to authenticated;
create policy f1_purposes_managed on public.processing_purposes for select to authenticated using(private.f1_role(organization_id,'consent_registrar') or private.f1_chair(organization_id));
create policy f1_consent_own_or_managed on public.consent_records for select to authenticated using(private.f1_account(organization_id) and(account_user_id=auth.uid() or private.f1_role(organization_id,'consent_registrar')));
create policy f1_withdraw_own_or_managed on public.consent_withdrawals for select to authenticated using(private.f1_account(organization_id) and(withdrawn_by=auth.uid() or private.f1_role(organization_id,'consent_registrar')));
create function public.f1_own_consent(p_organization_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not private.f1_account(p_organization_id) then raise exception 'f1_not_authorized' using errcode='42501';end if;
 return jsonb_build_object('purposes',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'purpose_code',purpose_code,'text_version',text_version,'title',title,'body',body,'allowed_scope',allowed_scope,'retention_policy',retention_policy)),'[]'::jsonb) from public.processing_purposes where organization_id=p_organization_id and status='active'),
 'records',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'purpose_id',c.purpose_id,'purpose_title',p.title,'purpose_body',p.body,'text_version',p.text_version,'scope',c.scope,'method',c.method,'recorded_at',c.recorded_at,'valid',private.f1_consent_valid(p_organization_id,c.id))),'[]'::jsonb) from public.consent_records c join public.processing_purposes p on p.id=c.purpose_id and p.organization_id=c.organization_id where c.organization_id=p_organization_id and c.account_user_id=auth.uid()));
end$$;
revoke all on function public.f1_own_consent(uuid) from public,anon,authenticated,service_role;
grant execute on function public.f1_own_consent(uuid) to authenticated;
-- Only own consent operations extend the actor boundary to existing portal users.
create or replace function private.f1_human(o uuid) returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null and auth.role()='authenticated' and exists(select 1 from public.organization_members where organization_id=o and user_id=auth.uid() and status='active')$$;
commit;
