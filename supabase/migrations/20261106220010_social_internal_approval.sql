-- Internal review only. No provider calls, publication queue or live backfill.
alter table public.approval_requests drop constraint approval_requests_entity_type_check;
alter table public.approval_requests add constraint approval_requests_entity_type_check
  check (entity_type in ('content','expense','partner','document','email','newsletter','social'));
alter table public.approval_requests drop constraint approval_requests_module_check;
alter table public.approval_requests add constraint approval_requests_module_check
  check (module in ('content','finance','sponsors','documents','communication','social'));
alter table public.approval_requests add column source_snapshot jsonb;
alter table public.social_posts add column review_version bigint not null default 0;

-- Volatile deliberately: after waiting for the parent lock, read the latest
-- committed variants rather than the outer command's older snapshot.
create function private.social_review_snapshot(org uuid, post uuid)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select jsonb_build_object(
    'post', to_jsonb(s) - array['status','updated_at'],
    'variants', coalesce((select jsonb_agg(to_jsonb(v) - array['status','updated_at'] order by v.id)
      from public.social_post_variants v where v.organization_id=org and v.social_post_id=post),'[]'::jsonb))
  from public.social_posts s where s.organization_id=org and s.id=post and s.deleted_at is null
$$;
revoke all on function private.social_review_snapshot(uuid,uuid) from public,anon;
grant execute on function private.social_review_snapshot(uuid,uuid) to authenticated;

create function private.guard_social_approval()
returns trigger language plpgsql security invoker set search_path='' as $$
declare source public.social_posts; snapshot jsonb;
begin
  if tg_op='UPDATE' and old.entity_type='social' and new.entity_type<>'social' then
    raise exception 'social_review_immutable';
  end if;
  if new.entity_type<>'social' then return new; end if;
  select * into source from public.social_posts
    where organization_id=new.organization_id and id=new.entity_id for update;
  if not found or source.deleted_at is not null or source.status='archived' then
    raise exception 'social_review_source_unavailable';
  end if;
  snapshot := private.social_review_snapshot(new.organization_id,new.entity_id);
  if tg_op='INSERT' then
    if not private.is_org_manager(new.organization_id) or new.requested_by is distinct from auth.uid()
      or new.status<>'pending' or new.decided_by is not null or new.decided_at is not null
      or new.decision_note is not null then raise exception 'social_review_submit_denied'; end if;
    new.source_snapshot := snapshot;
    new.title := source.title;
    new.module := 'social';
    new.source_href := '/app/social/' || source.id;
    new.requested_at := greatest(clock_timestamp(),coalesce((
      select max(a.requested_at)+interval '1 microsecond' from public.approval_requests a
      where a.organization_id=new.organization_id and a.entity_type='social' and a.entity_id=new.entity_id
    ),'-infinity'::timestamptz));
    new.updated_at := new.requested_at;
  else
    if old.entity_type<>'social' or old.status<>'pending'
      or (to_jsonb(new)-array['status','decided_by','decision_note','decided_at','updated_at'])
        is distinct from (to_jsonb(old)-array['status','decided_by','decision_note','decided_at','updated_at']) then
      raise exception 'social_review_immutable';
    end if;
    if not private.can_review_approval(new.organization_id,'social')
      or auth.uid() is not distinct from old.requested_by
      or new.decided_by is distinct from auth.uid()
      or new.status not in ('approved','changes_requested','rejected') then
      raise exception 'social_review_decision_denied';
    end if;
    if snapshot is distinct from old.source_snapshot then raise exception 'social_review_source_changed'; end if;
    if new.status<>'approved' and nullif(btrim(new.decision_note),'') is null then
      raise exception 'social_review_note_required';
    end if;
    new.decided_at := clock_timestamp();
    new.updated_at := new.decided_at;
  end if;
  return new;
end $$;
revoke all on function private.guard_social_approval() from public,anon,authenticated;
create trigger social_review_guard before insert or update on public.approval_requests
  for each row execute function private.guard_social_approval();

create function private.sync_social_approval()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.entity_type='social' then
    update public.social_posts set status=case when new.status='approved' then 'approved' else 'review' end,
      updated_at=clock_timestamp() where organization_id=new.organization_id and id=new.entity_id;
    if not found then raise exception 'social_review_source_unavailable'; end if;
  end if;
  return new;
end $$;
revoke all on function private.sync_social_approval() from public,anon,authenticated;
create trigger social_review_sync after insert or update on public.approval_requests
  for each row execute function private.sync_social_approval();

