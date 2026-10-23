begin;
-- Partner publication reuses public.partners and partner_roles. No source rows or grants seeded.
create table private.partner_publication_settings(site_id uuid primary key,organization_id uuid not null,enabled boolean not null default false,foreign key(organization_id,site_id) references public.publication_sites(organization_id,id));
create table private.partner_publication_revisions(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,site_id uuid not null,partner_id uuid not null references public.partners(id),
 revision integer not null check(revision>0),payload jsonb not null,payload_sha256 text not null,source_hash text not null,proof_hash text not null,role_ids uuid[] not null,
 proof_document_id uuid not null references public.document_registry(id),status text not null default 'draft' check(status in('draft','submitted','changes_requested','approved','withdrawn')),
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default clock_timestamp(),reviewed_by uuid references public.profiles(id),reviewed_at timestamptz,review_note text,
 foreign key(organization_id,site_id) references public.publication_sites(organization_id,id),unique(site_id,partner_id,revision),unique(organization_id,id));
create table private.partner_publication_entries(
 public_id uuid primary key default gen_random_uuid(),organization_id uuid not null,site_id uuid not null,partner_id uuid not null references public.partners(id),selected_revision_id uuid not null,
 locale text not null check(locale in('nl-BE','fr-BE','en')),slug text not null check(length(slug)<=160 and slug~'^[a-z0-9]+(-[a-z0-9]+)*$'),epoch bigint not null default 1,
 published_at timestamptz not null,valid_until timestamptz,withdrawn_at timestamptz,foreign key(organization_id,site_id) references public.publication_sites(organization_id,id),
 foreign key(organization_id,selected_revision_id) references private.partner_publication_revisions(organization_id,id),unique(site_id,partner_id,locale),unique(site_id,locale,slug),check(epoch>0),check(valid_until is null or valid_until>published_at));
do $$declare t text;begin foreach t in array array['partner_publication_settings','partner_publication_revisions','partner_publication_entries'] loop execute format('alter table private.%I enable row level security',t);execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);end loop;end$$;
create function private.f4_partner_url(u text) returns boolean language sql immutable set search_path='' as $$
 select u is null or(length(u)<=2048 and u~'^https://[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?([.][A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*[.][A-Za-z]{2,63}(/[^[:space:]?#\\]*)?$'
 and lower(split_part(u,'/',3))!~'[.](local|localhost|internal)$' and u!~*'/((private|sign|token)(/|$))' and u!~'[[:cntrl:]]')
