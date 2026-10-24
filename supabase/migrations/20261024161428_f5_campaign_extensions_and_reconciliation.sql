begin;
-- Additive F5 build only: no seed, scope grants to clients, rewards or live activation.
create table private.campaign_ingress_receipts(
 organization_id uuid not null, namespace text not null, event_key text not null,
 actor uuid not null, payload jsonb not null, result jsonb not null,
 created_at timestamptz not null default clock_timestamp(), primary key(organization_id,namespace,event_key)
);
create table private.campaign_source_references(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,campaign_id uuid not null,
 source_id uuid not null references private.campaign_sources(id),participant_id uuid not null,
 reference_id text not null,kind text not null check(kind in('clip','video','stream')),
 canonical_url text not null,occurred_at timestamptz not null,contribution_id uuid references private.campaign_contributions(id),
 received_at timestamptz not null default clock_timestamp(),unique(source_id,reference_id),
 foreign key(organization_id,campaign_id,participant_id) references private.campaign_participants(organization_id,campaign_id,id)
);
create table private.campaign_discovery_runs(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,campaign_id uuid not null,
 source_id uuid not null references private.campaign_sources(id),actor uuid not null,session_id uuid not null,
 request_id uuid not null,credential_version timestamptz not null,starts_at timestamptz not null,ends_at timestamptz not null,
 status text not null default 'pending' check(status in('pending','ready','failed','revoked')),
 items jsonb not null default '[]',created_at timestamptz not null default clock_timestamp(),
 unique(organization_id,actor,request_id)
);
create index f5_ingress_actor_time on private.campaign_ingress_receipts(organization_id,actor,created_at);
create index f5_source_reference_time on private.campaign_source_references(source_id,received_at);
create index f5_discovery_source_time on private.campaign_discovery_runs(source_id,created_at);
do $$declare t text;begin foreach t in array array['campaign_ingress_receipts','campaign_source_references','campaign_discovery_runs'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
end loop;end$$;

create function private.f5_participates(o uuid,c uuid,p uuid,u uuid,pilot boolean,real_campaign boolean) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from private.campaign_participants a
 join private.campaign_policies s on s.id=a.policy_id and s.organization_id=a.organization_id and s.campaign_id=a.campaign_id
 join public.community_people person on person.id=a.person_id and person.organization_id=a.organization_id
 join private.campaign_pilots cp on cp.campaign_id=a.campaign_id and cp.organization_id=a.organization_id
 join public.campaigns campaign on campaign.id=cp.campaign_id and campaign.organization_id=cp.organization_id
 where a.organization_id=o and a.campaign_id=c and a.id=p and a.account_user_id=u and person.account_user_id=u and person.deleted_at is null
 and a.accepted_at is not null and a.withdrawn_at is null and a.expires_at>clock_timestamp() and s.withdrawn_at is null and 'post_url'=any(s.fields)
 and cp.closed_at is null and campaign.deleted_at is null
 and ((cp.synthetic and pilot and campaign.title like 'TESTFIXTURE%') or (not cp.synthetic and real_campaign)));
$$;

