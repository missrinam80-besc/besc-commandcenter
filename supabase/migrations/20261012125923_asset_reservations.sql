begin;
create unique index projects_org_materials_key on public.projects(organization_id,id);
create table public.project_materials(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 project_id uuid not null,
 asset_id uuid not null,
 name text not null check(char_length(btrim(name)) between 2 and 180),
 starts_at timestamptz,
 ends_at timestamptz,
 status text not null default 'arranged' check(status in ('arranged','in_use','returned','cancelled')),
 notes text,
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(organization_id,project_id) references public.projects(organization_id,id) on delete cascade,
 foreign key(organization_id,asset_id) references public.assets(organization_id,id) on delete restrict,
 check(starts_at is null or ends_at is null or ends_at>starts_at)
);
alter table public.project_materials enable row level security;
revoke all on public.project_materials from public,anon,authenticated;
grant select,insert,update,delete on public.project_materials to authenticated;
create policy "members read project materials" on public.project_materials for select to authenticated using(private.is_active_member(organization_id));
create policy "managers insert project materials" on public.project_materials for insert to authenticated with check(private.can_manage_projects(organization_id) and created_by=(select auth.uid()) and exists(select 1 from public.projects p where p.organization_id=project_materials.organization_id and p.id=project_id and p.deleted_at is null));
create policy "managers update project materials" on public.project_materials for update to authenticated using(private.can_manage_projects(organization_id)) with check(private.can_manage_projects(organization_id) and exists(select 1 from public.projects p where p.organization_id=project_materials.organization_id and p.id=project_id and p.deleted_at is null));
create policy "managers delete project materials" on public.project_materials for delete to authenticated using(private.can_manage_projects(organization_id));
create index project_materials_asset_idx on public.project_materials(organization_id,asset_id);

create function private.asset_use_window(start_time timestamptz,end_time timestamptz,start_day date,end_day date)
returns tstzrange language sql immutable set search_path='' as $$
 select tstzrange(coalesce(start_time,start_day::timestamp at time zone 'Europe/Brussels'),coalesce(end_time,(end_day+1)::timestamp at time zone 'Europe/Brussels'),'[)');
$$;
revoke all on function private.asset_use_window(timestamptz,timestamptz,date,date) from public,anon,authenticated;

create function private.asset_bookings(p_org uuid,p_asset uuid)
returns table(source_table text,source_id uuid,period tstzrange)
language sql stable security definer set search_path='' as $$
 select 'event_materials'::text,m.id,private.asset_use_window(coalesce(m.pickup_at,e.start_at),coalesce(m.return_at,e.end_at),e.start_date,e.end_date)
 from public.event_materials m join public.events e on e.id=m.event_id and e.organization_id=m.organization_id
 where m.organization_id=p_org and m.asset_id=p_asset and m.status not in ('returned','cancelled') and e.deleted_at is null and e.status::text not in ('cancelled','archived')
 union all
 select 'project_materials',m.id,private.asset_use_window(m.starts_at,m.ends_at,p.start_date,p.due_date)
 from public.project_materials m join public.projects p on p.id=m.project_id and p.organization_id=m.organization_id
 where m.organization_id=p_org and m.asset_id=p_asset and m.status not in ('returned','cancelled') and p.deleted_at is null and p.status::text not in ('cancelled','archived');
$$;
revoke all on function private.asset_bookings(uuid,uuid) from public,anon,authenticated;

create function private.guard_material_reservation() returns trigger language plpgsql security definer set search_path='' as $$
declare item public.assets; use_period tstzrange; start_day date; end_day date; start_time timestamptz; end_time timestamptz; permitted boolean;
begin
 if new.asset_id is null or new.status in ('returned','cancelled') then return new;end if;
 permitted:=case when tg_table_name='event_materials' then private.can_manage_events(new.organization_id) else private.can_manage_projects(new.organization_id) end;
 if auth.uid() is null and session_user not in ('postgres','supabase_admin') then raise exception 'asset_no_access' using errcode='42501';end if;
 if auth.uid() is not null and not permitted then raise exception 'asset_no_access' using errcode='42501';end if;
 -- Acquire the common asset lock before checking other reservations or repairs.
 select * into item from public.assets where id=new.asset_id and organization_id=new.organization_id for update;
 if not found or item.deleted_at is not null or item.status in ('maintenance','retired','lost','archived','loaned') then raise exception 'asset_unavailable' using errcode='23514';end if;
 if exists(select 1 from public.tasks where organization_id=new.organization_id and repair_asset_id=new.asset_id and deleted_at is null and status::text not in ('done','cancelled','archived')) then raise exception 'asset_in_repair' using errcode='23514';end if;
 if tg_table_name='event_materials' then
  select coalesce(new.pickup_at,e.start_at),coalesce(new.return_at,e.end_at),e.start_date,e.end_date into start_time,end_time,start_day,end_day from public.events e where e.id=new.event_id and e.organization_id=new.organization_id;
 else
  select new.starts_at,new.ends_at,p.start_date,p.due_date into start_time,end_time,start_day,end_day from public.projects p where p.id=new.project_id and p.organization_id=new.organization_id;
 end if;
 use_period:=private.asset_use_window(start_time,end_time,start_day,end_day);
 if lower_inf(use_period) or upper_inf(use_period) or isempty(use_period) then raise exception 'asset_reservation_period_required' using errcode='23514';end if;
 if exists(select 1 from private.asset_bookings(new.organization_id,new.asset_id) b where not(b.source_table=tg_table_name and b.source_id=new.id) and b.period && use_period) then raise exception 'asset_already_reserved' using errcode='23514';end if;
 return new;
