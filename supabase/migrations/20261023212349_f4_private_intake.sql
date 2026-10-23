begin;
-- Private partnership intake foundation. No live forms, grants or applications.
create table private.intake_forms(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,site_id uuid not null,
 slug text not null check(length(slug)<=100 and slug~'^[a-z0-9]+(-[a-z0-9]+)*$'),version integer not null check(version>0),
 category text not null check(category='partnership'),title text not null,notice_version text not null,notice_body text not null,
 legal_basis text not null,retention_policy text not null,policy_document_id uuid not null,
 active boolean not null default false,opens_at timestamptz not null,closes_at timestamptz not null,
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default clock_timestamp(),
 foreign key(organization_id,site_id) references public.publication_sites(organization_id,id),foreign key(policy_document_id) references public.document_registry(id),
 unique(site_id,slug,version),unique(organization_id,id),check(closes_at>opens_at));
create unique index f4_intake_one_open on private.intake_forms(site_id,slug) where active;
create table private.intake_handlers(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,form_id uuid not null,user_id uuid not null references public.profiles(id),person_id uuid not null references public.community_people(id),
 proof_document_id uuid not null references public.document_registry(id),valid_until timestamptz not null,revoked_at timestamptz,
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default clock_timestamp(),
 foreign key(organization_id,form_id) references private.intake_forms(organization_id,id),check(valid_until>created_at));
create unique index f4_intake_current_handler on private.intake_handlers(form_id,user_id) where revoked_at is null;
create table private.platform_applications(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,site_id uuid not null,form_id uuid not null,access_id uuid not null,
 actor uuid not null references public.profiles(id),person_id uuid not null references public.community_people(id),payload jsonb not null,payload_sha256 text not null,
 form_snapshot jsonb not null,status text not null default 'received' check(status in('received','in_review','needs_information','rejected','closed','withdrawn')),
 version integer not null default 1,assigned_user_id uuid references public.profiles(id),created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 foreign key(organization_id,site_id) references public.publication_sites(organization_id,id),foreign key(organization_id,form_id) references private.intake_forms(organization_id,id),
 foreign key(organization_id,access_id) references private.platform_access(organization_id,id),unique(organization_id,id));
create index f4_intake_own on private.platform_applications(site_id,actor,created_at desc,id);
create index f4_intake_queue on private.platform_applications(form_id,status,created_at,id);
create table private.application_events(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,application_id uuid not null,actor uuid not null references public.profiles(id),
 version integer not null,kind text not null,status text not null,own_message text not null default '',internal_note text not null default '',created_at timestamptz not null default clock_timestamp(),
 foreign key(organization_id,application_id) references private.platform_applications(organization_id,id),unique(application_id,version));
do $$declare t text;begin foreach t in array array['intake_forms','intake_handlers','platform_applications','application_events'] loop
 execute format('alter table private.%I enable row level security',t);execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);end loop;end$$;

create function private.f4_intake_own(s uuid) returns uuid language sql stable security definer set search_path='' as $$
 select a.id from private.platform_access a join public.publication_sites p on p.id=a.site_id and p.organization_id=a.organization_id
 where a.site_id=s and a.user_id=auth.uid() and p.active and private.f4_identity() and private.f4_access_valid(a.id)
$$;
create function private.f4_intake_staff(o uuid,u uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.organization_members m join auth.users a on a.id=m.user_id where m.organization_id=o and m.user_id=u and m.status='active' and a.email_confirmed_at is not null and a.deleted_at is null and(a.banned_until is null or a.banned_until<=clock_timestamp()))
$$;
create function private.f4_intake_handler(f uuid,u uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.intake_handlers h join private.intake_forms x on x.id=h.form_id
 where h.form_id=f and h.user_id=u and exists(select 1 from public.publication_sites where id=x.site_id and active) and h.revoked_at is null and h.valid_until>clock_timestamp()
 and private.f4_intake_staff(x.organization_id,u) and exists(select 1 from public.community_people p where p.id=h.person_id and p.organization_id=x.organization_id and p.account_user_id=u and p.deleted_at is null))