create function private.f5_submit(o uuid,c uuid,p uuid,u uuid,ns text,k text,platform text,x text,pilot boolean,real_campaign boolean) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
#variable_conflict use_variable
declare prior private.campaign_ingress_receipts;post private.campaign_contributions;payload jsonb;result jsonb;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'f5_isolation_required';end if;
 perform 1 from auth.users where id=u for share;
 perform private.f1_lock();
 if not private.f5_participates(o,c,p,u,pilot,real_campaign) then raise exception 'f5_not_available' using errcode='42501';end if;
 if platform is null or x is null or not ((platform='youtube' and x~'^[A-Za-z0-9_-]{11}$') or (platform='twitch' and x~'^(video:[0-9]{1,30}|clip:[A-Za-z0-9_-]{1,100}|channel:[a-z0-9_]{1,25})$'))
 or ns is null or length(ns)>120 or k is null or length(k) not between 1 and 128 then raise exception 'f5_invalid_fields';end if;
 payload:=jsonb_build_object('campaign',c,'participant',p,'actor',u,'platform',platform,'external_id',x);
 select * into prior from private.campaign_ingress_receipts where organization_id=o and namespace=ns and event_key=k;
 if found then
  if prior.actor<>u or prior.payload<>payload then raise exception 'f5_conflict' using errcode='23505';end if;
  return prior.result||jsonb_build_object('replay',true);
 end if;
 if ns like 'discord:%' and ((k::numeric/4194304+1420070400000)/1000<extract(epoch from clock_timestamp()-interval '15 minutes') or (k::numeric/4194304+1420070400000)/1000>extract(epoch from clock_timestamp()+interval '5 seconds')) then raise exception 'f5_interaction_expired';end if;
 if (select count(*) from private.campaign_ingress_receipts where organization_id=o and actor=u and created_at>clock_timestamp()-interval '1 day')>=500 then raise exception 'f5_daily_limit';end if;
 if exists(select 1 from private.campaign_contributions other_post join private.campaign_participants a on a.id=other_post.participant_id
 where other_post.organization_id=o and other_post.platform=platform and other_post.external_id=x and a.person_id<>(select person_id from private.campaign_participants where id=p)) then raise exception 'f5_creator_conflict';end if;
 select * into post from private.campaign_contributions where campaign_id=c and campaign_contributions.platform=f5_submit.platform and external_id=x;
 if found then
  if post.participant_id<>p then
   update private.campaign_contributions set participant_id=p,revision=revision+1,status='candidate',availability='unknown',reviewed_by=null,review_reason=null,checked_at=null,submitted_by=u,submitted_at=clock_timestamp() where id=post.id returning * into post;
  end if;
 else
  insert into private.campaign_contributions(organization_id,campaign_id,participant_id,platform,external_id,submitted_by)
  values(o,c,p,platform,x,u) returning * into post;
 end if;
 result:=jsonb_build_object('id',post.id,'status',post.status,'replay',false);
 insert into private.campaign_ingress_receipts(organization_id,namespace,event_key,actor,payload,result) values(o,ns,k,u,payload,result);
 insert into private.campaign_events(organization_id,campaign_id,actor,operation,entity_id)
 values(o,c,u,'post.submit',post.id);
 return result;
end$$;
create function private.f5_bot_submit(o uuid,g text,d text,u uuid,c uuid,p uuid,k text,platform text,x text,pilot boolean,real_campaign boolean) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
begin
 if current_setting('role',true)<>'service_role' then raise exception 'f5_forbidden' using errcode='42501';end if;
 if g is null or g !~ '^[1-9][0-9]{16,19}$' or k is null or k !~ '^[1-9][0-9]{16,19}$' then raise exception 'f5_invalid_fields';end if;
 perform 1 from auth.users where id=u for share;perform private.f1_lock();
 perform 1 from auth.identities where user_id=u and provider='discord' for share;
 if not private.f5_discord_actor(o,d,u) then raise exception 'f5_account_unavailable' using errcode='42501';end if;
 if p is null then select case when count(*)=1 then (array_agg(a.id))[1] else null end into p from private.campaign_participants a where a.organization_id=o and a.campaign_id=c and private.f5_participates(o,c,a.id,u,pilot,real_campaign);end if;
 return private.f5_submit(o,c,p,u,'discord:'||g,k,platform,x,pilot,real_campaign);
end$$;
create function public.f5_bot_submit(p_org uuid,p_guild text,p_discord text,p_user uuid,p_campaign uuid,p_participant uuid,p_key text,p_platform text,p_external text,p_pilot boolean,p_real boolean) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$begin
 if current_user<>'service_role' then raise exception 'f5_forbidden' using errcode='42501';end if;
 return private.f5_bot_submit(p_org,p_guild,p_discord,p_user,p_campaign,p_participant,p_key,p_platform,p_external,p_pilot,p_real);
end$$;

-- Machine sources use general internal source evidence only. Restricted governance/
-- finance evidence requires its human workflow; this helper never impersonates it.
create function private.f5_source_actor(s uuid) returns uuid
language sql volatile security definer set search_path='' as $$
 select case when count(*)=1 then (array_agg(p.account_user_id))[1] else null end
 from private.campaign_sources b join private.campaign_participants p on p.id=b.participant_id and p.organization_id=b.organization_id and p.campaign_id=b.campaign_id
 join public.social_accounts a on a.id=b.account_id and a.organization_id=b.organization_id
 join auth.identities i on i.user_id=p.account_user_id and i.provider='twitch' and i.provider_id=b.broadcaster_id
 join auth.users u on u.id=p.account_user_id join public.organization_members m on m.user_id=u.id and m.organization_id=b.organization_id
 join public.document_registry doc on doc.id=b.document_id and doc.organization_id=b.organization_id
 where b.id=s and b.revoked_at is null and a.status='connected' and a.deleted_at is null and a.platform='twitch' and a.external_account_id=b.broadcaster_id
 and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp())
 and m.status='active' and m.role in('admin','board','member','volunteer') and not doc.restricted_finance and not doc.restricted_governance
 and jsonb_typeof(i.identity_data)='object' and jsonb_typeof(i.identity_data->'sub')='string' and i.identity_data->>'sub'=b.broadcaster_id
 and (not i.identity_data ? 'provider_id' or (jsonb_typeof(i.identity_data->'provider_id')='string' and i.identity_data->>'provider_id'=b.broadcaster_id))
 and private.f5_participates(b.organization_id,b.campaign_id,b.participant_id,p.account_user_id,false,true);
