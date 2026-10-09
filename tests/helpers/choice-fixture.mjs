// Synthetic, minimal PostgreSQL fixture. Never apply to an existing app database.
export const agendaChoice={key:'event_schedule_items.kind',table:'event_schedule_items',field:'kind',values:['program','stream','runbook','shift'].map(value=>({value}))};
export function choiceFixture(catalog) {
 let setup=`create schema auth;create schema private;
 create table public.organizations(id uuid primary key);
 create table public.organization_members(organization_id uuid,user_id uuid,role text,status text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function private.is_active_member(org_id uuid) returns boolean language sql stable security definer as $$select exists(select 1 from public.organization_members where organization_id=org_id and user_id=auth.uid() and status='active')$$;
 create function private.is_org_admin(org_id uuid) returns boolean language sql stable security definer as $$select exists(select 1 from public.organization_members where organization_id=org_id and user_id=auth.uid() and role='admin' and status='active')$$;
 grant usage on schema auth,private to authenticated;`;
 for(const c of catalog)setup+=`create table public.${c.table}(id uuid primary key default gen_random_uuid(),organization_id uuid references public.organizations(id),${c.field} text check(${c.field} in (${c.values.map(o=>"'"+o.value+"'").join(',')})),deleted_at timestamptz);
 grant select,insert,update,delete on public.${c.table} to authenticated;
 alter table public.${c.table} enable row level security;
 create policy fixture_access on public.${c.table} to authenticated using(private.is_active_member(organization_id)) with check(private.is_active_member(organization_id));`;
 return setup;
}
