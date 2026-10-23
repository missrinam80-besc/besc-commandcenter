begin;
-- Additive F3 completion; no campaign, role, consent or connection is activated.
alter table private.campaign_pilots drop constraint campaign_pilots_synthetic_check;
alter table private.campaign_pilots add column opening_document_id uuid references public.document_registry(id);
alter table private.campaign_pilots add constraint f3_real_opening_evidence check(synthetic or opening_document_id is not null);
alter table private.campaign_contributions drop constraint campaign_contributions_platform_check;
alter table private.campaign_contributions drop constraint campaign_contributions_external_id_check;
alter table private.campaign_contributions add constraint f3_post_identity check((platform='youtube' and external_id~'^[A-Za-z0-9_-]{11}$') or (platform='twitch' and (external_id~'^video:[0-9]{1,30}$' or external_id~'^clip:[A-Za-z0-9_-]{1,100}$' or external_id~'^channel:[a-z0-9_]{1,25}$')));
alter table private.campaign_contributions drop column canonical_url;
alter table private.campaign_contributions add column canonical_url text generated always as(case when platform='youtube' then 'https://www.youtube.com/watch?v='||external_id when external_id like 'video:%' then 'https://www.twitch.tv/videos/'||substr(external_id,7) when external_id like 'clip:%' then 'https://clips.twitch.tv/'||substr(external_id,6) else 'https://www.twitch.tv/'||substr(external_id,9) end) stored;
alter table private.campaign_measurements drop constraint campaign_measurements_metric_check;
alter table private.campaign_measurements add constraint f3_metric check(metric in('views','likes','comments','reach','impressions','engagements','shares','current_viewers'));
alter table private.campaign_measurements drop constraint campaign_measurements_semantics_check;
alter table private.campaign_measurements add constraint f3_semantics check(semantics in('period','cumulative','instant'));
alter table private.campaign_measurements drop constraint campaign_measurements_source_kind_check;
alter table private.campaign_measurements add constraint f3_source_kind check(source_kind in('manual','export','official_api'));

create table private.campaign_sources(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,campaign_id uuid not null,participant_id uuid not null,
 account_id uuid not null references public.social_accounts(id),broadcaster_id text not null check(broadcaster_id~'^[1-9][0-9]{0,19}$'),
 document_id uuid not null references public.document_registry(id),daily_limit integer not null check(daily_limit between 1 and 100),
 revoked_at timestamptz,created_by uuid not null references public.profiles(id),
 foreign key(organization_id,campaign_id,participant_id) references private.campaign_participants(organization_id,campaign_id,id));
create unique index f3_source_current on private.campaign_sources(campaign_id,participant_id,account_id) where revoked_at is null;
alter table private.campaign_measurements add column source_binding_id uuid references private.campaign_sources(id);
alter table private.campaign_measurements add constraint f3_official_binding check((source_kind='official_api')=(source_binding_id is not null));
create table private.campaign_source_runs(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,campaign_id uuid not null,source_id uuid not null references private.campaign_sources(id),
 contribution_id uuid not null references private.campaign_contributions(id),contribution_revision integer not null,
 actor uuid not null references public.profiles(id),session_id uuid not null,request_id uuid not null,
 credential_version timestamptz not null,created_at timestamptz not null default clock_timestamp(),
 status text not null default 'pending' check(status in('pending','succeeded','failed')),error_code text,measurement_id uuid references private.campaign_measurements(id),
 unique(organization_id,actor,request_id));
create index f3_source_budget on private.campaign_source_runs(source_id,created_at);
alter table private.campaign_sources enable row level security;
alter table private.campaign_source_runs enable row level security;
revoke all on private.campaign_sources,private.campaign_source_runs from public,anon,authenticated,service_role;