$$;
create function private.f4_intake_payload(d jsonb) returns boolean language plpgsql immutable set search_path='' as $$begin
 if d is null or jsonb_typeof(d)<>'object' or pg_column_size(d)>7000 or not(d?'organization_name' and d?'requested_roles' and d?'message')
 or exists(select 1 from jsonb_object_keys(d) k where k not in('organization_name','requested_roles','message')) then return false;end if;
 if jsonb_typeof(d->'organization_name') is distinct from 'string' or length(btrim(d->>'organization_name')) not between 1 and 180
 or jsonb_typeof(d->'message') is distinct from 'string' or length(btrim(d->>'message')) not between 1 and 4000 or jsonb_typeof(d->'requested_roles') is distinct from 'array' then return false;end if;
 if jsonb_array_length(d->'requested_roles') not between 1 and 6 or exists(select 1 from jsonb_array_elements(d->'requested_roles') v where jsonb_typeof(v)<>'string' or v#>>'{}' not in('sponsor','esports','community','event','education','social_impact'))
 or(select count(*)<>count(distinct v) from jsonb_array_elements(d->'requested_roles') v) then return false;end if;return true;
end$$;
create function private.f4_intake_open(f private.intake_forms) returns boolean language sql stable security definer set search_path='' as $$
 select f.active and f.opens_at<=clock_timestamp() and f.closes_at>clock_timestamp() and exists(select 1 from public.publication_sites s where s.id=f.site_id and s.active)
$$;
create function public.f4_intake_workflow(p_site_id uuid,p_operation text,p_data jsonb,p_request_id uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare s public.publication_sites;f private.intake_forms;a private.platform_applications;access private.platform_access;prior private.f4_receipts;
 op text:=p_operation;d jsonb:=p_data;allowed text[];field_key text;aid uuid;fid uuid;ident uuid;target uuid;answer jsonb;note text;msg text;next_status text;begin
 perform private.f4_read_gate();select * into s from public.publication_sites where id=p_site_id;
 if s.id is null or p_request_id is null or d is null or jsonb_typeof(d)<>'object' or pg_column_size(d)>22000 then raise exception 'intake_not_available' using errcode='42501';end if;
 allowed:=case op when 'form.create' then array['slug','version','title','notice_version','notice_body','legal_basis','retention_policy','policy_document_id','opens_at','closes_at'] when 'form.open' then array['id','policy_confirmed','reason'] when 'form.close' then array['id','reason'] when 'handler.assign' then array['form_id','user_id','proof_document_id','valid_until'] when 'handler.revoke' then array['id','reason'] when 'application.submit' then array['form_id','notice_version','notice_acknowledged','payload'] when 'application.withdraw' then array['id','expected_version'] when 'application.reply' then array['id','expected_version','message'] when 'application.claim' then array['id','expected_version'] when 'application.update' then array['id','expected_version','status','own_message','internal_note'] else null end;
 if allowed is null or not(d?&allowed) or exists(select 1 from jsonb_object_keys(d) k where not(k=any(allowed))) then raise exception 'intake_invalid_input';end if;
 foreach field_key in array array['slug','title','notice_version','notice_body','legal_basis','retention_policy','reason','message','own_message','internal_note','status'] loop if d?field_key and jsonb_typeof(d->field_key) is distinct from 'string' then raise exception 'intake_invalid_input';end if;end loop;
 if op in('form.create','form.open','form.close','handler.assign','handler.revoke') then
  if not private.f2_account(s.organization_id) or not private.f1_chair(s.organization_id) then raise exception 'intake_not_authorized' using errcode='42501';end if;
 else
  if op in('application.submit','application.withdraw','application.reply') then
   aid:=private.f4_intake_own(s.id);if aid is null then raise exception 'intake_not_authorized' using errcode='42501';end if;select * into access from private.platform_access where id=aid;
  end if;
 end if;
 if op in('application.withdraw','application.reply','application.claim','application.update') then
  select * into a from private.platform_applications where id=(d->>'id')::uuid and site_id=s.id for update;
  if a.id is null then raise exception 'intake_not_authorized' using errcode='42501';end if;
  if op in('application.withdraw','application.reply') then
   if a.actor<>auth.uid() or a.person_id<>access.person_id or a.access_id<>aid then raise exception 'intake_not_authorized' using errcode='42501';end if;
  elsif not private.f2_account(s.organization_id) or not private.f4_intake_handler(a.form_id,auth.uid()) or not s.active then raise exception 'intake_not_authorized' using errcode='42501';end if;
 end if;
 if op in('form.open','form.close') then fid:=(d->>'id')::uuid;elsif op in('handler.assign','application.submit') then fid:=(d->>'form_id')::uuid;end if;
 if fid is not null then select * into f from private.intake_forms where id=fid and site_id=s.id for update;if f.id is null then raise exception 'intake_not_authorized' using errcode='42501';end if;end if;
 if op='handler.revoke' and not exists(select 1 from private.intake_handlers h join private.intake_forms x on x.id=h.form_id where h.id=(d->>'id')::uuid and x.site_id=s.id) then raise exception 'intake_not_authorized' using errcode='42501';end if;
 if op='application.update' and a.assigned_user_id is distinct from auth.uid() then raise exception 'intake_not_authorized' using errcode='42501';end if;
 if op='application.claim' and a.assigned_user_id is not null and a.assigned_user_id<>auth.uid() and private.f4_intake_handler(a.form_id,a.assigned_user_id) then raise exception 'intake_assigned_conflict' using errcode='40001';end if;
 select * into prior from private.f4_receipts where site_id=s.id and actor=auth.uid() and request_id=p_request_id;
 if found then if op='application.submit' and not exists(select 1 from private.platform_applications x where x.id=(prior.result->>'id')::uuid and x.site_id=s.id and x.access_id=aid and x.actor=auth.uid() and x.person_id=access.person_id) then raise exception 'intake_not_authorized' using errcode='42501';end if;if prior.operation<>'intake.'||op or prior.input<>d then raise exception 'intake_request_conflict' using errcode='40001';end if;return prior.result;end if;
 perform private.f4_limit(s.id,'intake_write',20);
 if op='form.create' then
  if(select count(*) from private.intake_forms where site_id=s.id)>=200 then raise exception 'intake_capacity';end if;
  if coalesce(d->>'slug','')!~'^[a-z0-9]+(-[a-z0-9]+)*$' or length(d->>'slug')>100 or jsonb_typeof(d->'version') is distinct from 'number' or coalesce(d->>'version','')!~'^[1-9][0-9]*$'
  or length(btrim(coalesce(d->>'title',''))) not between 2 and 180 or length(btrim(coalesce(d->>'notice_version',''))) not between 1 and 80
  or length(btrim(coalesce(d->>'notice_body',''))) not between 10 and 10000 or length(btrim(coalesce(d->>'legal_basis',''))) not between 2 and 2000 or length(btrim(coalesce(d->>'retention_policy',''))) not between 2 and 4000
  or not private.f1_document_visible(s.organization_id,(d->>'policy_document_id')::uuid) or not exists(select 1 from public.document_registry where id=(d->>'policy_document_id')::uuid and organization_id=s.organization_id)
  or d->>'opens_at' is null or d->>'closes_at' is null or(d->>'closes_at')::timestamptz<=(d->>'opens_at')::timestamptz then raise exception 'intake_invalid_input';end if;
  insert into private.intake_forms(organization_id,site_id,slug,version,category,title,notice_version,notice_body,legal_basis,retention_policy,policy_document_id,opens_at,closes_at,created_by)
  values(s.organization_id,s.id,d->>'slug',(d->>'version')::integer,'partnership',d->>'title',d->>'notice_version',d->>'notice_body',d->>'legal_basis',d->>'retention_policy',(d->>'policy_document_id')::uuid,(d->>'opens_at')::timestamptz,(d->>'closes_at')::timestamptz,auth.uid()) returning id into ident;
 elsif op in('form.open','form.close') then
  if length(btrim(coalesce(d->>'reason',''))) not between 2 and 2000 or(op='form.open' and(d->'policy_confirmed' is distinct from 'true'::jsonb or not s.active or f.closes_at<=clock_timestamp() or not private.f1_document_visible(s.organization_id,f.policy_document_id))) then raise exception 'intake_invalid_input';end if;
  if op='form.open' and not f.active and(select count(*) from private.intake_forms where site_id=s.id and active)>=50 then raise exception 'intake_capacity';end if;
  update private.intake_forms set active=(op='form.open') where id=f.id;ident:=f.id;
 elsif op='handler.assign' then
  if(select count(*) from private.intake_handlers h join private.intake_forms x on x.id=h.form_id where x.site_id=s.id)>=500 then raise exception 'intake_capacity';end if;
  target:=(d->>'user_id')::uuid;
  if not private.f4_intake_staff(s.organization_id,target) or(select count(*) from public.community_people where organization_id=s.organization_id and account_user_id=target and deleted_at is null)<>1 or not private.f1_document_visible(s.organization_id,(d->>'proof_document_id')::uuid) or not exists(select 1 from public.document_registry where id=(d->>'proof_document_id')::uuid and organization_id=s.organization_id)
  or d->>'valid_until' is null or(d->>'valid_until')::timestamptz<=clock_timestamp() or(d->>'valid_until')::timestamptz>clock_timestamp()+interval '7 days' then raise exception 'intake_invalid_input';end if;
  insert into private.intake_handlers(organization_id,form_id,user_id,person_id,proof_document_id,valid_until,created_by) values(s.organization_id,f.id,target,(select id from public.community_people where organization_id=s.organization_id and account_user_id=target and deleted_at is null),(d->>'proof_document_id')::uuid,(d->>'valid_until')::timestamptz,auth.uid()) returning id into ident;
 elsif op='handler.revoke' then
  if length(btrim(coalesce(d->>'reason',''))) not between 2 and 2000 then raise exception 'intake_invalid_input';end if;
  update private.intake_handlers set revoked_at=coalesce(revoked_at,clock_timestamp()) where id=(d->>'id')::uuid returning id into ident;
 elsif op='application.submit' then
  if(select count(*) from private.platform_applications where site_id=s.id and actor=auth.uid() and access_id=aid)>=100 then raise exception 'intake_capacity';end if;
  if not private.f4_intake_open(f) or d->'notice_acknowledged' is distinct from 'true'::jsonb or d->>'notice_version' is distinct from f.notice_version or not private.f4_intake_payload(d->'payload') then raise exception 'intake_invalid_input';end if;
  insert into private.platform_applications(organization_id,site_id,form_id,access_id,actor,person_id,payload,payload_sha256,form_snapshot)
  values(s.organization_id,s.id,f.id,aid,auth.uid(),access.person_id,d->'payload',encode(sha256(convert_to((d->'payload')::text,'UTF8')),'hex'),jsonb_build_object('title',f.title,'version',f.version,'notice_version',f.notice_version,'notice_body',f.notice_body,'legal_basis',f.legal_basis,'retention_policy',f.retention_policy)) returning id into ident;
  insert into private.application_events(organization_id,application_id,actor,version,kind,status) values(s.organization_id,ident,auth.uid(),1,op,'received');
 else
  if jsonb_typeof(d->'expected_version') is distinct from 'number' or coalesce(d->>'expected_version','')!~'^[1-9][0-9]*$' or(d->>'expected_version')::integer<>a.version then raise exception 'intake_version_conflict' using errcode='40001';end if;
  if a.status in('closed','rejected','withdrawn') then raise exception 'intake_terminal_conflict' using errcode='40001';end if;
  if a.version>=100 and op<>'application.withdraw' then raise exception 'intake_history_limit';end if;
  next_status:=a.status;msg:='';note:='';
  if op='application.withdraw' then next_status:='withdrawn';
  elsif op='application.reply' then
   if a.status<>'needs_information' or jsonb_typeof(d->'message') is distinct from 'string' or length(btrim(d->>'message')) not between 1 and 4000 then raise exception 'intake_invalid_input';end if;next_status:='in_review';msg:=d->>'message';
  elsif op='application.claim' then
   if a.assigned_user_id is not null and a.assigned_user_id<>auth.uid() and private.f4_intake_handler(a.form_id,a.assigned_user_id) then raise exception 'intake_assigned_conflict' using errcode='40001';end if;
   update private.platform_applications set assigned_user_id=auth.uid() where id=a.id;
  elsif op='application.update' then
   if a.assigned_user_id is distinct from auth.uid() or coalesce(d->>'status','') not in('in_review','needs_information','rejected','closed') or jsonb_typeof(d->'own_message') is distinct from 'string' or length(d->>'own_message')>4000 or jsonb_typeof(d->'internal_note') is distinct from 'string' or length(d->>'internal_note')>4000
   or(d->>'status'='needs_information' and length(btrim(d->>'own_message'))<2) then raise exception 'intake_invalid_input';end if;
   next_status:=d->>'status';msg:=d->>'own_message';note:=d->>'internal_note';
  end if;
  update private.platform_applications set status=next_status,version=version+1,updated_at=clock_timestamp() where id=a.id returning id,version into ident,a.version;
  insert into private.application_events(organization_id,application_id,actor,version,kind,status,own_message,internal_note) values(s.organization_id,ident,auth.uid(),a.version,op,next_status,msg,note);
 end if;
 answer:=jsonb_build_object('id',ident);perform private.f1_audit(s.organization_id,ident,'f4.intake.'||op);
 insert into private.f4_receipts values(s.id,auth.uid(),p_request_id,'intake.'||op,d,answer);return answer;
end$$;

create function public.f4_intake_me(p_site_id uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare aid uuid;forms jsonb;apps jsonb;begin
 perform private.f4_read_gate();aid:=private.f4_intake_own(p_site_id);if aid is null then raise exception 'intake_not_authorized' using errcode='42501';end if;
 perform private.f4_limit(p_site_id,'intake_own_read',60);
 if(select count(*) from private.intake_forms f where f.site_id=p_site_id and private.f4_intake_open(f))>50 or(select count(*) from private.platform_applications where site_id=p_site_id and access_id=aid and actor=auth.uid())>100 then raise exception 'intake_page_required';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'category',f.category,'title',f.title,'version',f.version,'notice_version',f.notice_version,'notice_body',f.notice_body,'legal_basis',f.legal_basis,'retention_policy',f.retention_policy,'closes_at',f.closes_at) order by f.title,f.id),'[]') into forms from private.intake_forms f where f.site_id=p_site_id and private.f4_intake_open(f);
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'title',a.form_snapshot->>'title','category','partnership','version',a.version,'status',a.status,'created_at',a.created_at,'updated_at',a.updated_at) order by a.created_at desc,a.id desc),'[]') into apps
 from private.platform_applications a where a.site_id=p_site_id and a.access_id=aid and a.actor=auth.uid();
 return jsonb_build_object('schema_version','besc-intake-own-v1','lease_id',aid,'forms',forms,'applications',apps);
