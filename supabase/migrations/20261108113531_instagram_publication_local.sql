-- Local-first Instagram image publication. No scheduler, live backfill or activation.
alter table public.social_posts
 add column instagram_account_id uuid references public.social_accounts(id),
 add column instagram_target jsonb,
 add column instagram_image_url text check(instagram_image_url is null or instagram_image_url ~ '^https://[^[:space:]]+$'),
 add column instagram_image_sha256 text check(instagram_image_sha256 is null or instagram_image_sha256 ~ '^[a-f0-9]{64}$');

-- Preserve the exact historical snapshot when the new optional fields are empty.
create or replace function private.social_review_snapshot(org uuid, post uuid)
returns jsonb language sql volatile security invoker set search_path='' as $$
 select jsonb_build_object('post',
  (to_jsonb(s)-array['status','updated_at','instagram_account_id','instagram_image_url','instagram_image_sha256','instagram_target']) ||
  jsonb_strip_nulls(jsonb_build_object('instagram_account_id',s.instagram_account_id,'instagram_image_url',s.instagram_image_url,'instagram_image_sha256',s.instagram_image_sha256,
   'instagram_target',s.instagram_target)),
  'variants',coalesce((select jsonb_agg(to_jsonb(v)-array['status','updated_at'] order by v.id)
   from public.social_post_variants v where v.organization_id=org and v.social_post_id=post),'[]'::jsonb))
 from public.social_posts s where s.organization_id=org and s.id=post and s.deleted_at is null
$$;

create table private.ig_publications (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 post_id uuid not null references public.social_posts(id), account_id uuid not null references public.social_accounts(id),
 approval_id uuid not null references public.approval_requests(id), requested_by uuid not null references public.profiles(id),
 session_id uuid not null, snapshot jsonb not null, caption text not null check(char_length(caption) between 1 and 2200),
 image_url text not null, image_sha256 text not null, external_account_id text not null,
 scheduled_at timestamptz not null, created_at timestamptz not null default clock_timestamp(),
 state text not null default 'scheduled' check(state in('scheduled','preparing','container_ready','publishing','published','failed','uncertain','cancelled')),
 nonce uuid, container_id text, media_id text, permalink text, published_at timestamptz, reason text,
 unique(post_id,approval_id)
);
create unique index ig_publication_one_unresolved_post on private.ig_publications(post_id) where state not in('cancelled','failed');
create table private.ig_publication_events (
 id uuid primary key default gen_random_uuid(), job_id uuid not null references private.ig_publications(id),
 operation text not null, created_at timestamptz not null default clock_timestamp(), actor_id uuid
);
alter table private.ig_publications enable row level security;
alter table private.ig_publication_events enable row level security;
revoke all on table private.ig_publications,private.ig_publication_events from public,anon,authenticated,service_role;

create function private.ig_publication_current(j private.ig_publications)
returns boolean language sql volatile security definer set search_path='' as $$
 select private.cy_session(j.organization_id,j.requested_by,j.session_id)
 and exists(select 1 from public.organization_members m where m.organization_id=j.organization_id and m.user_id=j.requested_by and m.status='active' and m.role in('admin','board'))
 and exists(select 1 from public.social_posts s where s.id=j.post_id and s.organization_id=j.organization_id and s.deleted_at is null and s.status in('approved','scheduled')
  and private.social_review_snapshot(j.organization_id,j.post_id)=j.snapshot)
 and exists(select 1 from public.approval_requests a where a.id=j.approval_id and a.organization_id=j.organization_id and a.status='approved' and a.source_snapshot=j.snapshot
  and a.decided_by is not null and a.decided_by<>a.requested_by and not exists(select 1 from public.approval_requests n where n.organization_id=a.organization_id and n.entity_type='social' and n.entity_id=a.entity_id and n.requested_at>a.requested_at))
 and exists(select 1 from public.social_accounts a where a.id=j.account_id and a.organization_id=j.organization_id and a.deleted_at is null and a.status='connected' and a.platform='instagram'
  and a.external_account_id=j.external_account_id and jsonb_build_object('name',a.account_name,'external_id',a.external_account_id)=j.snapshot#>'{post,instagram_target}'
  and a.granted_scopes @> array['instagram_basic','instagram_content_publish','pages_read_engagement']::text[])
$$;
revoke all on function private.ig_publication_current(private.ig_publications) from public,anon,authenticated,service_role;