create or replace function private.f3_active(o uuid,c uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.f2_account(o) and exists(select 1 from private.campaign_pilots p join public.campaigns x on x.id=p.campaign_id and x.organization_id=p.organization_id where p.organization_id=o and p.campaign_id=c and p.closed_at is null and x.deleted_at is null and (not p.synthetic or x.title like 'TESTFIXTURE%'))
$$;
create function private.f3_source_valid(s uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.campaign_sources b join private.campaign_pilots pilot on pilot.campaign_id=b.campaign_id and pilot.organization_id=b.organization_id
 join public.campaigns c on c.id=b.campaign_id and c.organization_id=b.organization_id
 join public.social_accounts a on a.id=b.account_id and a.organization_id=b.organization_id
 join private.campaign_participants p on p.id=b.participant_id and p.campaign_id=b.campaign_id and p.organization_id=b.organization_id
 join auth.identities i on i.user_id=p.account_user_id and i.provider='twitch'
 where b.id=s and b.revoked_at is null and not pilot.synthetic and pilot.closed_at is null and c.deleted_at is null and a.deleted_at is null and a.status='connected' and a.platform='twitch' and a.external_account_id=b.broadcaster_id
 and i.identity_data->>'sub'=b.broadcaster_id and (i.identity_data->>'provider_id' is null or i.identity_data->>'provider_id'=b.broadcaster_id)
 and private.f3_participant_valid(b.organization_id,b.campaign_id,b.participant_id) and private.f1_document_visible(b.organization_id,b.document_id));
$$;
create function private.f3_measurement_visible(m private.campaign_measurements) returns boolean language sql stable security definer set search_path='' as $$
 select private.f1_document_visible(m.organization_id,m.source_document_id) and (m.source_kind<>'official_api' or private.f3_source_valid(m.source_binding_id));
$$;
create or replace function public.f3_workflow(p_organization_id uuid,p_campaign_id uuid,p_operation text,p_data jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o uuid:=p_organization_id;c uuid:=p_campaign_id;op text:=p_operation;d jsonb:=p_data;
 result jsonb;answer uuid;prior private.campaign_receipts;measurement private.campaign_measurements;post private.campaign_contributions;pol private.campaign_policies;fields text[];allowed text[];
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'f3_isolation_required';end if;
 -- Row locks serialize this mutation with revocation without modifying Auth tables or triggers.
 perform 1 from auth.users where id=auth.uid() for share;
 perform 1 from auth.sessions where user_id=auth.uid() and id::text=auth.jwt()->>'session_id' for share;
 perform private.f1_lock();
 if not private.f2_account(o) or p_request_id is null or c is null or jsonb_typeof(d)<>'object' or pg_column_size(d)>24000 then raise exception 'f3_not_available' using errcode='42501';end if;
 -- Explicit operation key lists also protect direct RPC callers.
 allowed:=case op
 when 'campaign.open' then array['document_id'] when 'source.assign' then array['participant_id','account_id','document_id','daily_limit'] when 'source.revoke' then array['id'] when 'pilot.open' then array[]::text[] when 'pilot.close' then array[]::text[] when 'report.capture' then array[]::text[]
 when 'access.assign' then array['user_id','role','valid_until'] when 'access.revoke' then array['id']
 when 'policy.set' then array['version','body','retention','fields','document_id']
 when 'participant.select' then array['person_id','policy_id','expires_at']
 when 'participant.accept' then array['id','accepted'] when 'participant.withdraw' then array['id']
 when 'post.submit' then array['participant_id','external_id','platform']
 when 'post.review' then array['id','expected_revision','decision','availability','reason']
 when 'measurement.record' then array['contribution_id','expected_revision','metric','definition','semantics','period_start','period_end','measured_at','value','quality','source_kind','source_reference','source_document_id','source_key']
 else null end;
 if allowed is null or exists(select 1 from jsonb_object_keys(d) k where not(k=any(allowed))) then raise exception 'f3_invalid_input';end if;
 if op='campaign.open' then
  if not private.f1_chair(o) or not private.f1_document_visible(o,(d->>'document_id')::uuid) or not exists(select 1 from public.campaigns where organization_id=o and id=c and deleted_at is null and title not like 'TESTFIXTURE%') then raise exception 'f3_campaign_approval_required' using errcode='42501';end if;
 elsif op='pilot.open' then
  if not private.f1_chair(o) or not exists(select 1 from public.campaigns where organization_id=o and id=c and deleted_at is null and title like 'TESTFIXTURE%') then raise exception 'f3_synthetic_chair_required' using errcode='42501';end if;
 else
  if not private.f3_active(o,c) then raise exception 'f3_not_available' using errcode='42501';end if;
 end if;
 -- Authorization is checked before receipts; a revoked actor cannot replay a write.
 if op in('access.assign','access.revoke','policy.set','pilot.close','source.assign','source.revoke') and not private.f1_chair(o) then raise exception 'f3_not_authorized' using errcode='42501';end if;
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
 elsif op='campaign.open' then
  insert into private.campaign_pilots(campaign_id,organization_id,synthetic,created_by,opening_document_id) values(c,o,false,auth.uid(),(d->>'document_id')::uuid);answer:=c;
 elsif op='pilot.open' then
  insert into private.campaign_pilots(campaign_id,organization_id,created_by) values(c,o,auth.uid());answer:=c;
 elsif op='pilot.close' then
  update private.campaign_pilots set closed_at=clock_timestamp() where campaign_id=c;update private.campaign_access set revoked_at=clock_timestamp() where campaign_id=c and revoked_at is null;answer:=c;
 elsif op='source.assign' then
  if not exists(select 1 from private.campaign_pilots where campaign_id=c and organization_id=o and not synthetic) then raise exception 'f3_real_campaign_required';end if;
  if not private.f3_participant_valid(o,c,(d->>'participant_id')::uuid) or not private.f1_document_visible(o,(d->>'document_id')::uuid) or (d->>'daily_limit')::int not between 1 and 100 then raise exception 'f3_source_binding_required';end if;
  if not exists(select 1 from public.social_accounts a join private.campaign_participants p on p.id=(d->>'participant_id')::uuid and p.organization_id=a.organization_id and p.campaign_id=c join auth.identities i on i.user_id=p.account_user_id and i.provider='twitch'
    where a.id=(d->>'account_id')::uuid and a.organization_id=o and a.platform='twitch' and a.status='connected' and a.deleted_at is null and a.external_account_id~'^[1-9][0-9]{0,19}$'
    and i.identity_data->>'sub'=a.external_account_id and (i.identity_data->>'provider_id' is null or i.identity_data->>'provider_id'=a.external_account_id)) then raise exception 'f3_source_owner_required';end if;
  insert into private.campaign_sources(organization_id,campaign_id,participant_id,account_id,broadcaster_id,document_id,daily_limit,created_by)
  select o,c,(d->>'participant_id')::uuid,a.id,a.external_account_id,(d->>'document_id')::uuid,(d->>'daily_limit')::int,auth.uid() from public.social_accounts a where a.id=(d->>'account_id')::uuid returning id into answer;
 elsif op='source.revoke' then
  update private.campaign_sources set revoked_at=clock_timestamp() where organization_id=o and campaign_id=c and id=(d->>'id')::uuid returning id into answer;
 elsif op='access.assign' then
  if not exists(select 1 from public.organization_members where organization_id=o and user_id=(d->>'user_id')::uuid and status='active') or (d->>'valid_until')::timestamptz<=clock_timestamp() or (d->>'valid_until')::timestamptz>clock_timestamp()+interval '7 days' then raise exception 'f3_invalid_access';end if;
  insert into private.campaign_access(organization_id,campaign_id,user_id,role,valid_until,created_by) values(o,c,(d->>'user_id')::uuid,d->>'role',(d->>'valid_until')::timestamptz,auth.uid()) returning id into answer;
 elsif op='access.revoke' then
  update private.campaign_access set revoked_at=clock_timestamp() where organization_id=o and campaign_id=c and id=(d->>'id')::uuid returning id into answer;
 elsif op='policy.set' then
  if not private.f1_document_visible(o,(d->>'document_id')::uuid) then raise exception 'f3_evidence_required';end if;
  select array_agg(v) into fields from jsonb_array_elements_text(d->'fields') v;
  if fields is null or not(fields<@array['post_url','views','likes','comments','reach','impressions','engagements','shares','current_viewers']) or not('post_url'=any(fields)) then raise exception 'f3_invalid_scope';end if;
  if (d->>'version')::integer<=coalesce((select max(version) from private.campaign_policies where campaign_id=c),0) then raise exception 'f3_revision_conflict' using errcode='40001';end if;
  update private.campaign_policies set withdrawn_at=clock_timestamp() where campaign_id=c and withdrawn_at is null;
  insert into private.campaign_policies(organization_id,campaign_id,version,body,retention,fields,document_id,created_by) values(o,c,(d->>'version')::integer,d->>'body',d->>'retention',fields,(d->>'document_id')::uuid,auth.uid()) returning id into answer;
 elsif op='participant.select' then
  if not exists(select 1 from public.community_people where organization_id=o and id=(d->>'person_id')::uuid and deleted_at is null and account_user_id is not null) or not exists(select 1 from private.campaign_policies where organization_id=o and campaign_id=c and id=(d->>'policy_id')::uuid and withdrawn_at is null) or (d->>'expires_at')::timestamptz<=clock_timestamp() or (d->>'expires_at')::timestamptz>clock_timestamp()+interval '7 days' then raise exception 'f3_not_available';end if;
  insert into private.campaign_participants(organization_id,campaign_id,person_id,account_user_id,policy_id,expires_at,created_by) values(o,c,(d->>'person_id')::uuid,(select account_user_id from public.community_people where organization_id=o and id=(d->>'person_id')::uuid),(d->>'policy_id')::uuid,(d->>'expires_at')::timestamptz,auth.uid()) returning id into answer;
 elsif op='participant.accept' then
  if d->>'accepted' is distinct from 'true' then raise exception 'f3_confirmation_required';end if;
  update private.campaign_participants a set accepted_at=coalesce(a.accepted_at,clock_timestamp()) where a.organization_id=o and a.campaign_id=c and a.id=(d->>'id')::uuid and a.withdrawn_at is null and a.expires_at>clock_timestamp() and exists(select 1 from private.campaign_policies where id=a.policy_id and withdrawn_at is null) returning id into answer;
 elsif op='participant.withdraw' then
  update private.campaign_participants set withdrawn_at=coalesce(withdrawn_at,clock_timestamp()) where organization_id=o and campaign_id=c and id=(d->>'id')::uuid returning id into answer;
 elsif op='post.submit' then
  if coalesce(d->>'platform','youtube') not in('youtube','twitch') then raise exception 'f3_invalid_platform';end if;
  if not private.f3_participant_valid(o,c,(d->>'participant_id')::uuid) then raise exception 'f3_consent_required';end if;
  if exists(select 1 from private.campaign_contributions x where x.organization_id=o and x.platform=coalesce(d->>'platform','youtube') and x.external_id=d->>'external_id' and x.participant_id<>(d->>'participant_id')::uuid and (select person_id from private.campaign_participants where id=x.participant_id)<>(select person_id from private.campaign_participants where id=(d->>'participant_id')::uuid)) then raise exception 'f3_creator_conflict';end if;
  select * into post from private.campaign_contributions where campaign_id=c and platform=coalesce(d->>'platform','youtube') and external_id=d->>'external_id';
  if post.id is not null then
   answer:=post.id;
   if post.participant_id<>(d->>'participant_id')::uuid then
    update private.campaign_contributions set participant_id=(d->>'participant_id')::uuid,revision=revision+1,status='candidate',availability='unknown',reviewed_by=null,review_reason=null,checked_at=null,submitted_by=auth.uid(),submitted_at=clock_timestamp() where id=post.id;
   end if;
  else
   insert into private.campaign_contributions(organization_id,campaign_id,participant_id,platform,external_id,submitted_by) values(o,c,(d->>'participant_id')::uuid,coalesce(d->>'platform','youtube'),d->>'external_id',auth.uid()) returning id into answer;
  end if;
 elsif op='post.review' then
  select * into post from private.campaign_contributions where organization_id=o and campaign_id=c and id=(d->>'id')::uuid;
  if post.id is null or (d->>'expected_revision')::integer is distinct from post.revision then raise exception 'f3_revision_conflict' using errcode='40001';end if;
  if post.submitted_by=auth.uid() or private.f3_own(o,c,post.participant_id) then raise exception 'f3_independent_review_required' using errcode='42501';end if;
  if not private.f3_participant_valid(o,c,post.participant_id) then raise exception 'f3_consent_required';end if;
  if coalesce(length(btrim(d->>'reason')),0)<2 or d->>'decision' not in('verified','rejected') then raise exception 'f3_reason_required';end if;
  update private.campaign_contributions set revision=revision+1,status=d->>'decision',availability=d->>'availability',review_reason=left(d->>'reason',2000),reviewed_by=auth.uid(),checked_at=clock_timestamp() where id=post.id returning id into answer;
 elsif op='measurement.record' then
  if d->>'source_kind' not in('manual','export') then raise exception 'f3_server_source_required';end if;
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

create or replace function public.f3_campaign_state(p_organization_id uuid,p_campaign_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o uuid:=p_organization_id;c uuid:=p_campaign_id;team boolean;begin
 if not private.f3_active(o,c) then raise exception 'f3_not_available' using errcode='42501';end if;
 team:=private.f3_role(o,c,array['editor','reviewer','reader']);
 if not team and not exists(select 1 from private.campaign_participants a where a.campaign_id=c and private.f3_own(o,c,a.id)) and not private.f1_chair(o) then raise exception 'f3_not_available' using errcode='42501';end if;
 if (select count(*) from private.campaign_contributions where campaign_id=c)>500 or (select count(*) from private.campaign_measurements where campaign_id=c)>5000 then raise exception 'f3_selection_too_large';end if;
 return jsonb_build_object('synthetic',(select synthetic from private.campaign_pilots where campaign_id=c),'as_of',clock_timestamp(),'campaign_id',c,'chair',private.f1_chair(o),'editor',private.f3_role(o,c,array['editor']),'reviewer',private.f3_role(o,c,array['reviewer']),'reader',team,
 'excluded_posts',(select count(*) from private.campaign_contributions x where x.campaign_id=c and not private.f3_participant_valid(o,c,x.participant_id) and (team or private.f3_own(o,c,x.participant_id))),
 'policies',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'version',version,'body',body,'fields',fields,'retention',retention,'withdrawn_at',withdrawn_at)),'[]') from private.campaign_policies where campaign_id=c),
 'sources',case when team or private.f1_chair(o) then (select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'participant_id',s.participant_id,'account_id',s.account_id,'broadcaster_id',s.broadcaster_id,'daily_limit',s.daily_limit,'revoked_at',s.revoked_at,'valid',private.f3_source_valid(s.id))),'[]') from private.campaign_sources s where s.campaign_id=c) else '[]'::jsonb end,
 'source_runs',case when team then (select coalesce(jsonb_agg(v),'[]') from(select jsonb_build_object('id',r.id,'status',r.status,'error_code',r.error_code,'created_at',r.created_at) v from private.campaign_source_runs r where r.campaign_id=c order by r.created_at desc limit 20) x) else '[]'::jsonb end,
 'access',case when private.f1_chair(o) then (select coalesce(jsonb_agg(jsonb_build_object('id',id,'user_id',user_id,'role',role,'valid_until',valid_until,'revoked_at',revoked_at)),'[]') from private.campaign_access where campaign_id=c) else '[]'::jsonb end,
 'participants',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'person_id',a.person_id,'policy_id',a.policy_id,'accepted_at',a.accepted_at,'withdrawn_at',a.withdrawn_at,'expires_at',a.expires_at,'valid',private.f3_participant_valid(o,c,a.id),'own',private.f3_own(o,c,a.id))),'[]') from private.campaign_participants a where a.campaign_id=c and (team or private.f3_own(o,c,a.id))),
 'posts',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'participant_id',x.participant_id,'platform',x.platform,'canonical_url',x.canonical_url,'external_id',x.external_id,'revision',x.revision,'status',x.status,'availability',x.availability,'checked_at',x.checked_at)),'[]') from private.campaign_contributions x where x.campaign_id=c and private.f3_participant_valid(o,c,x.participant_id) and (team or private.f3_own(o,c,x.participant_id))),
 'measurements',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'contribution_id',m.contribution_id,'revision',m.contribution_revision,'metric',m.metric,'definition',m.definition,'unit',m.unit,'semantics',m.semantics,'period_start',m.period_start,'period_end',m.period_end,'measured_at',m.measured_at,'fetched_at',m.fetched_at,'value',m.value,'quality',m.quality,'source_kind',m.source_kind,'source_binding_id',m.source_binding_id,'source_reference',m.source_reference)),'[]') from private.campaign_measurements m join private.campaign_contributions x on x.id=m.contribution_id where m.campaign_id=c and private.f3_measurement_visible(m) and x.status='verified' and x.revision=m.contribution_revision and private.f3_participant_valid(o,c,x.participant_id) and (team or private.f3_own(o,c,x.participant_id))));