end$$;
create function public.f4_intake_application(p_site_id uuid,p_id uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare aid uuid;a private.platform_applications;begin
 perform private.f4_read_gate();aid:=private.f4_intake_own(p_site_id);if aid is null then raise exception 'intake_not_authorized' using errcode='42501';end if;
 perform private.f4_limit(p_site_id,'intake_own_read',60);select * into a from private.platform_applications where id=p_id and site_id=p_site_id and access_id=aid and actor=auth.uid();
 if a.id is null then raise exception 'intake_not_authorized' using errcode='42501';end if;
 return jsonb_build_object('schema_version','besc-intake-detail-v1','lease_id',aid,'id',a.id,'category','partnership','version',a.version,'status',a.status,'created_at',a.created_at,'updated_at',a.updated_at,'payload',a.payload,'form',a.form_snapshot,
 'events',(select coalesce(jsonb_agg(jsonb_build_object('version',e.version,'kind',e.kind,'status',e.status,'message',e.own_message,'created_at',e.created_at) order by e.version),'[]') from private.application_events e where e.application_id=a.id));
end$$;
create function public.f4_intake_admin(p_site_id uuid,p_after_time timestamptz default null,p_after_id uuid default null) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare o uuid;ch boolean;forms jsonb;grants jsonb;apps jsonb;begin
 perform private.f4_read_gate();select organization_id into o from public.publication_sites where id=p_site_id;
 ch:=private.f1_chair(o);if not private.f2_account(o) or not(ch or exists(select 1 from private.intake_forms f where f.site_id=p_site_id and private.f4_intake_handler(f.id,auth.uid()))) then raise exception 'intake_not_authorized' using errcode='42501';end if;
 perform private.f4_limit(p_site_id,'intake_admin_read',60);
 if(select count(*) from private.platform_access where site_id=p_site_id)>500 or(select count(*) from private.intake_forms where site_id=p_site_id)>200 or(select count(*) from private.intake_handlers h join private.intake_forms f on f.id=h.form_id where f.site_id=p_site_id)>500 then raise exception 'intake_page_required';end if;
 if(p_after_time is null)<>(p_after_id is null) then raise exception 'intake_invalid_input';end if;
 select coalesce(jsonb_agg(to_jsonb(f)||jsonb_build_object('can_handle',private.f4_intake_handler(f.id,auth.uid())) order by f.created_at desc),'[]') into forms from private.intake_forms f where f.site_id=p_site_id and(ch or private.f4_intake_handler(f.id,auth.uid()));
 select coalesce(jsonb_agg(to_jsonb(h)||jsonb_build_object('valid',private.f4_intake_handler(h.form_id,h.user_id))),'[]') into grants from private.intake_handlers h join private.intake_forms f on f.id=h.form_id where f.site_id=p_site_id and ch;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'form_id',a.form_id,'status',a.status,'version',a.version,'assigned_user_id',a.assigned_user_id,'created_at',a.created_at,'title',a.form_snapshot->>'title') order by a.created_at,a.id),'[]') into apps from(select x.* from private.platform_applications x where x.site_id=p_site_id and private.f4_intake_handler(x.form_id,auth.uid()) and(p_after_time is null or(x.created_at,x.id)>(p_after_time,p_after_id)) order by x.created_at,x.id limit 50)a;
 return jsonb_build_object('chair',ch,'forms',forms,'handlers',grants,'applications',apps,'next_after',case when jsonb_array_length(apps)=50 then jsonb_build_object('at',(apps->-1)->>'created_at','id',(apps->-1)->>'id')else null end,'actor',auth.uid(),'access',case when ch then(select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('valid',private.f4_access_valid(a.id))),'[]') from private.platform_access a where a.site_id=p_site_id)else '[]'::jsonb end);
