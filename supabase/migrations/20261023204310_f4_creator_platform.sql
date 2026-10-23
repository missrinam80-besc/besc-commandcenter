begin;
-- F4 creator milestone only. No site, account, role, consent or publication seeded.
create table private.platform_settings(
 site_id uuid primary key,organization_id uuid not null,own_enabled boolean not null default false,read_enabled boolean not null default false,
 foreign key(organization_id,site_id) references public.publication_sites(organization_id,id));
create table private.platform_access(
 id uuid primary key default gen_random_uuid(),site_id uuid not null,organization_id uuid not null,user_id uuid not null references public.profiles(id),
 person_id uuid not null references public.community_people(id),proof_document_id uuid not null references public.document_registry(id),may_view boolean not null default false,
 valid_until timestamptz not null,revoked_at timestamptz,created_by uuid not null references public.profiles(id),created_at timestamptz not null default clock_timestamp(),
 foreign key(organization_id,site_id) references public.publication_sites(organization_id,id),unique(organization_id,id),check(valid_until>created_at));
create unique index f4_current_access on private.platform_access(site_id,user_id) where revoked_at is null;
create table private.creator_profiles(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,site_id uuid not null,person_id uuid not null references public.community_people(id),
 revision integer not null default 0,created_at timestamptz not null default clock_timestamp(),
 foreign key(organization_id,site_id) references public.publication_sites(organization_id,id),unique(site_id,person_id),unique(organization_id,id));
create table private.creator_revisions(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,profile_id uuid not null,access_id uuid not null,
 revision integer not null check(revision>0),payload jsonb not null,payload_sha256 text not null check(payload_sha256~'^[a-f0-9]{64}$'),
 status text not null default 'draft' check(status in('draft','submitted','changes_requested','approved','withdrawn')),
 consent_id uuid references public.consent_records(id),created_by uuid not null references public.profiles(id),created_at timestamptz not null default clock_timestamp(),
 reviewed_by uuid references public.profiles(id),reviewed_at timestamptz,review_note text,
 foreign key(organization_id,profile_id) references private.creator_profiles(organization_id,id),foreign key(organization_id,access_id) references private.platform_access(organization_id,id),
 unique(profile_id,revision),unique(organization_id,id));
create table private.creator_entries(
 public_id uuid primary key default gen_random_uuid(),organization_id uuid not null,site_id uuid not null,profile_id uuid not null,
 selected_revision_id uuid not null,locale text not null check(locale in('nl-BE','fr-BE','en')),slug text not null check(length(slug)<=160 and slug~'^[a-z0-9]+(-[a-z0-9]+)*$'),
 epoch bigint not null default 1 check(epoch>0),published_at timestamptz not null,valid_until timestamptz,withdrawn_at timestamptz,
 foreign key(organization_id,site_id) references public.publication_sites(organization_id,id),foreign key(organization_id,profile_id) references private.creator_profiles(organization_id,id),
 foreign key(organization_id,selected_revision_id) references private.creator_revisions(organization_id,id),unique(site_id,profile_id,locale),unique(site_id,locale,slug),
 check(valid_until is null or valid_until>published_at));
create table private.f4_receipts(
 site_id uuid not null,actor uuid not null,request_id uuid not null,operation text not null,input jsonb not null,result jsonb not null,
 primary key(site_id,actor,request_id));
create table private.f4_limits(
 site_id uuid not null,actor uuid not null,bucket text not null,window_start timestamptz not null,used integer not null,
 primary key(site_id,actor,bucket,window_start));
do $$declare t text;begin foreach t in array array['platform_settings','platform_access','creator_profiles','creator_revisions','creator_entries','f4_receipts','f4_limits'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
end loop;end$$;

create function private.f4_identity() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and auth.role()='authenticated' and coalesce(auth.jwt()->>'is_anonymous','false')='false'
 and exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null and deleted_at is null and(banned_until is null or banned_until<=clock_timestamp()))
 and exists(select 1 from auth.sessions where user_id=auth.uid() and id::text=auth.jwt()->>'session_id')
$$;
create function private.f4_access_valid(i uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.platform_access a join public.community_people p on p.id=a.person_id and p.organization_id=a.organization_id and p.account_user_id=a.user_id and p.deleted_at is null
 join auth.users u on u.id=a.user_id where a.id=i and a.revoked_at is null and a.valid_until>clock_timestamp() and u.deleted_at is null and u.email_confirmed_at is not null and(u.banned_until is null or u.banned_until<=clock_timestamp()))