$$;

create function private.f5_receive_reference(o uuid,s uuid,broadcaster text,d jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare src private.campaign_sources;u uuid;initial_user uuid;r private.campaign_source_references;kind text;ref text;x text;url text;contribution uuid;result jsonb;
begin
 if current_setting('role',true)<>'service_role' then raise exception 'f5_forbidden' using errcode='42501';end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'f5_isolation_required';end if;
 select p.account_user_id into initial_user from private.campaign_sources s0 join private.campaign_participants p on p.id=s0.participant_id where s0.id=s and s0.organization_id=o;
 perform 1 from auth.users where id=initial_user for share;
 perform 1 from auth.identities where user_id=initial_user and provider='twitch' for share;
 perform private.f1_lock();
 select * into src from private.campaign_sources where id=s and organization_id=o for update;
 u:=private.f5_source_actor(s);
 if src.id is null or u is null or u is distinct from initial_user or src.broadcaster_id is distinct from broadcaster then raise exception 'f5_source_unavailable' using errcode='42501';end if;
 if d is null or jsonb_typeof(d)<>'object' or pg_column_size(d)>4096 or not d?&array['schemaVersion','kind','reference_id','canonical_url','occurred_at'] or d-array['schemaVersion','kind','reference_id','canonical_url','occurred_at']<>'{}'::jsonb or d->'schemaVersion'<>'1'::jsonb then raise exception 'f5_invalid_fields';end if;
 kind:=d->>'kind';ref:=d->>'reference_id';url:=d->>'canonical_url';
 if kind='clip' and ref~'^clip:[A-Za-z0-9_-]{1,100}$' then x:=ref;
  if url is distinct from 'https://clips.twitch.tv/'||substr(ref,6) then raise exception 'f5_invalid_fields';end if;
 elsif kind='video' and ref~'^video:[0-9]{1,30}$' then x:=ref;
  if url is distinct from 'https://www.twitch.tv/videos/'||substr(ref,7) then raise exception 'f5_invalid_fields';end if;
 elsif kind='stream' and ref~'^stream:[0-9]{1,30}$' and url~'^https://www[.]twitch[.]tv/[a-z0-9_]{1,25}$' then x:=null;
 else raise exception 'f5_invalid_fields';end if;
 select * into r from private.campaign_source_references where source_id=s and reference_id=ref;
 if found then
  if r.canonical_url<>url or r.kind<>kind then raise exception 'f5_conflict' using errcode='23505';end if;
  return jsonb_build_object('receiptId',r.id,'accepted',true,'providerVerified',false,'awarded',false,'replay',true);
 end if;
 if d->>'occurred_at' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$' or (d->>'occurred_at')::timestamptz<clock_timestamp()-interval '7 days' or (d->>'occurred_at')::timestamptz>clock_timestamp()+interval '5 seconds' then raise exception 'f5_invalid_time';end if;
 if (select count(*) from private.campaign_source_references where source_id=s and received_at>clock_timestamp()-interval '1 day')>=500 then raise exception 'f5_daily_limit';end if;
 if x is not null then result:=private.f5_submit(o,src.campaign_id,src.participant_id,u,'reference:'||s::text,ref,'twitch',x,false,true);contribution:=(result->>'id')::uuid;end if;
 insert into private.campaign_source_references(organization_id,campaign_id,source_id,participant_id,reference_id,kind,canonical_url,occurred_at,contribution_id)
 values(o,src.campaign_id,s,src.participant_id,ref,kind,url,(d->>'occurred_at')::timestamptz,contribution) returning * into r;
 return jsonb_build_object('receiptId',r.id,'accepted',true,'providerVerified',false,'awarded',false,'replay',false);
end$$;
create function public.f5_receive_reference(p_org uuid,p_source uuid,p_broadcaster text,p_data jsonb) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$begin
 if current_user<>'service_role' then raise exception 'f5_forbidden' using errcode='42501';end if;
 return private.f5_receive_reference(p_org,p_source,p_broadcaster,p_data);
end$$;

create function public.f5_source_references(p_org uuid,p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$begin
 if not private.f2_account(p_org) or not private.f3_active(p_org,p_campaign) then raise exception 'f5_not_available' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'url',r.canonical_url,'occurred_at',r.occurred_at,'providerVerified',false) order by r.received_at desc,r.id),'[]') from
 (select x.* from private.campaign_source_references x where x.organization_id=p_org and x.campaign_id=p_campaign and private.f5_source_actor(x.source_id) is not null
 and (private.f3_own(p_org,p_campaign,x.participant_id) or private.f3_role(p_org,p_campaign,array['editor','reviewer','reader'])) order by x.received_at desc,x.id limit 50)r);