$$;
create function private.f4_partner_payload(p jsonb) returns boolean language plpgsql immutable set search_path='' as $$declare x jsonb;begin
 if p is null or jsonb_typeof(p)<>'object' or pg_column_size(p)>12000 or not(p?&array['slug','locale','name','description','roles','website_url','logo']) or exists(select 1 from jsonb_object_keys(p) k where k not in('slug','locale','name','description','roles','website_url','logo')) then return false;end if;
 if jsonb_typeof(p->'slug') is distinct from 'string' or length(p->>'slug') not between 1 and 160 or p->>'slug'!~'^[a-z0-9]+(-[a-z0-9]+)*$' or coalesce(p->>'locale','') not in('nl-BE','fr-BE','en')
 or jsonb_typeof(p->'name') is distinct from 'string' or length(btrim(p->>'name')) not between 2 and 180 or jsonb_typeof(p->'description') is distinct from 'string' or length(btrim(p->>'description')) not between 1 and 4000
 or jsonb_typeof(p->'roles') is distinct from 'array' or(jsonb_typeof(p->'website_url') is distinct from 'string' and p->'website_url'<>'null'::jsonb) or not private.f4_partner_url(p->>'website_url') then return false;end if;
 if jsonb_array_length(p->'roles') not between 1 and 6 or exists(select 1 from jsonb_array_elements(p->'roles') v where jsonb_typeof(v)<>'string' or v#>>'{}' not in('sponsor','esports','community','event','education','social_impact')) or(select count(*)<>count(distinct v) from jsonb_array_elements(p->'roles') v) then return false;end if;
 x:=p->'logo';if x<>'null'::jsonb and not private.f4_payload(jsonb_build_object('slug',p->>'slug','locale',p->>'locale','display_name','Partnerlogo','avatar',x)) then return false;end if;return true;
end$$;
create function private.f4_partner_document(o uuid,i uuid) returns text language sql stable security definer set search_path='' as $$
 select encode(sha256(convert_to(jsonb_build_object('id',d.id,'url',d.url,'label',d.label,'finance',d.restricted_finance,'governance',d.restricted_governance,'revoked',d.media_rights_revoked_at)::text,'UTF8')),'hex') from public.document_registry d where d.id=i and d.organization_id=o and d.media_rights_revoked_at is null
$$;
create function private.f4_partner_evidence(o uuid,s uuid,proof uuid,logo jsonb) returns text language sql stable security definer set search_path='' as $$
 select case when private.f4_partner_document(o,proof) is not null then encode(sha256(convert_to(jsonb_build_object('proof',private.f4_partner_document(o,proof),'logo',(select jsonb_build_object('id',m.public_media_id,'sha256',m.sha256,'path',m.storage_path,'mime',m.mime,'bytes',m.bytes,'revoked',m.revoked_at,'proof',private.f4_partner_document(o,m.document_id)) from public.publication_media m where m.organization_id=o and m.site_id=s and m.public_media_id::text=logo->>'public_media_id'))::text,'UTF8')),'hex') end
$$;
create function private.f4_partner_source(o uuid,p uuid,ids uuid[]) returns text language sql stable security definer set search_path='' set timezone='Europe/Brussels' as $$
 select case when x.status='active' and x.deleted_at is null and cardinality(ids) between 1 and 6 and cardinality(ids)=(select count(distinct v) from unnest(ids) v)
 and cardinality(ids)=(select count(*) from public.partner_roles r join public.document_registry d on d.id=r.proof_document_id and d.organization_id=r.organization_id where r.id=any(ids) and r.organization_id=o and r.partner_id=p and r.revoked_at is null and r.valid_from<=(clock_timestamp() at time zone 'Europe/Brussels')::date and(r.valid_until is null or r.valid_until>=(clock_timestamp() at time zone 'Europe/Brussels')::date) and d.media_rights_revoked_at is null)
 then encode(sha256(convert_to(jsonb_build_object('name',x.name,'status',x.status,'website',nullif(btrim(x.website),''),'roles',(select jsonb_agg(jsonb_build_object('id',r.id,'role',r.role,'from',r.valid_from,'until',r.valid_until,'proof',r.proof_document_id,'proof_version',private.f4_partner_document(o,r.proof_document_id),'revoked',r.revoked_at) order by r.id) from public.partner_roles r where r.id=any(ids)))::text,'UTF8')),'hex') end
 from public.partners x where x.organization_id=o and x.id=p
$$;
create function private.f4_partner_current(r private.partner_publication_revisions) returns boolean language sql stable security definer set search_path='' as $$
 select private.f4_partner_payload(r.payload) and r.proof_hash=private.f4_partner_evidence(r.organization_id,r.site_id,r.proof_document_id,r.payload->'logo') and r.source_hash=private.f4_partner_source(r.organization_id,r.partner_id,r.role_ids)
 and exists(select 1 from public.partners p where p.id=r.partner_id and p.organization_id=r.organization_id and p.name=r.payload->>'name' and nullif(btrim(p.website),'') is not distinct from r.payload->>'website_url')
 and(select jsonb_agg(role order by role) from public.partner_roles where id=any(r.role_ids))=(select jsonb_agg(v order by v) from jsonb_array_elements_text(r.payload->'roles') v)
 and exists(select 1 from public.document_registry d where d.id=r.proof_document_id and d.organization_id=r.organization_id and d.media_rights_revoked_at is null)
 and private.f4_avatar(r.organization_id,r.site_id,jsonb_build_object('avatar',r.payload->'logo'))
$$;
create function private.f4_partner_proof_access(r private.partner_publication_revisions) returns boolean language sql stable security definer set search_path='' as $$
 select private.f1_document_visible(r.organization_id,r.proof_document_id) and not exists(select 1 from public.partner_roles p where p.id=any(r.role_ids) and not private.f1_document_visible(r.organization_id,p.proof_document_id))
 and(r.payload->'logo'='null'::jsonb or exists(select 1 from public.publication_media m where m.site_id=r.site_id and m.public_media_id::text=r.payload->'logo'->>'public_media_id' and private.f1_document_visible(r.organization_id,m.document_id)))
$$;
create function private.f4_partner_viewer(s uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.f4_identity() and exists(select 1 from public.publication_sites p join private.partner_publication_settings cfg on cfg.site_id=p.id where p.id=s and p.active and cfg.enabled
 and(private.f2_viewer(s) or exists(select 1 from private.platform_access a where a.site_id=s and a.user_id=auth.uid() and a.may_view and private.f4_access_valid(a.id))))
$$;
create function private.f4_partner_entry(e private.partner_publication_entries) returns boolean language sql stable security definer set search_path='' as $$
 select e.withdrawn_at is null and e.published_at<=clock_timestamp() and(e.valid_until is null or e.valid_until>clock_timestamp()) and exists(select 1 from public.publication_sites s join private.partner_publication_settings cfg on cfg.site_id=s.id where s.id=e.site_id and s.active and cfg.enabled)
 and exists(select 1 from private.partner_publication_revisions r where r.id=e.selected_revision_id and r.site_id=e.site_id and r.organization_id=e.organization_id and r.partner_id=e.partner_id and r.status='approved' and private.f4_partner_current(r))
$$;
create function public.f4_partner_workflow(p_site_id uuid,p_operation text,p_data jsonb,p_request_id uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare s public.publication_sites;r private.partner_publication_revisions;e private.partner_publication_entries;prior private.f4_receipts;op text:=p_operation;d jsonb:=p_data;allowed text[];ids uuid[];ident uuid;p uuid;v integer;hash text;answer jsonb;start_at timestamptz;end_at timestamptz;begin
 perform private.f4_read_gate();select * into s from public.publication_sites where id=p_site_id;
 if s.id is null or p_request_id is null or d is null or jsonb_typeof(d)<>'object' or pg_column_size(d)>18000 then raise exception 'partner_not_available' using errcode='42501';end if;
 allowed:=case op when 'site.configure' then array['enabled','reason'] when 'partner.draft' then array['partner_id','expected_revision','payload','role_ids','proof_document_id'] when 'partner.submit' then array['id','expected_hash'] when 'partner.review' then array['id','expected_hash','decision','reason','rights_confirmed'] when 'partner.release' then array['id','expected_hash','expected_epoch','reason','published_at','valid_until'] when 'partner.withdraw' then array['partner_id','reason'] else null end;
 if allowed is null or not(d?&allowed) or exists(select 1 from jsonb_object_keys(d) k where not(k=any(allowed))) then raise exception 'partner_invalid_input';end if;
 if op='site.configure' then if not private.f1_chair(s.organization_id) or not private.f2_account(s.organization_id) then raise exception 'partner_not_authorized' using errcode='42501';end if;
 elsif op='partner.review' then if not private.f1_role(s.organization_id,'publication_reviewer') or not private.f2_account(s.organization_id) then raise exception 'partner_not_authorized' using errcode='42501';end if;
 else if not private.f1_role(s.organization_id,'publication_editor') or not private.f2_account(s.organization_id) or(op in('partner.draft','partner.submit') and not private.f1_role(s.organization_id,'partner_editor')) then raise exception 'partner_not_authorized' using errcode='42501';end if;end if;
 if op in('partner.submit','partner.review','partner.release') then select * into r from private.partner_publication_revisions where id=(d->>'id')::uuid and site_id=s.id for update;if r.id is null or not private.f4_partner_proof_access(r) then raise exception 'partner_not_authorized' using errcode='42501';end if;end if;
 if op in('partner.draft','partner.withdraw') and not exists(select 1 from public.partners where id=(d->>'partner_id')::uuid and organization_id=s.organization_id) then raise exception 'partner_not_authorized' using errcode='42501';end if;
 select * into prior from private.f4_receipts where site_id=s.id and actor=auth.uid() and request_id=p_request_id;
 if found then if prior.operation<>'partner.'||op or prior.input<>d then raise exception 'partner_request_conflict' using errcode='40001';end if;return prior.result;end if;
 perform private.f4_limit(s.id,'partner_write',30);
 if op='site.configure' then
  if jsonb_typeof(d->'enabled') is distinct from 'boolean' or jsonb_typeof(d->'reason') is distinct from 'string' or length(btrim(d->>'reason')) not between 2 and 2000 then raise exception 'partner_invalid_input';end if;
  insert into private.partner_publication_settings values(s.id,s.organization_id,(d->>'enabled')::boolean) on conflict(site_id) do update set enabled=excluded.enabled;ident:=s.id;
 elsif op='partner.draft' then
  if not private.f4_partner_payload(d->'payload') or jsonb_typeof(d->'role_ids') is distinct from 'array' or jsonb_typeof(d->'expected_revision') is distinct from 'number' or coalesce(d->>'expected_revision','')!~'^(0|[1-9][0-9]*)$' then raise exception 'partner_invalid_input';end if;
  select array_agg(value::uuid order by value) into ids from jsonb_array_elements_text(d->'role_ids');p:=(d->>'partner_id')::uuid;select coalesce(max(revision),0) into v from private.partner_publication_revisions where site_id=s.id and partner_id=p;
  if v<>(d->>'expected_revision')::integer then raise exception 'partner_version_conflict' using errcode='40001';end if;
  if(select count(*) from private.partner_publication_revisions where site_id=s.id)>=1000 then raise exception 'partner_capacity';end if;
  r.organization_id:=s.organization_id;r.site_id:=s.id;r.partner_id:=p;r.payload:=d->'payload';r.source_hash:=private.f4_partner_source(s.organization_id,p,ids);r.role_ids:=ids;r.proof_document_id:=(d->>'proof_document_id')::uuid;r.proof_hash:=private.f4_partner_evidence(s.organization_id,s.id,r.proof_document_id,r.payload->'logo');
  if r.source_hash is null or not coalesce(private.f4_partner_current(r),false) or not coalesce(private.f4_partner_proof_access(r),false) then raise exception 'partner_source_or_proof_invalid';end if;
  hash:=encode(sha256(convert_to((d->'payload')::text,'UTF8')),'hex');
  insert into private.partner_publication_revisions(organization_id,site_id,partner_id,revision,payload,payload_sha256,source_hash,proof_hash,role_ids,proof_document_id,created_by) values(s.organization_id,s.id,p,v+1,r.payload,hash,r.source_hash,r.proof_hash,ids,r.proof_document_id,auth.uid()) returning id into ident;
 elsif op in('partner.submit','partner.review','partner.release') then
  if d->>'expected_hash' is distinct from r.payload_sha256 then raise exception 'partner_hash_conflict' using errcode='40001';end if;ident:=r.id;
  if op='partner.submit' then
   if r.status<>'draft' or r.created_by<>auth.uid() or not coalesce(private.f4_partner_current(r),false) then raise exception 'partner_source_or_version_invalid';end if;update private.partner_publication_revisions set status='submitted' where id=r.id;
  elsif op='partner.review' then
   if r.status<>'submitted' or r.created_by=auth.uid() then raise exception 'partner_independent_review_required' using errcode='42501';end if;
   if d->'rights_confirmed' is distinct from 'true'::jsonb or coalesce(d->>'decision','') not in('approved','changes_requested') or jsonb_typeof(d->'reason') is distinct from 'string' or length(btrim(d->>'reason')) not between 2 and 2000 then raise exception 'partner_invalid_input';end if;
   if d->>'decision'='approved' and not coalesce(private.f4_partner_current(r),false) then raise exception 'partner_source_invalid';end if;
   update private.partner_publication_revisions set status=d->>'decision',reviewed_by=auth.uid(),reviewed_at=clock_timestamp(),review_note=d->>'reason' where id=r.id;
  else
   if r.status<>'approved' or not coalesce(private.f4_partner_current(r),false) or jsonb_typeof(d->'expected_epoch') is distinct from 'number' or coalesce(d->>'expected_epoch','')!~'^(0|[1-9][0-9]*)$' or jsonb_typeof(d->'reason') is distinct from 'string' or length(btrim(d->>'reason')) not between 2 and 2000 then raise exception 'partner_source_or_version_invalid';end if;
   select * into e from private.partner_publication_entries where site_id=s.id and partner_id=r.partner_id and locale=r.payload->>'locale' for update;
   if coalesce(e.epoch,0)<>(d->>'expected_epoch')::bigint or(e.public_id is not null and e.slug<>r.payload->>'slug') then raise exception 'partner_release_conflict' using errcode='40001';end if;
   start_at:=coalesce((d->>'published_at')::timestamptz,clock_timestamp());end_at:=(d->>'valid_until')::timestamptz;if end_at is not null and end_at<=start_at then raise exception 'partner_invalid_window';end if;
   if e.public_id is null then insert into private.partner_publication_entries(organization_id,site_id,partner_id,selected_revision_id,locale,slug,published_at,valid_until) values(s.organization_id,s.id,r.partner_id,r.id,r.payload->>'locale',r.payload->>'slug',start_at,end_at) returning public_id into ident;
   else update private.partner_publication_entries set selected_revision_id=r.id,epoch=epoch+1,published_at=start_at,valid_until=end_at,withdrawn_at=null where public_id=e.public_id;ident:=e.public_id;end if;
  end if;
 else
  if jsonb_typeof(d->'reason') is distinct from 'string' or length(btrim(d->>'reason')) not between 2 and 2000 then raise exception 'partner_invalid_input';end if;p:=(d->>'partner_id')::uuid;
  update private.partner_publication_entries set withdrawn_at=coalesce(withdrawn_at,clock_timestamp()) where site_id=s.id and partner_id=p;
  update private.partner_publication_revisions set status='withdrawn' where site_id=s.id and partner_id=p and status in('submitted','approved');ident:=p;
 end if;
 answer:=jsonb_build_object('id',ident);perform private.f1_audit(s.organization_id,ident,'f4.partner.'||op);insert into private.f4_receipts values(s.id,auth.uid(),p_request_id,'partner.'||op,d,answer);return answer;
end$$;
create function private.f4_partner_source_changed() returns trigger language plpgsql security definer set search_path='' as $$declare p uuid;rid uuid;begin
 if tg_table_name='partners' then
  if(new.name,new.status,new.website,new.deleted_at) is not distinct from(old.name,old.status,old.website,old.deleted_at) then return new;end if;p:=old.id;
 else
  if tg_op='UPDATE' and to_jsonb(new)=to_jsonb(old) then return new;end if;p:=old.partner_id;rid:=old.id;
 end if;
 update private.partner_publication_entries e set withdrawn_at=coalesce(e.withdrawn_at,clock_timestamp()) where e.partner_id=p and(rid is null or exists(select 1 from private.partner_publication_revisions r where r.id=e.selected_revision_id and rid=any(r.role_ids)));
 update private.partner_publication_revisions r set status='withdrawn' where r.partner_id=p and r.status in('submitted','approved') and(rid is null or rid=any(r.role_ids));
 if exists(select 1 from private.partner_publication_revisions where partner_id=p) then perform private.f1_audit(old.organization_id,p,'f4.partner.source_changed');end if;
 if tg_op='DELETE' then return old;end if;return new;
end$$;
create trigger f4_partner_source_changed after update of name,status,website,deleted_at on public.partners for each row execute function private.f4_partner_source_changed();
create trigger f4_partner_role_changed after update or delete on public.partner_roles for each row execute function private.f4_partner_source_changed();
create function private.f4_partner_evidence_changed() returns trigger language plpgsql security definer set search_path='' as $$declare affected uuid[];begin
 if to_jsonb(new)=to_jsonb(old) then return new;end if;
 if tg_table_name='document_registry' then
  select array_agg(r.id) into affected from private.partner_publication_revisions r where r.proof_document_id=old.id or exists(select 1 from public.partner_roles x where x.id=any(r.role_ids) and x.proof_document_id=old.id) or exists(select 1 from public.publication_media m where m.site_id=r.site_id and m.public_media_id::text=r.payload->'logo'->>'public_media_id' and m.document_id=old.id);
 else select array_agg(r.id) into affected from private.partner_publication_revisions r where r.site_id=old.site_id and r.payload->'logo'->>'public_media_id'=old.public_media_id::text;end if;
 update private.partner_publication_entries set withdrawn_at=coalesce(withdrawn_at,clock_timestamp()) where selected_revision_id=any(affected);
 update private.partner_publication_revisions set status='withdrawn' where id=any(affected) and status in('submitted','approved');if cardinality(affected)>0 then perform private.f1_audit(old.organization_id,case when tg_table_name='document_registry' then(to_jsonb(old)->>'id')::uuid else(to_jsonb(old)->>'public_media_id')::uuid end,'f4.partner.evidence_changed');end if;return new;
end$$;
create trigger f4_partner_evidence_changed after update of url,label,restricted_finance,restricted_governance,media_rights_revoked_at on public.document_registry for each row execute function private.f4_partner_evidence_changed();
create trigger f4_partner_logo_changed after update of storage_path,sha256,mime,bytes,revoked_at,document_id on public.publication_media for each row execute function private.f4_partner_evidence_changed();
create function public.f4_partner_admin(p_site_id uuid,p_before_time timestamptz default null,p_before_id uuid default null) returns jsonb language plpgsql volatile security definer set search_path='' as $$declare o uuid;ch boolean;ed boolean;rv boolean;curate boolean;begin
 perform private.f4_read_gate();select organization_id into o from public.publication_sites where id=p_site_id;ch:=private.f1_chair(o);ed:=private.f1_role(o,'publication_editor');rv:=private.f1_role(o,'publication_reviewer');curate:=ed and private.f1_role(o,'partner_editor');
 if not private.f2_account(o) or not(ch or ed or rv) then raise exception 'partner_not_authorized' using errcode='42501';end if;perform private.f4_limit(p_site_id,'partner_admin_read',60);
 if curate and(select count(*) from public.partners where organization_id=o and status='active' and deleted_at is null)>200 then raise exception 'partner_page_required';end if;
 if(p_before_time is null)<>(p_before_id is null) then raise exception 'partner_invalid_input';end if;
 return jsonb_build_object('chair',ch,'editor',ed,'reviewer',rv,'curate',curate,'enabled',coalesce((select enabled from private.partner_publication_settings where site_id=p_site_id),false),
 'partners',case when curate then(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'website',nullif(btrim(p.website),''),'revision',(select coalesce(max(revision),0) from private.partner_publication_revisions where partner_id=p.id and site_id=p_site_id),'roles',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'role',r.role,'proof_document_id',r.proof_document_id)),'[]') from public.partner_roles r where r.organization_id=o and r.partner_id=p.id and r.revoked_at is null and r.proof_document_id is not null and private.f1_document_visible(o,r.proof_document_id) and r.valid_from<=(clock_timestamp() at time zone 'Europe/Brussels')::date and(r.valid_until is null or r.valid_until>=(clock_timestamp() at time zone 'Europe/Brussels')::date))) order by p.name,p.id),'[]') from public.partners p where p.organization_id=o and p.status='active' and p.deleted_at is null)else '[]'::jsonb end,
 'revisions',(select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('current_source',coalesce(private.f4_partner_current(r),false),'proof_access',coalesce(private.f4_partner_proof_access(r),false)) order by r.created_at desc,r.id desc),'[]') from(select x.* from private.partner_publication_revisions x where x.site_id=p_site_id and private.f4_partner_proof_access(x) and(curate or((ed or rv) and x.status<>'draft')) and(p_before_time is null or(x.created_at,x.id)<(p_before_time,p_before_id)) order by x.created_at desc,x.id desc limit 50)r),
 'next_before',(select case when count(*)=50 then jsonb_build_object('at',min(v.created_at),'id',(array_agg(v.id order by v.created_at,v.id))[1])else null end from(select x.created_at,x.id from private.partner_publication_revisions x where x.site_id=p_site_id and private.f4_partner_proof_access(x) and(curate or((ed or rv) and x.status<>'draft')) and(p_before_time is null or(x.created_at,x.id)<(p_before_time,p_before_id)) order by x.created_at desc,x.id desc limit 50)v),'entries',case when ed or rv then(select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('available',coalesce(private.f4_partner_entry(e),false))),'[]') from private.partner_publication_entries e where e.site_id=p_site_id)else '[]'::jsonb end);