$$;
create function private.f4_own(s uuid) returns uuid language sql stable security definer set search_path='' as $$
 select a.id from private.platform_access a join public.publication_sites p on p.id=a.site_id and p.organization_id=a.organization_id join private.platform_settings cfg on cfg.site_id=p.id
 where a.site_id=s and a.user_id=auth.uid() and private.f4_identity() and p.active and cfg.own_enabled and private.f4_access_valid(a.id)
$$;
create function private.f4_viewer(s uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.f4_identity() and exists(select 1 from public.publication_sites p join private.platform_settings cfg on cfg.site_id=p.id and cfg.organization_id=p.organization_id
 where p.id=s and p.active and cfg.read_enabled and(private.f2_viewer(s) or exists(select 1 from private.platform_access a where a.site_id=s and a.user_id=auth.uid() and a.may_view and private.f4_access_valid(a.id))))
$$;
create function private.f4_purpose(o uuid,i uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.processing_purposes p where p.id=i and p.organization_id=o and p.purpose_code='public_profile' and p.status='active'
 and jsonb_typeof(p.allowed_scope->'fields')='array' and jsonb_array_length(p.allowed_scope->'fields') between 1 and 6 and p.allowed_scope->'fields' @> '["display_name"]'::jsonb
 and p.allowed_scope <@ '{"fields":["display_name","bio","platform_links","disciplines","languages","avatar"]}'::jsonb)
$$;
create function private.f4_consent(aid uuid,cid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.f4_access_valid(aid) and exists(select 1 from private.platform_access a join public.consent_records c on c.organization_id=a.organization_id and c.person_id=a.person_id and c.account_user_id=a.user_id
 where a.id=aid and c.id=cid and private.f4_purpose(a.organization_id,c.purpose_id) and(c.expires_at is null or c.expires_at>clock_timestamp()) and not exists(select 1 from public.consent_withdrawals w where w.consent_id=c.id)
 and jsonb_typeof(c.scope->'fields')='array' and c.scope->'fields' @> '["display_name"]'::jsonb)
$$;
create function private.f4_payload(p jsonb) returns boolean language plpgsql immutable set search_path='' as $$declare x jsonb;k text;v text;begin
 if p is null or jsonb_typeof(p)<>'object' or pg_column_size(p)>16000 or exists(select 1 from jsonb_object_keys(p) t where t not in('slug','locale','display_name','bio','platform_links','disciplines','languages','avatar')) then return false;end if;
 if jsonb_typeof(p->'slug') is distinct from 'string' or jsonb_typeof(p->'locale') is distinct from 'string' or coalesce(p->>'slug','')!~'^[a-z0-9]+(-[a-z0-9]+)*$' or length(p->>'slug')>160 or p->>'locale' is null or p->>'locale' not in('nl-BE','fr-BE','en') or jsonb_typeof(p->'display_name') is distinct from 'string' or length(btrim(p->>'display_name')) not between 2 and 120 then return false;end if;
 if p?'bio' and(jsonb_typeof(p->'bio') is distinct from 'string' or length(p->>'bio')>2000) then return false;end if;
 foreach k in array array['disciplines','languages'] loop
  if p?k then
   if jsonb_typeof(p->k)<>'array' then return false;end if;
   if jsonb_array_length(p->k)>(case when k='languages' then 8 else 12 end) then return false;end if;
   if exists(select 1 from jsonb_array_elements(p->k) t where jsonb_typeof(t)<>'string' or length(btrim(t#>>'{}')) not between 1 and (case when k='languages' then 30 else 60 end)) then return false;end if;
  end if;
 end loop;
 if p?'platform_links' then
  if jsonb_typeof(p->'platform_links')<>'array' then return false;end if;
  if jsonb_array_length(p->'platform_links')>8 then return false;end if;
  for x in select value from jsonb_array_elements(p->'platform_links') loop
   if jsonb_typeof(x)<>'object' or not(x?'platform' and x?'url') or exists(select 1 from jsonb_object_keys(x) t where t not in('platform','url')) then return false;end if;
   v:=x->>'url';
   if v is null or length(v)>2048 or (case x->>'platform'
    when 'twitch' then v!~'^https://(www[.])?twitch[.]tv/[A-Za-z0-9_]{1,25}/?$' or lower(split_part(trim(trailing '/' from v),'/',4)) in('login','signup','directory','settings','videos','downloads','search','inventory','wallet','subscriptions')
    when 'youtube' then v!~'^https://(www[.])?youtube[.]com/(@[A-Za-z0-9_.-]{1,100}|channel/[A-Za-z0-9_-]{1,100})/?$'
    when 'kick' then v!~'^https://(www[.])?kick[.]com/[A-Za-z0-9_-]{1,60}/?$'
    when 'tiktok' then v!~'^https://(www[.])?tiktok[.]com/@[A-Za-z0-9_.]{1,60}/?$'
    else true end) then return false;end if;
  end loop;
 end if;
 if p?'avatar' and p->'avatar'<>'null'::jsonb then
  x:=p->'avatar';if jsonb_typeof(x)<>'object' or not(x?'public_media_id' and x?'alt' and x?'credit') or exists(select 1 from jsonb_object_keys(x) t where t not in('public_media_id','alt','credit')) then return false;end if;
  if coalesce(x->>'public_media_id','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' or jsonb_typeof(x->'alt') is distinct from 'string' or length(btrim(x->>'alt')) not between 2 and 500 or jsonb_typeof(x->'credit') is distinct from 'string' or length(x->>'credit')>500 then return false;end if;
 end if;
 return true;
end$$;
create function private.f4_avatar(o uuid,s uuid,p jsonb) returns boolean language sql stable security definer set search_path='' as $$
 select not(p?'avatar') or p->'avatar'='null'::jsonb or exists(select 1 from public.publication_media m join public.document_registry d on d.id=m.document_id and d.organization_id=m.organization_id
 where m.organization_id=o and m.site_id=s and m.public_media_id::text=p->'avatar'->>'public_media_id' and m.revoked_at is null and d.media_rights_revoked_at is null)
$$;
create function private.f4_revision_valid(r private.creator_revisions) returns boolean language sql stable security definer set search_path='' as $$
 select r.status='approved' and private.f4_payload(r.payload) and private.f4_consent(r.access_id,r.consent_id)
 and exists(select 1 from private.creator_profiles p where p.id=r.profile_id and p.organization_id=r.organization_id and private.f4_avatar(p.organization_id,p.site_id,r.payload))
$$;
create function private.f4_entry_valid(e private.creator_entries) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.publication_sites s join private.platform_settings cfg on cfg.site_id=s.id where s.id=e.site_id and s.active and cfg.read_enabled) and e.withdrawn_at is null and e.published_at<=clock_timestamp() and(e.valid_until is null or e.valid_until>clock_timestamp()) and exists(select 1 from private.creator_revisions r where r.id=e.selected_revision_id and r.organization_id=e.organization_id and r.profile_id=e.profile_id and private.f4_revision_valid(r))
$$;
create function private.f4_limit(s uuid,b text,max_calls integer) returns void language plpgsql volatile security definer set search_path='' as $$declare n integer;begin
 delete from private.f4_limits where actor=auth.uid() and site_id=s and window_start<clock_timestamp()-interval '2 days';
 insert into private.f4_limits values(s,auth.uid(),b,date_trunc('minute',clock_timestamp()),1)
 on conflict(site_id,actor,bucket,window_start) do update set used=f4_limits.used+1 returning used into n;
 if n>max_calls then raise exception 'f4_rate_limited' using errcode='P0001';end if;
end$$;
create function private.f4_identity_changed() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.account_user_id is distinct from old.account_user_id or(new.deleted_at is not null and old.deleted_at is null) then
  update private.platform_access set revoked_at=coalesce(revoked_at,clock_timestamp()) where organization_id=old.organization_id and person_id=old.id and revoked_at is null;
 end if;return new;
end$$;
create trigger f4_person_binding before update of account_user_id,deleted_at on public.community_people for each row execute function private.f4_identity_changed();

create function public.f4_workflow(p_site_id uuid,p_operation text,p_data jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.publication_sites;o uuid;op text:=p_operation;d jsonb:=p_data;aid uuid;a private.platform_access;prof private.creator_profiles;r private.creator_revisions;e private.creator_entries;prior private.f4_receipts;
 allowed text[];answer jsonb;ident uuid;cons public.consent_records;projected jsonb;fields jsonb;k text;target_user uuid;begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'f4_isolation_required';end if;
 perform 1 from auth.users where id=auth.uid() for share;perform 1 from auth.sessions where user_id=auth.uid() and id::text=auth.jwt()->>'session_id' for share;
 perform private.f1_lock();
 select * into s from public.publication_sites where id=p_site_id;
 o:=s.organization_id;
 if s.id is null or not private.f4_identity() or p_request_id is null or d is null or jsonb_typeof(d)<>'object' or pg_column_size(d)>18000 then raise exception 'f4_not_available' using errcode='42501';end if;
 allowed:=case op when 'site.configure' then array['own_enabled','read_enabled','reason'] when 'access.assign' then array['person_id','valid_until','may_view','proof_document_id'] when 'access.revoke' then array['id','reason']
 when 'profile.save' then array['expected_revision','payload'] when 'profile.submit' then array['id','expected_hash','consent_id'] when 'consent.give' then array['purpose_id','scope','accepted'] when 'consent.withdraw' then array['id','reason']
 when 'profile.review' then array['id','expected_hash','decision','reason','rights_confirmed'] when 'profile.release' then array['id','expected_hash','expected_epoch','reason','published_at','valid_until'] when 'profile.withdraw' then array['profile_id','reason'] else null end;
 if allowed is null or exists(select 1 from jsonb_object_keys(d) t where not(t=any(allowed))) then raise exception 'f4_invalid_input';end if;
 if op in('site.configure','access.assign','access.revoke') then
  if not private.f2_account(o) or not private.f1_chair(o) then raise exception 'f4_not_authorized' using errcode='42501';end if;
 elsif op='profile.review' then
  if not private.f2_account(o) or not private.f1_role(o,'publication_reviewer') then raise exception 'f4_not_authorized' using errcode='42501';end if;
 elsif op='profile.release' then
  if not private.f2_account(o) or not private.f1_role(o,'publication_editor') then raise exception 'f4_not_authorized' using errcode='42501';end if;
 else
  aid:=private.f4_own(s.id);
  if aid is null then
   if op<>'profile.withdraw' or not private.f2_account(o) or not private.f1_role(o,'publication_editor') then raise exception 'f4_not_authorized' using errcode='42501';end if;
  else select * into a from private.platform_access where id=aid;end if;
 end if;
 -- Never return a previous receipt to an actor whose current object rights ended.
 if op in('profile.submit','profile.review','profile.release') then
  select * into r from private.creator_revisions where id=(d->>'id')::uuid and organization_id=o;
  select * into prof from private.creator_profiles where id=r.profile_id and site_id=s.id;
  if prof.id is null or(op='profile.submit' and(r.access_id<>aid or r.created_by<>auth.uid())) then raise exception 'f4_not_authorized' using errcode='42501';end if;
 end if;
 if op='profile.withdraw' then
  select * into prof from private.creator_profiles where id=(d->>'profile_id')::uuid and site_id=s.id;
  if prof.id is null or not((aid is not null and prof.person_id=a.person_id) or(private.f2_account(o) and private.f1_role(o,'publication_editor'))) then raise exception 'f4_not_authorized' using errcode='42501';end if;
 end if;
 if op='consent.withdraw' and not exists(select 1 from public.consent_records where id=(d->>'id')::uuid and organization_id=o and account_user_id=auth.uid() and person_id=a.person_id) then raise exception 'f4_not_authorized' using errcode='42501';end if;
 select * into prior from private.f4_receipts where site_id=s.id and actor=auth.uid() and request_id=p_request_id;
 if found then if prior.operation<>op or prior.input<>d then raise exception 'f4_request_conflict' using errcode='40001';end if;return prior.result;end if;
 perform private.f4_limit(s.id,'write',30);
 if op='site.configure' then
  if jsonb_typeof(d->'own_enabled') is distinct from 'boolean' or jsonb_typeof(d->'read_enabled') is distinct from 'boolean' or length(btrim(coalesce(d->>'reason',''))) not between 2 and 2000 then raise exception 'f4_invalid_input';end if;
  insert into private.platform_settings values(s.id,o,(d->>'own_enabled')::boolean,(d->>'read_enabled')::boolean) on conflict(site_id) do update set own_enabled=excluded.own_enabled,read_enabled=excluded.read_enabled;ident:=s.id;
 elsif op='access.assign' then
  select account_user_id into target_user from public.community_people where id=(d->>'person_id')::uuid and organization_id=o and deleted_at is null for share;
  if target_user is null or not exists(select 1 from auth.users where id=target_user and deleted_at is null and email_confirmed_at is not null and(banned_until is null or banned_until<=clock_timestamp())) or not private.f1_document_visible(o,(d->>'proof_document_id')::uuid)
   or jsonb_typeof(d->'may_view') is distinct from 'boolean' or(d->>'valid_until')::timestamptz<=clock_timestamp() or(d->>'valid_until')::timestamptz>clock_timestamp()+interval '7 days' then raise exception 'f4_access_evidence_required';end if;
  insert into private.platform_access(site_id,organization_id,user_id,person_id,proof_document_id,may_view,valid_until,created_by) values(s.id,o,target_user,(d->>'person_id')::uuid,(d->>'proof_document_id')::uuid,(d->>'may_view')::boolean,(d->>'valid_until')::timestamptz,auth.uid()) returning id into ident;
 elsif op='access.revoke' then
  if length(btrim(coalesce(d->>'reason',''))) not between 2 and 2000 then raise exception 'f4_invalid_input';end if;
  update private.platform_access set revoked_at=coalesce(revoked_at,clock_timestamp()) where id=(d->>'id')::uuid and site_id=s.id returning id into ident;
 elsif op='profile.save' then
  if not private.f4_payload(d->'payload') then raise exception 'f4_invalid_profile';end if;
  select * into prof from private.creator_profiles where site_id=s.id and person_id=a.person_id for update;
  if not found then
   if(d->>'expected_revision')::integer is distinct from 0 then raise exception 'f4_revision_conflict' using errcode='40001';end if;
   insert into private.creator_profiles(organization_id,site_id,person_id) values(o,s.id,a.person_id) returning * into prof;
  end if;
  if(d->>'expected_revision')::integer is distinct from prof.revision then raise exception 'f4_revision_conflict' using errcode='40001';end if;
  update private.creator_profiles set revision=revision+1 where id=prof.id returning * into prof;
  insert into private.creator_revisions(organization_id,profile_id,access_id,revision,payload,payload_sha256,created_by)
   values(o,prof.id,aid,prof.revision,d->'payload',encode(sha256(convert_to((d->'payload')::text,'UTF8')),'hex'),auth.uid()) returning id into ident;
 elsif op='consent.give' then
  if not private.f4_purpose(o,(d->>'purpose_id')::uuid) or d->>'accepted' is distinct from 'true' or jsonb_typeof(d->'scope') is distinct from 'object' or jsonb_typeof(d->'scope'->'fields') is distinct from 'array' or jsonb_array_length(d->'scope'->'fields') not between 1 and 6 or (select count(distinct x) from jsonb_array_elements(d->'scope'->'fields') x)<>jsonb_array_length(d->'scope'->'fields') or not(d->'scope'->'fields' @> '["display_name"]'::jsonb) then raise exception 'f4_personal_confirmation_required';end if;
  answer:=private.f1_consent(o,'consent.give',d);ident:=(answer->>'id')::uuid;
 elsif op='consent.withdraw' then
  answer:=private.f1_consent(o,'consent.withdraw',d);ident:=(answer->>'id')::uuid;
 elsif op='profile.submit' then
  if r.status<>'draft' or r.payload_sha256 is distinct from d->>'expected_hash' or not private.f4_consent(aid,(d->>'consent_id')::uuid) then raise exception 'f4_consent_or_revision_required';end if;
  select * into cons from public.consent_records where id=(d->>'consent_id')::uuid;
  fields:=cons.scope->'fields';projected:=r.payload-'bio'-'platform_links'-'disciplines'-'languages'-'avatar';
  foreach k in array array['bio','platform_links','disciplines','languages','avatar'] loop if fields ? k and r.payload?k then projected:=projected||jsonb_build_object(k,r.payload->k);end if;end loop;
  if not private.f4_payload(projected) or not private.f4_avatar(o,s.id,projected) then raise exception 'f4_profile_or_media_unavailable';end if;
  update private.creator_revisions set payload=projected,payload_sha256=encode(sha256(convert_to(projected::text,'UTF8')),'hex'),status='submitted',consent_id=cons.id where id=r.id returning id into ident;
 elsif op='profile.review' then
  if r.status<>'submitted' or r.payload_sha256 is distinct from d->>'expected_hash' or d->>'decision' is null or d->>'decision' not in('approved','changes_requested') or d->>'rights_confirmed' is distinct from 'true' or length(btrim(coalesce(d->>'reason',''))) not between 2 and 2000 then raise exception 'f4_review_required';end if;
  if r.created_by=auth.uid() or exists(select 1 from private.platform_access where id=r.access_id and user_id=auth.uid()) then raise exception 'f4_independent_review_required' using errcode='42501';end if;
  if d->>'decision'='approved' and(not private.f4_consent(r.access_id,r.consent_id) or not private.f4_avatar(o,s.id,r.payload)) then raise exception 'f4_consent_or_media_unavailable';end if;
  if d->>'decision'='approved' and r.payload?'avatar' and r.payload->'avatar'<>'null'::jsonb and not exists(select 1 from public.publication_media m where m.public_media_id::text=r.payload->'avatar'->>'public_media_id' and m.site_id=s.id and private.f1_document_visible(o,m.document_id)) then raise exception 'f4_media_review_access_required' using errcode='42501';end if;
  update private.creator_revisions set status=d->>'decision',reviewed_by=auth.uid(),reviewed_at=clock_timestamp(),review_note=d->>'reason' where id=r.id returning id into ident;
 elsif op='profile.release' then
  if not s.active or not exists(select 1 from private.platform_settings where site_id=s.id and read_enabled) or r.payload_sha256 is distinct from d->>'expected_hash' or not private.f4_revision_valid(r) or length(btrim(coalesce(d->>'reason',''))) not between 2 and 2000 then raise exception 'f4_release_required';end if;
  select * into e from private.creator_entries where site_id=s.id and profile_id=prof.id and locale=r.payload->>'locale' for update;
  if found then
   if e.epoch is distinct from (d->>'expected_epoch')::bigint or e.slug<>r.payload->>'slug' then raise exception 'f4_revision_conflict' using errcode='40001';end if;
   update private.creator_entries set selected_revision_id=r.id,epoch=epoch+1,published_at=coalesce((d->>'published_at')::timestamptz,clock_timestamp()),valid_until=(d->>'valid_until')::timestamptz,withdrawn_at=null where public_id=e.public_id returning public_id into ident;
  else
   if(d->>'expected_epoch')::bigint is distinct from 0::bigint then raise exception 'f4_revision_conflict' using errcode='40001';end if;
   insert into private.creator_entries(organization_id,site_id,profile_id,selected_revision_id,locale,slug,published_at,valid_until) values(o,s.id,prof.id,r.id,r.payload->>'locale',r.payload->>'slug',coalesce((d->>'published_at')::timestamptz,clock_timestamp()),(d->>'valid_until')::timestamptz) returning public_id into ident;
  end if;
 elsif op='profile.withdraw' then
  if length(btrim(coalesce(d->>'reason',''))) not between 2 and 2000 then raise exception 'f4_invalid_input';end if;
  update private.creator_entries set withdrawn_at=coalesce(withdrawn_at,clock_timestamp()),epoch=epoch+1 where site_id=s.id and profile_id=(d->>'profile_id')::uuid;
  update private.creator_revisions set status='withdrawn' where organization_id=o and profile_id=(d->>'profile_id')::uuid and status in('submitted','approved');ident:=(d->>'profile_id')::uuid;
 end if;
 if ident is null then raise exception 'f4_not_available';end if;
 answer:=jsonb_build_object('id',ident);perform private.f1_audit(o,ident,'f4.'||op);
 insert into private.f4_receipts values(s.id,auth.uid(),p_request_id,op,d,answer);return answer;
end$$;
create function private.f4_read_gate() returns void language plpgsql volatile security definer set search_path='' as $$begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'f4_isolation_required';end if;
 perform 1 from auth.users where id=auth.uid() for share;perform 1 from auth.sessions where user_id=auth.uid() and id::text=auth.jwt()->>'session_id' for share;
 perform private.f1_lock();if not private.f4_identity() then raise exception 'f4_not_authorized' using errcode='42501';end if;
end$$;
create function public.f4_me(p_site_id uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare aid uuid;a private.platform_access;prof private.creator_profiles;begin
 perform private.f4_read_gate();aid:=private.f4_own(p_site_id);if aid is null then raise exception 'f4_not_authorized' using errcode='42501';end if;
 perform private.f4_limit(p_site_id,'own_read',60);select * into a from private.platform_access where id=aid;
 select * into prof from private.creator_profiles where site_id=p_site_id and person_id=a.person_id;
 if(select count(*) from private.creator_revisions where profile_id=prof.id)>200 then raise exception 'f4_selection_too_large';end if;
 return jsonb_build_object('lease_id',aid,'profile_id',prof.id,'revision',coalesce(prof.revision,0),'may_view',a.may_view,
 'purposes',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'text_version',p.text_version,'title',p.title,'body',p.body,'allowed_scope',p.allowed_scope,'retention_policy',p.retention_policy)),'[]') from public.processing_purposes p where private.f4_purpose(a.organization_id,p.id)),
 'consents',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'purpose_id',c.purpose_id,'scope',c.scope,'recorded_at',c.recorded_at,'valid',private.f4_consent(aid,c.id)) order by c.recorded_at desc),'[]') from public.consent_records c join public.processing_purposes p on p.id=c.purpose_id where c.organization_id=a.organization_id and c.account_user_id=auth.uid() and c.person_id=a.person_id and p.purpose_code='public_profile' and c.scope->'fields' @> '["display_name"]'::jsonb and c.scope <@ '{"fields":["display_name","bio","platform_links","disciplines","languages","avatar"]}'::jsonb),
 'revisions',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'revision',r.revision,'payload',r.payload,'payload_sha256',r.payload_sha256,'status',r.status,'created_at',r.created_at,'current_access',r.access_id=aid) order by r.revision desc),'[]') from private.creator_revisions r where r.profile_id=prof.id),
 'entries',(select coalesce(jsonb_agg(jsonb_build_object('public_id',e.public_id,'slug',e.slug,'revision_id',e.selected_revision_id,'epoch',e.epoch,'available',private.f4_entry_valid(e))),'[]') from private.creator_entries e where e.profile_id=prof.id));
