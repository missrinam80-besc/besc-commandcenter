begin;
-- Synthetic campaign acceptance only. No real campaign, role, consent or metric is seeded.
-- Sensitive campaign rows live outside public: legacy member reads/admin exports
-- cannot accidentally include the new private insights.
create table private.campaign_pilots (
 campaign_id uuid primary key references public.campaigns(id), organization_id uuid not null references public.organizations(id),
 synthetic boolean not null default true check(synthetic), closed_at timestamptz,
 created_by uuid not null references public.profiles(id), unique(organization_id,campaign_id)
);
create table private.campaign_access (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, campaign_id uuid not null,
 user_id uuid not null references public.profiles(id), role text not null check(role in('editor','reviewer','reader')),
 valid_until timestamptz not null, revoked_at timestamptz, created_by uuid not null references public.profiles(id),
 foreign key(organization_id,campaign_id) references private.campaign_pilots(organization_id,campaign_id)
);
create unique index f3_access_current on private.campaign_access(campaign_id,user_id,role) where revoked_at is null;
create table private.campaign_policies (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, campaign_id uuid not null,
 version integer not null check(version>0), body text not null check(length(body) between 10 and 10000),
 retention text not null check(length(retention) between 10 and 4000), fields text[] not null check(cardinality(fields)>0),
 document_id uuid not null references public.document_registry(id), created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default clock_timestamp(), withdrawn_at timestamptz,
 unique(campaign_id,version), unique(organization_id,campaign_id,id),
 foreign key(organization_id,campaign_id) references private.campaign_pilots(organization_id,campaign_id)
);
create unique index f3_policy_current on private.campaign_policies(campaign_id) where withdrawn_at is null;
create table private.campaign_participants (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, campaign_id uuid not null,
 person_id uuid not null references public.community_people(id), policy_id uuid not null,
 accepted_at timestamptz, expires_at timestamptz not null, withdrawn_at timestamptz, created_by uuid not null references public.profiles(id),
 unique(campaign_id,person_id,policy_id), unique(organization_id,campaign_id,id),
 foreign key(organization_id,campaign_id,policy_id) references private.campaign_policies(organization_id,campaign_id,id)
);
create table private.campaign_contributions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, campaign_id uuid not null,
 participant_id uuid not null, platform text not null check(platform='youtube'), external_id text not null check(external_id~'^[A-Za-z0-9_-]{11}$'),
 canonical_url text generated always as ('https://www.youtube.com/watch?v='||external_id) stored,
 revision integer not null default 1, status text not null default 'candidate' check(status in('candidate','verified','rejected')),
 availability text not null default 'unknown' check(availability in('unknown','available','private','deleted','unavailable')),
 checked_at timestamptz, reviewed_by uuid references public.profiles(id), review_reason text,
 submitted_by uuid not null references public.profiles(id), submitted_at timestamptz not null default clock_timestamp(),
 unique(campaign_id,platform,external_id), unique(organization_id,campaign_id,id),
 foreign key(organization_id,campaign_id,participant_id) references private.campaign_participants(organization_id,campaign_id,id)
);
create table private.campaign_measurements (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, campaign_id uuid not null, contribution_id uuid not null,
 contribution_revision integer not null, metric text not null check(metric in('views','likes','comments','reach','impressions')),
 definition text not null check(length(definition) between 2 and 240), unit text not null check(unit='count'),
 semantics text not null check(semantics in('period','cumulative')), period_start timestamptz not null, period_end timestamptz not null,
 measured_at timestamptz not null, fetched_at timestamptz not null default clock_timestamp(),
 value numeric check(value>=0 and value<1e15), quality text not null check(quality in('known','missing','partial','stale','conflicted')),
 source_kind text not null check(source_kind in('manual','export')), source_reference text not null check(length(source_reference) between 2 and 500),
 source_document_id uuid not null references public.document_registry(id), source_key text not null check(length(source_key) between 2 and 180), input jsonb not null,
 created_by uuid not null references public.profiles(id),
 check(period_end>period_start),check((quality='missing' and value is null) or (quality<>'missing' and value is not null)),
 unique(campaign_id,source_key),
 foreign key(organization_id,campaign_id,contribution_id) references private.campaign_contributions(organization_id,campaign_id,id)
);
create index f3_measure_selection on private.campaign_measurements(campaign_id,period_start,period_end,metric,fetched_at,id);
create table private.campaign_receipts (
 organization_id uuid not null,campaign_id uuid not null,actor uuid not null,request_id uuid not null,
 operation text not null,payload jsonb not null,result jsonb not null,created_at timestamptz not null default clock_timestamp(),
 primary key(organization_id,actor,request_id)
);
create table private.campaign_events (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,campaign_id uuid not null,
 actor uuid not null,operation text not null,entity_id uuid not null,created_at timestamptz not null default clock_timestamp()
);
create table private.campaign_report_revisions (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,campaign_id uuid not null,
 snapshot jsonb not null,created_by uuid not null,created_at timestamptz not null default clock_timestamp(),
 foreign key(organization_id,campaign_id) references private.campaign_pilots(organization_id,campaign_id)
);
do $$declare t text;begin foreach t in array array['campaign_pilots','campaign_access','campaign_policies','campaign_participants','campaign_contributions','campaign_measurements','campaign_receipts','campaign_events','campaign_report_revisions'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
end loop;end$$;

create function private.f3_active(o uuid,c uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.f2_account(o) and exists(select 1 from private.campaign_pilots p join public.campaigns x on x.id=p.campaign_id and x.organization_id=p.organization_id where p.organization_id=o and p.campaign_id=c and p.closed_at is null and x.deleted_at is null and x.title like 'TESTFIXTURE%')
$$;
create function private.f3_role(o uuid,c uuid,roles text[]) returns boolean language sql stable security definer set search_path='' as $$
 select private.f3_active(o,c) and exists(select 1 from private.campaign_access a where a.organization_id=o and a.campaign_id=c and a.user_id=auth.uid() and a.role=any(roles) and a.revoked_at is null and a.valid_until>clock_timestamp())
$$;
create function private.f3_participant_valid(o uuid,c uuid,p uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.campaign_participants a join private.campaign_policies s on s.id=a.policy_id and s.campaign_id=a.campaign_id and s.organization_id=a.organization_id
 join public.community_people person on person.id=a.person_id and person.organization_id=a.organization_id
 where a.organization_id=o and a.campaign_id=c and a.id=p and a.accepted_at is not null and a.withdrawn_at is null and a.expires_at>clock_timestamp() and s.withdrawn_at is null and person.deleted_at is null and person.account_user_id is not null)
$$;
create function private.f3_own(o uuid,c uuid,p uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.campaign_participants a join public.community_people person on person.id=a.person_id and person.organization_id=a.organization_id where a.organization_id=o and a.campaign_id=c and a.id=p and person.account_user_id=auth.uid() and person.deleted_at is null)
$$;
-- RPCs are privileged boundaries, not generic database access. All private helpers
-- are non-callable by clients; actor, session, campaign and current purpose are checked.
create function public.f3_workflow(p_organization_id uuid,p_campaign_id uuid,p_operation text,p_data jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o uuid:=p_organization_id;c uuid:=p_campaign_id;op text:=p_operation;d jsonb:=p_data;
 result jsonb;answer uuid;prior private.campaign_receipts;measurement private.campaign_measurements;post private.campaign_contributions;pol private.campaign_policies;fields text[];allowed text[];
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'f3_isolation_required';end if;
 perform private.f1_lock();
 if not private.f2_account(o) or p_request_id is null or c is null or jsonb_typeof(d)<>'object' or pg_column_size(d)>24000 then raise exception 'f3_not_available' using errcode='42501';end if;
 -- Explicit operation key lists also protect direct RPC callers.
 allowed:=case op
 when 'pilot.open' then array[]::text[] when 'pilot.close' then array[]::text[] when 'report.capture' then array[]::text[]
 when 'access.assign' then array['user_id','role','valid_until'] when 'access.revoke' then array['id']
 when 'policy.set' then array['version','body','retention','fields','document_id']
 when 'participant.select' then array['person_id','policy_id','expires_at']
 when 'participant.accept' then array['id','accepted'] when 'participant.withdraw' then array['id']
 when 'post.submit' then array['participant_id','external_id']
 when 'post.review' then array['id','expected_revision','decision','availability','reason']
 when 'measurement.record' then array['contribution_id','expected_revision','metric','definition','semantics','period_start','period_end','measured_at','value','quality','source_kind','source_reference','source_document_id','source_key']
 else null end;
 if allowed is null or exists(select 1 from jsonb_object_keys(d) k where not(k=any(allowed))) then raise exception 'f3_invalid_input';end if;
 if op='pilot.open' then
  if not private.f1_chair(o) or not exists(select 1 from public.campaigns where organization_id=o and id=c and deleted_at is null and title like 'TESTFIXTURE%') then raise exception 'f3_synthetic_chair_required' using errcode='42501';end if;
 else
  if not private.f3_active(o,c) then raise exception 'f3_not_available' using errcode='42501';end if;
 end if;
 -- Authorization is checked before receipts; a revoked actor cannot replay a write.
 if op in('access.assign','access.revoke','policy.set','pilot.close') and not private.f1_chair(o) then raise exception 'f3_not_authorized' using errcode='42501';end if;
 if op in('participant.select','measurement.record') and not private.f3_role(o,c,array['editor']) then raise exception 'f3_not_authorized' using errcode='42501';end if;
 if op='post.review' and not private.f3_role(o,c,array['reviewer']) then raise exception 'f3_not_authorized' using errcode='42501';end if;
 if op='report.capture' and not private.f3_role(o,c,array['editor','reviewer','reader']) then raise exception 'f3_not_authorized' using errcode='42501';end if;
 if op in('participant.accept','participant.withdraw') and not private.f3_own(o,c,(d->>'id')::uuid) then raise exception 'f3_not_authorized' using errcode='42501';end if;
 if op='post.submit' and not(private.f3_own(o,c,(d->>'participant_id')::uuid) or private.f3_role(o,c,array['editor'])) then raise exception 'f3_not_authorized' using errcode='42501';end if;
 select * into prior from private.campaign_receipts where organization_id=o and actor=auth.uid() and request_id=p_request_id;
 if found then
  if prior.campaign_id<>c or prior.operation<>op or prior.payload<>d then raise exception 'f3_request_conflict' using errcode='40001';end if;
  return prior.result;
 end if;
 if op='report.capture' then
  insert into private.campaign_report_revisions(organization_id,campaign_id,snapshot,created_by) values(o,c,public.f3_campaign_state(o,c),auth.uid()) returning id into answer;
 elsif op='pilot.open' then
  insert into private.campaign_pilots(campaign_id,organization_id,created_by) values(c,o,auth.uid());answer:=c;
 elsif op='pilot.close' then
  update private.campaign_pilots set closed_at=clock_timestamp() where campaign_id=c;update private.campaign_access set revoked_at=clock_timestamp() where campaign_id=c and revoked_at is null;answer:=c;
 elsif op='access.assign' then
  if not exists(select 1 from public.organization_members where organization_id=o and user_id=(d->>'user_id')::uuid and status='active') or (d->>'valid_until')::timestamptz<=clock_timestamp() or (d->>'valid_until')::timestamptz>clock_timestamp()+interval '7 days' then raise exception 'f3_invalid_access';end if;
  insert into private.campaign_access(organization_id,campaign_id,user_id,role,valid_until,created_by) values(o,c,(d->>'user_id')::uuid,d->>'role',(d->>'valid_until')::timestamptz,auth.uid()) returning id into answer;
 elsif op='access.revoke' then
  update private.campaign_access set revoked_at=clock_timestamp() where organization_id=o and campaign_id=c and id=(d->>'id')::uuid returning id into answer;
 elsif op='policy.set' then
  if not private.f1_document_visible(o,(d->>'document_id')::uuid) then raise exception 'f3_evidence_required';end if;
  select array_agg(v) into fields from jsonb_array_elements_text(d->'fields') v;
  if fields is null or not(fields<@array['post_url','views','likes','comments','reach','impressions']) or not('post_url'=any(fields)) then raise exception 'f3_invalid_scope';end if;
  if (d->>'version')::integer<=coalesce((select max(version) from private.campaign_policies where campaign_id=c),0) then raise exception 'f3_revision_conflict' using errcode='40001';end if;
  update private.campaign_policies set withdrawn_at=clock_timestamp() where campaign_id=c and withdrawn_at is null;
  insert into private.campaign_policies(organization_id,campaign_id,version,body,retention,fields,document_id,created_by) values(o,c,(d->>'version')::integer,d->>'body',d->>'retention',fields,(d->>'document_id')::uuid,auth.uid()) returning id into answer;
 elsif op='participant.select' then
  if not exists(select 1 from public.community_people where organization_id=o and id=(d->>'person_id')::uuid and deleted_at is null and account_user_id is not null) or not exists(select 1 from private.campaign_policies where organization_id=o and campaign_id=c and id=(d->>'policy_id')::uuid and withdrawn_at is null) or (d->>'expires_at')::timestamptz<=clock_timestamp() or (d->>'expires_at')::timestamptz>clock_timestamp()+interval '7 days' then raise exception 'f3_not_available';end if;
  insert into private.campaign_participants(organization_id,campaign_id,person_id,policy_id,expires_at,created_by) values(o,c,(d->>'person_id')::uuid,(d->>'policy_id')::uuid,(d->>'expires_at')::timestamptz,auth.uid()) returning id into answer;
 elsif op='participant.accept' then
  if d->>'accepted' is distinct from 'true' then raise exception 'f3_confirmation_required';end if;
  update private.campaign_participants a set accepted_at=coalesce(a.accepted_at,clock_timestamp()) where a.organization_id=o and a.campaign_id=c and a.id=(d->>'id')::uuid and a.withdrawn_at is null and a.expires_at>clock_timestamp() and exists(select 1 from private.campaign_policies where id=a.policy_id and withdrawn_at is null) returning id into answer;
 elsif op='participant.withdraw' then
  update private.campaign_participants set withdrawn_at=coalesce(withdrawn_at,clock_timestamp()) where organization_id=o and campaign_id=c and id=(d->>'id')::uuid returning id into answer;
 elsif op='post.submit' then
  if not private.f3_participant_valid(o,c,(d->>'participant_id')::uuid) then raise exception 'f3_consent_required';end if;
  if exists(select 1 from private.campaign_contributions x where x.organization_id=o and x.platform='youtube' and x.external_id=d->>'external_id' and x.participant_id<>(d->>'participant_id')::uuid and (select person_id from private.campaign_participants where id=x.participant_id)<>(select person_id from private.campaign_participants where id=(d->>'participant_id')::uuid)) then raise exception 'f3_creator_conflict';end if;
  select * into post from private.campaign_contributions where campaign_id=c and platform='youtube' and external_id=d->>'external_id';
  if post.id is not null then
   answer:=post.id;
   if post.participant_id<>(d->>'participant_id')::uuid then
    update private.campaign_contributions set participant_id=(d->>'participant_id')::uuid,revision=revision+1,status='candidate',availability='unknown',reviewed_by=null,review_reason=null,checked_at=null,submitted_by=auth.uid(),submitted_at=clock_timestamp() where id=post.id;
   end if;
  else
   insert into private.campaign_contributions(organization_id,campaign_id,participant_id,platform,external_id,submitted_by) values(o,c,(d->>'participant_id')::uuid,'youtube',d->>'external_id',auth.uid()) returning id into answer;
  end if;
 elsif op='post.review' then
  select * into post from private.campaign_contributions where organization_id=o and campaign_id=c and id=(d->>'id')::uuid;
  if post.id is null or (d->>'expected_revision')::integer is distinct from post.revision then raise exception 'f3_revision_conflict' using errcode='40001';end if;
  if post.submitted_by=auth.uid() or private.f3_own(o,c,post.participant_id) then raise exception 'f3_independent_review_required' using errcode='42501';end if;
  if not private.f3_participant_valid(o,c,post.participant_id) then raise exception 'f3_consent_required';end if;
  if coalesce(length(btrim(d->>'reason')),0)<2 or d->>'decision' not in('verified','rejected') then raise exception 'f3_reason_required';end if;
  update private.campaign_contributions set revision=revision+1,status=d->>'decision',availability=d->>'availability',review_reason=left(d->>'reason',2000),reviewed_by=auth.uid(),checked_at=clock_timestamp() where id=post.id returning id into answer;
 elsif op='measurement.record' then
  select * into post from private.campaign_contributions where organization_id=o and campaign_id=c and id=(d->>'contribution_id')::uuid;
  if post.id is null or post.status<>'verified' or (d->>'expected_revision')::integer is distinct from post.revision or not private.f3_participant_valid(o,c,post.participant_id) then raise exception 'f3_consent_or_revision_required';end if;
  select s.* into pol from private.campaign_participants a join private.campaign_policies s on s.id=a.policy_id where a.id=post.participant_id;
  if not(d->>'metric'=any(pol.fields)) or not private.f1_document_visible(o,(d->>'source_document_id')::uuid) then raise exception 'f3_scope_or_evidence_required';end if;
  if (d->>'measured_at')::timestamptz>clock_timestamp() then raise exception 'f3_invalid_time';end if;
  select * into measurement from private.campaign_measurements where campaign_id=c and source_key=d->>'source_key';
  if measurement.id is not null then
   if measurement.input<>d then raise exception 'f3_source_conflict' using errcode='40001';end if;
   result:=jsonb_build_object('id',measurement.id);
   insert into private.campaign_receipts values(o,c,auth.uid(),p_request_id,op,d,result,clock_timestamp());
   return result;
  end if;
  insert into private.campaign_measurements(organization_id,campaign_id,contribution_id,contribution_revision,metric,definition,unit,semantics,period_start,period_end,measured_at,value,quality,source_kind,source_reference,source_document_id,source_key,input,created_by)
  values(o,c,post.id,post.revision,d->>'metric',d->>'definition','count',d->>'semantics',(d->>'period_start')::timestamptz,(d->>'period_end')::timestamptz,(d->>'measured_at')::timestamptz,(d->>'value')::numeric,d->>'quality',d->>'source_kind',d->>'source_reference',(d->>'source_document_id')::uuid,d->>'source_key',d,auth.uid()) returning id into answer;
 end if;
 if answer is null then raise exception 'f3_not_available';end if;
 result:=jsonb_build_object('id',answer);
 insert into private.campaign_events(organization_id,campaign_id,actor,operation,entity_id) values(o,c,auth.uid(),op,answer);
 insert into private.campaign_receipts values(o,c,auth.uid(),p_request_id,op,d,result,clock_timestamp());
 return result;
end$$;

create function public.f3_campaign_state(p_organization_id uuid,p_campaign_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o uuid:=p_organization_id;c uuid:=p_campaign_id;team boolean;begin
 if not private.f3_active(o,c) then raise exception 'f3_not_available' using errcode='42501';end if;
 team:=private.f3_role(o,c,array['editor','reviewer','reader']);
 if not team and not exists(select 1 from private.campaign_participants a where a.campaign_id=c and private.f3_own(o,c,a.id)) and not private.f1_chair(o) then raise exception 'f3_not_available' using errcode='42501';end if;
 if (select count(*) from private.campaign_contributions where campaign_id=c)>500 or (select count(*) from private.campaign_measurements where campaign_id=c)>5000 then raise exception 'f3_selection_too_large';end if;
 return jsonb_build_object('synthetic',true,'as_of',clock_timestamp(),'campaign_id',c,'chair',private.f1_chair(o),'editor',private.f3_role(o,c,array['editor']),'reviewer',private.f3_role(o,c,array['reviewer']),'reader',team,
 'excluded_posts',(select count(*) from private.campaign_contributions x where x.campaign_id=c and not private.f3_participant_valid(o,c,x.participant_id) and (team or private.f3_own(o,c,x.participant_id))),
 'policies',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'version',version,'body',body,'fields',fields,'retention',retention,'withdrawn_at',withdrawn_at)),'[]') from private.campaign_policies where campaign_id=c),
 'access',case when private.f1_chair(o) then (select coalesce(jsonb_agg(jsonb_build_object('id',id,'user_id',user_id,'role',role,'valid_until',valid_until,'revoked_at',revoked_at)),'[]') from private.campaign_access where campaign_id=c) else '[]'::jsonb end,
 'participants',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'person_id',a.person_id,'policy_id',a.policy_id,'accepted_at',a.accepted_at,'withdrawn_at',a.withdrawn_at,'expires_at',a.expires_at,'valid',private.f3_participant_valid(o,c,a.id),'own',private.f3_own(o,c,a.id))),'[]') from private.campaign_participants a where a.campaign_id=c and (team or private.f3_own(o,c,a.id))),
 'posts',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'participant_id',x.participant_id,'canonical_url',x.canonical_url,'external_id',x.external_id,'revision',x.revision,'status',x.status,'availability',x.availability,'checked_at',x.checked_at)),'[]') from private.campaign_contributions x where x.campaign_id=c and private.f3_participant_valid(o,c,x.participant_id) and (team or private.f3_own(o,c,x.participant_id))),
 'measurements',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'contribution_id',m.contribution_id,'revision',m.contribution_revision,'metric',m.metric,'definition',m.definition,'unit',m.unit,'semantics',m.semantics,'period_start',m.period_start,'period_end',m.period_end,'measured_at',m.measured_at,'fetched_at',m.fetched_at,'value',m.value,'quality',m.quality,'source_kind',m.source_kind,'source_reference',m.source_reference)),'[]') from private.campaign_measurements m join private.campaign_contributions x on x.id=m.contribution_id where m.campaign_id=c and private.f1_document_visible(o,m.source_document_id) and x.status='verified' and x.revision=m.contribution_revision and private.f3_participant_valid(o,c,x.participant_id) and (team or private.f3_own(o,c,x.participant_id))));