end $$;
revoke all on function private.guard_material_reservation() from public,anon,authenticated;
create trigger guard_event_asset_reservation before insert or update of asset_id,status,pickup_at,return_at,event_id,organization_id on public.event_materials for each row execute function private.guard_material_reservation();
create trigger guard_project_asset_reservation before insert or update of asset_id,status,starts_at,ends_at,project_id,organization_id on public.project_materials for each row execute function private.guard_material_reservation();

-- A repair and an overlapping reservation cannot bypass the shared lock.
create or replace function private.guard_task_repair_asset() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.repair_asset_id is null then return new;end if;
 if auth.uid() is not null and not private.is_active_member(new.organization_id) then raise exception 'repair_asset_unavailable' using errcode='42501';end if;
 perform 1 from public.assets where id=new.repair_asset_id and organization_id=new.organization_id for update;
 if tg_op='UPDATE' and new.repair_asset_id is not distinct from old.repair_asset_id and new.organization_id=old.organization_id then return new;end if;
 if not private.is_org_manager(new.organization_id) or not exists(select 1 from public.assets where id=new.repair_asset_id and organization_id=new.organization_id and deleted_at is null)
 then raise exception 'repair_asset_unavailable' using errcode='42501';end if;
 return new;
end $$;

create function private.asset_booking_calendar(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not private.is_active_member(p_organization_id) then raise exception 'asset_no_access' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'asOf',now(),'unavailable',a.status in ('maintenance','retired','lost','archived','loaned'),'repair',exists(select 1 from public.tasks t where t.organization_id=p_organization_id and t.repair_asset_id=a.id and t.deleted_at is null and t.status::text not in ('done','cancelled','archived')),'bookings',coalesce((select jsonb_agg(jsonb_build_object('table',b.source_table,'id',b.source_id,'start',lower(b.period),'end',upper(b.period))) from private.asset_bookings(p_organization_id,a.id) b),'[]'::jsonb))),'[]'::jsonb) into result from public.assets a where a.organization_id=p_organization_id and a.deleted_at is null;
 return result;
end $$;
revoke all on function private.asset_booking_calendar(uuid) from public,anon;
grant execute on function private.asset_booking_calendar(uuid) to authenticated;
create function public.asset_booking_calendar(p_organization_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.asset_booking_calendar(p_organization_id)$$;
revoke all on function public.asset_booking_calendar(uuid) from public,anon;
grant execute on function public.asset_booking_calendar(uuid) to authenticated;
drop trigger guard_task_repair_asset on public.tasks;
create trigger guard_task_repair_asset before insert or update of repair_asset_id,organization_id,status on public.tasks for each row execute function private.guard_task_repair_asset();

create function private.recheck_material_period() returns trigger language plpgsql security definer set search_path='' as $$
declare material record;
begin
 if tg_table_name='events' then
  if (new.start_at,new.end_at,new.start_date,new.end_date) is not distinct from (old.start_at,old.end_at,old.start_date,old.end_date) then return new;end if;
  for material in select id,pickup_at,return_at from public.event_materials where organization_id=new.organization_id and event_id=new.id and asset_id is not null and status not in ('returned','cancelled') order by asset_id,id loop
   if private.asset_use_window(coalesce(material.pickup_at,new.start_at),coalesce(material.return_at,new.end_at),new.start_date,new.end_date)
    is distinct from private.asset_use_window(coalesce(material.pickup_at,old.start_at),coalesce(material.return_at,old.end_at),old.start_date,old.end_date) then
    update public.event_materials set pickup_at=pickup_at where id=material.id;
   end if;
  end loop;
 else
  if (new.start_date,new.due_date) is not distinct from (old.start_date,old.due_date) then return new;end if;
  for material in select id,starts_at,ends_at from public.project_materials where organization_id=new.organization_id and project_id=new.id and status not in ('returned','cancelled') order by asset_id,id loop
   if private.asset_use_window(material.starts_at,material.ends_at,new.start_date,new.due_date)
    is distinct from private.asset_use_window(material.starts_at,material.ends_at,old.start_date,old.due_date) then
    update public.project_materials set starts_at=starts_at where id=material.id;
   end if;
  end loop;
 end if;
 return new;
end $$;
revoke all on function private.recheck_material_period() from public,anon,authenticated;
create trigger recheck_event_material_dates after update of start_at,end_at,start_date,end_date on public.events for each row execute function private.recheck_material_period();
create trigger recheck_project_material_dates after update of start_date,due_date on public.projects for each row execute function private.recheck_material_period();
commit;