end$$;
create function private.f4_partner_project(e private.partner_publication_entries) returns jsonb language sql stable security definer set search_path='' as $$
 select r.payload||jsonb_build_object('schema_version','besc-platform-publication-v1','type','partner','public_id',e.public_id,'revision',r.revision,'published_at',e.published_at,'valid_until',e.valid_until) from private.partner_publication_revisions r where r.id=e.selected_revision_id
$$;
create function public.f4_partners(p_site_id uuid,p_slug text default null,p_locale text default 'nl-BE',p_limit integer default 20,p_before_time timestamptz default null,p_before_id uuid default null,p_role text default null,p_search text default null) returns jsonb language plpgsql volatile security definer set search_path='' as $$declare result jsonb;begin
 perform private.f4_read_gate();if not private.f4_partner_viewer(p_site_id) then raise exception 'partner_not_authorized' using errcode='42501';end if;
 if p_locale is null or p_locale not in('nl-BE','fr-BE','en') or p_limit is null or p_limit not between 1 and 50 or(p_before_time is null)<>(p_before_id is null) or(p_slug is not null and(length(p_slug)>160 or p_slug!~'^[a-z0-9]+(-[a-z0-9]+)*$')) or(p_role is not null and p_role not in('sponsor','esports','community','event','education','social_impact')) or length(p_search)>80 then raise exception 'partner_invalid_input';end if;
 perform private.f4_limit(p_site_id,'partner_read',120);
 select coalesce(jsonb_agg(private.f4_partner_project(v) order by v.published_at desc,v.public_id desc),'[]') into result from(select e.* from private.partner_publication_entries e join private.partner_publication_revisions r on r.id=e.selected_revision_id where e.site_id=p_site_id and e.locale=p_locale and private.f4_partner_entry(e) and(p_slug is null or e.slug=p_slug) and(p_before_time is null or(e.published_at,e.public_id)<(p_before_time,p_before_id)) and(p_role is null or r.payload->'roles'?p_role) and(p_search is null or position(lower(p_search) in lower(r.payload->>'name'))>0) order by e.published_at desc,e.public_id desc limit p_limit)v;return result;