end$$;
create function public.f4_intake_admin_application(p_site_id uuid,p_id uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare a private.platform_applications;begin
 perform private.f4_read_gate();select * into a from private.platform_applications where id=p_id and site_id=p_site_id;
 if a.id is null or not private.f2_account(a.organization_id) or not private.f4_intake_handler(a.form_id,auth.uid()) or not exists(select 1 from public.publication_sites where id=p_site_id and active) then raise exception 'intake_not_authorized' using errcode='42501';end if;
 perform private.f4_limit(p_site_id,'intake_admin_read',60);
 return to_jsonb(a)||jsonb_build_object('events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.version),'[]') from private.application_events e where e.application_id=a.id));
end$$;
create function private.f4_intake_binding_changed() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.account_user_id is distinct from old.account_user_id or(new.deleted_at is not null and old.deleted_at is null) then update private.intake_handlers set revoked_at=coalesce(revoked_at,clock_timestamp()) where person_id=old.id and organization_id=old.organization_id and revoked_at is null;end if;return new;
end$$;
create trigger f4_intake_binding_changed after update of account_user_id,deleted_at on public.community_people for each row execute function private.f4_intake_binding_changed();
-- Explicitly remove default execute grants. Existing creator helpers are unchanged.
do $$declare x record;begin for x in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('private','public') and p.proname like 'f4_intake_%' loop execute 'revoke all on function '||x.sig||' from public,anon,authenticated,service_role';end loop;end$$;
grant execute on function public.f4_intake_workflow(uuid,text,jsonb,uuid),public.f4_intake_me(uuid),public.f4_intake_admin(uuid,timestamptz,uuid),public.f4_intake_application(uuid,uuid),public.f4_intake_admin_application(uuid,uuid) to authenticated;
commit;