end$$;
create function public.f3_report_revision(p_organization_id uuid,p_campaign_id uuid,p_report_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare snapshot jsonb;begin
 if not private.f3_role(p_organization_id,p_campaign_id,array['editor','reviewer','reader']) then raise exception 'f3_not_available' using errcode='42501';end if;
 select r.snapshot into snapshot from private.campaign_report_revisions r where r.id=p_report_id and r.organization_id=p_organization_id and r.campaign_id=p_campaign_id;
 if snapshot is null or exists(select 1 from jsonb_array_elements(snapshot->'participants') a where (a->>'valid')::boolean and not private.f3_participant_valid(p_organization_id,p_campaign_id,(a->>'id')::uuid))
 or exists(select 1 from jsonb_array_elements(snapshot->'posts') x where not exists(select 1 from private.campaign_contributions p where p.id=(x->>'id')::uuid and p.revision=(x->>'revision')::integer and p.status=x->>'status' and p.availability=x->>'availability'))
 or exists(select 1 from jsonb_array_elements(snapshot->'measurements') m join private.campaign_measurements source on source.id=(m->>'id')::uuid where not private.f1_document_visible(p_organization_id,source.source_document_id))
 then raise exception 'f3_report_access_changed' using errcode='42501';end if;
 return snapshot;
end$$;
-- Lock ordering includes session revocation, not just our workflow writers.
create trigger f3_auth_users_gate before update or delete on auth.users for each statement execute function private.f1_gate();
create trigger f3_auth_sessions_gate before update or delete on auth.sessions for each statement execute function private.f1_gate();
revoke all on function private.f3_active(uuid,uuid),private.f3_role(uuid,uuid,text[]),private.f3_participant_valid(uuid,uuid,uuid),private.f3_own(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.f3_workflow(uuid,uuid,text,jsonb,uuid),public.f3_campaign_state(uuid,uuid),public.f3_report_revision(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.f3_workflow(uuid,uuid,text,jsonb,uuid),public.f3_campaign_state(uuid,uuid),public.f3_report_revision(uuid,uuid,uuid) to authenticated;
commit;