end$$;

create or replace function public.f3_twitch_begin(p_organization_id uuid,p_campaign_id uuid,p_source_id uuid,p_contribution_id uuid,p_request_id uuid) returns jsonb
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
 if exists(select 1 from private.campaign_source_runs where source_id=s.id and created_at>clock_timestamp()-interval '1 minute') or exists(select 1 from private.campaign_discovery_runs where source_id=s.id and created_at>clock_timestamp()-interval '1 minute') then raise exception 'f3_source_rate_limited';end if;
 if (select count(*)*3+3 from private.campaign_source_runs where source_id=s.id and created_at>date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC')+(select count(*)*4 from private.campaign_discovery_runs where source_id=s.id and created_at>date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC')>s.daily_limit then raise exception 'f3_source_daily_limit';end if;
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


-- Discovery reserves four HTTP attempts (two token checks + two bounded lists).
create function public.f5_discovery_begin(p_org uuid,p_campaign uuid,p_source uuid,p_request uuid,p_start timestamptz,p_end timestamptz) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare s private.campaign_sources;a public.social_accounts;creds private.social_account_credentials;r private.campaign_discovery_runs;used integer;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'f5_isolation_required';end if;
 perform 1 from auth.users where id=auth.uid() for share;perform private.f1_lock();
 if not private.f3_role(p_org,p_campaign,array['editor']) or p_request is null or p_start is null or p_end is null or p_end<=p_start or p_end>clock_timestamp()+interval '5 seconds' or p_end-p_start>interval '31 days' then raise exception 'f5_not_available' using errcode='42501';end if;
 select * into s from private.campaign_sources where id=p_source and organization_id=p_org and campaign_id=p_campaign for update;
 if s.id is null or private.f5_source_actor(s.id) is null or not private.f3_source_valid(s.id) then raise exception 'f5_source_unavailable' using errcode='42501';end if;
 select * into r from private.campaign_discovery_runs where organization_id=p_org and actor=auth.uid() and request_id=p_request;
 if found then
  if r.source_id<>s.id or r.starts_at<>p_start or r.ends_at<>p_end then raise exception 'f5_conflict' using errcode='23505';end if;
  return jsonb_build_object('id',r.id,'status',r.status);
 end if;
 if exists(select 1 from private.campaign_discovery_runs where source_id=s.id and created_at>clock_timestamp()-interval '1 minute') or exists(select 1 from private.campaign_source_runs where source_id=s.id and created_at>clock_timestamp()-interval '1 minute') then raise exception 'f5_rate_limited';end if;
 if (select count(*)*4+4 from private.campaign_discovery_runs where source_id=s.id and created_at>(date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC'))+(select count(*)*3 from private.campaign_source_runs where source_id=s.id and created_at>(date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC'))>s.daily_limit then raise exception 'f5_daily_limit';end if;
 select * into a from public.social_accounts where id=s.account_id for update;
 select * into creds from private.social_account_credentials where social_account_id=a.id for share;
 used:=case when a.quota_counter_date=(clock_timestamp() at time zone 'UTC')::date then a.quota_used_estimate else 0 end;
 if creds.social_account_id is null or used+4>a.quota_daily_limit then raise exception 'f5_daily_limit';end if;
 update public.social_accounts set quota_counter_date=(clock_timestamp() at time zone 'UTC')::date,quota_used_estimate=used+4 where id=a.id;
 insert into private.campaign_discovery_runs(organization_id,campaign_id,source_id,actor,session_id,request_id,credential_version,starts_at,ends_at)
 values(p_org,p_campaign,s.id,auth.uid(),(auth.jwt()->>'session_id')::uuid,p_request,creds.updated_at,p_start,p_end) returning * into r;
 return jsonb_build_object('id',r.id,'status','new','account_id',a.id,'broadcaster_id',s.broadcaster_id);
