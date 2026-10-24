begin;
-- Extend the existing private intake, without importing forms or submissions.
alter table private.intake_forms drop constraint intake_forms_category_check;
alter table private.intake_forms add constraint intake_forms_category_check check(category in('partnership','volunteer_application','general_contact'));
alter table private.platform_applications drop constraint platform_applications_category_check;
alter table private.platform_applications add constraint platform_applications_category_check check(category in('partnership','volunteer_application','general_contact'));
alter table private.platform_applications drop constraint f4_application_vacancy_shape;
alter table private.platform_applications add constraint f4_application_vacancy_shape check((category in('partnership','general_contact')and vacancy_public_id is null and vacancy_revision_id is null and vacancy_snapshot is null)or(category='volunteer_application'and vacancy_public_id is not null and vacancy_revision_id is not null and vacancy_snapshot is not null));
create table private.contact_settings(site_id uuid primary key,organization_id uuid not null,form_id uuid,enabled boolean not null default false,version integer not null default 1 check(version>0),policy_hash text,foreign key(organization_id,site_id)references public.publication_sites(organization_id,id),foreign key(organization_id,form_id)references private.intake_forms(organization_id,id),check(not enabled or(form_id is not null and policy_hash is not null)));
alter table private.contact_settings enable row level security;
revoke all on private.contact_settings from public,anon,authenticated,service_role;
create function private.f4_contact_payload(p jsonb)returns boolean language plpgsql immutable set search_path=''as $$begin
 if p is null or jsonb_typeof(p)<>'object'or pg_column_size(p)>18000 or not(p?&array['subject','message'])or exists(select 1 from jsonb_object_keys(p)k where k not in('subject','message'))then return false;end if;
 return coalesce(jsonb_typeof(p->'subject')='string'and length(btrim(p->>'subject'))between 1 and 200 and jsonb_typeof(p->'message')='string'and length(btrim(p->>'message'))between 1 and 4000,false);
end$$;
create function private.f4_contact_open(f private.intake_forms)returns boolean language sql stable security definer set search_path=''as $$select f.category='general_contact'and private.f4_intake_open(f)and exists(select 1 from private.contact_settings c where c.site_id=f.site_id and c.organization_id=f.organization_id and c.form_id=f.id and c.enabled and c.policy_hash=private.f4_partner_document(f.organization_id,f.policy_document_id))and exists(select 1 from private.intake_handlers h where h.form_id=f.id and private.f4_intake_handler(f.id,h.user_id))$$;
create function public.f4_contact_configure(p_site_id uuid,p_data jsonb,p_request_id uuid)returns jsonb language plpgsql volatile security definer set search_path=''as $$declare s public.publication_sites;f private.intake_forms;c private.contact_settings;prior private.f4_receipts;j jsonb:=p_data;answer jsonb;proof text;begin
 perform private.f4_read_gate();select * into s from public.publication_sites where id=p_site_id;
 if s.id is null or not private.f2_account(s.organization_id)or not private.f1_chair(s.organization_id)then raise exception'contact_not_authorized'using errcode='42501';end if;
 if p_request_id is null or j is null or jsonb_typeof(j)<>'object'or not(j?&array['form_id','expected_version','enabled','reason'])or exists(select 1 from jsonb_object_keys(j)k where k not in('form_id','expected_version','enabled','reason'))or jsonb_typeof(j->'enabled')is distinct from'boolean'or jsonb_typeof(j->'expected_version')is distinct from'number'or coalesce(j->>'expected_version','')!~'^(0|[1-9][0-9]*)$'or jsonb_typeof(j->'reason')is distinct from'string'or length(btrim(j->>'reason'))not between 2 and 2000 then raise exception'contact_invalid_input';end if;
 if j->'form_id'<>'null'::jsonb then select * into f from private.intake_forms where id=(j->>'form_id')::uuid and site_id=s.id and category='general_contact';proof:=private.f4_partner_document(s.organization_id,f.policy_document_id);if f.id is null or proof is null or not private.f1_document_visible(s.organization_id,f.policy_document_id)then raise exception'contact_invalid_form';end if;end if;
 select * into prior from private.f4_receipts where site_id=s.id and actor=auth.uid()and request_id=p_request_id;if found then if prior.operation<>'contact.configure'or prior.input<>j then raise exception'contact_request_conflict'using errcode='40001';end if;return prior.result;end if;
 select * into c from private.contact_settings where site_id=s.id for update;if coalesce(c.version,0)<>(j->>'expected_version')::integer then raise exception'contact_version_conflict'using errcode='40001';end if;
 if j->'enabled'='true'::jsonb and(f.id is null or not private.f4_intake_open(f)or not exists(select 1 from private.intake_handlers h where h.form_id=f.id and private.f4_intake_handler(f.id,h.user_id)))then raise exception'contact_open_form_and_handler_required';end if;
 perform private.f4_limit(s.id,'intake_write',20);insert into private.contact_settings(site_id,organization_id,form_id,enabled,version,policy_hash)values(s.id,s.organization_id,f.id,(j->>'enabled')::boolean,1,proof)on conflict(site_id)do update set form_id=excluded.form_id,enabled=excluded.enabled,version=private.contact_settings.version+1,policy_hash=excluded.policy_hash;
 answer:=jsonb_build_object('id',s.id);perform private.f1_audit(s.organization_id,s.id,'f4.contact.configure');insert into private.f4_receipts values(s.id,auth.uid(),p_request_id,'contact.configure',j,answer);return answer;
