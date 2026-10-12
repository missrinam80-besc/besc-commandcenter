begin;
create table public.event_activities (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,event_id uuid not null,
 title text not null check(char_length(btrim(title)) between 2 and 180),description text default '' check(char_length(description)<=16000),position integer not null default 0 check(position>=0),
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,event_id,id),foreign key(organization_id,event_id) references public.events(organization_id,id) on delete cascade);
create index event_activities_event_idx on public.event_activities(organization_id,event_id,position,created_at);
alter table public.event_activities enable row level security;
revoke all on public.event_activities from public,anon,authenticated;
grant select,insert,update,delete on public.event_activities to authenticated;
create policy "members read event activities" on public.event_activities for select to authenticated using(private.is_active_member(organization_id) and exists(select 1 from public.events e where e.id=event_id and e.organization_id=event_activities.organization_id and e.deleted_at is null));
create policy "event managers add activities" on public.event_activities for insert to authenticated with check(private.can_manage_events(organization_id) and created_by=(select auth.uid()) and exists(select 1 from public.events e where e.id=event_id and e.organization_id=event_activities.organization_id and e.deleted_at is null));
create policy "event managers update activities" on public.event_activities for update to authenticated using(private.can_manage_events(organization_id)) with check(private.can_manage_events(organization_id));
create policy "event managers delete activities" on public.event_activities for delete to authenticated using(private.can_manage_events(organization_id) and exists(select 1 from public.events e where e.id=event_id and e.organization_id=event_activities.organization_id and e.deleted_at is null));
create function public.guard_event_activity() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if tg_op='UPDATE' then
 if new.organization_id<>old.organization_id or new.event_id<>old.event_id or new.created_by<>old.created_by then raise exception 'event_activity_identity_changed' using errcode='42501';end if;
 new.created_at=old.created_at;
 end if;
 perform 1 from public.events e where e.id=new.event_id and e.organization_id=new.organization_id and e.deleted_at is null for share;
 if not found then raise exception 'event_activity_event_unavailable' using errcode='42501';end if;
 new.title=btrim(new.title);new.updated_at=now();return new;
end$$;
revoke all on function public.guard_event_activity() from public,anon;
grant execute on function public.guard_event_activity() to authenticated;
create trigger guard_event_activity before insert or update on public.event_activities for each row execute function public.guard_event_activity();
alter table public.event_schedule_items add column activity_id uuid references public.event_activities(id) deferrable initially deferred;
alter table public.event_schedule_items add constraint event_schedule_activity_binding foreign key(organization_id,event_id,activity_id) references public.event_activities(organization_id,event_id,id) deferrable initially deferred;
create index event_schedule_activity_idx on public.event_schedule_items(organization_id,event_id,activity_id) where activity_id is not null;
-- Rename the standard display label only; preserve the stream key and custom labels.
alter table public.dossier_choice_options disable trigger guard_dossier_choice_option;
update public.dossier_choice_options set label='Streamer/content creator' where set_key='event_schedule_items.kind' and value='stream' and label='Stream';
alter table public.dossier_choice_options enable trigger guard_dossier_choice_option;
do $$declare definitions jsonb;begin
 select jsonb_agg(case when item->>'key'='event_schedule_items.kind' then jsonb_set(item,'{values}',(select jsonb_agg(case when v->>'value'='stream' then jsonb_set(v,'{label}','"Streamer/content creator"') else v end) from jsonb_array_elements(item->'values') v)) else item end) into definitions from jsonb_array_elements(private.dossier_choice_catalog()) item;
 execute format('create or replace function private.dossier_choice_catalog() returns jsonb language sql immutable set search_path='''' as %L',format('select %L::jsonb',definitions::text));
end$$;
notify pgrst,'reload schema';
commit;