end$$;

create function private.f5_discovery_finish(i uuid,items jsonb,err text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare r private.campaign_discovery_runs;s private.campaign_sources;k private.social_account_credentials;item jsonb;
begin
 if current_setting('role',true)<>'service_role' then raise exception 'f5_forbidden' using errcode='42501';end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'f5_isolation_required';end if;
 select * into r from private.campaign_discovery_runs where id=i;
 perform 1 from auth.users where id=r.actor for share;perform private.f1_lock();
 select * into r from private.campaign_discovery_runs where id=i for update;
 if r.id is null or r.status<>'pending' then raise exception 'f5_run_unavailable';end if;
 select * into s from private.campaign_sources where id=r.source_id for share;
 select * into k from private.social_account_credentials where social_account_id=s.account_id for share;
 if private.f5_source_actor(s.id) is null or k.updated_at is distinct from r.credential_version or r.created_at<clock_timestamp()-interval '1 minute'
 or not exists(select 1 from auth.sessions where id=r.session_id and user_id=r.actor)
 or not exists(select 1 from auth.users where id=r.actor and email_confirmed_at is not null and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp()))
 or not exists(select 1 from public.organization_members where organization_id=r.organization_id and user_id=r.actor and status='active')
 or not exists(select 1 from private.campaign_access where campaign_id=r.campaign_id and organization_id=r.organization_id and user_id=r.actor and role='editor' and revoked_at is null and valid_until>clock_timestamp()) then
  update private.campaign_discovery_runs set status='revoked' where id=i;return jsonb_build_object('status','revoked');
 end if;
 if err is not null then update private.campaign_discovery_runs set status='failed' where id=i;return jsonb_build_object('status','failed');end if;
 if items is null or jsonb_typeof(items)<>'array' or jsonb_array_length(items)>20 or pg_column_size(items)>24000 then raise exception 'f5_invalid_fields';end if;
 for item in select value from jsonb_array_elements(items) loop
  if jsonb_typeof(item)<>'object' or not item?&array['external_id','url','title','kind'] or item-array['external_id','url','title','kind']<>'{}'::jsonb or jsonb_typeof(item->'title')<>'string' or length(item->>'title')>160 then raise exception 'f5_invalid_fields';end if;
  if not ((item->>'kind'='clip' and item->>'external_id'~'^clip:[A-Za-z0-9_-]{1,100}$' and item->>'url'='https://clips.twitch.tv/'||substr(item->>'external_id',6)) or (item->>'kind'='video' and item->>'external_id'~'^video:[0-9]{1,30}$' and item->>'url'='https://www.twitch.tv/videos/'||substr(item->>'external_id',7))) then raise exception 'f5_invalid_fields';end if;
 end loop;
 if (select count(distinct value->>'external_id') from jsonb_array_elements(items))<>jsonb_array_length(items) then raise exception 'f5_invalid_fields';end if;
 update private.campaign_discovery_runs set status='ready',items=f5_discovery_finish.items where id=i;
 return jsonb_build_object('status','ready');
end$$;
create function public.f5_discovery_finish(p_run uuid,p_items jsonb,p_error text) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$begin
 if current_user<>'service_role' then raise exception 'f5_forbidden' using errcode='42501';end if;
 return private.f5_discovery_finish(p_run,p_items,p_error);
end$$;

create function public.f5_discovery_state(p_org uuid,p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$begin
 if not private.f3_role(p_org,p_campaign,array['editor']) then raise exception 'f5_not_available' using errcode='42501';end if;
 return jsonb_build_object('sources',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'broadcaster',s.broadcaster_id)),'[]') from private.campaign_sources s where s.organization_id=p_org and s.campaign_id=p_campaign and private.f5_source_actor(s.id) is not null and private.f3_source_valid(s.id)),
 'runs',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'status',r.status,'items',r.items,'limited',true) order by r.created_at desc),'[]') from (select * from private.campaign_discovery_runs r0 where r0.organization_id=p_org and r0.campaign_id=p_campaign and r0.actor=auth.uid() and private.f5_source_actor(r0.source_id) is not null and private.f3_source_valid(r0.source_id) order by r0.created_at desc limit 5)r));
