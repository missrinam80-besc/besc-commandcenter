begin;
-- Local-only BO04 preparation. No publication, audience, role or setting is seeded.
create table private.event_discord_settings(
 organization_id uuid primary key references public.organizations(id),
 guild_id text not null check(guild_id~'^[1-9][0-9]{16,19}$'),
 client_id text not null,enabled boolean not null default false,rsvp_enabled boolean not null default false,
 version bigint not null default 1,updated_at timestamptz not null default now()
);
create table private.event_discord_publications(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 event_id uuid not null,guild_id text not null,enabled boolean not null default false,rsvp_enabled boolean not null default false,
 public_title text not null,public_description text not null,public_location text not null,
 revision bigint not null default 0,desired jsonb,discord_event_id text,
 sync_state text not null default 'idle',last_error text,interest_observed_at timestamptz,
 created_by uuid not null,updated_at timestamptz not null default now(),
 unique(organization_id,event_id),unique(guild_id,discord_event_id)
);
create table private.event_discord_jobs(
 id uuid primary key default gen_random_uuid(),publication_id uuid not null references private.event_discord_publications(id),
 organization_id uuid not null,event_id uuid not null,guild_id text not null,revision bigint not null,
 operation text not null check(operation in('upsert','withdraw','complete')),payload jsonb,
 rendered boolean not null default false,discord_event_id text,result_discord_event_id text,
 state text not null default 'pending' check(state in('pending','leased','dispatching','done','cancelled','failed','uncertain')),
 client_id text,worker_id text,lease_token uuid,lease_until timestamptz,last_error text,
 created_at timestamptz not null default now(),unique(publication_id,revision)
);
create index event_discord_jobs_claim on private.event_discord_jobs(organization_id,guild_id,created_at) where state='pending';
create index event_discord_jobs_publication on private.event_discord_jobs(publication_id,state);
create table private.event_presence(
 publication_id uuid not null references private.event_discord_publications(id),user_id uuid not null references public.profiles(id) on delete cascade,
 status text not null check(status in('coming','withdrawn')),audience text not null default 'visitor' check(audience in('crew','participant','volunteer','visitor')),
 attended_at timestamptz,checked_by uuid,version bigint not null default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),primary key(publication_id,user_id)
);
create table private.event_discord_interest(
 publication_id uuid not null references private.event_discord_publications(id),discord_user_id text not null check(discord_user_id~'^[1-9][0-9]{16,19}$'),
 interested boolean not null,observed_at timestamptz not null,primary key(publication_id,discord_user_id)
);
create index event_presence_account on private.event_presence(user_id);
do $$declare t text;begin foreach t in array array['event_discord_settings','event_discord_publications','event_discord_jobs','event_presence','event_discord_interest'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
end loop;end$$;

create function private.event_public_text(t text,max_length integer) returns boolean language sql immutable set search_path='' as $$
 select t is not null and char_length(btrim(t)) between 1 and max_length
 and regexp_replace(t,E'[\n\r\t]','','g')!~'[[:cntrl:]]' and t!~*'@everyone|@here|<@[!&]?[0-9]+>'
$$;
create function private.event_actor_lock() returns void language plpgsql security definer set search_path='' as $$begin
 if not private.f4_identity() then raise exception 'event_actor_unavailable' using errcode='42501';end if;
 perform 1 from auth.users where id=auth.uid() for share;
 perform 1 from auth.sessions where user_id=auth.uid() and id::text=auth.jwt()->>'session_id' for share;
 if not private.f4_identity() then raise exception 'event_actor_unavailable' using errcode='42501';end if;
end$$;
create function private.event_source_shareable(o uuid,eid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.document_registry_sources r join public.document_registry d on d.id=r.document_id and d.organization_id=r.organization_id where r.organization_id=o and r.table_name='events' and r.record_id=eid and(d.restricted_governance or d.restricted_finance))
$$;
create function private.event_public_open(i uuid,for_rsvp boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.event_discord_publications p join private.event_discord_settings s on s.organization_id=p.organization_id and s.guild_id=p.guild_id
 join public.events e on e.id=p.event_id and e.organization_id=p.organization_id
 where p.id=i and p.enabled and s.enabled and (not for_rsvp or(p.rsvp_enabled and s.rsvp_enabled))
 and e.deleted_at is null and e.status in('confirmed','production','live') and e.start_at is not null and e.end_at>clock_timestamp()
 and e.title!~*'test[[:space:]_-]*fixture' and private.event_source_shareable(p.organization_id,p.event_id))
$$;
create function private.event_discord_refresh(o uuid,eid uuid,force_revision boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare p private.event_discord_publications;s private.event_discord_settings;e public.events;wanted jsonb;op text;payload jsonb;has_effect boolean;new_revision bigint;
begin
 select * into p from private.event_discord_publications where organization_id=o and event_id=eid for update;if not found then return;end if;
 select * into s from private.event_discord_settings where organization_id=o;
 select * into e from public.events where organization_id=o and id=eid;
 select p.discord_event_id is not null or exists(select 1 from private.event_discord_jobs where publication_id=p.id and state in('dispatching','uncertain')) into has_effect;
 if not private.event_source_shareable(o,eid) or not coalesce(s.enabled,false) or not p.enabled or e.id is null or e.deleted_at is not null or e.title~*'test[[:space:]_-]*fixture' or e.status in('idea','planning','cancelled','archived') then
  op:=case when has_effect then 'withdraw' else 'none' end;
 elsif e.status in('aftercare','completed') or(e.end_at is not null and e.end_at<=clock_timestamp()) then
  op:=case when has_effect then 'complete' else 'none' end;
 elsif e.status in('confirmed','production') and e.start_at>clock_timestamp() and e.end_at>e.start_at then
  op:='upsert';payload:=jsonb_build_object('name',p.public_title,'description',p.public_description,'scheduled_start_time',e.start_at,'scheduled_end_time',e.end_at,'privacy_level',2,'entity_type',3,'channel_id',null,'entity_metadata',jsonb_build_object('location',p.public_location));
 else op:='none';end if;
 wanted:=jsonb_build_object('operation',op,'payload',payload);
 if not force_revision and p.desired is not distinct from wanted then return;end if;
 new_revision:=p.revision+1;
 update private.event_discord_jobs set state='cancelled' where publication_id=p.id and state in('pending','leased');
 update private.event_discord_publications set revision=new_revision,desired=wanted,updated_at=clock_timestamp(),
 sync_state=case when exists(select 1 from private.event_discord_jobs where publication_id=p.id and state in('dispatching','uncertain')) then 'uncertain' when op='none' then case when p.discord_event_id is null then 'idle' else 'synced' end else 'pending' end,
 last_error=case when exists(select 1 from private.event_discord_jobs where publication_id=p.id and state in('dispatching','uncertain')) then 'reconciliation_required' else null end where id=p.id;
 if op<>'none' then insert into private.event_discord_jobs(publication_id,organization_id,event_id,guild_id,revision,operation,payload) values(p.id,o,eid,p.guild_id,new_revision,op,payload);end if;
end$$;
create function private.event_discord_source_changed() returns trigger language plpgsql security definer set search_path='' as $$begin
 perform private.event_discord_refresh(coalesce(new.organization_id,old.organization_id),coalesce(new.id,old.id));return coalesce(new,old);
end$$;
create trigger event_discord_source_changed after update or delete on public.events for each row execute function private.event_discord_source_changed();

create function public.event_discord_manage(o uuid,eid uuid,op text,d jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.event_discord_settings;p private.event_discord_publications;e public.events;b public.discord_bot_servers;v bigint;uid uuid;people jsonb;settings jsonb;publication jsonb;targets jsonb;x record;
begin
 perform private.f1_lock();perform private.event_actor_lock();
 if not private.can_manage_events(o) or(eid is not null and not private.f1_source_visible(o,'events',eid)) then raise exception 'event_manager_required' using errcode='42501';end if;
 select * into s from private.event_discord_settings where organization_id=o for update;
 if not exists(select 1 from public.events where organization_id=o and id=eid and deleted_at is null)then raise exception 'event_unavailable' using errcode='42501';end if;
 if op='configure' then
  if not private.can_manage_discord_bot(o) then raise exception 'event_bot_manager_required' using errcode='42501';end if;
  if coalesce((d->>'expected_version')::bigint,-1)<>coalesce(s.version,0) then raise exception 'event_revision_conflict' using errcode='40001';end if;
  select * into b from public.discord_bot_servers where organization_id=o and guild_id=d->>'guild_id' and client_id is not null and application_id is not null for share;
  if not found then raise exception 'event_server_unavailable' using errcode='42501';end if;
  if s.guild_id is distinct from b.guild_id and exists(select 1 from private.event_discord_publications where organization_id=o) then raise exception 'event_server_binding_in_use' using errcode='23514';end if;
  if jsonb_typeof(d->'enabled') is distinct from 'boolean' or jsonb_typeof(d->'rsvp_enabled') is distinct from 'boolean' then raise exception 'event_invalid_fields' using errcode='22023';end if;
  insert into private.event_discord_settings(organization_id,guild_id,client_id,enabled,rsvp_enabled,version) values(o,b.guild_id,b.client_id,(d->>'enabled')::boolean,(d->>'rsvp_enabled')::boolean,coalesce(s.version,0)+1)
  on conflict(organization_id) do update set guild_id=excluded.guild_id,client_id=excluded.client_id,enabled=excluded.enabled,rsvp_enabled=excluded.rsvp_enabled,version=excluded.version,updated_at=clock_timestamp();
  for x in select event_id from private.event_discord_publications where organization_id=o loop perform private.event_discord_refresh(o,x.event_id);end loop;
  insert into public.audit_log(organization_id,entity_type,entity_id,action,actor_id,metadata) values(o,'events',eid,'updated',auth.uid(),jsonb_build_object('operation','event.discord.configure'));
  return jsonb_build_object('ok',true);
 end if;
 select * into e from public.events where organization_id=o and id=eid and deleted_at is null for update;
 if not found then raise exception 'event_unavailable' using errcode='42501';end if;
 select * into p from private.event_discord_publications where organization_id=o and event_id=eid for update;
 if op='save' then
  if s.organization_id is null then raise exception 'event_discord_not_configured' using errcode='42501';end if;
  if coalesce((d->>'expected_revision')::bigint,-1)<>coalesce(p.revision,0) then raise exception 'event_revision_conflict' using errcode='40001';end if;
  if not private.event_public_text(d->>'public_title',100) or not private.event_public_text(d->>'public_description',700) or not private.event_public_text(d->>'public_location',100)
   or jsonb_typeof(d->'enabled') is distinct from 'boolean' or jsonb_typeof(d->'rsvp_enabled') is distinct from 'boolean' then raise exception 'event_invalid_fields' using errcode='22023';end if;
  if (d->>'enabled')::boolean and(not private.event_source_shareable(o,eid) or not s.enabled or e.status not in('confirmed','production') or e.start_at is null or e.start_at<=clock_timestamp() or e.end_at is null or e.end_at<=e.start_at or e.title~*'test[[:space:]_-]*fixture') then raise exception 'event_not_upcoming' using errcode='22023';end if;
  insert into private.event_discord_publications(organization_id,event_id,guild_id,enabled,rsvp_enabled,public_title,public_description,public_location,created_by)
  values(o,eid,s.guild_id,(d->>'enabled')::boolean,(d->>'rsvp_enabled')::boolean,btrim(d->>'public_title'),btrim(d->>'public_description'),btrim(d->>'public_location'),auth.uid())
  on conflict(organization_id,event_id) do update set enabled=excluded.enabled,rsvp_enabled=excluded.rsvp_enabled,public_title=excluded.public_title,public_description=excluded.public_description,public_location=excluded.public_location;
  perform private.event_discord_refresh(o,eid,true);
 elsif op='withdraw' then
  if p.id is null or coalesce((d->>'expected_revision')::bigint,-1)<>p.revision then raise exception 'event_revision_conflict' using errcode='40001';end if;
  update private.event_discord_publications set enabled=false where id=p.id;perform private.event_discord_refresh(o,eid,true);
 elsif op='presence' then
  if not exists(select 1 from private.event_presence where publication_id=p.id and user_id=(d->>'user_id')::uuid and version=(d->>'expected_version')::bigint) then raise exception 'event_revision_conflict' using errcode='40001';end if;
  if d->>'audience' not in('crew','participant','volunteer','visitor') or jsonb_typeof(d->'attended') is distinct from 'boolean' or ((d->>'attended')::boolean and(e.start_at is null or e.start_at>clock_timestamp())) then raise exception 'event_invalid_presence' using errcode='22023';end if;
  update private.event_presence set audience=d->>'audience',attended_at=case when(d->>'attended')::boolean then coalesce(attended_at,clock_timestamp())else null end,checked_by=auth.uid(),version=version+1,updated_at=clock_timestamp() where publication_id=p.id and user_id=(d->>'user_id')::uuid;
 elsif op<>'read' then raise exception 'event_unknown_operation' using errcode='22023';end if;
 if op<>'read' then insert into public.audit_log(organization_id,entity_type,entity_id,action,actor_id,metadata) values(o,'events',eid,'updated',auth.uid(),jsonb_build_object('operation','event.discord.'||op));end if;
 select * into p from private.event_discord_publications where organization_id=o and event_id=eid;
 settings:=case when s.organization_id is null then null else jsonb_build_object('guild_id',s.guild_id,'enabled',s.enabled,'rsvp_enabled',s.rsvp_enabled,'version',s.version) end;
 if p.id is not null then
  publication:=jsonb_build_object('id',p.id,'enabled',p.enabled,'rsvp_enabled',p.rsvp_enabled,'public_title',p.public_title,'public_description',p.public_description,'public_location',p.public_location,'revision',p.revision,'discord_event_id',p.discord_event_id,'guild_id',p.guild_id,'sync_state',p.sync_state,'last_error',p.last_error,'interest_observed_at',p.interest_observed_at,
   'interested_count',(select count(*) from private.event_discord_interest where publication_id=p.id and interested),
   'presence_count',(select count(*) from private.event_presence where publication_id=p.id),
   'coming_count',(select count(*) from private.event_presence where publication_id=p.id and status='coming'),
   'attended_count',(select count(*) from private.event_presence where publication_id=p.id and attended_at is not null));
  select coalesce(jsonb_agg(jsonb_build_object('user_id',r.user_id,'display_name',pr.display_name,'status',r.status,'audience',r.audience,'attended_at',r.attended_at,'version',r.version) order by r.created_at),'[]') into people from(select * from private.event_presence where publication_id=p.id order by created_at limit 50 offset greatest(0,least(coalesce((d->>'offset')::integer,0),10000)))r left join public.profiles pr on pr.id=r.user_id;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('guild_id',guild_id,'name',name) order by name),'[]') into targets from public.discord_bot_servers where organization_id=o and client_id is not null and application_id is not null;
 return jsonb_build_object('settings',settings,'publication',publication,'people',coalesce(people,'[]'),'servers',targets,'can_configure',private.can_manage_discord_bot(o));
end$$;

create function public.event_public_info(i uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select case when private.event_public_open(i) then(select jsonb_build_object('id',p.id,'revision',p.revision,'title',p.public_title,'description',p.public_description,'location',p.public_location,'start_at',e.start_at,'end_at',e.end_at,'rsvp_open',p.rsvp_enabled and s.rsvp_enabled,'discord_url',case when p.discord_event_id is not null then 'https://discord.com/events/'||p.guild_id||'/'||p.discord_event_id else null end)
 from private.event_discord_publications p join private.event_discord_settings s on s.organization_id=p.organization_id join public.events e on e.id=p.event_id and e.organization_id=p.organization_id where p.id=i)else null end
$$;
create function public.event_presence_own(i uuid,op text,d jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare p private.event_discord_publications;r private.event_presence;uid uuid;v bigint;
begin
 perform private.f1_lock();perform private.event_actor_lock();uid:=auth.uid();if exists(select 1 from public.community_people where account_user_id=uid and deleted_at is null and person_type='functional_account')then raise exception 'event_person_required' using errcode='42501';end if;
 select * into p from private.event_discord_publications where id=i for update;
 if not found then raise exception 'event_unavailable' using errcode='42501';end if;
 select * into r from private.event_presence where publication_id=i and user_id=uid for update;
 if op in('coming','withdraw') then
  if coalesce((d->>'expected_version')::bigint,-1)<>coalesce(r.version,0) then raise exception 'event_revision_conflict' using errcode='40001';end if;
  if op='coming' and(not private.event_public_open(i,true) or coalesce((d->>'expected_revision')::bigint,-1)<>p.revision) then raise exception 'event_registration_closed_or_changed' using errcode='40001';end if;
  if op='withdraw' and r.user_id is null then raise exception 'event_registration_unavailable' using errcode='42501';end if;
  insert into private.event_presence(publication_id,user_id,status) values(i,uid,case when op='coming' then 'coming' else 'withdrawn' end)
  on conflict(publication_id,user_id) do update set status=excluded.status,version=event_presence.version+1,updated_at=clock_timestamp();
  insert into public.audit_log(organization_id,entity_type,entity_id,action,actor_id,metadata) values(p.organization_id,'events',p.event_id,'updated',uid,jsonb_build_object('operation','event.presence.'||op));
 elsif op<>'read' then raise exception 'event_unknown_operation' using errcode='22023';end if;
 select * into r from private.event_presence where publication_id=i and user_id=uid;
 return case when r.user_id is null then null else jsonb_build_object('status',r.status,'version',r.version,'attended_at',r.attended_at) end;
end$$;

create function private.event_discord_job_view(j private.event_discord_jobs) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',j.id,'publication_id',j.publication_id,'event_id',j.event_id,'guild_id',j.guild_id,'revision',j.revision,'lease_token',j.lease_token,'lease_until',j.lease_until,'operation',j.operation,'discord_event_id',j.discord_event_id,'payload',j.payload)
$$;
create function public.event_discord_bot(op text,d jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare o uuid:=(d->>'organization_id')::uuid;gid text:=d->>'guild_id';client text:=d->>'client_id';worker text:=d->>'worker';s private.event_discord_settings;p private.event_discord_publications;j private.event_discord_jobs;answer jsonb;x record;did text;stamp timestamptz;origin text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'event_service_required' using errcode='42501';end if;
 perform private.f1_lock();
 select es.* into s from private.event_discord_settings es join public.discord_bot_servers b on b.organization_id=es.organization_id and b.guild_id=es.guild_id and b.client_id=es.client_id
 where es.organization_id=o and es.guild_id=gid and es.client_id=client for update of es;
 if not found then raise exception 'event_client_binding_unavailable' using errcode='42501';end if;
 if op in('interest_targets','interest_snapshot') then
  if not s.enabled then return jsonb_build_object('targets','[]'::jsonb,'ok',true);end if;
  if op='interest_targets' then select coalesce(jsonb_agg(jsonb_build_object('publication_id',id,'discord_event_id',discord_event_id)),'[]') into answer from(select * from private.event_discord_publications where organization_id=o and guild_id=gid and discord_event_id is not null and private.event_public_open(id) order by id limit 100)t;return jsonb_build_object('targets',answer);end if;
  select * into p from private.event_discord_publications where id=(d->>'publication_id')::uuid and organization_id=o and guild_id=gid and discord_event_id=d->>'discord_event_id' for update;
  if not found or not private.event_public_open(p.id) then raise exception 'event_unavailable' using errcode='42501';end if;
  stamp:=(d->>'observed_at')::timestamptz;
  if stamp is null or stamp>clock_timestamp()+interval '5 seconds' or stamp<clock_timestamp()-interval '10 minutes' or jsonb_typeof(d->'user_ids')<>'array' or jsonb_array_length(d->'user_ids')>5000 then raise exception 'event_invalid_interest_snapshot' using errcode='22023';end if;
  if exists(select 1 from jsonb_array_elements_text(d->'user_ids')u(value) where u.value!~'^[1-9][0-9]{16,19}$') then raise exception 'event_invalid_interest_snapshot' using errcode='22023';end if;
  if p.interest_observed_at is not null and p.interest_observed_at>=stamp then return jsonb_build_object('ok',true);end if;
  update private.event_discord_interest set interested=false,observed_at=stamp where publication_id=p.id;
  insert into private.event_discord_interest(publication_id,discord_user_id,interested,observed_at) select p.id,u.value,true,stamp from(select distinct jsonb_array_elements_text(d->'user_ids') as value)u
  on conflict(publication_id,discord_user_id) do update set interested=true,observed_at=excluded.observed_at;
  update private.event_discord_publications set interest_observed_at=stamp where id=p.id;return jsonb_build_object('ok',true);
 end if;
 if op='claim' then
  for x in select event_id from private.event_discord_publications where organization_id=o loop perform private.event_discord_refresh(o,x.event_id);end loop;
  update private.event_discord_jobs set state='uncertain',last_error='outcome_unknown' where organization_id=o and guild_id=gid and state='dispatching' and lease_until<=clock_timestamp();
  update private.event_discord_jobs set state='pending',worker_id=null,client_id=null,lease_token=null,lease_until=null where organization_id=o and guild_id=gid and state='leased' and lease_until<=clock_timestamp();
  select a.* into j from private.event_discord_jobs a join private.event_discord_publications b on b.id=a.publication_id
  where a.organization_id=o and a.guild_id=gid and a.state='pending' and a.revision=b.revision and(s.enabled or a.operation in('withdraw','complete'))
  and not exists(select 1 from private.event_discord_jobs busy where busy.publication_id=a.publication_id and busy.state in('leased','dispatching','uncertain')) order by a.created_at,a.id limit 1 for update of a;
  if not found then return jsonb_build_object('job',null);end if;
  select * into p from private.event_discord_publications where id=j.publication_id for update;
  if j.operation='upsert' and not j.rendered then
   origin:=d->>'site_origin';if origin is null or origin!~'^https://[A-Za-z0-9.-]+(:[0-9]+)?$' or length(origin)>200 then raise exception 'event_invalid_origin' using errcode='22023';end if;
   j.payload:=jsonb_set(j.payload,'{description}',to_jsonb((j.payload->>'description')||E'\n\nMeer informatie en aanmelden: '||origin||'/events/aanmelden/'||p.id::text));
  end if;
  update private.event_discord_jobs set state='leased',worker_id=worker,client_id=client,lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '2 minutes',discord_event_id=p.discord_event_id,payload=j.payload,rendered=true where id=j.id returning * into j;
  return jsonb_build_object('job',private.event_discord_job_view(j));
 end if;
 select * into j from private.event_discord_jobs where id=(d->>'id')::uuid and organization_id=o and guild_id=gid and client_id=client and worker_id=worker and lease_token=(d->>'lease_token')::uuid for update;
 if not found then raise exception 'event_lease_unavailable' using errcode='40001';end if;
 select * into p from private.event_discord_publications where id=j.publication_id for update;
 if op='inspect' then return jsonb_build_object('job',private.event_discord_job_view(j));end if;
 if op='dispatch' then
  perform private.event_discord_refresh(o,p.event_id);select * into p from private.event_discord_publications where id=j.publication_id;
  if(not s.enabled and j.operation='upsert') or j.state<>'leased' or j.lease_until<=clock_timestamp()+interval '15 seconds' or j.revision<>p.revision then return jsonb_build_object('authorized',false);end if;
  update private.event_discord_jobs set state='dispatching' where id=j.id;update private.event_discord_publications set sync_state='dispatching' where id=p.id;return jsonb_build_object('authorized',true);
 end if;
 if op='complete' then
  did:=nullif(d->>'discord_event_id','');
  if j.state='done' then if did is distinct from j.result_discord_event_id then raise exception 'event_result_conflict' using errcode='40001';end if;return jsonb_build_object('ok',true);end if;
  if j.state not in('dispatching','uncertain') or(did is not null and did!~'^[1-9][0-9]{16,19}$') or(j.operation='upsert' and did is null) or(j.discord_event_id is not null and j.discord_event_id is distinct from did) or(p.discord_event_id is not null and p.discord_event_id is distinct from did) then raise exception 'event_result_conflict' using errcode='40001';end if;
  update private.event_discord_jobs set state='done',result_discord_event_id=did where id=j.id;
  update private.event_discord_publications set discord_event_id=coalesce(discord_event_id,did),sync_state=case when j.revision<>revision then 'pending' when j.operation='upsert' then 'synced' else 'withdrawn' end,last_error=null where id=p.id;
  perform private.event_discord_refresh(o,p.event_id);return jsonb_build_object('ok',true);
 end if;
 if op='fail' then
  if d->>'error_code' not in('invalid_job','not_dispatched','remote_missing','remote_terminal','outcome_unknown') then raise exception 'event_invalid_fields' using errcode='22023';end if;
  if j.state in('done','cancelled') then return jsonb_build_object('ok',true);end if;
  if d->>'error_code'='not_dispatched' then
   update private.event_discord_jobs set state=case when j.revision=p.revision and s.enabled then 'pending' else 'cancelled' end,worker_id=null,client_id=null,lease_token=null,lease_until=null where id=j.id;
  else
   update private.event_discord_jobs set state=case when d->>'error_code'='outcome_unknown' then 'uncertain' else 'failed' end,last_error=d->>'error_code' where id=j.id;
   update private.event_discord_publications set sync_state=case when d->>'error_code'='outcome_unknown' then 'uncertain' else 'blocked' end,last_error=d->>'error_code' where id=p.id;
  end if;return jsonb_build_object('ok',true);
 end if;
 raise exception 'event_unknown_operation' using errcode='22023';
end$$;

revoke all on function private.event_source_shareable(uuid,uuid),private.event_public_text(text,integer),private.event_actor_lock(),private.event_public_open(uuid,boolean),private.event_discord_refresh(uuid,uuid,boolean),private.event_discord_source_changed(),private.event_discord_job_view(private.event_discord_jobs) from public,anon,authenticated,service_role;
revoke all on function public.event_discord_manage(uuid,uuid,text,jsonb),public.event_public_info(uuid),public.event_presence_own(uuid,text,jsonb),public.event_discord_bot(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.event_discord_manage(uuid,uuid,text,jsonb),public.event_presence_own(uuid,text,jsonb) to authenticated;
grant execute on function public.event_public_info(uuid) to anon,authenticated;
grant execute on function public.event_discord_bot(text,jsonb) to service_role;
commit;