end$$;
create function private.f4_contact_proof_changed()returns trigger language plpgsql security definer set search_path=''as $$declare affected uuid[];begin
 if to_jsonb(new)=to_jsonb(old)then return new;end if;
 if tg_table_name='document_registry'then select array_agg(c.site_id)into affected from private.contact_settings c join private.intake_forms f on f.id=c.form_id where f.policy_document_id=old.id and c.enabled;
 else select array_agg(site_id)into affected from private.contact_settings where form_id=old.id and enabled;end if;
 update private.contact_settings set enabled=false,version=version+1 where site_id=any(affected);if cardinality(affected)>0 then perform private.f1_audit(old.organization_id,old.id,'f4.contact.policy_changed');end if;return new;
end$$;
create trigger f4_contact_document_changed after update of url,label,restricted_finance,restricted_governance,media_rights_revoked_at on public.document_registry for each row execute function private.f4_contact_proof_changed();
create trigger f4_contact_policy_changed after update of title,notice_version,notice_body,legal_basis,retention_policy,policy_document_id,opens_at,closes_at on private.intake_forms for each row execute function private.f4_contact_proof_changed();

create or replace function public.f4_intake_workflow(p_site_id uuid,p_operation text,p_data jsonb,p_request_id uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare s public.publication_sites;f private.intake_forms;a private.platform_applications;access private.platform_access;prior private.f4_receipts;
 op text:=p_operation;d jsonb:=p_data;allowed text[];field_key text;aid uuid;fid uuid;ident uuid;target uuid;answer jsonb;note text;msg text;next_status text;ve private.vacancy_entries;vr private.vacancy_revisions;vac_snapshot jsonb;begin
 perform private.f4_read_gate();select * into s from public.publication_sites where id=p_site_id;
 if s.id is null or p_request_id is null or d is null or jsonb_typeof(d)<>'object' or pg_column_size(d)>22000 then raise exception 'intake_not_available' using errcode='42501';end if;
 if op='form.create'and not(d?'category')then d:=d||jsonb_build_object('category','partnership');end if;
 allowed:=case op when 'form.create' then array['category','slug','version','title','notice_version','notice_body','legal_basis','retention_policy','policy_document_id','opens_at','closes_at'] when 'form.open' then array['id','policy_confirmed','reason'] when 'form.close' then array['id','reason'] when 'handler.assign' then array['form_id','user_id','proof_document_id','valid_until'] when 'handler.revoke' then array['id','reason'] when 'application.submit' then array['form_id','notice_version','notice_acknowledged','payload'] when 'application.withdraw' then array['id','expected_version'] when 'application.reply' then array['id','expected_version','message'] when 'application.claim' then array['id','expected_version'] when 'application.update' then array['id','expected_version','status','own_message','internal_note'] else null end;
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
 if found then if op='application.submit' and not exists(select 1 from private.platform_applications x where x.id=(prior.result->>'id')::uuid and x.site_id=s.id and x.access_id=aid and x.actor=auth.uid() and x.person_id=access.person_id) then raise exception 'intake_not_authorized' using errcode='42501';end if;if prior.operation<>'intake.'||op or(case when op='form.create'then prior.input||jsonb_build_object('category',coalesce(prior.input->>'category','partnership'))else prior.input end)<>d then raise exception 'intake_request_conflict' using errcode='40001';end if;return prior.result;end if;
 perform private.f4_limit(s.id,'intake_write',20);
 if op='form.create' then
  if(select count(*) from private.intake_forms where site_id=s.id)>=200 then raise exception 'intake_capacity';end if;
  if coalesce(d->>'category','')not in('partnership','volunteer_application','general_contact')or coalesce(d->>'slug','')!~'^[a-z0-9]+(-[a-z0-9]+)*$' or length(d->>'slug')>100 or jsonb_typeof(d->'version') is distinct from 'number' or coalesce(d->>'version','')!~'^[1-9][0-9]*$'
  or length(btrim(coalesce(d->>'title',''))) not between 2 and 180 or length(btrim(coalesce(d->>'notice_version',''))) not between 1 and 80
  or length(btrim(coalesce(d->>'notice_body',''))) not between 10 and 10000 or length(btrim(coalesce(d->>'legal_basis',''))) not between 2 and 2000 or length(btrim(coalesce(d->>'retention_policy',''))) not between 2 and 4000
  or not private.f1_document_visible(s.organization_id,(d->>'policy_document_id')::uuid) or not exists(select 1 from public.document_registry where id=(d->>'policy_document_id')::uuid and organization_id=s.organization_id)
  or d->>'opens_at' is null or d->>'closes_at' is null or(d->>'closes_at')::timestamptz<=(d->>'opens_at')::timestamptz then raise exception 'intake_invalid_input';end if;
  insert into private.intake_forms(organization_id,site_id,slug,version,category,title,notice_version,notice_body,legal_basis,retention_policy,policy_document_id,opens_at,closes_at,created_by)
  values(s.organization_id,s.id,d->>'slug',(d->>'version')::integer,d->>'category',d->>'title',d->>'notice_version',d->>'notice_body',d->>'legal_basis',d->>'retention_policy',(d->>'policy_document_id')::uuid,(d->>'opens_at')::timestamptz,(d->>'closes_at')::timestamptz,auth.uid()) returning id into ident;
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
  if not private.f4_intake_open(f) or d->'notice_acknowledged' is distinct from 'true'::jsonb or d->>'notice_version' is distinct from f.notice_version or not(case when f.category='partnership' then private.f4_intake_payload(d->'payload')when f.category='general_contact'then private.f4_contact_payload(d->'payload')else coalesce(private.f4_vacancy_application_payload(d->'payload'),false)end) then raise exception 'intake_invalid_input';end if;
  if f.category='general_contact'and not coalesce(private.f4_contact_open(f),false)then raise exception'contact_not_open'using errcode='42501';end if;
  if f.category='volunteer_application'then
   if not private.f4_vacancy_viewer(s.id)then raise exception'vacancy_not_authorized'using errcode='42501';end if;
   select e.* into ve from private.vacancy_entries e join private.vacancy_dossiers vd on vd.id=e.dossier_id where e.public_id=(d->'payload'->>'vacancy_public_id')::uuid and e.site_id=s.id and vd.form_id=f.id and private.f4_vacancy_open(e);
   if ve.public_id is null then raise exception'vacancy_not_open'using errcode='42501';end if;
   select * into vr from private.vacancy_revisions where id=ve.selected_revision_id;
   if vr.revision<>(d->'payload'->>'expected_vacancy_revision')::integer then raise exception'vacancy_revision_conflict'using errcode='40001';end if;
   vac_snapshot:=private.f4_vacancy_project(ve);
  end if;
  insert into private.platform_applications(organization_id,site_id,form_id,access_id,actor,person_id,payload,payload_sha256,form_snapshot,category,vacancy_public_id,vacancy_revision_id,vacancy_snapshot)
  values(s.organization_id,s.id,f.id,aid,auth.uid(),access.person_id,d->'payload',encode(sha256(convert_to((d->'payload')::text,'UTF8')),'hex'),jsonb_build_object('title',f.title,'version',f.version,'notice_version',f.notice_version,'notice_body',f.notice_body,'legal_basis',f.legal_basis,'retention_policy',f.retention_policy),f.category,ve.public_id,vr.id,vac_snapshot) returning id into ident;
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


create or replace function public.f4_intake_me(p_site_id uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare aid uuid;forms jsonb;apps jsonb;begin
 perform private.f4_read_gate();aid:=private.f4_intake_own(p_site_id);if aid is null then raise exception 'intake_not_authorized' using errcode='42501';end if;
 perform private.f4_limit(p_site_id,'intake_own_read',60);
 if(select count(*) from private.intake_forms f where f.site_id=p_site_id and private.f4_intake_open(f))>50 or(select count(*) from private.platform_applications where site_id=p_site_id and access_id=aid and actor=auth.uid())>100 then raise exception 'intake_page_required';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'category',f.category,'title',f.title,'version',f.version,'notice_version',f.notice_version,'notice_body',f.notice_body,'legal_basis',f.legal_basis,'retention_policy',f.retention_policy,'closes_at',f.closes_at)||case when f.category='volunteer_application'then jsonb_build_object('vacancies',private.f4_vacancy_form_links(f.id))else'{}'::jsonb end order by f.title,f.id),'[]') into forms from private.intake_forms f where f.site_id=p_site_id and private.f4_intake_open(f)and(f.category='partnership'or f.category='general_contact'and private.f4_contact_open(f)or f.category='volunteer_application'and jsonb_array_length(private.f4_vacancy_form_links(f.id))>0);
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'title',a.form_snapshot->>'title','category',a.category,'version',a.version,'status',a.status,'created_at',a.created_at,'updated_at',a.updated_at) order by a.created_at desc,a.id desc),'[]') into apps
 from private.platform_applications a where a.site_id=p_site_id and a.access_id=aid and a.actor=auth.uid();
 return jsonb_build_object('schema_version','besc-intake-own-v1','lease_id',aid,'forms',forms,'applications',apps);