end$$;
create function public.f4_partner_media_locator(p_site_id uuid,p_media_id uuid,p_server_key text) returns jsonb language plpgsql volatile security definer set search_path='' as $$declare m public.publication_media;begin
 perform private.f4_read_gate();if not private.f4_partner_viewer(p_site_id) or length(p_server_key) not between 32 and 256 or not exists(select 1 from public.publication_sites where id=p_site_id and key_sha256=encode(sha256(convert_to(p_server_key,'UTF8')),'hex')) then raise exception 'partner_not_authorized' using errcode='42501';end if;
 perform private.f4_limit(p_site_id,'partner_media',120);select * into m from public.publication_media where site_id=p_site_id and public_media_id=p_media_id and revoked_at is null;
 if m.public_media_id is null or not exists(select 1 from private.partner_publication_entries e join private.partner_publication_revisions r on r.id=e.selected_revision_id where e.site_id=p_site_id and private.f4_partner_entry(e) and r.payload->'logo'->>'public_media_id'=p_media_id::text) then return null;end if;return jsonb_build_object('path',m.storage_path,'mime',m.mime,'sha256',m.sha256,'bytes',m.bytes);
end$$;
create function public.f4_partner_review_media(p_site_id uuid,p_revision_id uuid,p_media_id uuid) returns boolean language plpgsql volatile security definer set search_path='' as $$declare o uuid;begin
 perform private.f4_read_gate();select organization_id into o from public.publication_sites where id=p_site_id;if not private.f2_account(o) or not(private.f1_role(o,'publication_editor') or private.f1_role(o,'publication_reviewer')) then raise exception 'partner_not_authorized' using errcode='42501';end if;
 perform private.f4_limit(p_site_id,'partner_preview',120);return exists(select 1 from private.partner_publication_revisions r join public.publication_media m on m.site_id=r.site_id and m.public_media_id=p_media_id where r.id=p_revision_id and r.site_id=p_site_id and r.status<>'draft' and r.payload->'logo'->>'public_media_id'=p_media_id::text and private.f4_partner_proof_access(r) and private.f4_avatar(r.organization_id,r.site_id,jsonb_build_object('avatar',r.payload->'logo')));