create function private.ig_publication_owner(o uuid,p uuid,action text,job uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.social_posts; a public.approval_requests; account public.social_accounts; row private.ig_publications;
 snapshot jsonb; text_value text; session uuid;
begin
 session := nullif(auth.jwt()->>'session_id','')::uuid;
 if not private.cy_session(o,auth.uid(),session) or not private.is_org_manager(o) then raise exception 'instagram_access_denied'; end if;
 select * into s from public.social_posts where id=p and organization_id=o and deleted_at is null for update;
 if not found then raise exception 'instagram_source_unavailable'; end if;
 if action='list' then
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at,x.id) from (
   select j.id,j.state,j.scheduled_at,j.created_at,j.container_id,j.media_id,j.permalink,j.published_at,j.reason,
    (select coalesce(jsonb_agg(jsonb_build_object('operation',e.operation,'created_at',e.created_at) order by e.created_at,e.id),'[]'::jsonb) from private.ig_publication_events e where e.job_id=j.id) events
   from private.ig_publications j where j.post_id=p and j.organization_id=o) x),'[]'::jsonb);
 end if;
 if action='cancel' then
  select * into row from private.ig_publications where id=job and post_id=p and organization_id=o for update;
  if not found or row.state<>'scheduled' then raise exception 'instagram_cannot_cancel'; end if;
  update private.ig_publications set state='cancelled',reason='cancelled_by_manager' where id=row.id;
  insert into private.ig_publication_events(job_id,operation,actor_id) values(row.id,'cancelled',auth.uid());
  return jsonb_build_object('id',row.id,'state','cancelled');
 end if;
 if action<>'queue' then raise exception 'instagram_operation_denied'; end if;
 if s.platform is distinct from 'Instagram' or s.bundle_kind<>'single' or s.post_type<>'publication'
  or s.status not in('approved','scheduled') or s.scheduled_at is null or s.instagram_image_url is null or s.instagram_image_sha256 is null
  or exists(select 1 from public.social_post_variants where social_post_id=p) then raise exception 'instagram_image_post_required'; end if;
 snapshot := private.social_review_snapshot(o,p);
 select * into a from public.approval_requests where organization_id=o and entity_type='social' and entity_id=p order by requested_at desc,id desc limit 1;
 if not found or a.status<>'approved' or a.source_snapshot is distinct from snapshot or a.decided_by is null or a.decided_by=a.requested_by then raise exception 'instagram_approval_required'; end if;
 select * into account from public.social_accounts where id=s.instagram_account_id and organization_id=o and deleted_at is null for share;
 if not found or account.platform<>'instagram' or account.status<>'connected' or account.external_account_id !~ '^[0-9]+$'
  or not(account.granted_scopes @> array['instagram_basic','instagram_content_publish','pages_read_engagement']::text[]) then raise exception 'instagram_publish_permission_required'; end if;
 if s.instagram_target is distinct from jsonb_build_object('name',account.account_name,'external_id',account.external_account_id) then raise exception 'instagram_target_changed'; end if;
 text_value := concat_ws(E'\n\n',nullif(btrim(s.copy),''),nullif(btrim(s.hashtags),''),nullif(btrim(s.call_to_action),''));
 if char_length(text_value) not between 1 and 2200 then raise exception 'instagram_caption_invalid'; end if;
 select * into row from private.ig_publications where post_id=p and approval_id=a.id;
 if found then return jsonb_build_object('id',row.id,'state',row.state); end if;
 insert into private.ig_publications(organization_id,post_id,account_id,approval_id,requested_by,session_id,snapshot,caption,image_url,image_sha256,external_account_id,scheduled_at)
 values(o,p,account.id,a.id,auth.uid(),session,snapshot,text_value,s.instagram_image_url,s.instagram_image_sha256,account.external_account_id,s.scheduled_at) returning * into row;
 insert into private.ig_publication_events(job_id,operation,actor_id) values(row.id,'queued',auth.uid());
 return jsonb_build_object('id',row.id,'state',row.state);