create function private.guard_social_review_source()
returns trigger language plpgsql security invoker set search_path='' as $$
declare changed boolean; snapshot jsonb;
begin
  if tg_op='DELETE' then
    if exists(select 1 from public.approval_requests where entity_type='social' and entity_id=old.id
      and organization_id=old.organization_id and status='pending') then raise exception 'social_review_pending'; end if;
    return old;
  end if;
  changed := tg_op='INSERT';
  if tg_op='INSERT' then new.review_version := 0; end if;
  if tg_op='UPDATE' then
    if new.id<>old.id or new.organization_id<>old.organization_id then raise exception 'social_review_identity_immutable'; end if;
    changed := (to_jsonb(new)-array['status','updated_at','review_version']) is distinct from (to_jsonb(old)-array['status','updated_at','review_version']);
    if new.review_version<>old.review_version then
      -- Only the nested variant trigger may explicitly advance the version.
      if pg_trigger_depth()<>2 or new.review_version<>old.review_version+1 or changed then
        raise exception 'social_review_version_immutable';
      end if;
      changed := true;
    end if;
    if changed then new.review_version := old.review_version+1; end if;
    if exists(select 1 from public.approval_requests where entity_type='social' and entity_id=old.id
      and organization_id=old.organization_id and status='pending')
      and (changed or new.status<>'review') then raise exception 'social_review_pending'; end if;
    -- A formerly approved version is historical after an edit.
    if changed and old.status in ('approved','scheduled','published') then new.status := 'review'; end if;
  end if;
  if new.status in ('approved','scheduled','published') then
    snapshot := private.social_review_snapshot(new.organization_id,new.id);
    if changed or not exists(select 1 from public.approval_requests a where a.entity_type='social'
      and a.entity_id=new.id and a.organization_id=new.organization_id and a.status='approved'
      and a.source_snapshot=snapshot and a.decided_by is not null and a.decided_by<>a.requested_by
      and not exists(select 1 from public.approval_requests newer where newer.entity_type='social'
        and newer.entity_id=a.entity_id and newer.organization_id=a.organization_id and newer.requested_at>a.requested_at)) then
      raise exception 'social_review_approval_required';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.guard_social_review_source() from public,anon,authenticated;
create trigger social_review_source_guard before insert or update or delete on public.social_posts
  for each row execute function private.guard_social_review_source();

create function private.guard_social_review_variant()
returns trigger language plpgsql security invoker set search_path='' as $$
declare parent public.social_posts; org uuid; post uuid; changed boolean;
begin
  org := case when tg_op='DELETE' then old.organization_id else new.organization_id end;
  post := case when tg_op='DELETE' then old.social_post_id else new.social_post_id end;
  if tg_op='UPDATE' and (new.id<>old.id or new.organization_id<>old.organization_id or new.social_post_id<>old.social_post_id) then
    raise exception 'social_review_identity_immutable';
  end if;
  select * into parent from public.social_posts where id=post and organization_id=org for update;
  if not found then
    if tg_op='DELETE' then return old; end if;
    raise exception 'social_review_source_unavailable';
  end if;
  if exists(select 1 from public.approval_requests where entity_type='social' and entity_id=post
    and organization_id=org and status='pending') then raise exception 'social_review_pending'; end if;
  changed := true;
  if tg_op='UPDATE' then
    changed := (to_jsonb(new)-array['status','updated_at']) is distinct from (to_jsonb(old)-array['status','updated_at']);
    if changed and old.status in ('approved','scheduled','published') then new.status := 'review'; end if;
  end if;
  if tg_op<>'DELETE' and new.status in ('approved','scheduled','published') then
    if changed or parent.status not in ('approved','scheduled','published') then raise exception 'social_review_approval_required'; end if;
  end if;
  if changed then
    update public.social_posts set status=case when status in ('approved','scheduled','published') then 'review' else status end,
      review_version=review_version+1,updated_at=clock_timestamp() where id=post and organization_id=org;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function private.guard_social_review_variant() from public,anon,authenticated;
create trigger social_review_variant_guard before insert or update or delete on public.social_post_variants
  for each row execute function private.guard_social_review_variant();

create trigger social_approval_audit after insert or update on public.approval_requests
  for each row when (new.entity_type='social') execute function private.log_organization_change();
create trigger social_approval_delete_audit after delete on public.approval_requests
  for each row when (old.entity_type='social') execute function private.log_organization_change();
create trigger social_variant_review_audit after insert or update or delete on public.social_post_variants
  for each row execute function private.log_organization_change();