end$$;
create function public.f4_admin_state(p_site_id uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$declare o uuid;ch boolean;ed boolean;rv boolean;begin
 perform private.f4_read_gate();select organization_id into o from public.publication_sites where id=p_site_id;
 ch:=private.f1_chair(o);ed:=private.f1_role(o,'publication_editor');rv:=private.f1_role(o,'publication_reviewer');
 if o is null or not private.f2_account(o) or not(ch or ed or rv) then raise exception 'f4_not_authorized' using errcode='42501';end if;
 if(select count(*) from private.creator_revisions r join private.creator_profiles p on p.id=r.profile_id where p.site_id=p_site_id)>500 then raise exception 'f4_selection_too_large';end if;
 return jsonb_build_object('chair',ch,'editor',ed,'reviewer',rv,'settings',coalesce((select jsonb_build_object('own_enabled',own_enabled,'read_enabled',read_enabled) from private.platform_settings where site_id=p_site_id),'{"own_enabled":false,"read_enabled":false}'::jsonb),
 'access',case when ch then(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'person_id',a.person_id,'user_id',a.user_id,'may_view',a.may_view,'valid_until',a.valid_until,'revoked_at',a.revoked_at,'valid',private.f4_access_valid(a.id))),'[]') from private.platform_access a where a.site_id=p_site_id) else '[]'::jsonb end,
 'revisions',case when ed or rv then(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'profile_id',r.profile_id,'revision',r.revision,'payload',r.payload,'payload_sha256',r.payload_sha256,'status',r.status,'created_by',r.created_by,'review_note',r.review_note,'created_at',r.created_at,'valid_consent',private.f4_consent(r.access_id,r.consent_id)) order by r.created_at desc),'[]') from private.creator_revisions r join private.creator_profiles p on p.id=r.profile_id where p.site_id=p_site_id and r.status<>'draft') else '[]'::jsonb end,
 'entries',case when ed or rv then(select coalesce(jsonb_agg(jsonb_build_object('public_id',e.public_id,'profile_id',e.profile_id,'revision_id',e.selected_revision_id,'locale',e.locale,'slug',e.slug,'epoch',e.epoch,'valid_until',e.valid_until,'available',private.f4_entry_valid(e))),'[]') from private.creator_entries e where e.site_id=p_site_id) else '[]'::jsonb end);