end $$;
revoke all on function private.ig_publication_owner(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function private.ig_publication_owner(uuid,uuid,text,uuid) to authenticated;
create function public.instagram_publication_owner(p_org uuid,p_post uuid,p_action text,p_job uuid default null)
returns jsonb language sql volatile security invoker set search_path='' as $$ select private.ig_publication_owner(p_org,p_post,p_action,p_job) $$;
revoke all on function public.instagram_publication_owner(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.instagram_publication_owner(uuid,uuid,text,uuid) to authenticated;

create function private.ig_publication_server(job uuid,action text,data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare row private.ig_publications; source public.social_posts; claim uuid;
begin
 if action='due' and job is null then
  return coalesce((select jsonb_agg(jsonb_build_object('id',x.id)) from (
   select id from private.ig_publications where organization_id=(data->>'organization_id')::uuid and state='scheduled' and scheduled_at<=clock_timestamp() order by scheduled_at,id limit 1) x),'[]'::jsonb);
 end if;
 -- Parent-first order is shared with owner/approval/source mutation paths.
 select s.* into source from public.social_posts s join private.ig_publications j on j.post_id=s.id where j.id=job for update of s;
 if not found then raise exception 'instagram_job_unavailable'; end if;
 select * into row from private.ig_publications where id=job for update;
 if action='read' then return to_jsonb(row)-array['nonce','session_id']; end if;
 if action='claim' then
  if row.state<>'scheduled' or row.scheduled_at>clock_timestamp() then return jsonb_build_object('state','skipped'); end if;
  perform 1 from public.social_accounts where id=row.account_id for share;
  if not private.ig_publication_current(row) then
   update private.ig_publications set state='cancelled',reason='source_or_access_changed' where id=job;
   insert into private.ig_publication_events(job_id,operation) values(job,'blocked');
   return jsonb_build_object('state','blocked');
  end if;
  claim := gen_random_uuid();
  update private.ig_publications set state='preparing',nonce=claim where id=job;
  insert into private.ig_publication_events(job_id,operation) values(job,'claimed');
  return (to_jsonb(row)-array['session_id']) || jsonb_build_object('state','preparing','nonce',claim);
 end if;
 if action='preflight_failed' then
  if row.state<>'preparing' or row.nonce is null or nullif(data->>'nonce','')::uuid is distinct from row.nonce then raise exception 'instagram_claim_required'; end if;
  update private.ig_publications set state='failed',reason='preflight_failed' where id=job;
  insert into private.ig_publication_events(job_id,operation) values(job,'preflight_failed');
  return jsonb_build_object('state','failed');
 end if;
 if row.nonce is null or nullif(data->>'nonce','')::uuid is distinct from row.nonce then raise exception 'instagram_claim_required'; end if;
 if action='created' and row.state='preparing' and data->>'container_id' ~ '^[0-9]+$' then
  update private.ig_publications set state='container_ready',container_id=data->>'container_id' where id=job;
 elsif action='dispatch_publish' and row.state='container_ready' then
  perform 1 from public.social_accounts where id=row.account_id for share;
  if not private.ig_publication_current(row) then raise exception 'instagram_source_or_access_changed'; end if;
  update private.ig_publications set state='publishing' where id=job;
 elsif action='complete' and row.state='publishing' and data->>'media_id' ~ '^[0-9]+$'
  and data->>'permalink' ~ '^https://www\.instagram\.com/p/[A-Za-z0-9_-]+/$' then
  update private.ig_publications set state='published',media_id=data->>'media_id',permalink=data->>'permalink',published_at=clock_timestamp(),reason=null where id=job;
 elsif action='uncertain' and row.state in('preparing','container_ready','publishing') then
  update private.ig_publications set state='uncertain',reason='provider_or_receipt_not_confirmed' where id=job;
 else raise exception 'instagram_transition_denied'; end if;
 insert into private.ig_publication_events(job_id,operation) values(job,action);
 return jsonb_build_object('id',job,'state',(select state from private.ig_publications where id=job));
end $$;
revoke all on function private.ig_publication_server(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.ig_publication_server(uuid,text,jsonb) to service_role;
create function public.instagram_publication_server(p_job uuid,p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language sql volatile security invoker set search_path='' as $$ select private.ig_publication_server(p_job,p_action,p_data) $$;
revoke all on function public.instagram_publication_server(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.instagram_publication_server(uuid,text,jsonb) to service_role;

create function private.guard_instagram_inflight_source()
returns trigger language plpgsql security definer set search_path='' as $$
declare p uuid;
begin
 if tg_table_name='social_posts' then p:=old.id; else p:=old.social_post_id; end if;
 if exists(select 1 from private.ig_publications where post_id=p and state in('preparing','container_ready','publishing','uncertain')) then raise exception 'instagram_publication_inflight'; end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
revoke all on function private.guard_instagram_inflight_source() from public,anon,authenticated,service_role;
create trigger instagram_inflight_source before update or delete on public.social_posts for each row execute function private.guard_instagram_inflight_source();
create trigger instagram_inflight_variant before update or delete on public.social_post_variants for each row execute function private.guard_instagram_inflight_source();