end$$;
create function public.f5_discovery_submit(p_org uuid,p_run uuid,p_index integer,p_request uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare r private.campaign_discovery_runs;s private.campaign_sources;item jsonb;
begin
 perform 1 from auth.users where id=auth.uid() for share;perform private.f1_lock();
 select * into r from private.campaign_discovery_runs where id=p_run and organization_id=p_org and actor=auth.uid() for share;
 select * into s from private.campaign_sources where id=r.source_id for share;
 if r.id is null or r.status<>'ready' or not private.f3_role(p_org,r.campaign_id,array['editor']) or private.f5_source_actor(s.id) is null or not private.f3_source_valid(s.id) or p_index is null or p_index<0 or p_index>=jsonb_array_length(r.items) then raise exception 'f5_not_available' using errcode='42501';end if;
 item:=r.items->p_index;
 return public.f3_workflow(p_org,r.campaign_id,'post.submit',jsonb_build_object('participant_id',s.participant_id,'platform','twitch','external_id',item->>'external_id'),p_request);
end$$;

create function public.f5_reward_snapshot(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare accounts jsonb;material text;ledger text;n bigint;
begin
 if not private.f2_account(p_org) or not private.rewards_staff(p_org,auth.uid()) then raise exception 'f5_not_available' using errcode='42501';end if;
 if (select count(*) from public.reward_accounts where organization_id=p_org)>5000 or (select count(*) from public.reward_ledger where organization_id=p_org)>100000 then raise exception 'f5_snapshot_capacity';end if;
 select coalesce(jsonb_agg(jsonb_build_object('userId',user_id,'xp',xp::text,'bucks',bucks::text,'reserved',reserved::text) order by user_id),'[]'),
 coalesce(string_agg(user_id::text||'|'||xp::text||'|'||bucks::text||'|'||reserved::text,E'\n' order by user_id),'') into accounts,material from public.reward_accounts where organization_id=p_org;
 select count(*),coalesce(string_agg(id::text||'|'||xp_delta::text||'|'||bucks_delta::text||'|'||reserved_delta::text,E'\n' order by id),'') into n,ledger from public.reward_ledger where organization_id=p_org;
 return jsonb_build_object('schemaVersion',1,'source','BESC_CC','organizationId',p_org,'capturedAt',to_char(statement_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
 'accounts',accounts,'accountsDigest',encode(sha256(convert_to(material,'UTF8')),'hex'),'ledgerCount',n,'ledgerDigest',encode(sha256(convert_to(ledger,'UTF8')),'hex'),'mode','comparison_only');
end$$;

-- Explicit function grants under the same exposed-schema defaults as earlier releases.
revoke all on function private.f5_participates(uuid,uuid,uuid,uuid,boolean,boolean),private.f5_submit(uuid,uuid,uuid,uuid,text,text,text,text,boolean,boolean),private.f5_source_actor(uuid) from public,anon,authenticated,service_role;
revoke all on function private.f5_bot_submit(uuid,text,text,uuid,uuid,uuid,text,text,text,boolean,boolean),private.f5_receive_reference(uuid,uuid,text,jsonb),private.f5_discovery_finish(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function private.f5_bot_submit(uuid,text,text,uuid,uuid,uuid,text,text,text,boolean,boolean),private.f5_receive_reference(uuid,uuid,text,jsonb),private.f5_discovery_finish(uuid,jsonb,text) to service_role;
revoke all on function public.f5_bot_submit(uuid,text,text,uuid,uuid,uuid,text,text,text,boolean,boolean),public.f5_receive_reference(uuid,uuid,text,jsonb),public.f5_discovery_finish(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.f5_bot_submit(uuid,text,text,uuid,uuid,uuid,text,text,text,boolean,boolean),public.f5_receive_reference(uuid,uuid,text,jsonb),public.f5_discovery_finish(uuid,jsonb,text) to service_role;
revoke all on function public.f5_discovery_begin(uuid,uuid,uuid,uuid,timestamptz,timestamptz),public.f5_discovery_state(uuid,uuid),public.f5_discovery_submit(uuid,uuid,integer,uuid),public.f5_source_references(uuid,uuid),public.f5_reward_snapshot(uuid) from public,anon,service_role;
grant execute on function public.f5_discovery_begin(uuid,uuid,uuid,uuid,timestamptz,timestamptz),public.f5_discovery_state(uuid,uuid),public.f5_discovery_submit(uuid,uuid,integer,uuid),public.f5_source_references(uuid,uuid),public.f5_reward_snapshot(uuid) to authenticated;
commit;