end$$;


create or replace function public.f4_intake_admin(p_site_id uuid,p_after_time timestamptz default null,p_after_id uuid default null) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare o uuid;ch boolean;forms jsonb;grants jsonb;apps jsonb;begin
 perform private.f4_read_gate();select organization_id into o from public.publication_sites where id=p_site_id;
 ch:=private.f1_chair(o);if not private.f2_account(o) or not(ch or exists(select 1 from private.intake_forms f where f.site_id=p_site_id and private.f4_intake_handler(f.id,auth.uid()))) then raise exception 'intake_not_authorized' using errcode='42501';end if;
 perform private.f4_limit(p_site_id,'intake_admin_read',60);
 if(select count(*) from private.platform_access where site_id=p_site_id)>500 or(select count(*) from private.intake_forms where site_id=p_site_id)>200 or(select count(*) from private.intake_handlers h join private.intake_forms f on f.id=h.form_id where f.site_id=p_site_id)>500 then raise exception 'intake_page_required';end if;
 if(p_after_time is null)<>(p_after_id is null) then raise exception 'intake_invalid_input';end if;
 select coalesce(jsonb_agg(to_jsonb(f)||jsonb_build_object('can_handle',private.f4_intake_handler(f.id,auth.uid())) order by f.created_at desc),'[]') into forms from private.intake_forms f where f.site_id=p_site_id and(ch or private.f4_intake_handler(f.id,auth.uid()));
 select coalesce(jsonb_agg(to_jsonb(h)||jsonb_build_object('valid',private.f4_intake_handler(h.form_id,h.user_id))),'[]') into grants from private.intake_handlers h join private.intake_forms f on f.id=h.form_id where f.site_id=p_site_id and ch;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'category',a.category,'form_id',a.form_id,'status',a.status,'version',a.version,'assigned_user_id',a.assigned_user_id,'created_at',a.created_at,'title',a.form_snapshot->>'title') order by a.created_at,a.id),'[]') into apps from(select x.* from private.platform_applications x where x.site_id=p_site_id and private.f4_intake_handler(x.form_id,auth.uid()) and(p_after_time is null or(x.created_at,x.id)>(p_after_time,p_after_id)) order by x.created_at,x.id limit 50)a;
 return jsonb_build_object('chair',ch,'forms',forms,'handlers',grants,'applications',apps,'next_after',case when jsonb_array_length(apps)=50 then jsonb_build_object('at',(apps->-1)->>'created_at','id',(apps->-1)->>'id')else null end,'actor',auth.uid(),'contact',case when ch then(select to_jsonb(c)||jsonb_build_object('available',coalesce((select private.f4_contact_open(f)from private.intake_forms f where f.id=c.form_id),false))from private.contact_settings c where site_id=p_site_id)else null end,'access',case when ch then(select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('valid',private.f4_access_valid(a.id))),'[]') from private.platform_access a where a.site_id=p_site_id)else '[]'::jsonb end);