end$$;
create function public.f4_partner_preview_locator(p_site_id uuid,p_revision_id uuid,p_media_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare m public.publication_media;begin
 if auth.role()<>'service_role' then raise exception 'partner_server_required' using errcode='42501';end if;
 select a.* into m from public.publication_media a join private.partner_publication_revisions r on r.site_id=a.site_id where r.id=p_revision_id and r.site_id=p_site_id and a.public_media_id=p_media_id and r.payload->'logo'->>'public_media_id'=p_media_id::text and r.status<>'draft' and private.f4_avatar(r.organization_id,r.site_id,jsonb_build_object('avatar',r.payload->'logo'));
 if m.public_media_id is null then return null;end if;return jsonb_build_object('path',m.storage_path,'mime',m.mime,'sha256',m.sha256,'bytes',m.bytes);
end$$;
do $$declare x record;begin for x in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private') and(p.proname like 'f4_partner_%' or p.proname='f4_partners') loop execute 'revoke all on function '||x.sig||' from public,anon,authenticated,service_role';end loop;end$$;
grant execute on function public.f4_partner_workflow(uuid,text,jsonb,uuid),public.f4_partner_admin(uuid,timestamptz,uuid),public.f4_partners(uuid,text,text,integer,timestamptz,uuid,text,text),public.f4_partner_media_locator(uuid,uuid,text),public.f4_partner_review_media(uuid,uuid,uuid) to authenticated;
grant execute on function public.f4_partner_preview_locator(uuid,uuid,uuid) to service_role;
commit;