end$$;
create function private.f4_project(e private.creator_entries) returns jsonb language sql stable security definer set search_path='' as $$
 select r.payload||jsonb_build_object('schema_version','besc-platform-publication-v1','type','creator','public_id',e.public_id,'revision',r.revision,'published_at',e.published_at,'valid_until',e.valid_until) from private.creator_revisions r where r.id=e.selected_revision_id
$$;
create function public.f4_creators(p_site_id uuid,p_slug text default null,p_locale text default 'nl-BE',p_limit integer default 20,p_before_time timestamptz default null,p_before_id uuid default null,p_platform text default null,p_language text default null,p_discipline text default null,p_search text default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$declare result jsonb;begin
 perform private.f4_read_gate();if not private.f4_viewer(p_site_id) then raise exception 'f4_not_authorized' using errcode='42501';end if;
 if p_locale is null or p_locale not in('nl-BE','fr-BE','en') or p_limit is null or p_limit not between 1 and 50 or(p_before_time is null)<>(p_before_id is null) or(p_slug is not null and(length(p_slug)>160 or p_slug!~'^[a-z0-9]+(-[a-z0-9]+)*$'))
 or(p_platform is not null and p_platform not in('twitch','youtube','kick','tiktok')) or length(p_language)>30 or length(p_discipline)>60 or length(p_search)>80 then raise exception 'f4_invalid_input' using errcode='22023';end if;
 perform private.f4_limit(p_site_id,'public_read',120);
 select coalesce(jsonb_agg(private.f4_project(v) order by v.published_at desc,v.public_id desc),'[]') into result from(
 select e.* from private.creator_entries e join private.creator_revisions r on r.id=e.selected_revision_id where e.site_id=p_site_id and e.locale=p_locale and(p_slug is null or e.slug=p_slug) and private.f4_entry_valid(e)
 and(p_before_time is null or(e.published_at,e.public_id)<(p_before_time,p_before_id))
 and(p_platform is null or exists(select 1 from jsonb_array_elements(coalesce(r.payload->'platform_links','[]')) x where x->>'platform'=p_platform))
 and(p_language is null or coalesce(r.payload->'languages','[]')?p_language) and(p_discipline is null or coalesce(r.payload->'disciplines','[]')?p_discipline)
 and(p_search is null or position(lower(p_search) in lower(r.payload->>'display_name'))>0) order by e.published_at desc,e.public_id desc limit p_limit) v;
 return result;
end$$;
create function public.f4_media_locator(p_site_id uuid,p_media_id uuid,p_server_key text) returns jsonb language plpgsql volatile security definer set search_path='' as $$declare m public.publication_media;begin
 perform private.f4_read_gate();if not private.f4_viewer(p_site_id) or length(p_server_key) not between 32 and 256 or not exists(select 1 from public.publication_sites where id=p_site_id and key_sha256=encode(sha256(convert_to(p_server_key,'UTF8')),'hex')) then raise exception 'f4_not_authorized' using errcode='42501';end if;
 perform private.f4_limit(p_site_id,'media',120);
 select * into m from public.publication_media where site_id=p_site_id and public_media_id=p_media_id and revoked_at is null;
 if m.public_media_id is null or not exists(select 1 from private.creator_entries e join private.creator_revisions r on r.id=e.selected_revision_id where e.site_id=p_site_id and private.f4_entry_valid(e) and r.payload->'avatar'->>'public_media_id'=p_media_id::text) then return null;end if;
 return jsonb_build_object('path',m.storage_path,'sha256',m.sha256,'mime',m.mime,'bytes',m.bytes);
end$$;
-- Authenticated callers receive only an access decision, never a private path.
create function public.f4_review_media(p_site_id uuid,p_revision_id uuid,p_media_id uuid) returns boolean language plpgsql volatile security definer set search_path='' as $$declare o uuid;begin
 perform private.f4_read_gate();select organization_id into o from public.publication_sites where id=p_site_id;
 if not private.f2_account(o) or not(private.f1_role(o,'publication_editor') or private.f1_role(o,'publication_reviewer')) then raise exception 'f4_not_authorized' using errcode='42501';end if;
 perform private.f4_limit(p_site_id,'review_media',120);
 return exists(select 1 from public.publication_media a join private.creator_revisions r on r.id=p_revision_id and r.organization_id=a.organization_id join private.creator_profiles p on p.id=r.profile_id and p.site_id=a.site_id
 where a.site_id=p_site_id and a.public_media_id=p_media_id and r.status<>'draft' and r.payload->'avatar'->>'public_media_id'=p_media_id::text and a.revoked_at is null and private.f4_avatar(o,p_site_id,r.payload) and private.f1_document_visible(o,a.document_id));
end$$;
-- The existing CC server alone reads the locator after an authenticated check.
create function public.f4_preview_locator(p_site_id uuid,p_revision_id uuid,p_media_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare m public.publication_media;begin
 if auth.role()<>'service_role' then raise exception 'f4_server_required' using errcode='42501';end if;
 select a.* into m from public.publication_media a join private.creator_revisions r on r.id=p_revision_id and r.organization_id=a.organization_id join private.creator_profiles p on p.id=r.profile_id and p.site_id=a.site_id
 where a.site_id=p_site_id and a.public_media_id=p_media_id and r.status<>'draft' and r.payload->'avatar'->>'public_media_id'=p_media_id::text and a.revoked_at is null and private.f4_avatar(a.organization_id,p_site_id,r.payload);
 if m.public_media_id is null then return null;end if;
 return jsonb_build_object('path',m.storage_path,'sha256',m.sha256,'mime',m.mime,'bytes',m.bytes);
end$$;
-- Revoke default PUBLIC EXECUTE and platform defaults, including private helpers.
do $$declare x record;begin for x in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private') and p.proname like 'f4\_%' escape '\' loop execute 'revoke all on function '||x.sig||' from public,anon,authenticated,service_role';end loop;end$$;
grant execute on function public.f4_workflow(uuid,text,jsonb,uuid),public.f4_me(uuid),public.f4_admin_state(uuid),public.f4_creators(uuid,text,text,integer,timestamptz,uuid,text,text,text,text),public.f4_media_locator(uuid,uuid,text),public.f4_review_media(uuid,uuid,uuid) to authenticated;
grant execute on function public.f4_preview_locator(uuid,uuid,uuid) to service_role;
commit;