end$$;
create or replace function public.f3_report_revision(p_organization_id uuid,p_campaign_id uuid,p_report_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare snapshot jsonb;begin
 if not private.f3_role(p_organization_id,p_campaign_id,array['editor','reviewer','reader']) then raise exception 'f3_not_available' using errcode='42501';end if;
 select r.snapshot into snapshot from private.campaign_report_revisions r where r.id=p_report_id and r.organization_id=p_organization_id and r.campaign_id=p_campaign_id;
 if snapshot is null or exists(select 1 from jsonb_array_elements(snapshot->'participants') a where (a->>'valid')::boolean and not private.f3_participant_valid(p_organization_id,p_campaign_id,(a->>'id')::uuid))
 or exists(select 1 from jsonb_array_elements(snapshot->'posts') x where not exists(select 1 from private.campaign_contributions p where p.id=(x->>'id')::uuid and p.revision=(x->>'revision')::integer and p.status=x->>'status' and p.availability=x->>'availability'))
 or exists(select 1 from jsonb_array_elements(snapshot->'measurements') m join private.campaign_measurements source on source.id=(m->>'id')::uuid where not private.f3_measurement_visible(source))
 then raise exception 'f3_report_access_changed' using errcode='42501';end if;
 return snapshot;
end$$;
revoke all on function private.f3_active(uuid,uuid),private.f3_role(uuid,uuid,text[]),private.f3_participant_valid(uuid,uuid,uuid),private.f3_own(uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- Server-mediated source RPCs follow.
create function public.f3_twitch_begin(p_organization_id uuid,p_campaign_id uuid,p_source_id uuid,p_contribution_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s private.campaign_sources;p private.campaign_contributions;a public.social_accounts;k private.social_account_credentials;r private.campaign_source_runs;used integer;begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'f3_isolation_required';end if;
 perform 1 from auth.users where id=auth.uid() for share;
 perform 1 from auth.sessions where user_id=auth.uid() and id::text=auth.jwt()->>'session_id' for share;
 perform private.f1_lock();
 if not private.f3_role(p_organization_id,p_campaign_id,array['editor']) or p_request_id is null then raise exception 'f3_not_authorized' using errcode='42501';end if;
 select * into s from private.campaign_sources where id=p_source_id and organization_id=p_organization_id and campaign_id=p_campaign_id for update;
 select * into p from private.campaign_contributions where id=p_contribution_id and campaign_id=p_campaign_id and organization_id=p_organization_id for share;
 if s.id is null or p.id is null or not private.f3_source_valid(s.id) or p.participant_id<>s.participant_id or p.platform<>'twitch' or p.status<>'verified' or p.availability<>'available' then raise exception 'f3_source_binding_required' using errcode='42501';end if;
 select * into r from private.campaign_source_runs where organization_id=p_organization_id and actor=auth.uid() and request_id=p_request_id;
 if found then
  if r.source_id<>s.id or r.contribution_id<>p.id or r.contribution_revision<>p.revision then raise exception 'f3_request_conflict' using errcode='40001';end if;
  return jsonb_build_object('id',r.id,'status',r.status); -- never refetch a request replay
 end if;
 if exists(select 1 from private.campaign_source_runs where source_id=s.id and created_at>clock_timestamp()-interval '1 minute') then raise exception 'f3_source_rate_limited';end if;
 if (select count(*)*3+3 from private.campaign_source_runs where source_id=s.id and created_at>date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC')>s.daily_limit then raise exception 'f3_source_daily_limit';end if;
 select * into a from public.social_accounts where id=s.account_id for update;
 select * into k from private.social_account_credentials where social_account_id=a.id for share;
 if k.social_account_id is null then raise exception 'f3_source_credentials_required';end if;
 used:=case when a.quota_counter_date=(clock_timestamp() at time zone 'UTC')::date then a.quota_used_estimate else 0 end;
 if used+3>a.quota_daily_limit then raise exception 'f3_source_daily_limit';end if;
 update public.social_accounts set quota_used_estimate=used+3,quota_counter_date=(clock_timestamp() at time zone 'UTC')::date where id=a.id;
 insert into private.campaign_source_runs(organization_id,campaign_id,source_id,contribution_id,contribution_revision,actor,session_id,request_id,credential_version)
 values(p_organization_id,p_campaign_id,s.id,p.id,p.revision,auth.uid(),(auth.jwt()->>'session_id')::uuid,p_request_id,k.updated_at) returning * into r;
 return jsonb_build_object('id',r.id,'status','new','account_id',s.account_id,'broadcaster_id',s.broadcaster_id,'external_id',p.external_id);
end$$;

create function public.f3_twitch_finish(p_run_id uuid,p_sample jsonb default null,p_error text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.campaign_source_runs;s private.campaign_sources;p private.campaign_contributions;k private.social_account_credentials;pol private.campaign_policies;
 result uuid;kind text;metric text;definition text;semantics text;prior_sub text;prior_role text;prior_claims text;begin
 -- Only the server may attest official data. Original actor/session come solely
 -- from the reservation, never from a client-supplied user id or user_metadata.
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'f3_isolation_required';end if;
 if auth.role()<>'service_role' then raise exception 'f3_server_required' using errcode='42501';end if;
 select * into r from private.campaign_source_runs where id=p_run_id;
 if r.id is null then raise exception 'f3_not_available' using errcode='42501';end if;
 perform 1 from auth.users where id=r.actor for share;
 perform 1 from auth.sessions where user_id=r.actor and id=r.session_id for share;
 perform private.f1_lock();
 select * into r from private.campaign_source_runs where id=p_run_id for update;
 prior_sub:=current_setting('request.jwt.claim.sub',true);prior_role:=current_setting('request.jwt.claim.role',true);prior_claims:=current_setting('request.jwt.claims',true);
 perform set_config('request.jwt.claim.sub',r.actor::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',r.actor,'role','authenticated','session_id',r.session_id)::text,true);
 if not private.f3_role(r.organization_id,r.campaign_id,array['editor']) then raise exception 'f3_not_authorized' using errcode='42501';end if;
 select * into s from private.campaign_sources where id=r.source_id for share;
 perform 1 from auth.identities where user_id=(select account_user_id from private.campaign_participants where id=s.participant_id) and provider='twitch' for share;
 perform 1 from public.social_accounts where id=s.account_id for share;
 select * into k from private.social_account_credentials where social_account_id=s.account_id for share;
 select * into p from private.campaign_contributions where id=r.contribution_id for share;
 if not private.f3_source_valid(s.id) or k.updated_at is distinct from r.credential_version or p.revision<>r.contribution_revision or p.status<>'verified' or p.availability<>'available' then raise exception 'f3_source_or_revision_changed' using errcode='42501';end if;
 if r.status<>'pending' then raise exception 'f3_request_finished' using errcode='40001';end if;
 if r.created_at<clock_timestamp()-interval '2 minutes' then raise exception 'f3_source_request_expired';end if;
 if p_error is not null then
  if p_error not in('token_invalid','identity_mismatch','rate_limited','unavailable','invalid_response','network') or p_sample is not null then raise exception 'f3_invalid_input';end if;
  update private.campaign_source_runs set status='failed',error_code=p_error where id=r.id;
  if p_error in('token_invalid','identity_mismatch') then update private.campaign_sources set revoked_at=clock_timestamp() where id=s.id;end if;
 else
  if jsonb_typeof(p_sample)<>'object' or pg_column_size(p_sample)>3000 or exists(select 1 from jsonb_object_keys(p_sample) key where key not in('metric','definition','semantics','value','quality','measured_at','period_start','period_end','source_reference')) then raise exception 'f3_invalid_input';end if;
  kind:=split_part(p.external_id,':',1);metric:=case when kind='channel' then 'current_viewers' else 'views' end;
  definition:=case kind when 'channel' then 'twitch.stream.viewer_count.v1' when 'video' then 'twitch.video.view_count.v1' when 'clip' then 'twitch.clip.view_count.v1' end;
  semantics:=case when kind='channel' then 'instant' else 'cumulative' end;
  if definition is null or p_sample->>'metric' is distinct from metric or p_sample->>'definition' is distinct from definition or p_sample->>'semantics' is distinct from semantics then raise exception 'f3_source_capability_required';end if;
  select x.* into pol from private.campaign_participants q join private.campaign_policies x on x.id=q.policy_id where q.id=p.participant_id;
  if not(metric=any(pol.fields)) or not private.f1_document_visible(r.organization_id,s.document_id) then raise exception 'f3_scope_or_evidence_required';end if;
  if (p_sample->>'measured_at')::timestamptz not between r.created_at-interval '5 seconds' and clock_timestamp()+interval '5 seconds'
   or (p_sample->>'period_end')::timestamptz is distinct from (p_sample->>'measured_at')::timestamptz
   or (p_sample->>'period_start')::timestamptz is distinct from (p_sample->>'measured_at')::timestamptz-interval '1 millisecond'
   or p_sample->>'quality' not in('known','missing') then raise exception 'f3_invalid_time_or_quality';end if;
  insert into private.campaign_measurements(organization_id,campaign_id,contribution_id,contribution_revision,metric,definition,unit,semantics,period_start,period_end,measured_at,value,quality,source_kind,source_reference,source_document_id,source_key,input,created_by,source_binding_id)
   values(r.organization_id,r.campaign_id,p.id,p.revision,metric,definition,'count',semantics,(p_sample->>'period_start')::timestamptz,(p_sample->>'period_end')::timestamptz,(p_sample->>'measured_at')::timestamptz,(p_sample->>'value')::numeric,p_sample->>'quality','official_api',left(p_sample->>'source_reference',500),s.document_id,'twitch:'||r.id::text,p_sample,r.actor,s.id) returning id into result;
  update private.campaign_source_runs set status='succeeded',measurement_id=result where id=r.id;
 end if;
 insert into private.campaign_events(organization_id,campaign_id,actor,operation,entity_id) values(r.organization_id,r.campaign_id,r.actor,case when p_error is null then 'source.collected' else 'source.failed' end,r.id);
 perform set_config('request.jwt.claim.sub',coalesce(prior_sub,''),true);perform set_config('request.jwt.claim.role',coalesce(prior_role,''),true);perform set_config('request.jwt.claims',coalesce(prior_claims,''),true);
 return jsonb_build_object('id',r.id,'measurement_id',result,'status',case when p_error is null then 'succeeded' else 'failed' end);
end$$;
revoke all on function private.f3_source_valid(uuid),private.f3_measurement_visible(private.campaign_measurements) from public,anon,authenticated,service_role;
revoke all on function public.f3_twitch_begin(uuid,uuid,uuid,uuid,uuid),public.f3_twitch_finish(uuid,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.f3_twitch_begin(uuid,uuid,uuid,uuid,uuid) to authenticated;
grant execute on function public.f3_twitch_finish(uuid,jsonb,text) to service_role;
-- Personal entry point: campaign management permission is never a substitute for
-- a current campaign assignment or an explicitly bound own participation.
create function public.f3_my_campaigns(p_organization_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.f2_account(p_organization_id) then raise exception 'f3_not_available' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'title',c.title,'synthetic',p.synthetic) order by c.title,c.id),'[]') into result
 from private.campaign_pilots p join public.campaigns c on c.id=p.campaign_id and c.organization_id=p.organization_id
 where p.organization_id=p_organization_id and private.f3_active(p_organization_id,c.id)
 and (private.f3_role(p_organization_id,c.id,array['editor','reviewer','reader']) or exists(select 1 from private.campaign_participants a where a.campaign_id=c.id and private.f3_own(p_organization_id,c.id,a.id)));
 if jsonb_array_length(result)>200 then raise exception 'f3_capacity_exceeded';end if;
 return result;
end $$;
revoke all on function public.f3_my_campaigns(uuid) from public,anon,service_role;
grant execute on function public.f3_my_campaigns(uuid) to authenticated;
commit;