end$$;

do $$declare x record;begin for x in select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private')and p.proname like'f4_contact_%'loop execute format('revoke all on function %I.%I(%s)from public,anon,authenticated,service_role',x.nspname,x.proname,x.args);end loop;end$$;
grant execute on function public.f4_contact_configure(uuid,jsonb,uuid)to authenticated;

create or replace function private.f4_content_redirect_safe(s uuid,p jsonb)returns boolean language sql stable security definer set search_path=''as $$select p->>'old_path'not in('/','/nieuws','/events','/creators','/samenwerkingen','/esports','/vrijwilligers','/mijn-besc')and p->>'old_path'!~'^/(api|auth|login|logout|contact|events|nieuws|creators|samenwerkingen|esports|vrijwilligers|mijn-besc|media|creator-media|partner-media|page-media|assets|robots[.]txt|favicon[.]ico|_next)(/|$)'and not exists(select 1 from private.site_content_entries x join private.site_content_dossiers y on y.id=x.dossier_id join private.site_content_revisions z on z.id=x.selected_revision_id where x.site_id=s and y.kind='page'and '/'||(z.payload->>'slug')=p->>'old_path'and private.f4_content_entry(x))and(p->>'mode'='gone'or(private.f4_content_target_exists(s,p->>'target_path')and not exists(select 1 from private.site_content_entries e join private.site_content_dossiers d on d.id=e.dossier_id join private.site_content_revisions r on r.id=e.selected_revision_id where e.site_id=s and d.kind='redirect'and e.withdrawn_at is null and private.f4_content_key('redirect',r.payload)<>private.f4_content_key('redirect',p)and((r.payload->>'old_path')||case when r.payload->>'old_query'=''then''else'?'||(r.payload->>'old_query')end=p->>'target_path'or r.payload->>'target_path'=(p->>'old_path')||case when p->>'old_query'=''then''else'?'||(p->>'old_query')end))))$$;

create or replace function private.f4_content_target_exists(s uuid,p text)returns boolean language sql stable security definer set search_path=''as $$
 select private.f4_content_target(p)and(split_part(p,'?',1)in('/','/contact','/nieuws','/events','/creators','/samenwerkingen','/esports','/vrijwilligers','/mijn-besc')or
 exists(select 1 from private.site_content_entries e join private.site_content_dossiers d on d.id=e.dossier_id join private.site_content_revisions r on r.id=e.selected_revision_id where e.site_id=s and d.kind='page'and'/'||(r.payload->>'slug')=split_part(p,'?',1)and r.payload->>'locale'=case when position('?locale='in p)>0 then split_part(p,'?locale=',2)else'nl-BE'end and private.f4_content_entry(e))or
 exists(select 1 from public.publication_entries e where e.site_id=s and private.f2_valid(e)and('/'||case e.source_type when'news'then'nieuws'else'events'end||'/'||e.slug)=split_part(p,'?',1)and e.locale=case when position('?locale='in p)>0 then split_part(p,'?locale=',2)else'nl-BE'end))
$$;
commit;
